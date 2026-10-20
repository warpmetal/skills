/**
 * chatgpt/mentions.ts - the composer mentions surface.
 *
 * ChatGPT Desktop turns the `openai/mentions` capability into a typeahead picker
 * in the composer. The SDK registers the `search_mentions` tool (read-only,
 * app-only) and advertises the capability when a handler is set; this module
 * supplies the handler and the only data it may return.
 *
 * Mentions are local and cheap on purpose: servers come from `wm_state_list`
 * and tasks from this session's in-memory registry. No network call happens on
 * a keystroke, and an item carries an id and a type - never a path or a secret.
 */
import type { OpenAIExtensions } from "@openai/mcp-extensions/server";

import type { WmResult } from "../result.js";
import { ALL_TOOL_SPECS } from "../tools/index.js";
import { asRecord, str, toolSpecHandler, type ServerDeps, type WmToolSpec } from "../tools/spec.js";

const MAX_ITEMS = 25;

/** The only shape this server emits for a mention. */
export interface MentionItem {
  type: "resource_link";
  uri: string;
  name: string;
  title: string;
}

const SPECS_BY_NAME = new Map<string, WmToolSpec>(ALL_TOOL_SPECS.map((spec) => [spec.name, spec]));

/** Runs a read tool and returns its data, or null when it cannot run at all. */
async function readData(deps: ServerDeps, name: string): Promise<unknown> {
  const spec = SPECS_BY_NAME.get(name);
  if (spec === undefined) {
    return null;
  }
  try {
    const call = await toolSpecHandler(spec, deps)({}, {});
    return (call.structuredContent as WmResult | null)?.data ?? null;
  } catch {
    return null;
  }
}

function serverItems(data: unknown): MentionItem[] {
  const servers = asRecord(data)?.["servers"];
  if (!Array.isArray(servers)) {
    return [];
  }
  const items: MentionItem[] = [];
  for (const entry of servers) {
    const record = asRecord(entry);
    const id = str(record?.["serverId"]) ?? str(record?.["id"]);
    if (id === null) {
      continue;
    }
    items.push({ type: "resource_link", uri: "wm://server/" + id, name: id, title: "Server" });
  }
  return items;
}

function taskItems(data: unknown): MentionItem[] {
  const tasks = asRecord(data)?.["tasks"];
  if (!Array.isArray(tasks)) {
    return [];
  }
  const items: MentionItem[] = [];
  for (const entry of tasks) {
    const record = asRecord(entry);
    const taskId = str(record?.["taskId"]);
    if (taskId === null) {
      continue;
    }
    items.push({ type: "resource_link", uri: "wm://task/" + taskId, name: taskId, title: "Task" });
  }
  return items;
}

/**
 * Searches the mentionable resources. A read that fails contributes no items:
 * the picker renders an empty list rather than an error the user cannot act on.
 */
export async function searchMentions(deps: ServerDeps, query: string): Promise<MentionItem[]> {
  const [stateData, taskData] = await Promise.all([
    readData(deps, "wm_state_list"),
    readData(deps, "wm_task_list"),
  ]);

  const needle = query.trim().toLowerCase();
  const all = [...serverItems(stateData), ...taskItems(taskData)];
  const filtered =
    needle.length === 0 ? all : all.filter((item) => item.name.toLowerCase().includes(needle));
  return filtered.slice(0, MAX_ITEMS);
}

/**
 * Wires the search handler into the OpenAI extensions. The SDK registers the
 * `search_mentions` tool and advertises `openai/mentions` at this point, and it
 * requires being called before the server connects - which is why it runs
 * inside the `serveStdio` factory, before the transport is attached.
 */
export function registerChatgptMentions(openaiExtensions: OpenAIExtensions, deps: ServerDeps): void {
  openaiExtensions.mentions.setHandler(async ({ query }) => ({
    items: await searchMentions(deps, query),
  }));
}
