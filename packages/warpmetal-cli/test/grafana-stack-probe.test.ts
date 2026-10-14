/**
 * grafana-stack-probe.test.ts - opt-in, credential-free verification that the
 * Grafana stack tools point at routes a real Grafana serves.
 *
 * `npm test` stays offline: without GRAFANA_STACK_PROBE_HOST this test skips with
 * a named reason. Run it against a real Grafana with
 *
 *   GRAFANA_STACK_PROBE_HOST=https://play.grafana.org npm run probe:grafana-stack
 *
 * or against the stack the tools actually target, `https://<slug>.grafana.net`.
 * No token is needed and none is read: the probe sends the sentinel, so the
 * provider refuses it before doing anything. A route that exists answers
 * 401/403 (or 200 for the public ones like /api/health); a route the service
 * does not serve answers 404/405.
 *
 * The builder keeps `<label>.grafana.net`; only this harness swaps the origin
 * (`hostRewrite`), and `controlPath` moves the bogus control request under
 * `/api/` - at the root Grafana answers 200 to any path, which would make every
 * 404 inconclusive and turn this test into a green no-op.
 *
 * Two tools are excluded from the route assertion on purpose:
 * `get_dashboard` and `check_datasource_health` carry a resource id, so a 404
 * means "no such dashboard" rather than "no such route". They are verified with
 * real ids in test/grafana-stack-e2e.test.ts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { MCP_TOOL_DEFS } from "../src/integration/mcp-tools/catalog.ts";
import { invalidRoutes, probeAll } from "../scripts/probe-mcp-routes.mjs";

const HOST = process.env["GRAFANA_STACK_PROBE_HOST"] ?? "";
const SKIP: false | string =
  HOST === ""
    ? "set GRAFANA_STACK_PROBE_HOST (https://play.grafana.org, or https://<slug>.grafana.net) to probe the real routes"
    : false;

const here = dirname(fileURLToPath(import.meta.url));
const sampleArgs = JSON.parse(
  readFileSync(join(here, "fixtures/mcp-requests/sample-args.json"), "utf8"),
) as Record<string, Record<string, unknown>>;

/** The tools whose path id is a parameter: a 404 there proves nothing. */
const RESOURCE_SCOPED = new Set([
  "grafana-stack_get_dashboard",
  "grafana-stack_check_datasource_health",
]);

/**
 * The route-only tools are probed with **no arguments**, not with the sample
 * args. An invented sample value reaches the API as a real filter, and Grafana
 * answers 404 for a filter that names a resource which does not exist:
 * `?parentUid=sample_parent_uid` on `/api/folders` is a 404 on a route that
 * exists. This probe answers "does the path exist", so it must not carry an
 * invented resource id into a query parameter.
 */
function argsForRouteProbe(slug: string): Record<string, unknown> {
  return RESOURCE_SCOPED.has(slug) ? (sampleArgs[slug] ?? {}) : {};
}

test(
  "every grafana-stack route is served by the target",
  { skip: SKIP, timeout: 180_000 },
  async () => {
    const defs = MCP_TOOL_DEFS.filter((def) => def.provider === "grafana-stack");
    assert.equal(defs.length, 15, "batch 13 registers fifteen tools");

    const { rows, control } = await probeAll({
      defs,
      args: Object.fromEntries(
        defs.map((def) => [def.toolSlug, argsForRouteProbe(def.toolSlug)]),
      ),
      hostRewrite: { "acme.grafana.net": HOST },
      controlPath: "/api/-/warpmetal-probe-",
    });

    const width = Math.max(...rows.map((row) => row.toolSlug.length));
    for (const row of rows) {
      console.log(
        `${row.toolSlug.padEnd(width)}  ${row.method.padEnd(4)}  ${String(row.status ?? "-").padStart(3)}  ${row.verdict}`,
      );
    }
    console.log("control:", JSON.stringify(control));

    const effectiveHost = new URL(HOST).host;

    // Without a conclusive control every 404 below is meaningless, so this must
    // fail rather than pass quietly.
    assert.equal(
      control[effectiveHost],
      "invalid-route",
      `inconclusive: ${effectiveHost} must answer 404 to a path it does not serve, got ${String(control[effectiveHost])}`,
    );

    // Every tool reached the host: no silent no-op and nothing unreachable.
    const silent = rows.filter((row) => row.status === null);
    assert.deepEqual(silent.map((row) => row.toolSlug), [], "these tools sent no request");

    const routeOnly = rows.filter((row) => !RESOURCE_SCOPED.has(row.toolSlug));
    assert.deepEqual(
      invalidRoutes(routeOnly).map((row) => `${row.toolSlug} -> ${row.status}`),
      [],
      "a route-only tool resolved to a path the target does not serve",
    );

    // `invalidRoutes` tolerates a 5xx, which for a route-only read would still be
    // ambiguous, so the opt-in run is stricter: the target must have answered
    // the request it was given.
    const ambiguous = routeOnly.filter(
      (row) => !["public", "auth-required", "reachable"].includes(row.verdict),
    );
    assert.deepEqual(
      ambiguous.map((row) => `${row.toolSlug} -> ${row.status} (${row.verdict})`),
      [],
      "a route-only tool was neither served, refused nor rejected",
    );

    for (const slug of RESOURCE_SCOPED) {
      const row = rows.find((entry) => entry.toolSlug === slug);
      assert.ok(row, `${slug} must have been probed`);
      assert.notEqual(
        row.verdict,
        "unreachable",
        `${slug}: the host answered nothing, so nothing was verified`,
      );
      console.log(
        `${slug}: ${String(row.status)} (${row.verdict}) - expected with the placeholder id; the real one is checked in grafana-stack-e2e.test.ts`,
      );
    }
  },
);
