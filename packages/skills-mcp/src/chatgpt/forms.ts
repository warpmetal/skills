/**
 * chatgpt/forms.ts - the extended forms surface (legacy elicitation).
 *
 * The connection negotiates a 2025-era protocol, so the OpenAI extension's
 * legacy elicitation (`openai/elicitation/create`) is the supported path; MRTR
 * forms require 2026-07-28 and are a later phase.
 *
 * The form only collects a selection. It never calls a plan or an apply tool:
 * the model receives the chosen id and must run the plan, show its effect, and
 * obtain approval before anything changes.
 */
import type { McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { OpenAIExtensions } from "@openai/mcp-extensions/server";
import { z } from "zod";

import type { WmResult } from "../result.js";
import { ALL_TOOL_SPECS } from "../tools/index.js";
import { asRecord, str, toolSpecHandler, type ServerDeps, type WmToolSpec } from "../tools/spec.js";

const PICK_SERVER_TOOL = "wm_pick_server";
const SPECS_BY_NAME = new Map<string, WmToolSpec>(ALL_TOOL_SPECS.map((spec) => [spec.name, spec]));

/** The ids the host knows about, read through the same shared handler. */
async function knownServerIds(deps: ServerDeps): Promise<string[]> {
  const spec = SPECS_BY_NAME.get("wm_state_list");
  if (spec === undefined) {
    return [];
  }
  try {
    const call = await toolSpecHandler(spec, deps)({}, {});
    const servers = asRecord((call.structuredContent as WmResult | null)?.data)?.["servers"];
    if (!Array.isArray(servers)) {
      return [];
    }
    const ids: string[] = [];
    for (const entry of servers) {
      const record = asRecord(entry);
      const id = str(record?.["serverId"]) ?? str(record?.["id"]);
      if (id !== null) {
        ids.push(id);
      }
    }
    return ids;
  } catch {
    return [];
  }
}

export type PickAction = "accept" | "decline" | "cancel" | "unavailable";

export interface PickServerResult {
  action: PickAction;
  serverId: string | null;
}

/**
 * Asks the host to show the server picker. Returns the selection, or why there
 * is none. A host that cannot show forms degrades to `unavailable`; it must
 * never fail the tool.
 */
export async function pickServer(
  extensions: OpenAIExtensions,
  context: ServerContext,
  deps: ServerDeps,
  message: string,
): Promise<PickServerResult> {
  const serverIds = await knownServerIds(deps);
  if (serverIds.length === 0) {
    return { action: "unavailable", serverId: null };
  }
  try {
    const result = await extensions.elicitInputLegacy(context, {
      mode: "form",
      message,
      requestedSchema: {
        type: "object",
        properties: {
          serverId: {
            type: "string",
            title: "Server",
            oneOf: serverIds.map((id) => ({ const: id, title: id })),
          },
        },
        required: ["serverId"],
      },
    });
    if (result.action !== "accept") {
      return { action: result.action, serverId: null };
    }
    const selected = result.content?.["serverId"];
    const serverId = typeof selected === "string" && serverIds.includes(selected) ? selected : null;
    return { action: "accept", serverId };
  } catch {
    return { action: "unavailable", serverId: null };
  }
}

export function registerChatgptForms(
  server: McpServer,
  extensions: OpenAIExtensions,
  deps: ServerDeps,
): void {
  server.registerTool(
    PICK_SERVER_TOOL,
    {
      title: "Pick a WarpMetal server",
      description:
        "Asks the user to pick one of the servers known on this host and returns its id. It changes nothing; use the id with a plan tool.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async (_args, context) => {
      const result = await pickServer(extensions, context, deps, "Choose a WarpMetal server");
      if (result.action === "unavailable") {
        return {
          content: [
            {
              type: "text",
              text: "No server picker was shown: this host has no known servers, or it cannot display forms. Run wm_state_list to see what exists.",
            },
          ],
        };
      }
      if (result.serverId === null) {
        return {
          content: [
            {
              type: "text",
              text: "The picker was dismissed without a selection. Nothing was changed.",
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text:
              "Selected server " +
              result.serverId +
              ". Nothing has changed yet: run the matching plan tool, show the effect, and obtain approval before applying.",
          },
        ],
        structuredContent: { serverId: result.serverId },
      };
    },
  );
}
