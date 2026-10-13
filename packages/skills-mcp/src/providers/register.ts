/**
 * Register WarpMetal provider tools (all batches) on an MCP server (full profile only).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { loadProviderCatalog } from "./catalog.js";
import { withExperimentalMarker } from "./experimental.js";
import type {
  ProviderCatalogTool,
  ProviderInvokeError,
  ProviderInvoker,
  ProviderJsonSchema,
} from "./types.js";

const providerResultSchema = z.object({
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
 * Builds a Zod object from the catalog JSON Schema so MCP clients see
 * real parameter names/types without hand-writing schemas.
 */
export function jsonSchemaToZodObject(
  schema: ProviderJsonSchema,
): z.ZodObject<Record<string, z.ZodType>> {
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

  const base = z.object(shape);
  // `additionalProperties: true` (or a schema) means extras are allowed; the
  // default is strict, matching the root object and the "an undeclared argument
  // is an error" contract the rest of this server keeps.
  return schema.additionalProperties === true ? base.passthrough() : base.strict();
}

function isLiteral(value: unknown): value is string | number | boolean | null {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  );
}

function zodFromProperty(prop: ProviderJsonSchema): z.ZodType {
  let base = zodBase(prop);
  if (prop.default !== undefined) {
    // A provider-declared default is honoured so a caller can omit the field.
    base = base.default(prop.default as never);
  }
  return base;
}

function zodBase(prop: ProviderJsonSchema): z.ZodType {
  // A field may accept more than one shape (GitLab project_id: an id or a path).
  // Without this, such a property fell through to z.unknown() and validated nothing.
  if (Array.isArray(prop.anyOf) && prop.anyOf.length > 0) {
    const options = prop.anyOf.map((option) => zodBase(option));
    if (options.length === 1) return options[0]!;
    return z.union(options as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  }

  // `"type": ["integer", "null"]` is how the catalog spells a nullable field
  // (Zendesk's `assignee_id`, Vercel's `framework`, Intercom's `phone`). The
  // switch below reads a single type, so without this branch the whole property
  // fell to z.unknown(): a wrong type was accepted here and only refused by the
  // provider, and `null` - a documented value - was indistinguishable from a
  // missing one. Each non-null type is built as if it stood alone, then the
  // union is made nullable when the list carries `"null"`.
  if (Array.isArray(prop.type)) {
    const types = prop.type.filter((entry) => entry !== "null");
    const options = types.map((entry) => zodBase({ ...prop, type: entry }));
    const base =
      options.length === 0
        ? z.unknown()
        : options.length === 1
          ? options[0]!
          : z.union(options as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
    return prop.type.includes("null") ? base.nullable() : base;
  }

  const enumValues = prop.enum;
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    if (enumValues.every((value): value is string => typeof value === "string")) {
      return z.enum(enumValues as [string, ...string[]]);
    }
    const literals = enumValues.filter(isLiteral).map((value) => z.literal(value));
    if (literals.length === enumValues.length) {
      if (literals.length === 1) return literals[0]!;
      return z.union(literals as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
    }
  }

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

function providerErrorPayload(tool: string, error: ProviderInvokeError): CallToolResult {
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

function extractProviderError(error: unknown): ProviderInvokeError | null {
  if (!(error instanceof Error)) return null;
  const provider = (error as Error & { provider?: unknown }).provider;
  if (
    typeof provider === "object" &&
    provider !== null &&
    typeof (provider as ProviderInvokeError).code === "string"
  ) {
    return provider as ProviderInvokeError;
  }
  return null;
}

export function registerProviderTools(
  server: McpServer,
  invoker: ProviderInvoker,
  tools: readonly ProviderCatalogTool[] = loadProviderCatalog(),
): void {
  for (const tool of tools) {
    const inputSchema = jsonSchemaToZodObject(tool.inputSchema);
    server.registerTool(
      tool.toolSlug,
      {
        title: tool.title,
        description: withExperimentalMarker(tool.toolSlug, tool.description),
        inputSchema,
        outputSchema: providerResultSchema,
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
          const provider = extractProviderError(error);
          if (provider) return providerErrorPayload(tool.toolSlug, provider);
          return providerErrorPayload(tool.toolSlug, {
            code: "provider_invoke_failed",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
  }
}
