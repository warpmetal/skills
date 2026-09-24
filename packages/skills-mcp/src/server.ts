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
 * stdio gets: both surfaces, because stdio is a local, operator-controlled
 * channel. `content` is what HTTP gets: the `skill_*` tools and the registry
 * resources only, because the HTTP transport has no authentication, and the
 * `wm_*` tools spawn a privileged binary and mutate real infrastructure. A
 * remote, unauthenticated caller must never reach them, so the tools are not
 * registered at all rather than registered and refused - an absent tool cannot
 * be argued with.
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
 *  - `full`: the content surface plus the 43 `wm_*` CLI tools. stdio only.
 *  - `content`: the `skill_*` tools and the registry resources only. The safe
 *    profile for the unauthenticated HTTP transport.
 */
export type ServerProfile = "full" | "content";

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
 * Builds the shared dependencies for the `wm_*` surface. Called only when the
 * `full` profile is selected, so the HTTP server never allocates a latch store
 * or an approval broker it cannot expose.
 *
 * One directory resolves both the audit log and the latch, so redirecting one
 * redirects the other, and neither can be pointed somewhere the other is not.
 */
function buildDeps(options: ServerOptions): ServerDeps {
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

/**
 * Registers the content surface: the three `skill_*` tools plus the `skill://`
 * resources. Available in both profiles, because reading a skill is a local,
 * read-only operation that exposes no execution.
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

  server.registerTool(
    "skill_list",
    {
      title: "List WarpMetal skills",
      description:
        "List every skill in the WarpMetal registry with its version, description, roles, hosts, and files. Optional filters narrow by role or agent host.",
      annotations: { readOnlyHint: true },
      inputSchema: z.strictObject({
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
      }),
      outputSchema: skillListOutputSchema,
    },
    async (args) => {
      try {
        const payload = {
          ...registryMeta(loaded),
          skills: listSkills(loaded, { role: args.role, host: args.host }),
        };
        return {
          content: [{ type: "text", text: json(payload) }],
          structuredContent: payload,
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  server.registerTool(
    "skill_search",
    {
      title: "Search WarpMetal skills",
      description:
        "Rank WarpMetal skills by name, tag, description, role, and host matches. Use before skill_read to find the right skill for a task.",
      annotations: { readOnlyHint: true },
      inputSchema: z.strictObject({
        query: z.string().min(1).max(256).describe("Substring query, e.g. 'coding environment'"),
        limit: z.number().int().min(1).max(20).optional().describe("Maximum hits (default 10)"),
        role: z.string().min(1).max(64).optional(),
        host: z.string().min(1).max(64).optional(),
      }),
      outputSchema: skillSearchOutputSchema,
    },
    async (args) => {
      try {
        const payload = {
          ...registryMeta(loaded),
          query: args.query,
          hits: searchSkills(loaded, args.query, {
            limit: args.limit,
            role: args.role,
            host: args.host,
          }),
        };
        return {
          content: [{ type: "text", text: json(payload) }],
          structuredContent: payload,
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  server.registerTool(
    "skill_read",
    {
      title: "Read a WarpMetal skill",
      description:
        "Read a skill's SKILL.md or a supporting file listed in the registry. The registry checksum is verified before the content is returned.",
      annotations: { readOnlyHint: true },
      inputSchema: z.strictObject({
        name: z.string().min(1).max(64).describe("Skill name, e.g. warpmetal"),
        file: z
          .string()
          .min(1)
          .max(256)
          .optional()
          .describe("Relative file inside the skill; defaults to SKILL.md"),
      }),
    },
    async (args) => {
      try {
        const content = await readSkillFile(loaded, args.name, args.file ?? "SKILL.md");
        return {
          content: [{ type: "text", text: content.text }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

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
 * `profile: "full"` is what `index.ts` connects to stdio; `profile: "content"`
 * is what the HTTP handler builds per request.
 */
export function createSkillsServer(
  loaded: LoadedRegistry,
  options: ServerOptions = {},
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );

  registerContentTools(server, loaded);

  if ((options.profile ?? "full") === "full") {
    registerToolSpecs(server, options.specs ?? ALL_TOOL_SPECS, buildDeps(options));
  }

  return server;
}

export function skillSummaries(loaded: LoadedRegistry) {
  return loaded.registry.skills.map(summarizeSkill);
}
