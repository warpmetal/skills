import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ErrorCode,
  ListResourcesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { SkillError } from "./errors.js";
import type { LoadedRegistry } from "./registry.js";
import {
  listSkills,
  parseSkillUri,
  readSkillFile,
  searchSkills,
  summarizeSkill,
} from "./skills.js";
import { packageVersion } from "./version.js";

export const SERVER_NAME = "warpmetal-skills";

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

export function createSkillsServer(loaded: LoadedRegistry): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: packageVersion() },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.registerTool(
    "skill_list",
    {
      title: "List WarpMetal skills",
      description:
        "List every skill in the WarpMetal registry with its version, description, roles, hosts, and files. Optional filters narrow by role or agent host.",
      annotations: { readOnlyHint: true },
      inputSchema: {
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
      },
    },
    async (args) => {
      try {
        const skills = listSkills(loaded, { role: args.role, host: args.host });
        return {
          content: [{ type: "text", text: json({ ...registryMeta(loaded), skills }) }],
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
      inputSchema: {
        query: z.string().min(1).max(256).describe("Substring query, e.g. 'coding environment'"),
        limit: z.number().int().min(1).max(20).optional().describe("Maximum hits (default 10)"),
        role: z.string().min(1).max(64).optional(),
        host: z.string().min(1).max(64).optional(),
      },
    },
    async (args) => {
      try {
        const hits = searchSkills(loaded, args.query, {
          limit: args.limit,
          role: args.role,
          host: args.host,
        });
        return {
          content: [{ type: "text", text: json({ ...registryMeta(loaded), query: args.query, hits }) }],
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
      inputSchema: {
        name: z.string().min(1).max(64).describe("Skill name, e.g. warpmetal"),
        file: z
          .string()
          .min(1)
          .max(256)
          .optional()
          .describe("Relative file inside the skill; defaults to SKILL.md"),
      },
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

  return server;
}

export function skillSummaries(loaded: LoadedRegistry) {
  return loaded.registry.skills.map(summarizeSkill);
}
