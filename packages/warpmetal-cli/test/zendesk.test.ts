/**
 * zendesk.test.ts - one request-shape test per Zendesk provider tool.
 *
 * `mcp-request-contract.test.ts` compares each builder against a fixture that
 * `gen-mcp-contract-fixtures.mjs` produced from that same builder, so it cannot
 * notice a wrong query name, a missing body field or a requester sent in the
 * wrong place: the fixture encodes the same mistake. `provider-contract.test.ts`
 * pins host, method and auth header against a hand-authored file, but says
 * nothing about the parameters or the body. These tests state the whole request,
 * written from Zendesk's published API reference, so a drift in any of the three
 * fails here.
 *
 * Everything above the live suite is offline: `fetch` is injected, so the suite
 * is deterministic and runs in CI. The live companion at the bottom is gated
 * behind ZENDESK_LIVE=1 and is skipped, with a named reason, until a tenant is
 * available; it is the only tier that can prove Zendesk accepts the call.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runCli } from "../src/dispatch.js";
import { captureOut } from "../src/output.js";
import { memoryStore } from "./helpers.js";

const TOKEN = "zd_test_token_value";
const SUBDOMAIN = "acme";
const EMAIL = "ops@acme.test";
const HOST = `https://${SUBDOMAIN}.zendesk.com`;

/** Zendesk API-token auth: Basic base64(<email>/token:<api_token>). */
const EXPECTED_AUTH = `Basic ${Buffer.from(`${EMAIL}/token:${TOKEN}`, "utf8").toString("base64")}`;

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

/** The vault a healthy Zendesk call needs. A negative case drops a key. */
const VAULT = {
  "zendesk.token": TOKEN,
  "zendesk.subdomain": SUBDOMAIN,
  "zendesk.email": EMAIL,
};

/**
 * Runs one `integration zendesk <verb>` call with a stubbed HTTP layer.
 *
 * `seed` is the whole vault, so a negative case removes a secret by leaving the
 * key out rather than by planting an undefined value.
 */
async function call(
  verb: string,
  args: Record<string, unknown>,
  seed: Record<string, string> = VAULT,
  extra: readonly string[] = [],
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
      "zendesk",
      verb,
      "--args-json",
      JSON.stringify(args),
      ...extra,
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

/** Asserts one of the call's warnings names the thing the operator must fix. */
function assertWarned(
  out: ReturnType<typeof captureOut>,
  fragment: string,
): void {
  const warnings = resultOf(out)["warnings"] as string[] | undefined;
  assert.ok(
    warnings?.some((warning) => warning.includes(fragment)),
    `expected a warning naming ${fragment}, got ${JSON.stringify(warnings)}`,
  );
}

/** Asserts the call succeeded, the auth contract holds, and returns the request. */
async function expectRequest(
  verb: string,
  args: Record<string, unknown>,
  extra: readonly string[] = [],
): Promise<Built> {
  const { code, out, seen } = await call(verb, args, VAULT, extra);
  assert.equal(code, 0, `expected a clean exit, stderr: ${out.err.join("")}`);
  assert.equal(resultOf(out)["status"], "OK");
  if (seen === null) assert.fail("expected an HTTP request");
  const headers = seen.init.headers as Record<string, string>;
  assert.equal(
    headers["Authorization"],
    EXPECTED_AUTH,
    "auth must be Basic email/token:api_token",
  );
  assert.equal(headers["Accept"], "application/json");
  return seen;
}

describe("zendesk request shape (offline)", () => {
  it("list_tickets queries the account's tickets", async () => {
    const request = await expectRequest("list-tickets", {
      external_id: "loc-1",
      page: 3,
      per_page: 25,
      sort_by: "updated_at",
      sort_order: "desc",
    });
    const url = new URL(request.url);
    assert.equal(url.origin, HOST);
    assert.equal(url.pathname, "/api/v2/tickets.json");
    assert.equal(url.searchParams.get("external_id"), "loc-1");
    assert.equal(url.searchParams.get("page"), "3");
    assert.equal(url.searchParams.get("per_page"), "25");
    assert.equal(url.searchParams.get("sort_by"), "updated_at");
    assert.equal(url.searchParams.get("sort_order"), "desc");
    assert.equal(request.init.method, "GET");
  });

  it("list_tickets sends no parameter the caller did not ask for", async () => {
    const request = await expectRequest("list-tickets", {});
    const url = new URL(request.url);
    // The builder keeps the repo's trailing `?` when `qs` is empty; what matters
    // is that no parameter is invented.
    assert.deepEqual([...url.searchParams.keys()], []);
  });

  it("get_ticket addresses one ticket by id", async () => {
    const request = await expectRequest("get-ticket", { ticket_id: 42 });
    assert.equal(request.init.method, "GET");
    assert.equal(request.url, `${HOST}/api/v2/tickets/42.json`);
  });

  it("list_ticket_comments reads one ticket's conversation", async () => {
    const request = await expectRequest("list-ticket-comments", {
      page_after: "cursor-token",
      page_size: 20,
      sort_order: "desc",
      ticket_id: 42,
    });
    const url = new URL(request.url);
    assert.equal(request.init.method, "GET");
    assert.equal(url.pathname, "/api/v2/tickets/42/comments.json");
    assert.equal(url.searchParams.get("sort_order"), "desc");
    // Cursor pagination: Zendesk rejects a request that mixes it with the offset
    // shape, so none of `page`/`per_page` may appear alongside `page[size]`.
    assert.equal(url.searchParams.get("page[size]"), "20");
    assert.equal(url.searchParams.get("page[after]"), "cursor-token");
    assert.equal(url.searchParams.get("page"), null);
    assert.equal(url.searchParams.get("per_page"), null);
  });

  it("search forwards the query syntax and its paging", async () => {
    const request = await expectRequest("search", {
      query: "type:ticket status:open",
      sort_by: "status",
      sort_order: "desc",
      per_page: 5,
    });
    const url = new URL(request.url);
    assert.equal(request.init.method, "GET");
    assert.equal(url.pathname, "/api/v2/search.json");
    // Space and colon are encoded by URLSearchParams; Zendesk reads `+` as a space.
    assert.equal(url.searchParams.get("query"), "type:ticket status:open");
    assert.equal(url.searchParams.get("sort_by"), "status");
    assert.equal(url.searchParams.get("per_page"), "5");
  });

  it("get_current_user reads the credential's own identity", async () => {
    const request = await expectRequest("get-current-user", {});
    assert.equal(request.init.method, "GET");
    assert.equal(request.url, `${HOST}/api/v2/users/me.json`);
  });

  it("list_users forwards the filters and the cursor, and invents no sort", async () => {
    const request = await expectRequest("list-users", {
      external_id: "loc-2",
      page_after: "cursor-token",
      page_size: 25,
      role: "agent",
    });
    const url = new URL(request.url);
    assert.equal(request.init.method, "GET");
    assert.equal(url.pathname, "/api/v2/users.json");
    assert.equal(url.searchParams.get("role"), "agent");
    assert.equal(url.searchParams.get("external_id"), "loc-2");
    assert.equal(url.searchParams.get("page[size]"), "25");
    assert.equal(url.searchParams.get("page[after]"), "cursor-token");
    // Regression: the tool exposed `sort_by`/`sort_order`, which this endpoint
    // does not accept. Zendesk ignores an unknown parameter instead of rejecting
    // it, so an unsorted page read as if it were sorted.
    assert.equal(url.searchParams.get("sort_by"), null);
    assert.equal(url.searchParams.get("sort_order"), null);
    assert.equal(url.searchParams.get("page"), null);
    assert.equal(url.searchParams.get("per_page"), null);
  });

  it("list_organizations uses Zendesk's cursor pagination", async () => {
    const request = await expectRequest("list-organizations", {
      page_size: 25,
      page_after: "cursor-token",
    });
    const url = new URL(request.url);
    assert.equal(request.init.method, "GET");
    assert.equal(url.pathname, "/api/v2/organizations.json");
    // Zendesk rejects mixing offset `page` with `page[size]`, so only the cursor
    // shape is exposed; the brackets are percent-encoded by URLSearchParams.
    assert.equal(url.searchParams.get("page[size]"), "25");
    assert.equal(url.searchParams.get("page[after]"), "cursor-token");
    assert.equal(url.searchParams.get("page"), null);
    assert.equal(url.searchParams.get("per_page"), null);
  });

  it("list_views uses Zendesk's cursor pagination", async () => {
    const request = await expectRequest("list-views", {
      page_size: 10,
      page_after: "cursor",
    });
    const url = new URL(request.url);
    assert.equal(request.init.method, "GET");
    assert.equal(url.pathname, "/api/v2/views.json");
    assert.equal(url.searchParams.get("page[size]"), "10");
    assert.equal(url.searchParams.get("page[after]"), "cursor");
  });

  it("list_view_tickets addresses one view with cursor paging", async () => {
    const request = await expectRequest("list-view-tickets", {
      page_after: "cursor",
      page_size: 30,
      view_id: 7,
    });
    const url = new URL(request.url);
    assert.equal(request.init.method, "GET");
    assert.equal(url.pathname, "/api/v2/views/7/tickets.json");
    assert.equal(url.searchParams.get("page[size]"), "30");
    assert.equal(url.searchParams.get("page[after]"), "cursor");
    assert.equal(url.searchParams.get("page"), null);
    assert.equal(url.searchParams.get("per_page"), null);
  });

  it("create_ticket sends requester_id at the top level of the ticket", async () => {
    const request = await expectRequest(
      "create-ticket",
      {
        requester_id: 7,
        subject: "Site down",
        comment_body: "investigating",
        public: false,
        priority: "urgent",
        tags: ["ops"],
      },
      ["--confirm", "CONFIRM ZENDESK CREATE TICKET"],
    );
    assert.equal(request.init.method, "POST");
    assert.equal(request.url, `${HOST}/api/v2/tickets.json`);
    const headers = request.init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    // Regression: `requester_id` was nested inside `requester` as `id`, which is
    // not a field of that object - Zendesk would have opened the ticket with no
    // requester.
    assert.deepEqual(JSON.parse(String(request.init.body)), {
      ticket: {
        requester_id: 7,
        subject: "Site down",
        comment: { body: "investigating", public: false },
        priority: "urgent",
        tags: ["ops"],
      },
    });
  });

  it("create_ticket builds a requester object from email and name alone", async () => {
    const request = await expectRequest(
      "create-ticket",
      { requester_email: "client@acme.test", requester_name: "Client" },
      ["--confirm", "CONFIRM ZENDESK CREATE TICKET"],
    );
    // Nothing the caller left out is invented: no `subject`, no `comment`.
    assert.deepEqual(JSON.parse(String(request.init.body)), {
      ticket: { requester: { email: "client@acme.test", name: "Client" } },
    });
  });

  it("add_ticket_comment updates the ticket with the comment", async () => {
    const request = await expectRequest(
      "add-ticket-comment",
      { ticket_id: 42, comment_body: "on it", public: false },
      ["--confirm", "CONFIRM ZENDESK ADD TICKET COMMENT"],
    );
    assert.equal(request.init.method, "PUT");
    assert.equal(request.url, `${HOST}/api/v2/tickets/42.json`);
    assert.deepEqual(JSON.parse(String(request.init.body)), {
      ticket: { comment: { body: "on it", public: false } },
    });
  });

  it("add_ticket_comment defaults to a public reply", async () => {
    const request = await expectRequest(
      "add-ticket-comment",
      { ticket_id: 42, comment_body: "on it" },
      ["--confirm", "CONFIRM ZENDESK ADD TICKET COMMENT"],
    );
    assert.deepEqual(JSON.parse(String(request.init.body)), {
      ticket: { comment: { body: "on it", public: true } },
    });
  });

  it("update_ticket sends the settable fields inside the ticket envelope", async () => {
    const request = await expectRequest(
      "update-ticket",
      {
        ticket_id: 42,
        status: "open",
        priority: "high",
        assignee_id: 7,
        group_id: 3,
        subject: "Reopened",
        type: "incident",
        tags: ["ops", "urgent"],
      },
      ["--confirm", "CONFIRM ZENDESK UPDATE TICKET"],
    );
    assert.equal(request.init.method, "PUT");
    assert.equal(request.url, `${HOST}/api/v2/tickets/42.json`);
    const headers = request.init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(String(request.init.body)), {
      ticket: {
        status: "open",
        priority: "high",
        assignee_id: 7,
        group_id: 3,
        subject: "Reopened",
        type: "incident",
        tags: ["ops", "urgent"],
      },
    });
  });

  it("update_ticket forwards only the fields the caller asked to change", async () => {
    const request = await expectRequest(
      "update-ticket",
      { ticket_id: 42, status: "solved" },
      ["--confirm", "CONFIRM ZENDESK UPDATE TICKET"],
    );
    // Regression: forwarding the raw args would carry `ticket_id` into the body
    // as an unknown field and reset nothing on purpose.
    assert.deepEqual(JSON.parse(String(request.init.body)), {
      ticket: { status: "solved" },
    });
  });

  it("update_ticket forwards an explicit null assignee as an unassign", async () => {
    const request = await expectRequest(
      "update-ticket",
      { ticket_id: 42, assignee_id: null },
      ["--confirm", "CONFIRM ZENDESK UPDATE TICKET"],
    );
    // `null` is a value the caller asked for, not an absent field, so it travels.
    assert.deepEqual(JSON.parse(String(request.init.body)), {
      ticket: { assignee_id: null },
    });
  });

  it("update_ticket with no settable field is a documented no-op", async () => {
    const request = await expectRequest("update-ticket", { ticket_id: 42 }, [
      "--confirm",
      "CONFIRM ZENDESK UPDATE TICKET",
    ]);
    assert.equal(request.init.method, "PUT");
    assert.equal(request.url, `${HOST}/api/v2/tickets/42.json`);
    assert.deepEqual(JSON.parse(String(request.init.body)), { ticket: {} });
  });

  it("get_user addresses one user by id", async () => {
    const request = await expectRequest("get-user", { user_id: 7 });
    assert.equal(request.init.method, "GET");
    assert.equal(request.url, `${HOST}/api/v2/users/7.json`);
  });

  it("get_organization addresses one organization by id", async () => {
    const request = await expectRequest("get-organization", {
      organization_id: 9,
    });
    assert.equal(request.init.method, "GET");
    assert.equal(request.url, `${HOST}/api/v2/organizations/9.json`);
  });

  it("count_view_tickets reads a view's count, not its tickets", async () => {
    const request = await expectRequest("count-view-tickets", { view_id: 7 });
    assert.equal(request.init.method, "GET");
    assert.equal(request.url, `${HOST}/api/v2/views/7/count.json`);
  });

  it("get_ticket_metrics reads a ticket's metrics resource", async () => {
    const request = await expectRequest("get-ticket-metrics", {
      ticket_id: 42,
    });
    assert.equal(request.init.method, "GET");
    assert.equal(request.url, `${HOST}/api/v2/tickets/42/metrics.json`);
  });
});

describe("zendesk refusals and identity (offline)", () => {
  it("refuses without a subdomain and sends nothing", async () => {
    const { code, out, requested } = await call(
      "get-current-user",
      {},
      { "zendesk.token": TOKEN, "zendesk.email": EMAIL },
    );
    assert.equal(requested, 0, "no request may be sent without a subdomain");
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    assertWarned(out, "zendesk.subdomain");
  });

  it("refuses without the account email and sends nothing", async () => {
    const { code, out, requested } = await call(
      "get-current-user",
      {},
      { "zendesk.token": TOKEN, "zendesk.subdomain": SUBDOMAIN },
    );
    assert.equal(
      requested,
      0,
      "API-token auth needs the email that owns the token",
    );
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    assertWarned(out, "zendesk.email");
  });

  it("refuses a subdomain that is not a DNS label instead of leaving the tenant host", async () => {
    for (const hostile of [
      "evil.example/x",
      "acme:8080",
      "acme@evil.example",
      "evil.example",
    ]) {
      const { code, out, requested } = await call(
        "list-tickets",
        {},
        { ...VAULT, "zendesk.subdomain": hostile },
      );
      assert.equal(
        requested,
        0,
        `${hostile}: the credential must not leave *.zendesk.com`,
      );
      assert.equal(code, 4, `${hostile}: expected NEEDS_AUTH`);
      assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    }
  });

  it("accepts a pasted host or URL as the subdomain without doubling it", async () => {
    for (const pasted of ["acme.zendesk.com", "https://acme.zendesk.com/"]) {
      const { code, seen } = await call(
        "get-current-user",
        {},
        { ...VAULT, "zendesk.subdomain": pasted },
      );
      assert.equal(code, 0, `${pasted}: expected a clean exit`);
      if (seen === null) assert.fail(`${pasted}: expected an HTTP request`);
      assert.equal(
        seen.url,
        `${HOST}/api/v2/users/me.json`,
        `${pasted}: must resolve to the same tenant host`,
      );
    }
  });

  it("requires the create gate literal before anything is sent", async () => {
    const { code, out, requested } = await call("create-ticket", {
      requester_email: "client@acme.test",
    });
    assert.equal(requested, 0, "nothing may be sent without the gate");
    assert.equal(code, 2);
    assert.match(out.err.join(""), /CONFIRM ZENDESK CREATE TICKET/);
  });

  it("requires the comment gate literal before anything is sent", async () => {
    const { code, out, requested } = await call("add-ticket-comment", {
      ticket_id: 42,
      comment_body: "on it",
    });
    assert.equal(requested, 0, "nothing may be sent without the gate");
    assert.equal(code, 2);
    assert.match(out.err.join(""), /CONFIRM ZENDESK ADD TICKET COMMENT/);
  });

  it("requires the update gate literal before anything is sent", async () => {
    const { code, out, requested } = await call("update-ticket", {
      ticket_id: 42,
      status: "closed",
    });
    assert.equal(requested, 0, "nothing may be sent without the gate");
    assert.equal(code, 2);
    assert.match(out.err.join(""), /CONFIRM ZENDESK UPDATE TICKET/);
  });

  it("refuses a create with no requester at all, before sending anything", async () => {
    // The schema cannot express "requester_id or requester_email", so the pair
    // is checked by the CLI's argument validator. Zendesk answers 422 for a
    // ticket with no requester; the caller deserves the reason and no request.
    const { code, out, requested } = await call(
      "create-ticket",
      { subject: "No requester" },
      VAULT,
      ["--confirm", "CONFIRM ZENDESK CREATE TICKET"],
    );
    assert.equal(requested, 0, "an impossible create must not reach the network");
    assert.equal(code, 5);
    assert.equal(resultOf(out)["status"], "ERROR");
    const errors = resultOf(out)["errors"] as string[] | undefined;
    assert.ok(
      errors?.some((error) => error.includes("requester_id or requester_email")),
      `expected the reason to name the fix, got ${JSON.stringify(errors)}`,
    );
  });

  it("rejects an unknown verb without reading the credential store", async () => {
    const { store, backend } = await memoryStore();
    const out = captureOut();
    const code = await runCli(
      ["integration", "zendesk", "nonsense", "--json"],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 2);
    assert.match(out.err.join(""), /Unknown zendesk verb/);
    assert.equal(backend.loads, 0, "the verb check must precede the store");
  });
});

/* ------------------------------------------------------------------------- *
 * Live tier.
 *
 * Offline tests prove the request matches the documented API; only a real
 * tenant proves Zendesk accepts it. This suite is skipped by default and never
 * touches the operator's vault: the secrets are seeded straight from the
 * environment into an in-memory store, and `runCli` uses the real `fetch`
 * because no `fetchFn` is injected.
 *
 *   ZENDESK_LIVE=1 ZENDESK_SUBDOMAIN=acme ZENDESK_EMAIL=ops@acme.test \
 *     ZENDESK_API_TOKEN=… node --import tsx --test test/zendesk.test.ts
 *
 * The write tier needs a second flag and leaves one ticket behind, because the
 * provider exposes no delete tool: close it by hand afterwards.
 * ------------------------------------------------------------------------- */

const LIVE = process.env["ZENDESK_LIVE"] === "1";
const LIVE_WRITE = process.env["ZENDESK_LIVE_WRITE"] === "1";
const LIVE_SUBDOMAIN = process.env["ZENDESK_SUBDOMAIN"] ?? "";
const LIVE_EMAIL = process.env["ZENDESK_EMAIL"] ?? "";
const LIVE_TOKEN = process.env["ZENDESK_API_TOKEN"] ?? "";

const LIVE_SKIP: false | string = !LIVE
  ? "live contract: set ZENDESK_LIVE=1 (plus ZENDESK_SUBDOMAIN, ZENDESK_EMAIL and ZENDESK_API_TOKEN) to run it against a real tenant"
  : LIVE_SUBDOMAIN === "" || LIVE_EMAIL === "" || LIVE_TOKEN === ""
    ? "live contract: ZENDESK_SUBDOMAIN, ZENDESK_EMAIL and ZENDESK_API_TOKEN must all be set"
    : false;

const LIVE_WRITE_SKIP: false | string =
  LIVE_SKIP === false
    ? LIVE_WRITE
      ? false
      : "live writes: set ZENDESK_LIVE_WRITE=1 to create a real ticket and an internal note"
    : LIVE_SKIP;

const LIVE_OPTS = { skip: LIVE_SKIP, timeout: 60_000 } as const;

async function liveCall(
  verb: string,
  args: Record<string, unknown>,
  extra: readonly string[] = [],
): Promise<Record<string, unknown>> {
  const { store } = await memoryStore({
    "zendesk.token": LIVE_TOKEN,
    "zendesk.subdomain": LIVE_SUBDOMAIN,
    "zendesk.email": LIVE_EMAIL,
  });
  const out = captureOut();
  await runCli(
    [
      "integration",
      "zendesk",
      verb,
      "--args-json",
      JSON.stringify(args),
      ...extra,
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

describe("zendesk live (read-only)", () => {
  it("list_tickets returns the tickets envelope", LIVE_OPTS, async () => {
    const data = liveData(
      await liveCall("list-tickets", { per_page: 1 }),
      "zendesk_list_tickets",
    );
    assert.ok(
      Array.isArray(data["tickets"]),
      "the response must carry a tickets array",
    );
  });

  it(
    "get_current_user returns the credential's own record",
    LIVE_OPTS,
    async () => {
      const data = liveData(
        await liveCall("get-current-user", {}),
        "zendesk_get_current_user",
      );
      assert.ok(data["user"], "the response must carry the user object");
    },
  );

  it("search returns the results envelope", LIVE_OPTS, async () => {
    const data = liveData(
      await liveCall("search", { query: "type:ticket", per_page: 1 }),
      "zendesk_search",
    );
    assert.ok(
      Array.isArray(data["results"]),
      "the response must carry a results array",
    );
  });

  it("list_users returns the users envelope", LIVE_OPTS, async () => {
    const data = liveData(
      await liveCall("list-users", { role: "agent" }),
      "zendesk_list_users",
    );
    assert.ok(
      Array.isArray(data["users"]),
      "the response must carry a users array",
    );
  });

  it(
    "list_organizations returns the organizations envelope",
    LIVE_OPTS,
    async () => {
      const data = liveData(
        await liveCall("list-organizations", { page_size: 1 }),
        "zendesk_list_organizations",
      );
      assert.ok(
        Array.isArray(data["organizations"]),
        "the response must carry an organizations array",
      );
    },
  );

  it("list_views returns the views envelope", LIVE_OPTS, async () => {
    const data = liveData(
      await liveCall("list-views", { page_size: 1 }),
      "zendesk_list_views",
    );
    assert.ok(
      Array.isArray(data["views"]),
      "the response must carry a views array",
    );
  });

  it(
    "get_ticket and list_ticket_comments read a ticket the account already has",
    LIVE_OPTS,
    async (t) => {
      const listed = liveData(
        await liveCall("list-tickets", { per_page: 1 }),
        "zendesk_list_tickets",
      );
      const tickets = listed["tickets"] as Array<{ id?: number }> | undefined;
      const ticketId = tickets?.[0]?.id;
      if (typeof ticketId !== "number")
        return t.skip("the account has no ticket to read");

      const ticket = liveData(
        await liveCall("get-ticket", { ticket_id: ticketId }),
        "zendesk_get_ticket",
      );
      assert.ok(ticket["ticket"], "the response must carry the ticket object");

      const comments = liveData(
        await liveCall("list-ticket-comments", { ticket_id: ticketId }),
        "zendesk_list_ticket_comments",
      );
      assert.ok(
        Array.isArray(comments["comments"]),
        "the response must carry a comments array",
      );
    },
  );

  it(
    "list_view_tickets reads a view the account already has",
    LIVE_OPTS,
    async (t) => {
      const listed = liveData(
        await liveCall("list-views", { page_size: 1 }),
        "zendesk_list_views",
      );
      const views = listed["views"] as Array<{ id?: number }> | undefined;
      const viewId = views?.[0]?.id;
      if (typeof viewId !== "number")
        return t.skip("the account has no view to read");

      const data = liveData(
        await liveCall("list-view-tickets", { view_id: viewId }),
        "zendesk_list_view_tickets",
      );
      assert.ok(
        Array.isArray(data["tickets"]),
        "the response must carry a tickets array",
      );
    },
  );

  it("count_view_tickets returns a view_count object", LIVE_OPTS, async (t) => {
    const listed = liveData(
      await liveCall("list-views", { page_size: 1 }),
      "zendesk_list_views",
    );
    const views = listed["views"] as Array<{ id?: number }> | undefined;
    const viewId = views?.[0]?.id;
    if (typeof viewId !== "number")
      return t.skip("the account has no view to read");

    const data = liveData(
      await liveCall("count-view-tickets", { view_id: viewId }),
      "zendesk_count_view_tickets",
    );
    assert.ok(
      data["view_count"],
      "the response must carry a view_count object",
    );
  });

  it(
    "get_user and get_organization read the credential's own records",
    LIVE_OPTS,
    async (t) => {
      const me = liveData(
        await liveCall("get-current-user", {}),
        "zendesk_get_current_user",
      );
      const userId = (me["user"] as { id?: number } | undefined)?.id;
      if (typeof userId !== "number")
        return t.skip("the credential's user has no id to read");

      const user = liveData(
        await liveCall("get-user", { user_id: userId }),
        "zendesk_get_user",
      );
      assert.ok(user["user"], "the response must carry the user object");

      const orgId = (user["user"] as { organization_id?: number } | undefined)
        ?.organization_id;
      if (typeof orgId !== "number")
        return t.skip("the credential's user has no organization to read");

      const org = liveData(
        await liveCall("get-organization", { organization_id: orgId }),
        "zendesk_get_organization",
      );
      assert.ok(
        org["organization"],
        "the response must carry the organization object",
      );
    },
  );

  it(
    "get_ticket_metrics reads a ticket's metrics the account already has",
    LIVE_OPTS,
    async (t) => {
      const listed = liveData(
        await liveCall("list-tickets", { per_page: 1 }),
        "zendesk_list_tickets",
      );
      const tickets = listed["tickets"] as Array<{ id?: number }> | undefined;
      const ticketId = tickets?.[0]?.id;
      if (typeof ticketId !== "number")
        return t.skip("the account has no ticket to read");

      const data = liveData(
        await liveCall("get-ticket-metrics", { ticket_id: ticketId }),
        "zendesk_get_ticket_metrics",
      );
      assert.ok(
        data["ticket_metric"],
        "the response must carry a ticket_metric object",
      );
    },
  );
});

describe("zendesk live (writes, opt-in)", () => {
  it(
    "create_ticket opens an internal note and add_ticket_comment appends one",
    { skip: LIVE_WRITE_SKIP, timeout: 90_000 },
    async () => {
      // `public: false` on both writes: nothing is emailed to a customer. The
      // requester is the operator's own agent address for the same reason.
      const created = liveData(
        await liveCall(
          "create-ticket",
          {
            requester_email: LIVE_EMAIL,
            requester_name: "WarpMetal provider check",
            subject: `[warpmetal-test] Zendesk provider verification ${new Date().toISOString()}`,
            comment_body:
              "Created by the WarpMetal Zendesk provider verification. Safe to close.",
            public: false,
            tags: ["warpmetal-test"],
          },
          ["--confirm", "CONFIRM ZENDESK CREATE TICKET"],
        ),
        "zendesk_create_ticket",
      );
      const ticket = created["ticket"] as { id?: number } | undefined;
      assert.ok(
        Number.isInteger(ticket?.id),
        "Zendesk must return the created ticket id",
      );

      const commented = liveData(
        await liveCall(
          "add-ticket-comment",
          {
            ticket_id: ticket?.id,
            comment_body: "Second step of the WarpMetal provider verification.",
            public: false,
          },
          ["--confirm", "CONFIRM ZENDESK ADD TICKET COMMENT"],
        ),
        "zendesk_add_ticket_comment",
      );
      assert.ok(
        commented["ticket"],
        "the update must return the ticket object",
      );

      // Update the ticket we just created: change the priority and tags but do
      // NOT close it, because the ticket stays behind for a human to close and
      // the provider exposes no delete tool to clean it up.
      const updated = liveData(
        await liveCall(
          "update-ticket",
          {
            ticket_id: ticket?.id,
            priority: "high",
            tags: ["warpmetal-test", "verified"],
          },
          ["--confirm", "CONFIRM ZENDESK UPDATE TICKET"],
        ),
        "zendesk_update_ticket",
      );
      const updatedTicket = updated["ticket"] as
        | { priority?: string; tags?: string[]; status?: string }
        | undefined;
      assert.ok(updatedTicket, "the update must return the ticket object");
      assert.equal(
        updatedTicket?.priority,
        "high",
        "the update must persist the new priority",
      );
      assert.ok(
        Array.isArray(updatedTicket?.tags) &&
          updatedTicket.tags.includes("verified"),
        "the update must persist the new tags",
      );

      // No delete tool is exposed on purpose, so the ticket stays behind.
      console.log(
        `zendesk live: created ticket ${String(ticket?.id)} (internal notes only); close it by hand.`,
      );
    },
  );
});
