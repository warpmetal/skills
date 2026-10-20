/**
 * chatgpt/app.ts - the MCP App surface: one UI resource and the tool that opens it.
 *
 * The app is served as a `ui://` resource with the MCP Apps HTML mime type, and
 * the tool carries the `openai/ui` entrypoints so ChatGPT Desktop can put it in
 * the sidebar (`global`) and in a conversation's side panel (`thread`).
 *
 * The tool is the only thing the app calls. It returns the dashboard payload, so
 * the app never needs `callServerTool` and never reaches the CLI on its own.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { ServerDeps } from "../tools/spec.js";
import { buildDashboardPayload, DASHBOARD_OUTPUT } from "./dashboard.js";
import { DASHBOARD_HTML } from "./ui/dashboard.js";

export const DASHBOARD_TOOL_NAME = "warpmetal.dashboard";
export const DASHBOARD_RESOURCE_URI = "ui://warpmetal/dashboard";
export const UI_MIME_TYPE = "text/html;profile=mcp-app";

export function registerChatgptApp(server: McpServer, deps: ServerDeps): void {
  // The resource must exist before the tool references it: the host resolves
  // `_meta.ui.resourceUri` through `resources/read`.
  server.registerResource(
    "warpmetal-dashboard",
    DASHBOARD_RESOURCE_URI,
    {
      title: "WarpMetal",
      description: "WarpMetal status dashboard",
      mimeType: UI_MIME_TYPE,
      _meta: { ui: { prefersBorder: false } },
    },
    async () => ({
      contents: [
        {
          uri: DASHBOARD_RESOURCE_URI,
          mimeType: UI_MIME_TYPE,
          text: DASHBOARD_HTML,
        },
      ],
    }),
  );

  server.registerTool(
    DASHBOARD_TOOL_NAME,
    {
      title: "WarpMetal",
      description:
        "WarpMetal status: CLI availability, known servers, and recent tasks. Opens the WarpMetal dashboard.",
      // An entrypoint always opens with `{}`, so the tool must accept it.
      inputSchema: z.object({}),
      outputSchema: DASHBOARD_OUTPUT,
      annotations: { readOnlyHint: true },
      _meta: {
        ui: { resourceUri: DASHBOARD_RESOURCE_URI },
        "openai/ui": {
          entrypoints: [{ type: "global" }, { type: "thread" }],
        },
      },
    },
    async () => {
      const { payload, summary } = await buildDashboardPayload(deps);
      return {
        content: [{ type: "text", text: summary }],
        structuredContent: payload,
      };
    },
  );
}
