/**
 * mcp-route-probe.test.ts - the opt-in live companion to the static audit.
 *
 * Behind `MCP_PROBE=1` it sends every builder's request with a sentinel token
 * and fails if any public host answers 404/405/410, which is the credential-free
 * signature of a URL pointing at a route the provider does not serve. It is
 * skipped by default so `npm test` stays offline and deterministic; CI that has
 * network access can set `MCP_PROBE=1`.
 *
 * A 404 is only conclusive when the host also 404s an arbitrary bogus path.
 * Auth-first hosts answer 401 to any path, and website/SPA hosts answer 2xx to
 * any path while resolving a slug before authenticating, so in both cases a 404
 * says nothing about the route; those rows are marked `weakSignal` and excluded
 * from the failure set.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { invalidRoutes, probeAll, summarize } from "../scripts/probe-mcp-routes.mjs";

test(
  "no provider builder resolves to a missing route",
  { skip: process.env.MCP_PROBE ? false : "set MCP_PROBE=1 to run the live route probe" },
  async () => {
    const { rows } = await probeAll();
    const summary = summarize(rows);
    console.log("route probe summary:", summary);

    const bad = invalidRoutes(rows);
    assert.deepEqual(
      bad.map((row) => `${row.toolSlug} -> ${row.method} https://${row.host} (${row.status})`),
      [],
      "a builder points at a route the provider does not serve",
    );

    // Guard against a probe that silently did nothing: at least the public,
    // unauthenticated tools must have answered.
    assert.ok(summary["public"] > 0 || summary["auth-required"] > 0, "probe made no requests");
  },
);
