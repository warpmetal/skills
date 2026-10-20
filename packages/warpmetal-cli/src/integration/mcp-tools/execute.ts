import { flagBool, flagString, requireConfirm, type ParsedArgs } from "../../args.js";
import {
  failure,
  needsAuth,
  ok,
  type AdapterContext,
  type AdapterResult,
} from "../adapters/types.js";
import type { McpToolDef } from "./types.js";

/**
 * Extra context secrets/env used to build provider URLs (site, shop, DC, …).
 */
async function buildContext(
  def: McpToolDef,
  context: AdapterContext,
): Promise<Record<string, string>> {
  const ctx: Record<string, string> = {};
  const read = async (name: string, key: string): Promise<void> => {
    const value = await context.store.read(name);
    if (value !== null) ctx[key] = value;
  };

  switch (def.provider) {
    case "jira":
      await read("jira.site", "jiraBase");
      ctx.jiraBase = (ctx.jiraBase ?? context.env["JIRA_SITE"] ?? "").replace(/\/+$/, "");
      await read("jira.email", "jiraEmail");
      ctx.jiraEmail = ctx.jiraEmail ?? context.env["JIRA_EMAIL"] ?? "";
      break;
    case "confluence":
      await read("confluence.site", "confluenceBase");
      ctx.confluenceBase = (ctx.confluenceBase ?? context.env["CONFLUENCE_SITE"] ?? "").replace(
        /\/+$/,
        "",
      );
      await read("confluence.email", "confluenceEmail");
      ctx.confluenceEmail = ctx.confluenceEmail ?? context.env["CONFLUENCE_EMAIL"] ?? "";
      break;
    case "shopify":
      await read("shopify.shop", "shop");
      ctx.shop = ctx.shop ?? context.env["SHOPIFY_SHOP"] ?? "";
      break;
    case "snowflake":
      await read("snowflake.account_url", "snowflakeBase");
      await read("snowflake.warehouse", "warehouse");
      ctx.snowflakeBase = (ctx.snowflakeBase ?? context.env["SNOWFLAKE_ACCOUNT_URL"] ?? "").replace(
        /\/+$/,
        "",
      );
      ctx.warehouse = ctx.warehouse ?? context.env["SNOWFLAKE_WAREHOUSE"] ?? "";
      break;
    case "posthog":
      await read("posthog.host", "posthogBase");
      ctx.posthogBase = (
        ctx.posthogBase ??
        context.env["POSTHOG_HOST"] ??
        "https://us.posthog.com"
      ).replace(/\/+$/, "");
      break;
    case "mailchimp":
      await read("mailchimp.dc", "mailchimpDc");
      ctx.mailchimpDc = ctx.mailchimpDc ?? context.env["MAILCHIMP_DC"] ?? "us1";
      break;
    case "pagerduty":
      // PagerDuty requires a `From` header identifying the acting user.
      await read("pagerduty.email", "pagerdutyEmail");
      ctx.pagerdutyEmail = ctx.pagerdutyEmail ?? context.env["PAGERDUTY_EMAIL"] ?? "";
      break;
    case "plane": {
      // Plane is per-workspace: the slug names the workspace in every path, so a
      // value carrying `/`, `..` or a query string would move the request - and the
      // stored API key with it - to a different resource. `planeWorkspaceSlug`
      // reduces the shapes an operator can paste and refuses everything else.
      await read("plane.workspace_slug", "planeWorkspace");
      ctx.planeWorkspace = planeWorkspaceSlug(
        ctx.planeWorkspace ?? context.env["PLANE_WORKSPACE_SLUG"] ?? "",
      );
      break;
    }
    case "zendesk": {
      // Zendesk is per-tenant: every request goes to <subdomain>.zendesk.com.
      // A bare label is expected, but an operator who pastes the full host or
      // URL is reduced to the label instead of producing a doubled hostname.
      // The result must still be a DNS label, because it is interpolated into
      // the host: a value carrying `/`, `:` or `@` would move the request - and
      // the Basic credential with it - to a host that is not *.zendesk.com.
      await read("zendesk.subdomain", "zendeskSubdomain");
      const raw = (ctx.zendeskSubdomain ?? context.env["ZENDESK_SUBDOMAIN"] ?? "").trim();
      const label = raw
        .replace(/^https?:\/\//, "")
        .replace(/\.zendesk\.com.*$/, "")
        .replace(/\/+$/, "");
      ctx.zendeskSubdomain = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label) ? label : "";
      await read("zendesk.email", "zendeskEmail");
      ctx.zendeskEmail = ctx.zendeskEmail ?? context.env["ZENDESK_EMAIL"] ?? "";
      break;
    }
    case "grafana-stack": {
      // Grafana Cloud stacks are per-customer too: every request goes to
      // <stack>.grafana.net. The same allowlist reasoning as Zendesk applies -
      // the label is interpolated into the host, so a value carrying `/`, `:`
      // or `@` would move the request, and the Bearer token with it, off
      // *.grafana.net. A pasted host or URL is reduced to its label.
      await read("grafana.stack", "grafanaStack");
      const raw = (ctx.grafanaStack ?? context.env["GRAFANA_STACK"] ?? "").trim();
      const label = raw
        .replace(/^https?:\/\//, "")
        .replace(/\.grafana\.net.*$/, "")
        .replace(/\/+$/, "");
      ctx.grafanaStack = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label) ? label : "";
      break;
    }
    default:
      break;
  }

  return ctx;
}

async function readArgsJson(
  args: ParsedArgs,
  readStdin: () => Promise<string>,
): Promise<Record<string, unknown>> {
  // `--args-stdin` keeps the payload out of argv (and out of `ps`); the MCP
  // invoker uses it so secrets in arguments never reach the process list.
  const raw = flagBool(args, "args-stdin")
    ? await readStdin()
    : flagString(args, "args-json");
  if (raw === undefined || raw.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error("not an object");
  } catch {
    return { __parse_error: true };
  }
}

function basicAuthValue(email: string, token: string): string {
  return Buffer.from(`${email}:${token}`, "utf8").toString("base64");
}

/**
 * The user part of a Basic credential, per provider.
 *
 * Atlassian Cloud takes `<email>:<api_token>`. Zendesk takes
 * `<email>/token:<api_token>`: a bare `<email>:<api_token>` is rejected with
 * HTTP 401, so the `/token` literal is part of the credential, not a path.
 */
function basicAuthUser(
  provider: string,
  ctx: Readonly<Record<string, string>>,
): string | undefined {
  switch (provider) {
    case "jira":
      return ctx.jiraEmail;
    case "confluence":
      return ctx.confluenceEmail;
    case "zendesk": {
      const email = ctx.zendeskEmail;
      return email === undefined || email.length === 0 ? undefined : `${email}/token`;
    }
    default:
      return undefined;
  }
}

function substituteToken(
  headers: Readonly<Record<string, string>> | undefined,
  token: string,
  url: string,
  basic: string | null,
): { headers: Record<string, string>; url: string } {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    let next = value.replaceAll("__TOKEN__", token);
    if (basic !== null) next = next.replaceAll("__BASIC__", basic);
    out[key] = next;
  }
  return { headers: out, url: url.replaceAll("__TOKEN__", token) };
}

function encodeForm(form: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object") {
      search.set(key, JSON.stringify(value));
    } else {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

/**
 * The workspace label in a stored `plane.workspace_slug`, or "" when the value is
 * not one of the shapes an operator can paste.
 *
 * The slug names the workspace in every path, so a value carrying `/`, `..` or a
 * query string would move the request - and the stored API key with it - to a
 * different resource. Plane labels are DNS-label shaped, so a bare label is taken
 * as it is and the two URL shapes Plane prints are reduced to their label:
 * `https://app.plane.so/<slug>/` and
 * `https://api.plane.so/api/v1/workspaces/<slug>/`. Everything else is refused -
 * including a deep app link (`https://app.plane.so/<slug>/issues/`), whose other
 * segments do not name the workspace. The reductions are anchored per segment
 * rather than done with a blind string replace, because a replace would splice
 * the neighbours of a stray `workspaces/` together into a label that passes the
 * shape check: `a/workspaces/b` must be refused, not read as `ab`.
 */
function planeWorkspaceSlug(raw: string): string {
  const segments = raw
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/[?#].*$/, "")
    .split("/")
    .filter((part) => part !== "");
  // A pasted value may carry the host. A host is the only leading segment that can
  // hold a "." or a ":", and a host with no path leaves no label behind.
  if (segments.length > 1 && /[.:]/.test(segments[0] ?? "")) segments.shift();
  if (segments[0] === "api" && segments[1] === "v1") segments.splice(0, 2);
  if (segments[0] === "workspaces") segments.shift();
  const label = segments.length === 1 ? (segments[0] ?? "") : "";
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label) ? label : "";
}

/**
 * Normalises a provider body into the `data` object the envelope carries.
 *
 * The provider's root is not always an object. When it is an array, spreading
 * it would turn `[a, b]` into `{ 0: a, 1: b }` - the payload survives but stops
 * being an array, which every consumer would have to special-case. Wrapping it
 * under `items` keeps one predictable shape for every tool.
 */
function wrapProviderData(
  def: McpToolDef,
  json: unknown,
  text: string,
): Record<string, unknown> {
  if (Array.isArray(json)) {
    return { items: json, toolSlug: def.toolSlug };
  }
  if (json !== null && json !== undefined && typeof json === "object") {
    // `toolSlug` last, so a provider response field of the same name cannot
    // masquerade as the routing identity.
    return { ...(json as Record<string, unknown>), toolSlug: def.toolSlug };
  }
  return { raw: text, toolSlug: def.toolSlug };
}

/**
 * Providers that refuse an unusable credential with 403 rather than 401.
 *
 * A 403 usually means "the credential is fine, the scope is not", and the hint
 * below says so. Plane is not that: measured against the live API
 * (`scripts/plane/probe.mjs`), a key it does not recognise is refused with
 * `403 {"detail":"Given API token is not valid"}`, while the 403 it sends for a
 * missing permission carries a different body. Reading the first as a scope
 * problem sends the operator to grant a permission instead of reissuing the key,
 * so the body - not the status alone - decides, and only for a provider whose body
 * was measured.
 */
const CREDENTIAL_REFUSED_ON_403: Readonly<Record<string, readonly string[]>> = {
  plane: ["API token is not valid"],
};

export async function executeMcpTool(
  def: McpToolDef,
  args: ParsedArgs,
  context: AdapterContext,
): Promise<AdapterResult> {
  if (def.mutating) {
    if (!def.gate) {
      return failure(def.provider, def.verb, `Mutating tool ${def.toolSlug} has no confirm gate.`);
    }
    requireConfirm(args, def.gate);
  }

  const toolArgs = await readArgsJson(args, context.readStdin);
  if (toolArgs["__parse_error"]) {
    return failure(def.provider, def.verb, "Provider arguments must be a JSON object.");
  }

  // A shape the schema cannot express (for example "one of these two fields").
  // Checked before the credential is read and before a request is built, so an
  // impossible call fails with the reason instead of a provider 4xx.
  const invalid = def.validate?.(toolArgs) ?? null;
  if (invalid !== null) {
    return failure(def.provider, def.verb, invalid);
  }

  const ctx = await buildContext(def, context);
  if (def.provider === "jira" && !ctx.jiraBase) {
    return needsAuth(
      def.provider,
      def.verb,
      "No jira.site in the store (e.g. https://example.atlassian.net).",
    );
  }
  if (def.provider === "confluence" && !ctx.confluenceBase) {
    return needsAuth(
      def.provider,
      def.verb,
      "No confluence.site in the store (e.g. https://example.atlassian.net).",
    );
  }
  if (def.provider === "shopify" && !ctx.shop) {
    return needsAuth(def.provider, def.verb, "No shopify.shop in the store (e.g. my-shop.myshopify.com).");
  }
  if (def.provider === "snowflake" && !ctx.snowflakeBase) {
    return needsAuth(def.provider, def.verb, "No snowflake.account_url in the store.");
  }
  if (def.provider === "pagerduty" && !ctx.pagerdutyEmail) {
    return needsAuth(
      def.provider,
      def.verb,
      "No pagerduty.email in the store (the API requires a From header).",
    );
  }
  if (def.provider === "plane" && !ctx.planeWorkspace) {
    return needsAuth(
      def.provider,
      def.verb,
      "No valid plane.workspace_slug in the store (the workspace's slug, as it appears in " +
        "https://app.plane.so/<slug>/). Run `warpmetal env store set plane.workspace_slug`.",
    );
  }
  if (def.provider === "zendesk" && !ctx.zendeskSubdomain) {
    return needsAuth(
      def.provider,
      def.verb,
      "No valid zendesk.subdomain in the store (the label in <subdomain>.zendesk.com).",
    );
  }
  if (def.provider === "grafana-stack" && !ctx.grafanaStack) {
    return needsAuth(
      def.provider,
      def.verb,
      "No valid grafana.stack in the store (the label in <stack>.grafana.net).",
    );
  }

  const built = def.build({ args: toolArgs, ctx });
  const headerValues = Object.values(built.headers ?? {});
  const needsToken =
    built.url.includes("__TOKEN__") || headerValues.some((value) => value.includes("__TOKEN__"));
  const needsBasic = headerValues.some((value) => value.includes("__BASIC__"));
  const token = (await context.store.read(def.secretName)) ?? "";
  if ((needsToken || needsBasic) && token.length === 0) {
    return needsAuth(
      def.provider,
      def.verb,
      `No ${def.secretName} in the store. Run \`warpmetal env store set ${def.secretName}\`.`,
    );
  }
  if (token.length > 0) context.redactor.add(token);

  let basic: string | null = null;
  if (needsBasic) {
    const user = basicAuthUser(def.provider, ctx);
    if (user === undefined || user.length === 0) {
      return needsAuth(
        def.provider,
        def.verb,
        `No ${def.provider}.email in the store. Run \`warpmetal env store set ${def.provider}.email\`.`,
      );
    }
    basic = basicAuthValue(user, token);
    context.redactor.add(basic);
  }

  const { headers, url } = substituteToken(built.headers, token, built.url, basic);

  let body: string | undefined;
  const requestHeaders = { ...headers };
  if (built.form) {
    body = encodeForm(built.form);
    requestHeaders["Content-Type"] = "application/x-www-form-urlencoded";
  } else if (built.body !== undefined) {
    body = JSON.stringify(built.body);
    if (!requestHeaders["Content-Type"]) {
      requestHeaders["Content-Type"] = "application/json";
    }
  }

  const response = await context.http({
    method: built.method,
    url,
    headers: requestHeaders,
    body,
  });

  if (response.status === 0) {
    return {
      provider: def.provider,
      verb: def.verb,
      status: "DEGRADED",
      warnings: [`${def.provider} unreachable; credential validity is unknown.`],
    };
  }
  if (response.status === 401) {
    // The credential itself was refused: it is absent, expired or revoked.
    return needsAuth(
      def.provider,
      def.verb,
      `${def.provider} rejected the stored credential (HTTP 401); it is invalid, expired or revoked.`,
    );
  }
  if (response.status === 403) {
    // A 403 is not a rejected credential: the token is valid but the provider
    // scoped it too narrowly. Reporting it as "rejected" sends the operator to
    // rotate a working token instead of granting the missing scope. A provider
    // that breaks that rule answers with a body that says so, and only then is the
    // credential treated as refused.
    const authRefused = CREDENTIAL_REFUSED_ON_403[def.provider] ?? [];
    if (authRefused.some((marker) => response.text.includes(marker))) {
      return needsAuth(
        def.provider,
        def.verb,
        `${def.provider} rejected the stored credential (HTTP 403); it is invalid, expired or revoked.`,
      );
    }
    return needsAuth(
      def.provider,
      def.verb,
      `${def.provider} accepted the credential but it lacks permission for this action (HTTP 403); the token is valid, so grant the scope ${def.toolSlug} needs.`,
    );
  }
  if (!response.ok) {
    return failure(
      def.provider,
      def.verb,
      `${def.provider} responded with HTTP ${String(response.status)}.`,
    );
  }

  return ok(def.provider, def.verb, wrapProviderData(def, response.json, response.text));
}
