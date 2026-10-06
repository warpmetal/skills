/**
 * Register Action Gateway tools (all batches) on an MCP server (full profile only).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { loadAgCatalog } from "./catalog.js";
import type { ActionGatewayInvoker, AgCatalogTool, AgInvokeError, AgJsonSchema } from "./types.js";

const agResultSchema = z.object({
  ok: z.boolean(),
  tool: z.string(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

/**
 * Builds a Zod object from the Action Gateway JSON Schema so MCP clients see
 * real parameter names/types without hand-writing ten schemas.
 */
export function jsonSchemaToZodObject(schema: AgJsonSchema): z.ZodObject<Record<string, z.ZodType>> {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const shape: Record<string, z.ZodType> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let field = zodFromProperty(prop);
    if (prop.description) {
      field = field.describe(prop.description);
    }
    if (!required.has(key)) {
      field = field.optional();
    }
    shape[key] = field;
  }

  // AG schemas rarely set additionalProperties:false; keep unknown keys out so
  // we do not forward undeclared fields to action_invoke.
  return z.object(shape).strict();
}

function zodFromProperty(prop: AgJsonSchema): z.ZodType {
  switch (prop.type) {
    case "string":
      return z.string();
    case "integer":
      return z.number().int();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(prop.items ? zodFromProperty(prop.items) : z.unknown());
    case "object":
      if (prop.properties && Object.keys(prop.properties).length > 0) {
        return jsonSchemaToZodObject(prop);
      }
      return z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function agErrorPayload(tool: string, error: AgInvokeError): CallToolResult {
  const payload = {
    ok: false,
    tool,
    error: { code: error.code, message: error.message },
  };
  return {
    isError: true,
    content: [{ type: "text", text: json(payload) }],
    structuredContent: payload,
  };
}

function successPayload(tool: string, result: unknown): CallToolResult {
  const payload = { ok: true, tool, result };
  return {
    content: [{ type: "text", text: json(payload) }],
    structuredContent: payload,
  };
}

function extractAgError(error: unknown): AgInvokeError | null {
  if (!(error instanceof Error)) return null;
  const ag = (error as Error & { ag?: unknown }).ag;
  if (typeof ag === "object" && ag !== null && typeof (ag as AgInvokeError).code === "string") {
    return ag as AgInvokeError;
  }
  return null;
}

export function registerActionGatewayTools(
  server: McpServer,
  invoker: ActionGatewayInvoker,
  tools: readonly AgCatalogTool[] = loadAgCatalog(),
): void {
  for (const tool of tools) {
    const inputSchema = jsonSchemaToZodObject(tool.inputSchema);
    server.registerTool(
      tool.toolSlug,
      {
        title: tool.title,
        description: tool.description,
        inputSchema,
        outputSchema: agResultSchema,
        annotations: {
          title: tool.annotations.title ?? tool.title,
          readOnlyHint: tool.annotations.readOnlyHint,
          destructiveHint: tool.annotations.destructiveHint,
          idempotentHint: tool.annotations.idempotentHint,
          openWorldHint: tool.annotations.openWorldHint,
        },
      },
      async (args) => {
        try {
          const result = await invoker.invoke(tool.toolSlug, args as Record<string, unknown>);
          return successPayload(tool.toolSlug, result);
        } catch (error) {
          const ag = extractAgError(error);
          if (ag) return agErrorPayload(tool.toolSlug, ag);
          return agErrorPayload(tool.toolSlug, {
            code: "ag_invoke_failed",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
  }
}
