/**
 * probe-mcp-routes.mjs - a credential-free reachability probe for every MCP
 * provider tool.
 *
 * The static audit (Proxy traps over the builders) proves every declared
 * argument is read and every schema is well-typed, but it cannot notice a URL
 * that points at a host or path the provider does not serve - the Amplitude bug
 * (a management host that 404s the flags path) shipped through a fully
 * consistent schema and a green fixture test. This probe closes that gap
 * without a credential: a valid route answers 401/403 when the token is
 * garbage, while an invented route answers 404/405. The distinction is in the
 * path, not the secret.
 *
 * It builds each request from the reviewed sample args/ctx, substitutes a
 * sentinel token for `__TOKEN__`/`__BASIC__`, and sends it. Providers reject the
 * sentinel before doing anything, so the probe has no side effects.
 *
 * A 404 is only conclusive when the host uses 404 for genuinely unknown paths.
 * Two patterns make it a false positive, and both are detected with a control
 * request to a bogus path on the same host:
 *   - auth-first hosts answer 401 to any path, so their 401s are not evidence
 *     and a 404 elsewhere is not either;
 *   - website/SPA hosts (a single-page app) answer 2xx to any path, and resolve
 *     a path parameter - an org or project slug - before authenticating, so a
 *     placeholder slug yields 404 even though the route is correct.
 * When the control does not answer 404 for a bogus path, a tool 404 is marked
 * `weakSignal` and excluded from the failure set. `test/.../provider-contract`
 * still pins the host independently, so that gap is covered elsewhere.
 *
 * Run it with `npm run probe` (network required). It is not part of `npm test`;
 * `test/mcp-route-probe.test.ts` runs the same logic behind `MCP_PROBE=1`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { MCP_TOOL_DEFS } from "../src/integration/mcp-tools/catalog.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "test/fixtures/mcp-requests");

export const SENTINEL_TOKEN = "warpmetal-route-probe-not-a-real-token";
export const SENTINEL_BASIC = Buffer.from("probe:probe", "utf8").toString("base64");

/** Hosts whose tools cannot be probed because the URL is account-scoped. */
const ACCOUNT_SCOPED_HOSTS = new Set([
  "acme.atlassian.net",
  "acme.myshopify.com",
  "acme.snowflakecomputing.com",
]);

const INVALID_STATUSES = new Set([404, 405, 410, 501]);

export function classify(status) {
  if (status === 0) return "unreachable";
  if (INVALID_STATUSES.has(status)) return "invalid-route";
  if (status === 401 || status === 403) return "auth-required";
  if (status === 400 || status === 422 || status === 429) return "reachable";
  if (status >= 200 && status < 300) return "public";
  if (status >= 500) return "server-error";
  return "other";
}

function applySentinel(request) {
  const headers = {};
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    headers[key] = value
      .replaceAll("__TOKEN__", SENTINEL_TOKEN)
      .replaceAll("__BASIC__", SENTINEL_BASIC);
  }
  return {
    ...request,
    url: request.url.replaceAll("__TOKEN__", SENTINEL_TOKEN),
    headers,
  };
}

function encodeForm(form) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(form)) {
    if (value === undefined || value === null) continue;
    search.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return search.toString();
}

function bodyFor(request) {
  if (request.form) {
    return { body: encodeForm(request.form), contentType: "application/x-www-form-urlencoded" };
  }
  if (request.body !== undefined) {
    return { body: JSON.stringify(request.body), contentType: "application/json" };
  }
  return { body: undefined, contentType: undefined };
}

async function send(built, fetchFn, timeoutMs) {
  const request = applySentinel(built);
  const { body, contentType } = bodyFor(request);
  const headers = { ...request.headers };
  if (body !== undefined && contentType && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = contentType;
  }
  try {
    const response = await fetchFn(request.url, {
      method: request.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status };
  } catch {
    return { status: 0 };
  }
}

/**
 * Probes every tool and returns one row per tool plus the control verdict per
 * host. `fetchFn` is injectable so the opt-in test can drive it offline.
 */
export async function probeAll({
  defs = MCP_TOOL_DEFS,
  args = JSON.parse(readFileSync(join(fixtures, "sample-args.json"), "utf8")),
  ctx = JSON.parse(readFileSync(join(fixtures, "sample-ctx.json"), "utf8")),
  fetchFn = fetch,
  timeoutMs = 10000,
  throttleMs = 150,
} = {}) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const builtBySlug = new Map();
  for (const def of defs) {
    builtBySlug.set(
      def.toolSlug,
      def.build({ args: args[def.toolSlug] ?? {}, ctx: ctx[def.provider] ?? {} }),
    );
  }

  const hosts = [...new Set([...builtBySlug.values()].map((request) => new URL(request.url).host))];
  const control = new Map();
  for (const host of hosts) {
    if (ACCOUNT_SCOPED_HOSTS.has(host)) {
      control.set(host, "account-scoped");
      continue;
    }
    const sentinel = Math.random().toString(36).slice(2);
    const { status } = await send(
      { method: "GET", url: `https://${host}/-/warpmetal-probe-${sentinel}` },
      fetchFn,
      timeoutMs,
    );
    control.set(host, classify(status));
    await delay(throttleMs);
  }

  const rows = [];
  for (const def of defs) {
    const request = builtBySlug.get(def.toolSlug);
    const host = new URL(request.url).host;
    if (ACCOUNT_SCOPED_HOSTS.has(host)) {
      rows.push({
        toolSlug: def.toolSlug,
        provider: def.provider,
        method: request.method,
        host,
        status: null,
        verdict: "account-scoped",
        weakSignal: false,
      });
      continue;
    }
    const { status } = await send(request, fetchFn, timeoutMs);
    const verdict = classify(status);
    const hostControl = control.get(host);
    rows.push({
      toolSlug: def.toolSlug,
      provider: def.provider,
      method: request.method,
      host,
      status,
      verdict,
      // A 404 only proves a missing route when the host also 404s an arbitrary
      // bogus path; otherwise the host is auth-first or a website/SPA that
      // resolves slugs before authenticating, and the 404 is inconclusive.
      weakSignal: verdict === "invalid-route" && hostControl !== "invalid-route",
      hostControl,
    });
    await delay(throttleMs);
  }

  return { rows, control: Object.fromEntries(control) };
}

export function summarize(rows) {
  const counts = {};
  for (const row of rows) {
    const key = row.verdict === "invalid-route" && row.weakSignal ? "invalid-route (weak)" : row.verdict;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Rows that prove a builder points at a route the provider does not serve. */
export function invalidRoutes(rows) {
  return rows.filter((row) => row.verdict === "invalid-route" && !row.weakSignal);
}

async function main() {
  const { rows, control } = await probeAll();
  const width = Math.max(...rows.map((row) => row.toolSlug.length));
  for (const row of rows) {
    const status = row.status === null ? "-" : String(row.status);
    const flag = row.weakSignal ? ` (weak: host returns ${row.hostControl} for any path)` : "";
    console.log(
      `${row.toolSlug.padEnd(width)}  ${row.method.padEnd(4)}  ${status.padStart(3)}  ${row.verdict}${flag}`,
    );
  }
  console.log("\ncontrol per host:", control);
  console.log("summary:", summarize(rows));

  const bad = invalidRoutes(rows);
  if (bad.length > 0) {
    console.error(`\n${bad.length} tool(s) resolved to a missing route:`);
    for (const row of bad) console.error(`  ${row.method} https://${row.host} -> ${row.status} (${row.toolSlug})`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
