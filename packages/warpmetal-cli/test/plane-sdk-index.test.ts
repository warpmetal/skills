/**
 * plane-sdk-index.test.ts - the endpoint table, held against the pinned SDK's source.
 *
 * `endpoints.mjs` records a verb and a path for every shipped tool and says it read them
 * from `plane-sdk==0.3.1`. This test is what makes that claim checkable: it reads the
 * pinned release, derives the request for every call site the table names, and compares
 * the two. Where an action in the pin forks - one member for a project, another for the
 * workspace - the table has to record one branch and refuse the other by argument, and
 * the second test holds it to that.
 *
 * Both caches are optional on purpose: the SDK comes from the pinned tarball and the
 * call sites come from the pinned MCP checkout, and a unit test may not fetch either.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { ENDPOINTS } from "../scripts/plane/endpoints.mjs";
import { readPinnedSdk } from "../scripts/plane/fetch-sdk.mjs";
import { buildSdkIndex, comparablePath, resolveCallSite, resolveRecorded } from "../scripts/plane/sdk-index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const planDir = join(here, "..", "scripts", "plane");
const inventory = JSON.parse(readFileSync(join(planDir, "inventory.json"), "utf8"));
const mcpCache = join(planDir, ".cache", `plane-mcp-${inventory.source.tag}`);
/** The SDK release the pin records, and the tarball it was read out of. */
const sdkPin = JSON.parse(readFileSync(join(planDir, "sdk.json"), "utf8")).source;
const sdkTarball = join(planDir, ".cache", `${sdkPin.package}-${sdkPin.version}`, sdkPin.artifact);

/** The module each `plane_<tool>_<action>` entry was reviewed against. */
const moduleOf = new Map<string, string>();
for (const tool of inventory.tools) {
  for (const action of tool.actions) moduleOf.set(`plane_${tool.tool}_${action.name}`, tool.module);
}

/**
 * The pinned SDK's index, or null when a cache is not checked out.
 *
 * Both halves of the comparison are fixtures read from `scripts/plane/.cache/`, and a
 * checkout without them skips rather than reaching the network for them. Only the
 * missing fixture is a skip: a pin this reader cannot read is a failure, so nothing here
 * catches one.
 */
function pinned(): { index: any } | null {
  if (!existsSync(mcpCache) || !existsSync(sdkTarball)) return null;
  return { index: buildSdkIndex(readPinnedSdk().files) };
}

/** A tool module's source, as the pin recorded it. */
function sourceOf(module: string): string {
  return readFileSync(join(mcpCache, ...module.split("/")), "utf8");
}

/** The paths an entry records: one, or one per case of the argument that chooses it. */
function recordedPaths(entry: any): string[] {
  return typeof entry.path === "string" ? [entry.path] : Object.values(entry.path.cases);
}

/**
 * Whether the SDK's spelling of a path and the table's are one route.
 *
 * `comparablePath` settles the workspace placeholder and the trailing slash the SDK
 * appends. One difference is left, and it is the SDK being *finer* than the table: an
 * identifier sent as two path parameters joined by a dash (`{project_identifier}` and
 * `{issue_identifier}`, which the caller writes as `PROJECT-123`) is one argument in the
 * table, named for what the caller passes. Both spellings describe one segment with one
 * dash in it, so a `{}-{}` pair is read as the single placeholder it stands for.
 */
function sameRoute(derived: string, recorded: string): boolean {
  return shape(derived) === shape(recorded);
}

function shape(path: string): string {
  return comparablePath(path).replace(/\{\}-\{\}/g, "{}");
}

/** The requests a resolution stands for, for a failure message. */
function spell(calls: Array<{ method: string; path: string }>): string {
  return calls.map((call) => `${call.method} ${call.path}`).join(" | ") || "nothing";
}

describe("plane sdk index", () => {
  it("reads the v1 tree and sets the v2 tree aside", () => {
    const context = pinned();
    if (context === null) return;
    const { index } = context;
    assert.ok(index.classes.size > 0, "no class read from plane/api");
    assert.ok(index.v2.size > 0, "the pinned release ships a v2 tree this reader must account for");
    // A name is not unique across the two trees: `Collections` is declared in both
    // `plane/api/collections/base.py` and `plane/api/v2/collections/__init__.py`. So what
    // keeps them apart is the file a class was read from, not its name - and were a v2
    // class allowed into the v1 map it could answer for a v1 call site, silently.
    for (const item of index.classes.values()) {
      assert.ok(!item.file.startsWith("plane/api/v2/"), `${item.name}: read from the v2 tree`);
    }
    // The client's own wiring is the boundary: every resource it assigns resolves in the
    // tree this reader reads, except one - `self.v2 = V2Namespace(self.config)`, in
    // `plane/client/plane_client.py` - which crosses into the other. That crossing is
    // what makes the out-of-scope error a real path rather than a defensive one, so a
    // call site through it is refused by name.
    const v2Roots: string[] = [];
    for (const [attribute, className] of index.roots) {
      if (index.classes.has(className)) continue;
      assert.ok(index.v2.has(className), `client.${attribute}: ${className} is declared in neither tree`);
      v2Roots.push(attribute);
    }
    assert.ok(v2Roots.length > 0, "the v1 client wires an entry point into the v2 tree");
    assert.throws(
      () => resolveCallSite(index, `client.${v2Roots[0]}.work_items.list`),
      /is in the v2 tree \(plane\/api\/v2\/\)/,
    );
  });

  it("derives the request every entry records", () => {
    const context = pinned();
    if (context === null) return;
    const wrong: string[] = [];
    let checked = 0;
    for (const [key, entry] of Object.entries(ENDPOINTS)) {
      const module = moduleOf.get(key);
      assert.ok(module !== undefined, `${key}: no action of that name in the pin`);
      const derived = resolveRecorded(context.index, entry.sdk, sourceOf(module));
      for (const path of recordedPaths(entry)) {
        checked += 1;
        if (!derived.calls.some((call) => call.method === entry.method && sameRoute(call.path, path))) {
          wrong.push(`${key}: ${entry.sdk} derives ${spell(derived.calls)}, not ${entry.method} ${path}`);
        }
      }
    }
    assert.deepEqual(wrong, []);
    assert.ok(checked >= Object.keys(ENDPOINTS).length, `${checked} path(s) checked`);
  });

  it("refuses the branch of a fork the table does not record", () => {
    // Half the pin's actions pick a member by whether an argument was given, and both
    // members are real requests. The table ships one branch and turns the other into a
    // named refusal; an entry that shipped one quietly would be sending the branch
    // nobody reviewed.
    const context = pinned();
    if (context === null) return;
    const problems: string[] = [];
    let forks = 0;
    for (const [key, entry] of Object.entries(ENDPOINTS)) {
      const module = moduleOf.get(key) as string;
      const derived = resolveRecorded(context.index, entry.sdk, sourceOf(module));
      const recorded = recordedPaths(entry);
      const extra = derived.calls.filter((call) => !recorded.some((path) => sameRoute(call.path, path)));
      if (extra.length === 0) continue;
      forks += 1;
      if ((entry.requireArgs ?? []).length === 0) {
        problems.push(`${key}: ${entry.sdk} also stands for ${spell(extra)}, but the entry refuses nothing`);
      }
    }
    assert.ok(forks > 0, "the pin's actions fork; this test must see at least one");
    assert.deepEqual(problems, []);
  });

  it("treats a bound name and the member it stands for as one call site", () => {
    const context = pinned();
    if (context === null) return;
    const bound = resolveRecorded(context.index, "customers.list", sourceOf("plane_mcp/tools/customer.py"));
    const qualified = resolveRecorded(context.index, "client.customers.list", "");
    assert.deepEqual(bound.members, ["client.customers.list"]);
    assert.deepEqual(bound.calls, qualified.calls);
  });

  it("refuses a call site the pin does not declare", () => {
    // The reader is worth trusting because it cannot skip a call site quietly: a member
    // the SDK does not declare, and a local name the module never binds, both fail here.
    const context = pinned();
    if (context === null) return;
    const module = sourceOf("plane_mcp/tools/workitem.py");
    assert.throws(() => resolveRecorded(context.index, "client.work_items.no_such_method", module), /declares no request/);
    assert.throws(() => resolveRecorded(context.index, "no_such_local_name_here", module), /never binds it to a client member/);
  });
});
