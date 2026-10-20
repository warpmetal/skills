/**
 * plane.test.ts - the request each Plane tool builds, and what it refuses.
 *
 * `mcp-request-contract.test.ts` compares the builders against fixtures generated
 * from the same builders, so it cannot notice a wrong path segment, a query
 * parameter sent for a field, or a workspace slug interpolated raw: the fixture
 * encodes the same mistake. `provider-contract.test.ts` pins host, method and auth
 * header. These tests state the whole request, and the refusals, from the endpoint
 * map in `docs/plane-endpoint-map.md`, and they go through the dispatcher by the
 * verb a caller actually types - so a tool whose verb is not dispatchable fails
 * here rather than in an operator's terminal.
 *
 * Two properties of this provider get their own cases, because both are ways a
 * request could silently go somewhere other than where it was reviewed:
 *
 *   - the workspace slug is context, never an argument, so no caller can aim a tool
 *     at another workspace, and a slug that is not a slug is refused rather than
 *     trimmed into one;
 *   - a tool that ships the project-scoped branch of a vendor action refuses the
 *     call that would have selected the workspace-scoped one.
 *
 * One provider behaviour is pinned here because it was measured against the live
 * service (see `scripts/plane/probe.mjs`): Plane answers 403 - not 401 - for an API
 * key it does not recognise, with the body `{"detail":"Given API token is not
 * valid"}`. The shared 403 path reads a 403 as "the credential is fine, the scope
 * is not", which for Plane would send an operator to grant a scope instead of
 * reissuing the key, so that body is reported as a refused credential instead.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/dispatch.js";
import { captureOut } from "../src/output.js";
import { MCP_TOOL_DEFS } from "../src/integration/mcp-tools/index.js";
import { memoryStore } from "./helpers.js";

const TOKEN = "plane_test_token_value";
const WORKSPACE = "acme-eng";
const HOST = "https://api.plane.so";
const PROJECT = "11111111-1111-1111-1111-111111111111";
const WORKITEM = "22222222-2222-2222-2222-222222222222";

const here = dirname(fileURLToPath(import.meta.url));
const sampleArgs = JSON.parse(
  readFileSync(join(here, "fixtures/mcp-requests/sample-args.json"), "utf8"),
) as Record<string, Record<string, unknown>>;

const PLANE_DEFS = MCP_TOOL_DEFS.filter((def) => def.provider === "plane");

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

/** The vault a healthy Plane call needs. A negative case drops a key. */
const VAULT = {
  "plane.token": TOKEN,
  "plane.workspace_slug": WORKSPACE,
};

/** What the stubbed API answers. The default is a JSON body of the usual shape. */
interface StubResponse {
  readonly status?: number;
  readonly body?: unknown;
}

/** Runs one `integration plane <verb>` call with a stubbed HTTP layer. */
async function call(
  verb: string,
  args: Record<string, unknown>,
  seed: Record<string, string> = VAULT,
  response: StubResponse = {},
): Promise<CallResult> {
  const { store } = await memoryStore(seed);
  const out = captureOut();
  let seen: Built | null = null;
  let requested = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    requested += 1;
    seen = { url: String(url), init };
    return new Response(JSON.stringify(response.body ?? { id: PROJECT }), {
      status: response.status ?? 200,
    });
  }) as unknown as typeof fetch;

  const code = await runCli(
    ["integration", "plane", verb, "--args-json", JSON.stringify(args), "--json"],
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
  const document = JSON.parse(out.out.join("")) as { results?: Array<Record<string, unknown>> };
  return document.results?.[0] ?? {};
}

function messages(result: Record<string, unknown>, field: string): string[] {
  return (result[field] ?? []) as string[];
}

/** Asserts the call succeeded, the auth contract holds, and returns the request. */
async function expectRequest(verb: string, args: Record<string, unknown>): Promise<Built> {
  const { code, out, seen } = await call(verb, args);
  assert.equal(code, 0, `expected a clean exit, stderr: ${out.err.join("")}`);
  assert.equal(resultOf(out)["status"], "OK");
  if (seen === null) assert.fail("expected an HTTP request");
  const headers = seen.init.headers as Record<string, string>;
  assert.equal(headers["x-api-key"], TOKEN, "the API key travels in x-api-key");
  assert.equal(headers["Content-Type"], "application/json");
  return seen;
}

describe("plane request shape (offline)", () => {
  it("member-me reads the token's own user, naming no workspace", async () => {
    const request = await expectRequest("member-me", {});
    const url = new URL(request.url);
    assert.equal(url.origin, HOST);
    assert.equal(url.pathname, "/api/v1/users/me/");
  });

  it("workitem-retrieve names the workspace, the project and the work item", async () => {
    const request = await expectRequest("workitem-retrieve", {
      project_id: PROJECT,
      workitem_id: WORKITEM,
      expand: "state",
    });
    const url = new URL(request.url);
    assert.equal(
      url.pathname,
      `/api/v1/workspaces/${WORKSPACE}/projects/${PROJECT}/work-items/${WORKITEM}/`,
    );
    assert.equal(url.searchParams.get("expand"), "state");
  });

  it("workitem-retrieve-by-identifier puts the human key in the path", async () => {
    const request = await expectRequest("workitem-retrieve-by-identifier", {
      workitem_identifier: "ENG-42",
    });
    assert.equal(new URL(request.url).pathname, `/api/v1/workspaces/${WORKSPACE}/work-items/ENG-42/`);
  });

  it("customer-list sends only the filters it was given", async () => {
    const request = await expectRequest("customer-list", { per_page: 25 });
    const url = new URL(request.url);
    assert.equal(url.pathname, `/api/v1/workspaces/${WORKSPACE}/customers/`);
    assert.equal(url.searchParams.get("per_page"), "25");
    // A filter nobody passed is absent, not empty: an empty `query` would ask
    // Plane for names matching "".
    assert.equal(url.searchParams.has("query"), false);
    assert.equal(url.searchParams.has("cursor"), false);
  });

  it("the workspace slug is context, never an argument", async () => {
    // A caller cannot redirect the request by passing a workspace of their own.
    const request = await expectRequest("customer-list", { workspace: "someone-else" });
    assert.match(new URL(request.url).pathname, new RegExp(`^/api/v1/workspaces/${WORKSPACE}/`));
  });

  it("a pasted workspace URL is reduced to its slug", async () => {
    // The shapes an operator can paste: the one the refusal hint names, the API URL
    // from the vendor's own documentation, and the two host forms without a scheme.
    const pasted = [
      `https://app.plane.so/${WORKSPACE}/`,
      `https://api.plane.so/api/v1/workspaces/${WORKSPACE}/`,
      `app.plane.so/${WORKSPACE}`,
      `api.plane.so/workspaces/${WORKSPACE}?per_page=5`,
    ];
    for (const stored of pasted) {
      const { code, out, seen } = await call("customer-list", {}, {
        ...VAULT,
        "plane.workspace_slug": stored,
      });
      assert.equal(code, 0, `${stored}: ${out.err.join("")}`);
      assert.equal(
        new URL(seen!.url).pathname,
        `/api/v1/workspaces/${WORKSPACE}/customers/`,
        `${stored}: must reduce to the label`,
      );
    }
  });

  it("refuses a deep app link instead of guessing which segment is the workspace", async () => {
    // `https://app.plane.so/<slug>/issues/` is a link an operator may well copy,
    // and only its first segment names the workspace. The reducer knows the two
    // shapes the hint and the docs name, so anything else is refused with the
    // shape to store rather than trimmed to the first path segment: a guess would
    // name a workspace nobody reviewed, which is the property this provider is
    // built around.
    const { code, out, seen } = await call("customer-list", {}, {
      ...VAULT,
      "plane.workspace_slug": `https://app.plane.so/${WORKSPACE}/issues/`,
    });
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    assert.match(messages(resultOf(out), "warnings").join(" "), /app\.plane\.so\/<slug>\//);
    assert.equal(seen, null, "an unresolved slug must not reach the network");
  });

  it("retrieve and list are different routes, so the verb has to choose", async () => {
    // A surface that answered every listing with the collection-only path would
    // still be schema-consistent; these are the paths the map records.
    const retrieve = await expectRequest("project-retrieve", { project_id: PROJECT });
    assert.equal(new URL(retrieve.url).pathname, `/api/v1/workspaces/${WORKSPACE}/projects/${PROJECT}/`);
    const list = await expectRequest("project-list", {});
    assert.equal(new URL(list.url).pathname, `/api/v1/workspaces/${WORKSPACE}/projects-lite/`);
  });
});

describe("plane refusals (offline)", () => {
  it("needs the workspace slug, and says which secret to set", async () => {
    const { code, out, seen } = await call("customer-list", {}, { "plane.token": TOKEN });
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    const warnings = messages(resultOf(out), "warnings");
    assert.ok(warnings.some((warning) => warning.includes("plane.workspace_slug")), warnings.join(" "));
    assert.equal(seen, null, "no request is made without a workspace");
  });

  it("refuses a slug that is not a slug instead of trimming it into one", async () => {
    const { code, out, seen } = await call("customer-list", {}, {
      ...VAULT,
      "plane.workspace_slug": "acme/../../evil",
    });
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    assert.equal(seen, null);
  });

  it("refuses a value whose stray segments would splice into a different label", async () => {
    // Reducing with a blind replace of `workspaces/` would splice this into the
    // label `acme-engevil` - a workspace nobody named - and every request, with the
    // stored key, would go there. The reduction is anchored per segment instead.
    const { code, out, seen } = await call("customer-list", {}, {
      ...VAULT,
      "plane.workspace_slug": "acme-eng/workspaces/evil",
    });
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    assert.equal(seen, null);
  });

  it("refuses a project-scoped tool called without project_id", async () => {
    // The refusal is the tool's own, so it arrives as an ERROR result and exit 5,
    // the way an impossible Zendesk create does - not as a usage failure.
    const { code, out, seen } = await call("state-list", {});
    assert.equal(code, 5);
    assert.equal(resultOf(out)["status"], "ERROR");
    const errors = messages(resultOf(out), "errors");
    assert.ok(errors.some((error) => error.includes("project_id")), errors.join(" "));
    assert.equal(seen, null, "the refusal happens before any request is built");
  });

  it("refuses a template kind the surface does not ship", async () => {
    const { code, out, seen } = await call("template-list", { kind: "project", project_id: PROJECT });
    assert.equal(code, 5);
    assert.equal(resultOf(out)["status"], "ERROR");
    const errors = messages(resultOf(out), "errors");
    assert.ok(errors.some((error) => error.includes("workitem, page")), errors.join(" "));
    assert.equal(seen, null);
  });

  it("needs the API key, and says which secret to set", async () => {
    const { code, out, seen } = await call("customer-list", {}, { "plane.workspace_slug": WORKSPACE });
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    const warnings = messages(resultOf(out), "warnings");
    assert.ok(warnings.some((warning) => warning.includes("plane.token")), warnings.join(" "));
    assert.equal(seen, null);
  });
});

describe("plane credential verdicts (offline)", () => {
  /**
   * The two 403 cases were measured on the live API: an unrecognised key is a 403
   * whose body says the token is not valid, and Plane sends the same status for a
   * real scope refusal.
   */
  it("a 403 that says the key is not valid is a refused credential, not a missing scope", async () => {
    const { code, out, requested } = await call("member-me", {}, VAULT, {
      status: 403,
      body: { detail: "Given API token is not valid" },
    });
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    assert.equal(requested, 1, "the key is only reported bad once it has been tried");
    const warnings = messages(resultOf(out), "warnings").join(" ");
    assert.ok(
      /rejected the stored credential/.test(warnings),
      `the credential was refused, so the hint must say so: ${warnings}`,
    );
    assert.equal(
      /the token is valid/.test(warnings),
      false,
      "calling an invalid key valid sends the operator to grant a scope instead of reissuing it",
    );
  });

  it("a 403 that is not about the key keeps reading as a missing scope", async () => {
    const { code, out } = await call("member-me", {}, VAULT, {
      status: 403,
      body: { detail: "You do not have permission to perform this action." },
    });
    assert.equal(code, 4);
    assert.equal(resultOf(out)["status"], "NEEDS_AUTH");
    assert.match(messages(resultOf(out), "warnings").join(" "), /lacks permission/);
  });

  it("a 401 is still a refused credential, as it is for every provider", async () => {
    const { code, out } = await call("member-me", {}, VAULT, { status: 401, body: { detail: "nope" } });
    assert.equal(code, 4);
    assert.match(messages(resultOf(out), "warnings").join(" "), /rejected the stored credential/);
  });
});

describe("plane dispatch (offline)", () => {
  it("registers the sixty read tools of the shipped wave", () => {
    assert.equal(PLANE_DEFS.length, 60);
    assert.equal(new Set(PLANE_DEFS.map((def) => def.verb)).size, 60, "verbs are unique");
    assert.equal(PLANE_DEFS.filter((def) => def.mutating).length, 0, "wave p1 is the read surface");
  });

  /**
   * The dispatcher resolves a tool by the verb a caller types, so a verb nobody
   * can type - a name the catalog does not register, or args the tool refuses -
   * is a tool that is shipped but unreachable. Every tool is driven here through
   * `runCli` with the reviewed sample args.
   */
  it("every shipped tool is reachable by its own verb and sends exactly one request", async () => {
    for (const def of PLANE_DEFS) {
      const args = { ...(sampleArgs[def.toolSlug] ?? {}) };
      if (def.toolSlug === "plane_template_list") {
        // The sample kind is deliberately not a shipped one; that refusal has its
        // own case above.
        args["kind"] = "workitem";
      }
      const { code, out, seen, requested } = await call(def.verb, args);
      assert.equal(code, 0, `${def.toolSlug}: exit ${code}, ${out.err.join("")}`);
      const result = resultOf(out);
      assert.equal(result["status"], "OK", `${def.toolSlug}: ${JSON.stringify(result)}`);
      // The routing identity travels inside the payload, so a tool whose verb
      // resolved to a neighbour is caught here.
      const data = result["data"] as Record<string, unknown> | undefined;
      assert.equal(data?.["toolSlug"], def.toolSlug, `${def.toolSlug}: routed to another tool`);
      assert.equal(requested, 1, `${def.toolSlug}: made ${String(requested)} requests`);
      const url = new URL(seen!.url);
      assert.equal(url.origin, HOST, `${def.toolSlug}: origin`);
      const scoped = def.toolSlug !== "plane_member_me";
      assert.equal(
        url.pathname.startsWith(`/api/v1/workspaces/${WORKSPACE}/`),
        scoped,
        `${def.toolSlug}: ${url.pathname} must ${scoped ? "" : "not "}name the workspace`,
      );
    }
  });
});
