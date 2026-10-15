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
  /**
   * Argument check the JSON Schema cannot express, run before anything is sent.
   *
   * Returns `null` when the arguments are acceptable, or the reason they are
   * not. The reason is reported verbatim as an `ERROR` result (exit 5) and no
   * request is made, so a call that could never succeed fails cheaply and with
   * a message that names the fix.
   */
  readonly validate?: (args: Record<string, unknown>) => string | null;
  readonly build: (input: {
    args: Record<string, unknown>;
    ctx: Record<string, string>;
  }) => McpToolRequest;
}
