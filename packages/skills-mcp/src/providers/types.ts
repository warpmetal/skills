/**
 * Shared provider catalog / invoke types for the WarpMetal-backed tool surface.
 */

export interface ProviderToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** JSON Schema object for MCP tool input contracts. */
export interface ProviderJsonSchema {
  /**
   * A single type, or a list of them. The catalog spells a nullable field as
   * `["integer", "null"]`, which `jsonSchemaToZodObject` turns into a nullable
   * schema rather than an unvalidated `z.unknown()`.
   */
  type?: string | string[];
  properties?: Record<string, ProviderJsonSchema & { description?: string }>;
  required?: string[];
  items?: ProviderJsonSchema;
  additionalProperties?: boolean | ProviderJsonSchema;
  description?: string;
  /** Alternative shapes for one field; GitLab ids accept a string or an integer. */
  anyOf?: ProviderJsonSchema[];
  [key: string]: unknown;
}

export interface ProviderCatalogTool {
  toolSlug: string;
  name: string;
  title: string;
  description: string;
  toolkitId: string;
  version: string;
  inputSchema: ProviderJsonSchema;
  outputSchema?: ProviderJsonSchema;
  annotations: ProviderToolAnnotations;
}

export interface ProviderCatalogFile {
  version: number;
  /** Provider `toolkitId` this file holds; mirrors the file name (`jira.json` -> `"jira"`). */
  provider: string;
  source: string;
  extractedAt: string;
  tools: ProviderCatalogTool[];
}

export type ProviderInvokeErrorCode =
  | "provider_unconfigured"
  | "provider_not_implemented"
  | "provider_invoke_failed"
  | "provider_invalid_args";

export interface ProviderInvokeError {
  code: ProviderInvokeErrorCode;
  message: string;
}

export interface ProviderInvoker {
  /** True when the WarpMetal CLI can be resolved for integration calls. */
  readonly configured: boolean;
  invoke(toolSlug: string, args: Record<string, unknown>): Promise<unknown>;
}
