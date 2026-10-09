export interface McpToolRequest {
  readonly method: string;
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  /** When set, send as application/x-www-form-urlencoded (Stripe-style). */
  readonly form?: Record<string, unknown>;
}

export interface McpToolDef {
  readonly toolSlug: string;
  readonly provider: string;
  readonly verb: string;
  readonly mutating: boolean;
  readonly gate?: string;
  readonly secretName: string;
  readonly build: (input: {
    args: Record<string, unknown>;
    ctx: Record<string, string>;
  }) => McpToolRequest;
}
