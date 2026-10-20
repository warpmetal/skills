/**
 * server.ts - the single MCP server for this package, in two profiles.
 *
 * This package carries two surfaces that used to live in separate servers:
 *
 *   1. the content surface (`skill_*`), which serves the loaded skills registry
 *      from disk, and
 *   2. the WarpMetal CLI surface (`wm_*`), which runs the `warpmetal` binary
 *      through one hardened executor.
 *
 * They are split by *transport*, not by trust in the caller. `full` is what
 * stdio gets: content + `wm_*` + the WarpMetal provider tools, because stdio is a
 * local, operator-controlled channel. `content` is what HTTP gets: the
 * `skill_*` tools and the registry resources only, because the HTTP transport
 * has no authentication, and the `wm_*` / provider tools can mutate real
 * infrastructure. A remote, unauthenticated caller must never reach them, so
 * those tools are not registered at all rather than registered and refused -
 * an absent tool cannot be argued with.
 *
 * The runner is injected rather than imported, so the conformance tests can
 * drive the real server (and the real schema conversion) with a deterministic
 * fake instead of spawning the CLI. The approval store and task registry are
 * per-server instances for the same reason: their state must not leak between
 * tests, and neither is persisted by design.
 *
 * The latch is the exception to that last sentence and the reason it is called
 * out: it *is* persisted, because a terminal state that dies with the process is
 * exactly the thing that gets retried. It lives beside the audit log, so one
 * directory is the whole trust domain.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ErrorCode,
  ListResourcesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type CallToolResult,
  type ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { ApprovalStore } from "./approval.js";
import { auditEnabled, resolveAuditDir } from "./audit.js";
import { SkillError } from "./errors.js";
import { createCliRunner, type Runner } from "./exec.js";
import { LatchStore } from "./latch.js";
import type { LoadedRegistry } from "./registry.js";
import {
  listSkills,
  parseSkillUri,
  readSkillFile,
  searchSkills,
  summarizeSkill,
} from "./skills.js";
import { TaskRegistry } from "./tasks.js";
import {
  createProviderInvokerFromEnv,
  registerProviderTools,
  type ProviderInvoker,
} from "./providers/index.js";
import {
  ALL_TOOL_SPECS,
  registerToolSpecs,
  type ServerDeps,
  type WmToolSpec,
} from "./tools/index.js";
import { packageVersion } from "./version.js";

export const SERVER_NAME = "warpmetal-mcp";

/**
 * Read from `package.json` at runtime instead of being duplicated here, so the
 * `serverInfo` version can never drift from the released package version.
 */
export const SERVER_VERSION = packageVersion();

/**
 * Which tools this server exposes.
 *
 *  - `full`: the content surface plus the 43 `wm_*` CLI tools and the WarpMetal
 *    provider tools. stdio only.
 *  - `content`: the `skill_*` tools and the registry resources only. The safe
 *    profile for the unauthenticated HTTP transport (no wm_*, no provider tools).
 *  - `chatgpt-local`: the content surface plus the 43 `wm_*` CLI tools, without
 *    the provider tools. stdio only; this is the ChatGPT desktop integration
 *    surface, and its tool count is a test condition rather than an assumption.
 */
export type ServerProfile = "full" | "content" | "chatgpt-local";

export interface ServerOptions {
  /** Defaults to `full`. `content` is the HTTP profile. */
  profile?: ServerProfile;
  runner?: Runner;
  auditDir?: string;
  auditEnabled?: boolean;
  /** Overrides the registry of CLI tools. Only the tests pass this. */
  specs?: readonly WmToolSpec[];
  approvals?: ApprovalStore;
  tasks?: TaskRegistry;
  latch?: LatchStore;
  /**
   * Provider invoker for the full profile. Defaults to a WarpMetal CLI-backed
   * invoker. Tests inject a mock. Pass `null` to skip registering provider tools.
   */
  providers?: ProviderInvoker | null;
}

export type BuildServerOptions = ServerOptions;

function toMcpError(error: unknown): McpError {
  if (error instanceof McpError) return error;
  if (error instanceof SkillError) {
    const internal = error.code === "integrity_mismatch" || error.code === "registry_unavailable";
    return new McpError(
      internal ? ErrorCode.InternalError : ErrorCode.InvalidParams,
      `${error.code}: ${error.message}`,
    );
  }
  return new McpError(
    ErrorCode.InternalError,
    error instanceof Error ? error.message : String(error),
  );
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function registryMeta(loaded: LoadedRegistry): {
  registryVersion: string;
  source: string;
  stale: boolean;
} {
  return {
    registryVersion: loaded.registry.registryVersion,
    source: loaded.source,
    stale: loaded.stale,
  };
}

/**
 * Builds the shared dependencies for the `wm_*` surface. Called only for the
 * profiles that expose that surface (`full` and `chatgpt-local`), so the HTTP
 * `content` server never allocates a latch store or an approval broker it
 * cannot expose.
 *
 * One directory resolves both the audit log and the latch, so redirecting one
 * redirects the other, and neither can be pointed somewhere the other is not.
 */
export function buildDeps(options: ServerOptions): ServerDeps {
  const stateDir = options.auditDir ?? resolveAuditDir();

  return {
    runner: options.runner ?? createCliRunner(),
    auditDir: stateDir,
    auditEnabled: options.auditEnabled ?? auditEnabled(),
    approvals: options.approvals ?? new ApprovalStore(),
    tasks: options.tasks ?? new TaskRegistry(),
    latch: options.latch ?? new LatchStore(stateDir),
  };
}

const skillListInput = z.strictObject({
  role: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("Filter to skills that declare this role, e.g. planner, builder, reviewer"),
  host: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("Filter to skills that support this agent host, e.g. omp, opencode, codex, claude"),
});

const skillSearchInput = z.strictObject({
  query: z.string().min(1).max(256).describe("Substring query, e.g. 'coding environment'"),
  limit: z.number().int().min(1).max(20).optional().describe("Maximum hits (default 10)"),
  role: z.string().min(1).max(64).optional(),
  host: z.string().min(1).max(64).optional(),
});

const skillReadInput = z.strictObject({
  name: z.string().min(1).max(64).describe("Skill name, e.g. warpmetal"),
  file: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe("Relative file inside the skill; defaults to SKILL.md"),
});

/**
 * One content tool, transport-agnostic: the config and handler are what the v1
 * registrar below and the v2 adapter in `chatgpt/register.ts` consume, so the
 * two cannot describe different tools.
 */
export interface ContentToolRegistration {
  name: string;
  config: {
    title: string;
    description: string;
    annotations: { readOnlyHint: true };
    inputSchema: z.ZodType;
    outputSchema?: z.ZodType;
  };
  handler: (args: unknown) => Promise<CallToolResult>;
}

export function contentToolRegistrations(loaded: LoadedRegistry): ContentToolRegistration[] {
  /** Mirrors `summarizeSkill`, so a drift in either direction fails validation. */
  const skillSummarySchema = z.strictObject({
    name: z.string(),
    version: z.string(),
    description: z.string(),
    roles: z.array(z.string()),
    hosts: z.array(z.string()),
    tags: z.array(z.string()),
    files: z.array(z.string()),
    minimumWarpmetalCli: z.string().optional(),
    integrations: z.array(z.string()).optional(),
  });

  const registryMetaSchema = {
    registryVersion: z.string(),
    source: z.enum(["bundled", "local", "remote"]),
    stale: z.boolean(),
  };

  const skillListOutputSchema = z.strictObject({
    ...registryMetaSchema,
    skills: z.array(skillSummarySchema),
  });

  const skillSearchOutputSchema = z.strictObject({
    ...registryMetaSchema,
    query: z.string(),
    hits: z.array(
      z.strictObject({
        name: z.string(),
        version: z.string(),
        description: z.string(),
        tags: z.array(z.string()),
        score: z.number(),
      }),
    ),
  });

  return [
    {
      name: "skill_list",
      config: {
        title: "List WarpMetal skills",
        description:
          "List every skill in the WarpMetal registry with its version, description, roles, hosts, and files. Optional filters narrow by role or agent host.",
        annotations: { readOnlyHint: true },
        inputSchema: skillListInput,
        outputSchema: skillListOutputSchema,
      },
      handler: async (args: unknown) => {
        const { role, host } = args as z.infer<typeof skillListInput>;
        try {
          const payload = {
            ...registryMeta(loaded),
            skills: listSkills(loaded, { role, host }),
          };
          return {
            content: [{ type: "text", text: json(payload) }],
            structuredContent: payload,
          };
        } catch (error) {
          throw toMcpError(error);
        }
      },
    },
    {
      name: "skill_search",
      config: {
        title: "Search WarpMetal skills",
        description:
          "Rank WarpMetal skills by name, tag, description, role, and host matches. Use before skill_read to find the right skill for a task.",
        annotations: { readOnlyHint: true },
        inputSchema: skillSearchInput,
        outputSchema: skillSearchOutputSchema,
      },
      handler: async (args: unknown) => {
        const { query, limit, role, host } = args as z.infer<typeof skillSearchInput>;
        try {
          const payload = {
            ...registryMeta(loaded),
            query,
            hits: searchSkills(loaded, query, { limit, role, host }),
          };
          return {
            content: [{ type: "text", text: json(payload) }],
            structuredContent: payload,
          };
        } catch (error) {
          throw toMcpError(error);
        }
      },
    },
    {
      name: "skill_read",
      config: {
        title: "Read a WarpMetal skill",
        description:
          "Read a skill's SKILL.md or a supporting file listed in the registry. The registry checksum is verified before the content is returned.",
        annotations: { readOnlyHint: true },
        inputSchema: skillReadInput,
      },
      handler: async (args: unknown) => {
        const { name, file } = args as z.infer<typeof skillReadInput>;
        try {
          const content = await readSkillFile(loaded, name, file ?? "SKILL.md");
          return {
            content: [{ type: "text", text: content.text }],
          };
        } catch (error) {
          throw toMcpError(error);
        }
      },
    },
  ];
}

/**
 * Registers the content surface on the v1 server: the three `skill_*` tools plus
 * the `skill://` resources. Available in both profiles, because reading a skill
 * is a local, read-only operation that exposes no execution.
 *
 * These tools follow the same registration convention as the `wm_*` specs: a
 * strict Zod input schema and an output schema, so an unexpected argument and an
 * unexpected response field are both errors rather than something quietly
 * ignored. `skill_read` is the one exception, and for a real reason: its output
 * *is* the file body, streamed as markdown, so declaring an output schema would
 * force every file to be duplicated into `structuredContent` for no contract the
 * text block does not already carry.
 */
function registerContentTools(server: McpServer, loaded: LoadedRegistry): void {
  for (const tool of contentToolRegistrations(loaded)) {
    server.registerTool(tool.name, tool.config, tool.handler);
  }

  server.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: loaded.registry.skills.map((skill) => ({
      uri: `skill://${skill.name}`,
      name: skill.name,
      title: `skill://${skill.name}`,
      description: skill.description,
      mimeType: "text/markdown",
    })),
  }));

  server.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const { name, file } = parseSkillUri(request.params.uri);
      const content = await readSkillFile(loaded, name, file);
      const uri = file === "SKILL.md" ? `skill://${name}` : `skill://${name}/${file}`;
      const result: ReadResourceResult = {
        contents: [{ uri, mimeType: content.mimeType, text: content.text }],
      };
      return result;
    } catch (error) {
      throw toMcpError(error);
    }
  });
}

/**
 * Registers the `wm_*` surface only. Kept as its own factory because the
 * conformance suites drive exactly this surface with a fake runner and assert it
 * is precisely the 43 documented tools, with no content tools mixed in.
 */
export function buildServer(options: BuildServerOptions = {}): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerToolSpecs(server, options.specs ?? ALL_TOOL_SPECS, buildDeps(options));
  return server;
}

/**
 * The unified server used by both transports.
 *
 * `profile: "full"` is what `index.ts` connects to stdio by default;
 * `profile: "chatgpt-local"` is that same local channel minus the provider
 * tools; `profile: "content"` is what the HTTP handler builds per request.
 */
export function createSkillsServer(
  loaded: LoadedRegistry,
  options: ServerOptions = {},
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );

  const profile = options.profile ?? "full";

  registerContentTools(server, loaded);

  if (profile === "full" || profile === "chatgpt-local") {
    registerToolSpecs(server, options.specs ?? ALL_TOOL_SPECS, buildDeps(options));
    // `chatgpt-local` never registers the provider surface, so it also never
    // resolves the provider invoker: the count stays 46 whatever the host has
    // installed, and no third-party account can be reached from that profile.
    if (profile === "full" && options.providers !== null) {
      const invoker = options.providers ?? createProviderInvokerFromEnv();
      registerProviderTools(server, invoker);
    }
  }

  return server;
}

export function skillSummaries(loaded: LoadedRegistry) {
  return loaded.registry.skills.map(summarizeSkill);
}
