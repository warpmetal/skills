/**
 * plane-probe.test.ts - the offline guard on the Plane route probe, and its opt-in
 * live companion.
 *
 * `scripts/plane/probe.mjs` decides what "the API serves this path" means from the
 * *body* of a 404, using a sentinel key and an invented workspace so that nothing
 * on a real account is read or written. Two things can quietly turn that into a
 * green light:
 *
 *   - a request that never left the shape the surface declares - a real credential
 *     sent instead of the sentinel, or a path argument still carrying its
 *     `{placeholder}`, which the router would answer as an unmatched pattern;
 *   - a host that stopped keeping `Page not found.` and `Workspace not found.`
 *     apart, which makes every 404 below it inconclusive rather than conclusive.
 *
 * The offline cases model the router as it was measured and pin both, so the probe
 * fails loudly rather than passing quietly, and they run without the network. The
 * live case, behind `PLANE_PROBE=1`, runs the same logic against the real
 * `api.plane.so`, the way `test/mcp-route-probe.test.ts` does for the rest of the
 * catalog.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  PROBE_WORKSPACE,
  SENTINEL_TOKEN,
  classifyResponse,
  failuresOf,
  probePlane,
  summarize,
} from "../scripts/plane/probe.mjs";
import { ENDPOINTS } from "../scripts/plane/endpoints.mjs";

/** The part of an endpoint entry this stub reads: the path, forked or not. */
interface RouteEntry {
  readonly path: string | { readonly cases: Record<string, string> };
}

/**
 * The prefix the table's paths are relative to. `scripts/plane/endpoints.mjs` records
 * the paths API-relative because the SDK builds every URL as `{base_url}/api/v1` +
 * path + `/`, so the route a builder emits carries this prefix and the table's entry
 * does not.
 */
const API_PREFIX = "/api/v1";

/**
 * A stub of the live API, reproducing the order that was measured: the URL pattern
 * matches first, then the tenant is resolved, then the key is checked.
 *
 * The routes it serves are derived from the shipped endpoint table, so the stub is
 * a router that serves exactly the paths this surface declares - a builder whose URL
 * drifts from its table entry is answered `Page not found.` and reported by tool
 * name, which is the point of the probe. A tenant path stops at `Workspace not found.`
 * because the probe's workspace is absent, and the one route that names no workspace
 * reaches the key verdict instead.
 */
function measuredRouter() {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const routes = Object.values(ENDPOINTS as Record<string, RouteEntry>).map((entry) => {
    const raw = typeof entry.path === "string" ? entry.path : Object.values(entry.path.cases)[0] ?? "";
    // The placeholders are split out first, so escaping the literal parts cannot
    // touch them: a `{workspace}` segment may only be the probe's own absent
    // workspace, and any other placeholder accepts the shape the probe substitutes
    // into it.
    const pattern = new RegExp(
      `^${API_PREFIX}${raw
        .split(/(\{[a-z_]+\})/g)
        .map((part) => {
          const placeholder = /^\{([a-z_]+)\}$/.exec(part)?.[1];
          if (placeholder === undefined) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return placeholder === "workspace" ? PROBE_WORKSPACE : "[^/]+";
        })
        .join("")}/?$`,
    );
    return { pattern, scoped: raw.includes("{workspace}") };
  });

  const fetchFn = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    const path = new URL(String(url)).pathname;
    const route = routes.find((candidate) => candidate.pattern.test(path));
    const [status, body] =
      route === undefined
        ? [404, { error: "Page not found." }]
        : route.scoped
          ? [404, { error: "Workspace not found." }]
          : [403, { detail: "Given API token is not valid" }];
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fetchFn, seen };
}

/** A host that answers the same thing to every request. */
function always(status: number, body: unknown) {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

test("the verdict comes from the body, not the status", () => {
  const cases: Array<[number, string, string]> = [
    [404, '{"error": "Workspace not found."}', "route-served"],
    [404, '{"error": "Page not found."}', "route-missing"],
    [403, '{"detail": "Given API token is not valid"}', "auth-required"],
    [403, '{"detail": "Authentication credentials were not provided."}', "no-credential"],
    [0, "", "unreachable"],
    [200, "[]", "public"],
    [500, "oops", "server-error"],
    [418, "teapot", "unexpected"],
  ];
  for (const [status, text, verdict] of cases) {
    assert.equal(classifyResponse(status, text), verdict, `HTTP ${String(status)} ${text}`);
  }
});

test("the probe sends one inert request per shipped tool", async () => {
  const { fetchFn, seen } = measuredRouter();
  const { rows, controls } = await probePlane({ fetchFn, throttleMs: 0 });

  assert.equal(rows.length, 60, "one row per shipped read tool");
  assert.equal(
    rows.filter((row) => row.verdict === "not-shipped").length,
    0,
    "a shipped tool with no endpoint entry would be probed as a missing route",
  );
  assert.equal(controls.length, 3, "the controls decide whether the 404s mean anything");
  assert.equal(seen.length, rows.length + controls.length, "one request per row and control");

  // The probe's workspace has to pass the same shape rule the surface enforces, or
  // the router answers an unmatched pattern and every verdict means nothing.
  assert.match(
    PROBE_WORKSPACE,
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    "the probe's workspace must be slug-shaped",
  );

  for (const request of seen) {
    const url = new URL(request.url);
    const headers = request.init.headers as Record<string, string>;
    assert.equal(url.origin, "https://api.plane.so", "the probe names the shipped origin");
    assert.equal(headers["x-api-key"], SENTINEL_TOKEN, `${url.pathname}: the sentinel key travels`);
    assert.equal(url.href.includes("__TOKEN__"), false, `${url.pathname}: a placeholder must not travel`);
    assert.equal(
      /\{[a-z_]+\}/.test(url.pathname),
      false,
      `${url.pathname}: every path argument is substituted, or the router sees an unmatched pattern`,
    );
  }
  assert.equal(
    JSON.stringify(seen).includes("__TOKEN__"),
    false,
    "no request may carry a placeholder in place of a value",
  );
});

test("every shipped tool resolves to a path the API serves, controls included", async () => {
  const { fetchFn } = measuredRouter();
  const { rows, controls } = await probePlane({ fetchFn, throttleMs: 0 });

  assert.deepEqual(failuresOf(rows, controls), [], "the probe must be clean against the measured router");
  assert.deepEqual(summarize(rows), { "route-served": 59, "auth-required": 1 });
  assert.equal(
    rows.find((row) => row.toolSlug === "plane_member_me")?.verdict,
    "auth-required",
    "the one route that names no workspace meets the key verdict instead",
  );
  for (const row of rows) {
    assert.equal(
      row.path.includes(PROBE_WORKSPACE),
      false,
      `${row.toolSlug}: the row reports the pattern, not the absent workspace`,
    );
  }
});

test("a host that stopped separating the two 404s fails the probe as inconclusive", async () => {
  // The tenant is resolved before the pattern now, so a served path and an invented
  // one are indistinguishable and nothing below either can be evidence.
  const { rows, controls } = await probePlane({
    fetchFn: always(404, { error: "Workspace not found." }),
    throttleMs: 0,
  });
  const failures = failuresOf(rows, controls);
  assert.ok(
    failures.filter((failure) => failure.startsWith("control ")).length >= 2,
    `both invented-path controls must be reported: ${failures.join("; ")}`,
  );
});

test("a path the API does not serve fails the probe by tool name", async () => {
  const { rows, controls } = await probePlane({
    fetchFn: always(404, { error: "Page not found." }),
    throttleMs: 0,
  });
  const failures = failuresOf(rows, controls);
  assert.ok(
    failures.some((failure) => failure.includes("plane_customer_list")),
    `the tool whose path is missing must be named: ${failures.slice(0, 3).join("; ")}`,
  );
});

test(
  "every shipped Plane tool resolves on the real api.plane.so",
  {
    skip: process.env["PLANE_PROBE"] ? false : "set PLANE_PROBE=1 to run the live Plane route probe",
  },
  async () => {
    const { rows, controls } = await probePlane();
    console.log("plane probe summary:", summarize(rows));

    assert.equal(rows.length, 60, "one row per shipped read tool");
    assert.deepEqual(
      failuresOf(rows, controls),
      [],
      "a tool points at a route Plane does not serve, or the controls stopped discriminating",
    );
    // Guard against a probe that silently did nothing.
    assert.ok((summarize(rows)["route-served"] ?? 0) > 0, "the probe made no requests");
  },
);
