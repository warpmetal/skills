/**
 * probe.mjs - a credential-free probe that every shipped Plane tool resolves to a
 * route the real `api.plane.so` serves.
 *
 * Everything else in this package verifies Plane against the pin: `check.mjs`
 * proves the allowlist and the endpoint table agree with the vendor's call sites,
 * and `test/plane.test.ts` proves each builder emits the request the table
 * describes. None of that can notice a path that is self-consistent but that the
 * service does not serve - the Amplitude bug in `scripts/probe-mcp-routes.mjs`
 * shipped through exactly that gap. This probe closes it without a credential.
 *
 * Plane's router is pattern-first, which is what makes that possible. Measured
 * against the live API with a sentinel key and a well-formed workspace slug that
 * does not exist:
 *
 *   GET /api/v1/workspaces/<absent>/projects-lite/  -> 404 {"error": "Workspace not found."}
 *   GET /api/v1/workspaces/<absent>/<invented>/     -> 404 {"error": "Page not found."}
 *   GET /api/v1/<invented>/                         -> 404 {"error": "Page not found."}
 *   GET /api/v1/users/me/                           -> 403 {"detail": "Given API token is not valid"}
 *
 * So the URL pattern is matched before the tenant is resolved, and the tenant is
 * resolved before the key is checked. A shipped path therefore answers
 * `Workspace not found.` - "this is a route, the workspace is not one" - while an
 * invented path answers `Page not found.`, and the one route that is not
 * workspace-scoped (`plane_member_me`) answers the key verdict instead. The
 * distinction is in the path, not in the secret, so no credential and no real
 * workspace are needed, and nothing on any account is read or written: the tenant
 * does not exist, which is why the probe is inert.
 *
 * A 404 is only evidence while the host keeps those two bodies apart, so the
 * probe also asks the controls: an invented path under an invented workspace must
 * answer `Page not found.` - if it ever answers `Workspace not found.` the host
 * has started resolving the tenant before matching the path, every 404 below
 * becomes inconclusive, and the probe fails as inconclusive rather than passing
 * quietly, exactly like `probeAll`'s `weakSignal` rule.
 *
 * Path arguments are substituted with values whose *shape* the URL pattern
 * accepts (a UUID, and `workitem_identifier` as a human identifier), because a
 * rejected shape is indistinguishable from a missing route. Query parameters
 * travel with their reviewed sample values: with an absent workspace the request
 * stops at tenant resolution, so a filter's value can never be what decides the
 * verdict.
 *
 * Run it with `npm run probe:plane` (network required). It is not part of
 * `npm test`; `test/plane-probe.test.ts` runs the same logic behind PLANE_PROBE=1.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { MCP_TOOL_DEFS } from "../../src/integration/mcp-tools/catalog.ts";
import { API_ORIGIN, ENDPOINTS } from "./endpoints.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "..", "test/fixtures/mcp-requests");

/** Substituted for `__TOKEN__`: the API refuses it at the auth step. */
export const SENTINEL_TOKEN = "warpmetal-route-probe-not-a-real-token";

/**
 * The workspace every request names. Well-formed, so it passes the router's slug
 * pattern, and invented, so the API stops at `Workspace not found.` and touches
 * no real account.
 */
export const PROBE_WORKSPACE = "warpmetal-probe-workspace-absent";

/** A shape the `{id}` segments accept. */
const PROBE_UUID = "11111111-1111-1111-1111-111111111111";

/** The bodies the API answers that carry a verdict. */
const PAGE_NOT_FOUND = "Page not found.";
const WORKSPACE_NOT_FOUND = "Workspace not found.";
const TOKEN_NOT_VALID = "Given API token is not valid";
const NO_CREDENTIAL = "Authentication credentials were not provided.";

/** Verdicts that mean the API resolved the path to a route it serves. */
export const SERVED_VERDICTS = new Set(["route-served", "auth-required"]);

/** The path an entry asks for, with a forked `cases` path resolved to the branch we ship. */
function pathOf(entry) {
  const path = entry.path;
  if (typeof path === "string") return path;
  const [first] = Object.values(path.cases);
  if (typeof first !== "string") throw new Error("endpoint path case is not a string");
  return first;
}

/** The `{name}` placeholders in a path, in order. */
function placeholdersOf(path) {
  return [...path.matchAll(/\{([a-z_]+)\}/g)].map((match) => match[1]);
}

/**
 * The arguments a probe call needs: the reviewed sample values, with every path
 * argument replaced by a value of the shape that argument's segment accepts.
 */
function probeArgs(toolSlug, entry, sampleArgs) {
  const args = { ...(sampleArgs[toolSlug] ?? {}) };
  for (const name of placeholdersOf(pathOf(entry))) {
    if (name === "workspace") continue;
    args[name] = name.endsWith("_identifier") ? "PROBE-1" : PROBE_UUID;
  }
  const fork = entry.path;
  if (typeof fork === "object" && typeof args[fork.arg] !== "string") {
    args[fork.arg] = Object.keys(fork.cases)[0];
  }
  return args;
}

/** Replaces the token placeholder in the built request with the sentinel. */
function applySentinel(request) {
  const headers = {};
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    headers[key] = value.replaceAll("__TOKEN__", SENTINEL_TOKEN);
  }
  return { ...request, url: request.url.replaceAll("__TOKEN__", SENTINEL_TOKEN), headers };
}

/** The verdict a response carries. The body is the discriminator, not the status. */
export function classifyResponse(status, text) {
  if (status === 0) return "unreachable";
  if (text.includes(NO_CREDENTIAL)) return "no-credential";
  if (text.includes(TOKEN_NOT_VALID)) return "auth-required";
  if (text.includes(WORKSPACE_NOT_FOUND)) return "route-served";
  if (text.includes(PAGE_NOT_FOUND)) return "route-missing";
  if (status >= 200 && status < 300) return "public";
  if (status >= 500) return "server-error";
  return "unexpected";
}


async function send(url, method, headers, fetchFn, timeoutMs) {
  try {
    const response = await fetchFn(url, { method, headers, signal: AbortSignal.timeout(timeoutMs) });
    return { status: response.status, text: (await response.text()).slice(0, 400) };
  } catch {
    return { status: 0, text: "" };
  }
}

/**
 * Probes every shipped Plane tool, plus the controls that decide whether its 404s
 * mean anything. `fetchFn` is injectable so the opt-in test can drive it without
 * the network.
 */
export async function probePlane({
  defs = MCP_TOOL_DEFS.filter((def) => def.provider === "plane"),
  sampleArgs = JSON.parse(readFileSync(join(fixtures, "sample-args.json"), "utf8")),
  fetchFn = fetch,
  timeoutMs = 15000,
  throttleMs = 250,
} = {}) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rows = [];

  for (const def of defs) {
    const entry = ENDPOINTS[def.toolSlug];
    if (entry === undefined) {
      rows.push({
        toolSlug: def.toolSlug,
        method: "-",
        path: "-",
        status: null,
        verdict: "not-shipped",
      });
      continue;
    }
    // A refusal here means the probe's own args are wrong, not that the route is
    // missing, so it is reported instead of skipped.
    let request;
    try {
      request = applySentinel(
        def.build({ args: probeArgs(def.toolSlug, entry, sampleArgs), ctx: { planeWorkspace: PROBE_WORKSPACE } }),
      );
    } catch (error) {
      rows.push({
        toolSlug: def.toolSlug,
        method: "-",
        path: pathOf(entry),
        status: null,
        verdict: "refused",
        detail: String(error).slice(0, 160),
      });
      continue;
    }
    const { status, text } = await send(request.url, request.method, request.headers, fetchFn, timeoutMs);
    rows.push({
      toolSlug: def.toolSlug,
      method: request.method,
      path: new URL(request.url).pathname.replace(
        `/api/v1/workspaces/${PROBE_WORKSPACE}`,
        "/workspaces/{ws}",
      ),
      status,
      verdict: classifyResponse(status, text),
    });
    await delay(throttleMs);
  }

  // The controls. `served-route` is a route this surface ships; the two invented
  // paths must come back as unmatched patterns, or every 404 above is
  // inconclusive.
  const random = Math.random().toString(36).slice(2);
  const planned = [
    ["served-route", `/api/v1/workspaces/${PROBE_WORKSPACE}/projects-lite/`, "route-served"],
    ["missing-route-under-tenant", `/api/v1/workspaces/${PROBE_WORKSPACE}/-warpmetal-probe-${random}/`, "route-missing"],
    ["missing-route", `/api/v1/-warpmetal-probe-${random}/`, "route-missing"],
  ];
  const controls = [];
  for (const [name, path, expected] of planned) {
    const url = `${API_ORIGIN}${path}`;
    const { status, text } = await send(url, "GET", { "x-api-key": SENTINEL_TOKEN }, fetchFn, timeoutMs);
    controls.push({ name, url, status, expected, actual: classifyResponse(status, text) });
    await delay(throttleMs);
  }

  return { rows, controls };
}

export function summarize(rows) {
  const counts = {};
  for (const row of rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;
  return counts;
}

/**
 * Everything that stops this probe from saying "every route is served": a tool the
 * API answered as a missing pattern, and any control that stopped discriminating.
 */
export function failuresOf(rows, controls) {
  const failures = [];
  for (const row of rows) {
    if (!SERVED_VERDICTS.has(row.verdict)) {
      failures.push(`${row.toolSlug}: ${row.method} ${row.path} -> ${String(row.status)} (${row.verdict})`);
    }
  }
  for (const control of controls) {
    if (control.actual !== control.expected) {
      failures.push(
        `control ${control.name}: expected ${control.expected}, got ${control.actual} (HTTP ${String(control.status)})`,
      );
    }
  }
  return failures;
}

async function main() {
  const { rows, controls } = await probePlane();
  const width = Math.max(...rows.map((row) => row.toolSlug.length));
  for (const row of rows) {
    console.log(
      `${row.toolSlug.padEnd(width)}  ${row.method.padEnd(4)}  ${String(row.status ?? "-").padStart(3)}  ` +
        `${row.verdict}  ${row.path}`,
    );
  }
  console.log("");
  for (const control of controls) {
    console.log(`control ${control.name}: ${control.actual} (expected ${control.expected})`);
  }
  console.log("\nsummary:", summarize(rows));

  const failures = failuresOf(rows, controls);
  if (failures.length > 0) {
    console.error(`\n${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`\nall ${rows.length} routes resolved to a path the API serves.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
