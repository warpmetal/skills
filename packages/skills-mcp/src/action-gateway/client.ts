/**
 * Action Gateway client: creates a session via the DigitalOcean public API and
 * invokes catalog tools through the session MCP endpoint (`action_invoke`).
 *
 * Implements the same wire protocol as `@digitalocean/dots/action_gateway`
 * without importing that package (its generated sources fail strict tsc).
 */
import { agToolSlugs } from "./catalog.js";
import {
  isActionGatewayConfigured,
  readActionGatewayEnv,
  type ActionGatewayEnv,
} from "./env.js";
import type { ActionGatewayInvoker, AgInvokeError } from "./types.js";

const DEFAULT_API_BASE = "https://api.digitalocean.com";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const META_INVOKE = "action_invoke";
const SESSION_NAME_PREFIX = "warpmetal-skills-mcp-ag";

interface GatewaySession {
  mcpUrl: string;
  sessionId: string;
  actorId: string;
  apiKey: string;
  nextRequestId: number;
}

export class ActionGatewayClientBridge implements ActionGatewayInvoker {
  readonly configured: boolean;
  private readonly env: ActionGatewayEnv;
  private readonly apiBaseURL: string;
  private sessionPromise: Promise<GatewaySession> | null = null;

  constructor(
    env: ActionGatewayEnv = readActionGatewayEnv(),
    apiBaseURL: string = DEFAULT_API_BASE,
  ) {
    this.env = env;
    this.apiBaseURL = apiBaseURL.replace(/\/+$/, "");
    this.configured = isActionGatewayConfigured(env);
  }

  async invoke(toolSlug: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.configured || !this.env.token || !this.env.actorId) {
      throw agError(
        "ag_unconfigured",
        "Action Gateway is not configured. Set DIGITALOCEAN_TOKEN and DIGITALOCEAN_AG_ACTOR_ID, authorize Connections for GitHub/GitLab/Notion/Stripe/Jira/Confluence/Linear/Supabase/Cloudflare/Vercel/Figma/Shopify/HubSpot/Asana/Dropbox/Discord/Airtable/Intercom/Snowflake/Sentry/Datadog/PagerDuty/Exa/Perplexity/Resend/Calendly/ClickUp/PostHog/Mixpanel/CircleCI/Mailchimp/X/Square/OpenAI/Gemini/Anthropic Admin/Grafana Cloud/Monday.com/OneSignal/Amplitude on that actor, then restart warpmetal-skills-mcp (stdio / full profile).",
      );
    }

    try {
      const session = await this.ensureSession();
      return await invokeOne(session, toolSlug, args);
    } catch (error) {
      if (isAgError(error)) throw error;
      this.sessionPromise = null;
      throw agError(
        "ag_invoke_failed",
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  private ensureSession(): Promise<GatewaySession> {
    if (!this.sessionPromise) {
      this.sessionPromise = this.createSession().catch((error) => {
        this.sessionPromise = null;
        throw error;
      });
    }
    return this.sessionPromise;
  }

  private async createSession(): Promise<GatewaySession> {
    const apiKey = this.env.token!;
    const actorId = this.env.actorId!;
    const tools = [...agToolSlugs()];
    const body = {
      actorId,
      name: `${SESSION_NAME_PREFIX}-${Date.now().toString(16)}`,
      tools,
      policy: {
        defaultAction: "deny",
        rules: [
          { tool: "action_search", action: "allow" },
          { tool: META_INVOKE, action: "allow" },
          ...tools.map((tool) => ({ tool, action: "allow" })),
        ],
      },
      config: { preloadTools: tools },
    };

    let payload: Record<string, unknown>;
    try {
      payload = await requestJson(`${this.apiBaseURL}/v2/action-gateway/sessions`, apiKey, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw agError(
        "ag_session_failed",
        error instanceof Error ? error.message : String(error),
        error,
      );
    }

    const sessionObj = asObject(payload["session"]);
    const sessionUrn = String(sessionObj["sessionUrn"] ?? "");
    const mcpUrl = String(payload["mcpUrl"] ?? "");
    if (!sessionUrn || !mcpUrl) {
      throw agError("ag_session_failed", "session create response missing sessionUrn or mcpUrl");
    }
    assertHttpsOrLoopback(mcpUrl);

    return {
      apiKey,
      actorId,
      mcpUrl,
      sessionId: sessionUrn.split(":").at(-1) ?? sessionUrn,
      nextRequestId: 1,
    };
  }
}

async function invokeOne(
  session: GatewaySession,
  toolSlug: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const envelope = asObject(
    await mcpRpc(session, "tools/call", {
      name: META_INVOKE,
      arguments: {
        tools: [{ tool: toolSlug, arguments: args }],
      },
    }),
  );

  if (envelope["isError"]) {
    const structured = asObject(envelope["structuredContent"]);
    const error = asObject(structured["error"]);
    throw agError(
      "ag_invoke_failed",
      String(error["message"] ?? contentText(envelope["content"]) ?? "tool call failed"),
    );
  }

  const structured = envelope["structuredContent"];
  if (structured !== undefined) {
    return unwrapInvokeEnvelope(structured, toolSlug);
  }
  const text = contentText(envelope["content"]);
  if (text === undefined) return envelope;
  try {
    return unwrapInvokeEnvelope(JSON.parse(text), toolSlug);
  } catch {
    return text;
  }
}

function unwrapInvokeEnvelope(payload: unknown, toolSlug: string): unknown {
  const root = asObject(payload);
  const results = Array.isArray(root["results"]) ? root["results"] : null;
  if (!results || results.length === 0) {
    if ("output" in root || "status" in root) return unwrapToolResult(root);
    return payload;
  }
  const first = asObject(results[0]);
  const inner = first["result"] ?? first;
  return unwrapToolResult(asObject(inner), toolSlug);
}

function unwrapToolResult(result: Record<string, unknown>, toolSlug?: string): unknown {
  if (result["status"] && result["status"] !== "succeeded") {
    const error = asObject(result["error"]);
    throw agError(
      "ag_invoke_failed",
      String(error["message"] ?? `invoke of ${toolSlug ?? "tool"} failed`),
    );
  }
  if ("output" in result) {
    const output = result["output"];
    if (typeof output === "string") {
      try {
        return JSON.parse(output);
      } catch {
        return output;
      }
    }
    return output;
  }
  return result;
}

async function mcpRpc(
  session: GatewaySession,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const id = session.nextRequestId++;
  const response = await fetch(session.mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.apiKey}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      "X-Session-Id": session.sessionId,
      "X-Actor-Id": session.actorId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });
  const text = await response.text();
  const envelope = parseMcpEnvelope(text);
  if (!response.ok) {
    throw new Error(String(asObject(envelope)["message"] ?? response.statusText ?? "MCP request failed"));
  }
  const error = asObject(asObject(envelope)["error"]);
  if (Object.keys(error).length > 0) {
    throw new Error(String(error["message"] ?? "MCP request failed"));
  }
  if (!("result" in asObject(envelope))) {
    throw new Error("MCP response is missing result");
  }
  return asObject(envelope)["result"];
}

async function requestJson(
  url: string,
  apiKey: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = String(asObject(body)["message"] ?? response.statusText ?? "request failed");
    throw new Error(message);
  }
  return asObject(body);
}

function parseMcpEnvelope(text: string): unknown {
  if (!text.trim()) return undefined;
  if (!text.split("\n").some((line) => line.startsWith("data:"))) {
    return JSON.parse(text) as unknown;
  }
  const events = text.split(/\r?\n\r?\n/);
  for (const event of events) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    const candidate = JSON.parse(data) as unknown;
    if ("result" in asObject(candidate) || "error" in asObject(candidate)) return candidate;
  }
  throw new Error("MCP response did not contain a JSON-RPC result");
}

function contentText(content: unknown): string | undefined {
  const text = (Array.isArray(content) ? content : [])
    .map(asObject)
    .filter((item) => item["type"] === "text" && typeof item["text"] === "string")
    .map((item) => String(item["text"]))
    .join("\n");
  return text || undefined;
}

function assertHttpsOrLoopback(mcpUrl: string): void {
  let url: URL;
  try {
    url = new URL(mcpUrl);
  } catch {
    throw agError("ag_session_failed", `invalid mcpUrl: ${mcpUrl}`);
  }
  if (url.protocol === "https:") return;
  if (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
  ) {
    return;
  }
  throw agError("ag_session_failed", `non-HTTPS mcpUrl refused: ${mcpUrl}`);
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function agError(code: AgInvokeError["code"], message: string, cause?: unknown): Error {
  const error = new Error(message);
  (error as Error & { ag: AgInvokeError; cause?: unknown }).ag = { code, message };
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

function isAgError(error: unknown): error is Error & { ag: AgInvokeError } {
  if (!(error instanceof Error)) return false;
  const ag = (error as Error & { ag?: unknown }).ag;
  return typeof ag === "object" && ag !== null && typeof (ag as AgInvokeError).code === "string";
}

export function createActionGatewayClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ActionGatewayInvoker {
  return new ActionGatewayClientBridge(readActionGatewayEnv(env));
}

/** Test helper: invoker that never talks to DigitalOcean. */
export function createMockActionGatewayInvoker(options: {
  configured?: boolean;
  invoke?: (toolSlug: string, args: Record<string, unknown>) => Promise<unknown>;
}): ActionGatewayInvoker {
  const configured = options.configured ?? false;
  return {
    configured,
    async invoke(toolSlug, args) {
      if (!configured) {
        throw agError(
          "ag_unconfigured",
          "Action Gateway is not configured. Set DIGITALOCEAN_TOKEN and DIGITALOCEAN_AG_ACTOR_ID.",
        );
      }
      if (options.invoke) return options.invoke(toolSlug, args);
      return { ok: true, tool: toolSlug, args };
    },
  };
}
