/**
 * grafana-stack.test.ts - one request-shape test per Grafana stack tool.
 *
 * The source of truth is `api-merged.json` (the Grafana HTTP API), which the
 * catalog describes. `mcp-request-contract.test.ts` compares each builder
 * against a fixture generated from that same builder, so it cannot notice a
 * wrong query name or an array encoded the wrong way; these tests state the
 * whole request so a drift in any of the three fails here.
 *
 * Everything above the live suite is offline: `fetch` is injected. The live
 * companion at the bottom is gated behind GRAFANA_STACK_LIVE=1 and is skipped,
 * with a named reason, until a stack is available - it is the only tier that
 * can prove Grafana accepts the call, because the host is per-customer and the
 * route probe classifies it instead of probing it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runCli } from "../src/dispatch.js";
import { captureOut } from "../src/output.js";
import { memoryStore } from "./helpers.js";

const TOKEN = "glsa_test_token_value";
const STACK = "acme";
const HOST = `https://${STACK}.grafana.net`;

/** Grafana stack auth: Bearer with a stack service-account token. */
const EXPECTED_AUTH = `Bearer ${TOKEN}`;

interface Built {
  readonly url: string;
  readonly init: RequestInit;
}

interface CallResult {
  readonly code: number;
  readonly out: ReturnType<typeof captureOut>;
  readonly seen: Built | null;
  /** How many HTTP requests the call made. Zero is the happy path for refusals. */
  readonly requested: number;
}

/** The vault a healthy Grafana call needs. A negative case drops a key. */
const VAULT = {
  "grafana-stack.token": TOKEN,
  "grafana.stack": STACK,
};

/**
 * Runs one `integration grafana-stack <verb>` call with a stubbed HTTP layer.
 *
 * `seed` is the whole vault, so a negative case removes a secret by leaving the
 * key out rather than by planting an undefined value.
 */
async function call(
  verb: string,
  args: Record<string, unknown>,
  seed: Record<string, string> = VAULT,
): Promise<CallResult> {
  const { store } = await memoryStore(seed);
  const out = captureOut();
  let seen: Built | null = null;
  let requested = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    requested += 1;
    seen = { url: String(url), init };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;

  const code = await runCli(
    [
      "integration",
      "grafana-stack",
      verb,
      "--args-json",
      JSON.stringify(args),
      "--json",
    ],
    {
      store,
      out,
      isTTY: false,
      upstream: null,
      fetchFn,
      run: async () => ({ code: 127, stdout: "", stderr: "" }),
    },
  );
  return { code, out, seen, requested };
}

function resultOf(out: ReturnType<typeof captureOut>): Record<string, unknown> {
  const document = JSON.parse(out.out.join("")) as {
    results?: Array<Record<string, unknown>>;
  };
  return document.results?.[0] ?? {};
}

/** Asserts the call succeeded, the auth contract holds, and returns the request. */
async function expectRequest(
  verb: string,
  args: Record<string, unknown>,
): Promise<Built> {
  const { code, out, seen } = await call(verb, args, VAULT);
  assert.equal(code, 0, `expected a clean exit, stderr: ${out.err.join("")}`);
  assert.equal(resultOf(out)["status"], "OK");
  if (seen === null) assert.fail("expected an HTTP request");
  const headers = seen.init.headers as Record<string, string>;
  assert.equal(headers["Authorization"], EXPECTED_AUTH);
  assert.equal(seen.init.method, "GET");
  const url = new URL(seen.url);
  assert.equal(url.origin, HOST, "the credential must stay on the stack host");
  return seen;
}

describe("grafana stack request shape (offline)", () => {
  it("health probes the stack without a query string", async () => {
    const request = await expectRequest("health", {});
    assert.equal(request.url, `${HOST}/api/health`);
    assert.deepEqual([...new URL(request.url).searchParams.keys()], []);
  });

  it("get_current_user reads the token's own identity", async () => {
    const request = await expectRequest("get-current-user", {});
    assert.equal(request.url, `${HOST}/api/user`);
  });

  it("search forwards the filters and repeats the multi-valued tag", async () => {
    const request = await expectRequest("search", {
      query: "site down",
      tag: ["prod", "api"],
      type: "dash-db",
      dashboard_uids: ["dash-1", "dash-2"],
      folder_uids: ["folder-1"],
      starred: true,
      limit: 10,
      page: 2,
      permission: "View",
      sort: "alpha-desc",
      deleted: false,
    });
    const url = new URL(request.url);
    assert.equal(url.pathname, "/api/search");
    assert.equal(url.searchParams.get("query"), "site down");
    assert.equal(url.searchParams.get("type"), "dash-db");
    assert.equal(url.searchParams.get("starred"), "true");
    assert.equal(url.searchParams.get("limit"), "10");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("permission"), "View");
    assert.equal(url.searchParams.get("sort"), "alpha-desc");
    assert.equal(url.searchParams.get("deleted"), "false");
    // `tag` is a `multi` collection: the key repeats, and it is not joined.
    assert.deepEqual(url.searchParams.getAll("tag"), ["prod", "api"]);
    // `dashboardUIDs`/`folderUIDs` declare no collectionFormat, so they stay csv.
    assert.equal(url.searchParams.get("dashboardUIDs"), "dash-1,dash-2");
    assert.equal(url.searchParams.get("folderUIDs"), "folder-1");
    assert.equal(url.searchParams.get("dashboardIds"), null);
  });

  it("search sends no parameter the caller did not ask for", async () => {
    const request = await expectRequest("search", {});
    const url = new URL(request.url);
    assert.equal(url.pathname, "/api/search");
    assert.deepEqual([...url.searchParams.keys()], []);
  });

  it("get_dashboard addresses one dashboard by uid", async () => {
    const request = await expectRequest("get-dashboard", { uid: "abc123" });
    assert.equal(request.url, `${HOST}/api/dashboards/uid/abc123`);
  });

  it("list_datasources lists the stack's data sources", async () => {
    const request = await expectRequest("list-datasources", {});
    assert.equal(request.url, `${HOST}/api/datasources`);
  });

  it("check_datasource_health addresses one data source", async () => {
    const request = await expectRequest("check-datasource-health", {
      uid: "prom-1",
    });
    assert.equal(request.url, `${HOST}/api/datasources/uid/prom-1/health`);
  });

  it("list_folders maps parent_uid and permission onto the API's names", async () => {
    const request = await expectRequest("list-folders", {
      limit: 50,
      page: 3,
      parent_uid: "root-uid",
      permission: "Edit",
    });
    const url = new URL(request.url);
    assert.equal(url.pathname, "/api/folders");
    assert.equal(url.searchParams.get("limit"), "50");
    assert.equal(url.searchParams.get("page"), "3");
    assert.equal(url.searchParams.get("parentUid"), "root-uid");
    assert.equal(url.searchParams.get("permission"), "Edit");
  });

  it("list_alert_rules reads the provisioning surface", async () => {
    const request = await expectRequest("list-alert-rules", {});
    assert.equal(request.url, `${HOST}/api/v1/provisioning/alert-rules`);
  });

  it("list_annotations repeats the multi-valued tags and keeps the window", async () => {
    const request = await expectRequest("list-annotations", {
      from: 1_760_000_000_000,
      to: 1_760_003_600_000,
      dashboard_uid: "dash-1",
      limit: 5,
      match_any: true,
      tags: ["deploy", "rollback"],
      type: "annotation",
    });
    const url = new URL(request.url);
    assert.equal(url.pathname, "/api/annotations");
    assert.equal(url.searchParams.get("from"), "1760000000000");
    assert.equal(url.searchParams.get("to"), "1760003600000");
    assert.equal(url.searchParams.get("dashboardUID"), "dash-1");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal(url.searchParams.get("matchAny"), "true");
    assert.equal(url.searchParams.get("type"), "annotation");
    // `tags` is a `multi` collection too: the key repeats, it is not joined.
    assert.deepEqual(url.searchParams.getAll("tags"), ["deploy", "rollback"]);
  });

  it("list_contact_points filters by name", async () => {
    const request = await expectRequest("list-contact-points", {
      name: "oncall-email",
    });
    const url = new URL(request.url);
    assert.equal(url.pathname, "/api/v1/provisioning/contact-points");
    assert.equal(url.searchParams.get("name"), "oncall-email");
  });

  it("list_mute_timings reads the provisioning surface", async () => {
    const request = await expectRequest("list-mute-timings", {});
    assert.equal(request.url, `${HOST}/api/v1/provisioning/mute-timings`);
  });

  it("list_dashboard_tags lists the tag vocabulary", async () => {
    const request = await expectRequest("list-dashboard-tags", {});
    assert.equal(request.url, `${HOST}/api/dashboards/tags`);
  });

  it("search_teams maps per_page onto perpage", async () => {
    const request = await expectRequest("search-teams", {
      name: "platform",
      page: 2,
      per_page: 25,
      query: "oncall",
    });
    const url = new URL(request.url);
    assert.equal(url.pathname, "/api/teams/search");
    assert.equal(url.searchParams.get("name"), "platform");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("perpage"), "25");
    assert.equal(url.searchParams.get("query"), "oncall");
    assert.equal(url.searchParams.get("per_page"), null);
  });

  it("list_org_users filters the current organization", async () => {
    const request = await expectRequest("list-org-users", {
      limit: 20,
      query: "ops@acme.test",
    });
    const url = new URL(request.url);
    assert.equal(url.pathname, "/api/org/users");
    assert.equal(url.searchParams.get("limit"), "20");
    assert.equal(url.searchParams.get("query"), "ops@acme.test");
  });

  it("list_library_elements maps the camelCase query names", async () => {
    const request = await expectRequest("list-library-elements", {
      folder_filter: "Infra",
      page: 4,
      per_page: 10,
      search_string: "latency",
      sort_direction: "alpha-desc",
    });
    const url = new URL(request.url);
    assert.equal(url.pathname, "/api/library-elements");
    assert.equal(url.searchParams.get("folderFilter"), "Infra");
    assert.equal(url.searchParams.get("page"), "4");
    assert.equal(url.searchParams.get("perPage"), "10");
    assert.equal(url.searchParams.get("searchString"), "latency");
    assert.equal(url.searchParams.get("sortDirection"), "alpha-desc");
  });

  it("the parameterless tools invent nothing", async () => {
    for (const [verb, path] of [
      ["health", "/api/health"],
      ["get-current-user", "/api/user"],
      ["list-datasources", "/api/datasources"],
      ["list-alert-rules", "/api/v1/provisioning/alert-rules"],
      ["list-mute-timings", "/api/v1/provisioning/mute-timings"],
      ["list-dashboard-tags", "/api/dashboards/tags"],
    ] as const) {
      const request = await expectRequest(verb, {});
      const url = new URL(request.url);
      assert.equal(url.pathname, path, `${verb}: path`);
      assert.deepEqual([...url.searchParams.keys()], [], `${verb}: no query`);
    }
  });
});

describe("grafana stack refusals (offline)", () => {
  it("refuses without a stack label and sends nothing", async () => {
    const { code, out, requested } = await call(
      "health",
      {},
      { "grafana-stack.token": TOKEN },
    );
    assert.equal(requested, 0, "no request may be sent without a stack");
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    const warnings = resultOf(out)["warnings"] as string[] | undefined;
    assert.ok(
      warnings?.some((warning) => warning.includes("grafana.stack")),
      `expected a warning naming grafana.stack, got ${JSON.stringify(warnings)}`,
    );
  });

  it("refuses without the token and sends nothing", async () => {
    const { code, out, requested } = await call(
      "health",
      {},
      { "grafana.stack": STACK },
    );
    assert.equal(requested, 0, "no request may be sent without a token");
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
  });

  it("refuses a stack that is not a DNS label instead of leaving the stack host", async () => {
    for (const hostile of [
      "evil.example/x",
      "acme:8080",
      "acme@evil.example",
      "evil.example",
    ]) {
      const { code, out, requested } = await call(
        "list-datasources",
        {},
        { ...VAULT, "grafana.stack": hostile },
      );
      assert.equal(
        requested,
        0,
        `${hostile}: the credential must not leave *.grafana.net`,
      );
      assert.equal(code, 4, `${hostile}: expected NEEDS_AUTH`);
      assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    }
  });

  it("accepts a pasted host or URL as the stack without doubling it", async () => {
    for (const pasted of [
      "acme.grafana.net",
      "https://acme.grafana.net/",
      // A suffixed lookalike collapses to the label inside it, so the request
      // still lands on acme.grafana.net and the token never reaches evil.example.
      "acme.grafana.net.evil.example",
    ]) {
      const { code, seen } = await call(
        "health",
        {},
        { ...VAULT, "grafana.stack": pasted },
      );
      assert.equal(code, 0, `${pasted}: expected a clean exit`);
      if (seen === null) assert.fail(`${pasted}: expected an HTTP request`);
      assert.equal(
        seen.url,
        `${HOST}/api/health`,
        `${pasted}: must resolve to the same stack host`,
      );
    }
  });

  it("rejects an unknown verb without reading the credential store", async () => {
    const { store, backend } = await memoryStore();
    const out = captureOut();
    const code = await runCli(
      ["integration", "grafana-stack", "nonsense", "--json"],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 2);
    assert.match(out.err.join(""), /Unknown grafana-stack verb/);
    assert.equal(backend.loads, 0, "the verb check must precede the store");
  });
});

/* ------------------------------------------------------------------------- *
 * Live tier.
 *
 * Offline tests prove the request matches the documented API; only a real
 * stack proves Grafana accepts it, and the route probe cannot help here (the
 * host is per-customer, so `npm run probe` classifies it). This suite is
 * skipped by default and never touches the operator's vault: the secrets are
 * seeded straight from the environment into an in-memory store, and `runCli`
 * uses the real `fetch` because no `fetchFn` is injected.
 *
 *   GRAFANA_STACK_LIVE=1 GRAFANA_STACK=acme GRAFANA_STACK_TOKEN=… \
 *     node --import tsx --test test/grafana-stack.test.ts
 * ------------------------------------------------------------------------- */

const LIVE = process.env["GRAFANA_STACK_LIVE"] === "1";
const LIVE_STACK = process.env["GRAFANA_STACK"] ?? "";
const LIVE_TOKEN = process.env["GRAFANA_STACK_TOKEN"] ?? "";

const LIVE_SKIP: false | string = !LIVE
  ? "live contract: set GRAFANA_STACK_LIVE=1 (plus GRAFANA_STACK and GRAFANA_STACK_TOKEN) to run it against a real stack"
  : LIVE_STACK === "" || LIVE_TOKEN === ""
    ? "live contract: GRAFANA_STACK and GRAFANA_STACK_TOKEN must both be set"
    : false;

const LIVE_OPTS = { skip: LIVE_SKIP, timeout: 60_000 } as const;

async function liveCall(
  verb: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { store } = await memoryStore({
    "grafana-stack.token": LIVE_TOKEN,
    "grafana.stack": LIVE_STACK,
  });
  const out = captureOut();
  await runCli(
    [
      "integration",
      "grafana-stack",
      verb,
      "--args-json",
      JSON.stringify(args),
      "--json",
    ],
    {
      store,
      out,
      isTTY: false,
      upstream: null,
      run: async () => ({ code: 127, stdout: "", stderr: "" }),
    },
  );
  return resultOf(out);
}

function liveData(
  result: Record<string, unknown>,
  slug: string,
): Record<string, unknown> {
  assert.equal(result["status"], "OK", JSON.stringify(result));
  const data = result["data"] as Record<string, unknown> | undefined;
  assert.ok(data, "a successful call must carry data");
  assert.equal(data["toolSlug"], slug);
  return data;
}

describe("grafana stack live (read-only)", () => {
  it("health answers with the stack's build information", LIVE_OPTS, async () => {
    const data = liveData(await liveCall("health", {}), "grafana-stack_health");
    assert.ok(data["version"] || data["commit"], "health must report a version");
  });

  it("get_current_user returns the token's own record", LIVE_OPTS, async () => {
    const data = liveData(
      await liveCall("get-current-user", {}),
      "grafana-stack_get_current_user",
    );
    assert.ok(data["id"], "the response must carry the signed-in user");
  });

  it("list_datasources returns the data source list", LIVE_OPTS, async (t) => {
    const data = liveData(
      await liveCall("list-datasources", {}),
      "grafana-stack_list_datasources",
    );
    const sources = data["items"] ?? data;
    if (!Array.isArray(sources)) {
      return t.skip("the response was not a list of data sources");
    }
    const uid = (sources[0] as { uid?: string } | undefined)?.uid;
    if (typeof uid !== "string") {
      return t.skip("the stack has no data source to check");
    }
    const health = liveData(
      await liveCall("check-datasource-health", { uid }),
      "grafana-stack_check_datasource_health",
    );
    assert.ok(health["status"], "a health check must report a status");
  });

  it("search lists dashboards and get_dashboard reads one", LIVE_OPTS, async (t) => {
    const found = liveData(
      await liveCall("search", { type: "dash-db", limit: 1 }),
      "grafana-stack_search",
    );
    const rows = found["items"] ?? found;
    if (!Array.isArray(rows)) return t.skip("search returned no list");
    const uid = (rows[0] as { uid?: string } | undefined)?.uid;
    if (typeof uid !== "string") {
      return t.skip("the stack has no dashboard to read");
    }
    const dashboard = liveData(
      await liveCall("get-dashboard", { uid }),
      "grafana-stack_get_dashboard",
    );
    assert.ok(dashboard["dashboard"], "the response must carry the dashboard");
  });

  it("list_folders, list_dashboard_tags and list_library_elements answer", LIVE_OPTS, async () => {
    for (const [verb, slug] of [
      ["list-folders", "grafana-stack_list_folders"],
      ["list-dashboard-tags", "grafana-stack_list_dashboard_tags"],
      ["list-library-elements", "grafana-stack_list_library_elements"],
    ] as const) {
      const data = liveData(await liveCall(verb, {}), slug);
      assert.ok(data, `${slug}: expected a body`);
    }
  });

  it("the alerting provisioning reads answer", LIVE_OPTS, async () => {
    for (const [verb, slug] of [
      ["list-alert-rules", "grafana-stack_list_alert_rules"],
      ["list-contact-points", "grafana-stack_list_contact_points"],
      ["list-mute-timings", "grafana-stack_list_mute_timings"],
    ] as const) {
      const data = liveData(await liveCall(verb, {}), slug);
      assert.ok(data, `${slug}: expected a body`);
    }
  });

  it("annotations, teams and org users answer", LIVE_OPTS, async () => {
    const now = Date.now();
    const annotations = liveData(
      await liveCall("list-annotations", { from: now - 3_600_000, to: now }),
      "grafana-stack_list_annotations",
    );
    assert.ok(annotations, "annotations must return a body");
    const teams = liveData(
      await liveCall("search-teams", { per_page: 1 }),
      "grafana-stack_search_teams",
    );
    assert.ok(teams, "teams must return a body");
    const users = liveData(
      await liveCall("list-org-users", { limit: 1 }),
      "grafana-stack_list_org_users",
    );
    assert.ok(users, "org users must return a body");
  });
});
