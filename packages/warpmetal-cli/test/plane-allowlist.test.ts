/**
 * plane-allowlist.test.ts - the rules that keep the Plane allowlist honest.
 *
 * Plane publishes no spec, so the validator is doing something a Cloudflare-style
 * review gets from the document itself: it holds a *selection* and an *endpoint
 * table* together that were decided separately. The rules tested here are the ones
 * that would otherwise be discovered by a caller:
 *
 *   - the endpoint's `sdk` call site must be one the pin recorded for that action,
 *     which is the only thing tying "what we ship" to "what the vendor does";
 *   - an action the pin sees as more than one request cannot be shipped as one;
 *   - an argument the action declares must reach the request, and the request may
 *     not name an argument the action does not declare;
 *   - a `destructive` claim has to agree with the vendor's flag, and a narrowing
 *     has to be argued in a `flowNote`.
 *
 * The stubs are deliberately tiny: the rules live in the validator, not in how the
 * real inventory was parsed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadAllowlist } from "../scripts/plane/allowlist.mjs";

const TAG = "v9.9.9";

/** An inventory with one tool and one action, unless the case says otherwise. */
function inventoryOf(action, { tool = "widget" } = {}) {
  return {
    source: { tag: TAG },
    tools: [
      {
        tool,
        title: "Widgets",
        actions: [
          {
            name: "list",
            // A read by default, because the default endpoint below is a GET and
            // the validator refuses a write that is a GET.
            requires: [],
            optional: [],
            read: true,
            destructive: false,
            requestShape: "single",
            requestLines: 1,
            loops: false,
            branch: "own",
            sdkCalls: ["client.widgets.list"],
            ...action,
          },
        ],
      },
    ],
  };
}

const ENDPOINT = { sdk: "client.widgets.list", method: "GET", path: "/workspaces/{workspace}/widgets" };

/** A document whose single entry is valid unless the case says otherwise. */
function documentOf(entry, extra = {}) {
  return {
    version: 1,
    inventory: { tag: TAG },
    waves: { w1: { status: "reviewed" } },
    tools: [
      {
        toolSlug: "plane_widget_list",
        resource: "widget",
        action: "list",
        wave: "w1",
        reason: "A reason long enough for the validator to accept it.",
        ...entry,
      },
    ],
    excluded: [],
    pending: [],
    ...extra,
  };
}

function problemsFor(entry, { action = {}, endpoints = { plane_widget_list: ENDPOINT }, extra = {} } = {}) {
  const result = loadAllowlist("", inventoryOf(action), endpoints, documentOf(entry, extra));
  return result.problems;
}

describe("plane allowlist rules", () => {
  it("accepts a reviewed entry whose endpoint is the recorded call site", () => {
    assert.deepEqual(problemsFor({}), []);
  });

  it("refuses an entry whose endpoint names a call the action does not make", () => {
    const problems = problemsFor({}, { endpoints: { plane_widget_list: { ...ENDPOINT, sdk: "client.other.list" } } });
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? "", /does not call/);
  });

  it("refuses a tool with no endpoint, and an endpoint with no tool", () => {
    const missing = problemsFor({}, { endpoints: {} });
    assert.ok(missing.some((problem) => problem.includes("no endpoint")), missing.join("\n"));

    const orphan = problemsFor({}, {
      endpoints: { plane_widget_list: ENDPOINT, plane_other_list: ENDPOINT },
    });
    assert.ok(orphan.some((problem) => problem.includes("plane_other_list: has an endpoint")));
  });

  it("refuses an action the pin classifies as more than one request", () => {
    const problems = problemsFor(
      {},
      { action: { requestShape: "multi", requestLines: 2, sdkCalls: ["client.widgets.list", "client.widgets.count"] } },
    );
    assert.ok(problems.some((problem) => problem.includes("is a multi request")), problems.join("\n"));
  });

  it("refuses a slug that does not match its resource and action", () => {
    const problems = problemsFor({ toolSlug: "plane_widget_retrieve" });
    assert.ok(problems.some((problem) => problem.includes("does not match resource")));
  });

  it("refuses a pin the allowlist has not been reviewed against", () => {
    const result = loadAllowlist(
      "",
      inventoryOf({}),
      { plane_widget_list: ENDPOINT },
      documentOf({}, { inventory: { tag: "v0.0.1" } }),
    );
    assert.ok(result.problems.some((problem) => problem.includes("re-review the allowlist")));
  });

  it("refuses an action that is neither shipped, excluded, nor pending", () => {
    const result = loadAllowlist("", inventoryOf({}), { plane_widget_list: ENDPOINT }, documentOf({}, { tools: [] }));
    assert.ok(result.problems.some((problem) => problem.includes("neither allowlisted, excluded, nor pending")));
  });
});


describe("plane allowlist arguments", () => {
  it("refuses a declared argument the endpoint never sends", () => {
    const problems = problemsFor({}, { action: { requires: ["widget_id", "widget_name"] } });
    assert.ok(problems.some((problem) => problem.includes('declares "widget_name"')), problems.join("\n"));
  });

  it("refuses a path placeholder the action does not declare", () => {
    const problems = problemsFor(
      {},
      { endpoints: { plane_widget_list: { ...ENDPOINT, path: "/workspaces/{workspace}/widgets/{other_id}" } } },
    );
    assert.ok(problems.some((problem) => problem.includes("the path names {other_id}")));
  });

  it("accepts an argument dropped with a note", () => {
    const problems = problemsFor(
      { dropArgs: ["widget_id"], dropNote: "The listing does not filter by widget." },
      {
        action: { requires: ["widget_id"] },
        endpoints: { plane_widget_list: { ...ENDPOINT, path: "/workspaces/{workspace}/widgets" } },
      },
    );
    assert.deepEqual(problems, []);
  });

  it("requires the note that explains a drop", () => {
    const problems = problemsFor(
      { dropArgs: ["widget_id"] },
      {
        action: { requires: ["widget_id"] },
        endpoints: { plane_widget_list: { ...ENDPOINT, path: "/workspaces/{workspace}/widgets" } },
      },
    );
    assert.ok(problems.some((problem) => problem.includes("dropNote")));
  });

  it("refuses a path that names no workspace without saying so", () => {
    const problems = problemsFor({}, { endpoints: { plane_widget_list: { ...ENDPOINT, path: "/widgets" } } });
    assert.ok(problems.some((problem) => problem.includes("noWorkspace: true")));
  });

  it("refuses a query entry the action does not declare", () => {
    const problems = problemsFor(
      {},
      { endpoints: { plane_widget_list: { ...ENDPOINT, query: ["widget_id", "nope"] } } },
    );
    assert.ok(problems.some((problem) => problem.includes('"nope" is used by the endpoint')));
  });
});

describe("plane allowlist safety rules", () => {
  it("refuses to ship an action the vendor marks destructive as an ordinary write", () => {
    const problems = problemsFor({}, { action: { destructive: true } });
    assert.ok(problems.some((problem) => problem.includes("the vendor marks widget.list destructive")));
  });

  it("requires a reason for a destructive claim", () => {
    const problems = problemsFor(
      { destructive: true },
      { action: { destructive: true }, endpoints: { plane_widget_list: { ...ENDPOINT, method: "DELETE" } } },
    );
    assert.ok(problems.some((problem) => problem.includes("destructiveReason")));
  });

  it("refuses a read that is not a GET", () => {
    const problems = problemsFor(
      {},
      { action: { read: true }, endpoints: { plane_widget_list: { ...ENDPOINT, method: "POST" } } },
    );
    assert.ok(problems.some((problem) => problem.includes("is a read")));
  });

  it("requires a flowNote where the endpoint narrows the vendor's action", () => {
    const problems = problemsFor({}, { endpoints: { plane_widget_list: { ...ENDPOINT, requireArgs: ["project_id"] } } });
    assert.ok(problems.some((problem) => problem.includes("add a flowNote")), problems.join("\n"));
  });

  it("requires a flowNote where the pin's dispatcher shares the branch", () => {
    const problems = problemsFor({}, { action: { branch: "fall-through" } });
    assert.ok(problems.some((problem) => problem.includes("add a flowNote")));
  });

  it("accepts a narrowing that is argued", () => {
    const problems = problemsFor(
      { flowNote: "Ships the project-scoped branch; the workspace one is not exposed." },
      { endpoints: { plane_widget_list: { ...ENDPOINT, requireArgs: ["project_id"] } } },
    );
    assert.deepEqual(problems, []);
  });
});
