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

import { invalidRoutes, probeAll, summarize, verdictRecord } from "../scripts/probe-mcp-routes.mjs";

test("per-customer hosts are classified instead of probed", async () => {
  // A fetch that always throws: nothing here may leave the process, and a row
  // that is not account-scoped would come back `unreachable` rather than
  // `account-scoped`. This is what keeps the Zendesk tenant host (an invented
  // `acme.zendesk.com`, which does not resolve) out of the probe's failure set.
  const { rows } = await probeAll({
    fetchFn: (async () => {
      throw new Error("a per-customer host must not be probed");
    }) as unknown as typeof fetch,
    throttleMs: 0,
  });

  const accountScopedHosts = new Set(
    rows.filter((row) => row.verdict === "account-scoped").map((row) => row.host),
  );
  for (const host of [
    "acme.atlassian.net",
    "acme.myshopify.com",
    "acme.snowflakecomputing.com",
    "acme.zendesk.com",
    "acme.grafana.net",
  ]) {
    assert.ok(accountScopedHosts.has(host), `${host} must be reported as account-scoped`);
  }
  assert.deepEqual(invalidRoutes(rows), [], "an unreachable host is not a missing route");
});

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

test("verdictRecord is the stable, sorted slice the marker generator reads", () => {
  const record = verdictRecord([
    {
      toolSlug: "z_tool",
      verdict: "invalid-route",
      weakSignal: false,
      provider: "z",
      method: "GET",
      host: "z.example",
      status: 404,
      hostControl: "invalid-route",
    },
    {
      toolSlug: "a_tool",
      verdict: "auth-required",
      weakSignal: false,
      provider: "a",
      method: "GET",
      host: "a.example",
      status: 401,
      hostControl: "auth-required",
    },
  ]);
  assert.deepEqual(record, {
    version: 1,
    rows: [
      { toolSlug: "a_tool", verdict: "auth-required", weakSignal: false },
      { toolSlug: "z_tool", verdict: "invalid-route", weakSignal: false },
    ],
  });
});
