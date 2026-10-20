/**
 * chatgpt/register.ts - the v2 registration adapter.
 *
 * The tool specs, the content tools and the single `handle()` path are shared
 * with the v1 server; only the registration call differs between the two SDK
 * generations. This module is that boundary: it maps a v2 `registerTool` call
 * onto the exact config and handler the v1 path uses, so a change to a tool's
 * behaviour cannot reach one transport and miss the other.
 */
import type { McpServer } from "@modelcontextprotocol/server";

import type { LoadedRegistry } from "../registry.js";
import { contentToolRegistrations, type ContentToolRegistration } from "../server.js";
import { ALL_TOOL_SPECS } from "../tools/index.js";
import {
  toolSpecConfig,
  toolSpecHandler,
  type ServerDeps,
  type WmToolSpec,
} from "../tools/spec.js";

/**
 * The shape of the v2 `registerTool` this adapter uses. The v2 method is generic
 * over the schema type, so the erasure is kept in this one alias instead of at
 * every call site. The configs themselves come from the shared builders, and the
 * stdio smoke proves the server actually serves them.
 */
type V2RegisterTool = (
  name: string,
  config: unknown,
  handler: (args: unknown, context: unknown) => Promise<unknown>,
) => unknown;

/**
 * The v2 handler context. The shared handler reads only `_meta` and a
 * `sendNotification`, so that is the whole surface this adapter has to bridge.
 * `sendNotification` stays `undefined` when the host does not provide one; the
 * task tools' progress reporter already no-ops in that case.
 */
interface V2ToolContext {
  _meta?: { progressToken?: string | number } | undefined;
  sendNotification?: (notification: unknown) => Promise<void>;
}

function adaptContext(context: unknown): unknown {
  const source = context as V2ToolContext | undefined;
  return { _meta: source?._meta, sendNotification: source?.sendNotification };
}

function registrarOf(server: McpServer): V2RegisterTool {
  return server.registerTool.bind(server) as unknown as V2RegisterTool;
}

export function registerContentToolV2(
  register: V2RegisterTool,
  tool: ContentToolRegistration,
): void {
  register(tool.name, tool.config, (args: unknown) => tool.handler(args));
}

export function registerToolSpecV2(
  register: V2RegisterTool,
  spec: WmToolSpec,
  deps: ServerDeps,
): void {
  register(spec.name, toolSpecConfig(spec), (args: unknown, context: unknown) =>
    toolSpecHandler(spec, deps)(args, adaptContext(context)),
  );
}

/**
 * Registers the `chatgpt-local` surface on a v2 server: the three content tools
 * and the 43 `wm_*` specs, and nothing else. There is no provider path here by
 * construction, so the count cannot drift from the profile contract.
 */
export function registerChatgptSurface(
  server: McpServer,
  loaded: LoadedRegistry,
  deps: ServerDeps,
): void {
  const register = registrarOf(server);

  for (const tool of contentToolRegistrations(loaded)) {
    registerContentToolV2(register, tool);
  }
  for (const spec of ALL_TOOL_SPECS) {
    registerToolSpecV2(register, spec, deps);
  }
}
