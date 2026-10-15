/**
 * grafana-stack-e2e.test.ts - opt-in, credential-free end-to-end verification of
 * the Grafana stack tools against a real Grafana.
 *
 * `npm test` stays offline: without GRAFANA_STACK_E2E_HOST this suite skips with
 * a named reason. Run it with
 *
 *   GRAFANA_STACK_E2E_HOST=https://play.grafana.org npm run e2e:grafana-stack
 *
 * or against the stack the tools target, `https://<slug>.grafana.net`.
 *
 * This is the only layer that can check what the tool *promises about the
 * response*, because `api-merged.json` types none of the fifteen responses:
 * `search` returns an array, `library-elements` returns an object with `result`
 * (not an array), `get_dashboard` returns `{ meta, dashboard }`, and a health
 * check returns `{ message, status }`. It also verifies the two tools the route
 * probe cannot: a 404 on a path id means "no such dashboard", not "no such
 * route", so those are proven here with ids the target itself hands out.
 *
 * No credential is used and none is read: the probe's sentinel goes in the
 * Authorization header, which the target refuses, so it answers as the anonymous
 * viewer. On a public instance that means 200 for the reads it exposes
 * anonymously, 401 for `/api/user` and 403 for teams and org users - all three
 * prove the route exists, and only the last two limit what can be asserted about
 * the body.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { MCP_TOOL_DEFS } from "../src/integration/mcp-tools/catalog.ts";
import { SENTINEL_TOKEN, rewriteOrigin } from "../scripts/probe-mcp-routes.mjs";

const HOST = process.env["GRAFANA_STACK_E2E_HOST"] ?? "";
const SKIP: false | string =
  HOST === ""
    ? "set GRAFANA_STACK_E2E_HOST (https://play.grafana.org, or https://<slug>.grafana.net) to run the real calls"
    : false;

const OPTIONS = { skip: SKIP, timeout: 180_000 } as const;

interface Answer {
  readonly slug: string;
  readonly status: number;
  readonly body: unknown;
  readonly url: string;
}

/** Builds the real request, swaps the origin, and sends the sentinel token. */
async function call(
  slug: string,
  args: Record<string, unknown>,
): Promise<Answer> {
  const def = MCP_TOOL_DEFS.find((entry) => entry.toolSlug === slug);
  assert.ok(def, `${slug} must be a catalog tool`);
  const request = def.build({ args, ctx: { grafanaStack: "acme" } });
  const rewritten = rewriteOrigin(request, HOST);
  const headers = Object.fromEntries(
    Object.entries(rewritten.headers ?? {}).map(([key, value]) => [
      key,
      value.replaceAll("__TOKEN__", SENTINEL_TOKEN),
    ]),
  );
  const response = await fetch(rewritten.url, {
    method: rewritten.method,
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // A non-JSON body stays a string, and the assertions below say so.
  }
  return { slug, status: response.status, body, url: rewritten.url };
}

function describeShape(body: unknown): string {
  if (Array.isArray(body)) {
    const first = body[0];
    const keys =
      first && typeof first === "object" ? ` keys=${Object.keys(first).slice(0, 4).join(",")}` : "";
    return `array[${body.length}]${keys}`;
  }
  if (body && typeof body === "object") {
    return `object keys=${Object.keys(body).slice(0, 5).join(",")}`;
  }
  return typeof body;
}

function report(answer: Answer, note = ""): void {
  console.log(
    `${answer.slug.padEnd(38)} ${String(answer.status).padStart(3)}  ${describeShape(answer.body)}${note ? `  ${note}` : ""}`,
  );
}

function asArray(answer: Answer): unknown[] {
  assert.ok(
    Array.isArray(answer.body),
    `${answer.slug}: expected an array, got ${describeShape(answer.body)}`,
  );
  return answer.body;
}

function asObject(answer: Answer): Record<string, unknown> {
  assert.ok(
    answer.body !== null && typeof answer.body === "object" && !Array.isArray(answer.body),
    `${answer.slug}: expected an object, got ${describeShape(answer.body)}`,
  );
  return answer.body as Record<string, unknown>;
}

/** A 404 is the one status that cannot be explained away on these routes. */
function assertRouteExists(answer: Answer): void {
  assert.notEqual(
    [404, 405, 410, 501].includes(answer.status),
    true,
    `${answer.slug}: the target does not serve this route (${answer.status} ${answer.url})`,
  );
}

test("the reads that need no resource id answer with the documented shape", OPTIONS, async () => {
  const health = await call("grafana-stack_health", {});
  assertRouteExists(health);
  assert.equal(health.status, 200, "health is public");
  const healthBody = asObject(health);
  assert.ok(healthBody["version"] || healthBody["commit"], "health reports a version");
  report(health);

  const datasources = await call("grafana-stack_list_datasources", {});
  assertRouteExists(datasources);
  assert.equal(datasources.status, 200);
  asArray(datasources);
  report(datasources);

  const folders = await call("grafana-stack_list_folders", {});
  assertRouteExists(folders);
  asArray(folders);
  report(folders);

  const tags = await call("grafana-stack_list_dashboard_tags", {});
  assertRouteExists(tags);
  const tagRows = asArray(tags);
  if (tagRows.length > 0) {
    const first = tagRows[0] as Record<string, unknown>;
    assert.ok("term" in first && "count" in first, "a tag row is { term, count }");
  }
  report(tags);

  const annotations = await call("grafana-stack_list_annotations", {
    from: Date.now() - 3_600_000,
    to: Date.now(),
  });
  assertRouteExists(annotations);
  asArray(annotations);
  report(annotations);

  const alertRules = await call("grafana-stack_list_alert_rules", {});
  assertRouteExists(alertRules);
  asArray(alertRules);
  report(alertRules);

  const contactPoints = await call("grafana-stack_list_contact_points", {});
  assertRouteExists(contactPoints);
  asArray(contactPoints);
  report(contactPoints);

  const muteTimings = await call("grafana-stack_list_mute_timings", {});
  assertRouteExists(muteTimings);
  asArray(muteTimings);
  report(muteTimings);

  // The shape that would have been guessed wrong: an object wrapper, not a list.
  const library = await call("grafana-stack_list_library_elements", { per_page: 1 });
  assertRouteExists(library);
  assert.equal(
    library.status,
    200,
    "library-elements is a plain read on an instance that has the feature",
  );
  const libraryBody = asObject(library);
  assert.ok(
    "result" in libraryBody,
    `library-elements wraps its rows in result, got ${describeShape(library.body)}`,
  );
  report(library);
});

test("a real dashboard uid and a real data source uid are read end to end", OPTIONS, async () => {
  const search = await call("grafana-stack_search", { type: "dash-db", limit: 1 });
  assertRouteExists(search);
  const found = asArray(search);
  report(search);
  if (found.length === 0) {
    // An empty instance is not a failure of the tool; it is nothing to verify.
    return;
  }
  const uid = (found[0] as { uid?: unknown }).uid;
  assert.equal(typeof uid, "string", "a search row carries its uid");
  assert.ok(String(uid).length > 0);

  const dashboard = await call("grafana-stack_get_dashboard", { uid });
  assertRouteExists(dashboard);
  assert.equal(dashboard.status, 200, `the uid ${String(uid)} came from search`);
  const dashboardBody = asObject(dashboard);
  assert.ok("dashboard" in dashboardBody, "the response is { meta, dashboard }");
  const document = dashboardBody["dashboard"] as Record<string, unknown>;
  assert.equal(
    document["uid"],
    uid,
    "get_dashboard returns the dashboard that was asked for",
  );
  report(dashboard, "uid from search");

  const datasources = await call("grafana-stack_list_datasources", {});
  const sources = asArray(datasources);
  const sourceUid = (sources[0] as { uid?: unknown } | undefined)?.uid;
  if (typeof sourceUid !== "string") return;

  const healthCheck = await call("grafana-stack_check_datasource_health", {
    uid: sourceUid,
  });
  assertRouteExists(healthCheck);
  const healthBody = asObject(healthCheck);
  assert.ok(
    "status" in healthBody || "message" in healthBody,
    `a health check answers { message, status }, got ${describeShape(healthCheck.body)}`,
  );
  report(healthCheck, "uid from list_datasources");
});

test("the identity-scoped reads exist, and say so when anonymous", OPTIONS, async () => {
  for (const [slug, args] of [
    ["grafana-stack_get_current_user", {}],
    ["grafana-stack_search_teams", { per_page: 1 }],
    ["grafana-stack_list_org_users", { limit: 1 }],
  ] as const) {
    const answer = await call(slug, args);
    // These three are the ones an anonymous viewer may not use. Both outcomes
    // are evidence the route exists; a 404/405 would not be.
    assertRouteExists(answer);
    assert.ok(
      [200, 401, 403].includes(answer.status),
      `${slug}: expected 200 (authorized) or 401/403 (anonymous), got ${answer.status}`,
    );
    if (answer.status !== 200) {
      const error = asObject(answer);
      assert.equal(
        typeof error["message"],
        "string",
        `${slug}: an authenticated refusal is a Grafana error object, got ${describeShape(answer.body)}`,
      );
    }
    report(answer, answer.status === 200 ? "authorized" : "anonymous refusal");
  }
});
