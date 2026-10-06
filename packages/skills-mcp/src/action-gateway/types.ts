/**
 * Shared Action Gateway catalog / invoke types for the aggregated tool surface.
 */

export interface AgToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** JSON Schema object as returned by DigitalOcean Action Gateway. */
export interface AgJsonSchema {
  type?: string;
  properties?: Record<string, AgJsonSchema & { description?: string }>;
  required?: string[];
  items?: AgJsonSchema;
  additionalProperties?: boolean | AgJsonSchema;
  description?: string;
  [key: string]: unknown;
}

export interface AgCatalogTool {
  toolSlug: string;
  name: string;
  title: string;
  description: string;
  toolkitId: string;
  version: string;
  inputSchema: AgJsonSchema;
  outputSchema?: AgJsonSchema;
  annotations: AgToolAnnotations;
}

export interface AgCatalogFile {
  version: number;
  batch: string;
  source: string;
  extractedAt: string;
  tools: AgCatalogTool[];
}

export type AgInvokeErrorCode =
  | "ag_unconfigured"
  | "ag_session_failed"
  | "ag_invoke_failed"
  | "ag_invalid_args";

export interface AgInvokeError {
  code: AgInvokeErrorCode;
  message: string;
}

export interface ActionGatewayInvoker {
  /** True when DIGITALOCEAN_TOKEN and DIGITALOCEAN_AG_ACTOR_ID (or session URL) are set. */
  readonly configured: boolean;
  invoke(toolSlug: string, args: Record<string, unknown>): Promise<unknown>;
}
