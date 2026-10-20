/**
 * plane-inventory.test.ts - what the Plane pin promises, and that `--check` keeps it.
 *
 * The pin is the load-bearing artifact for this provider: Plane publishes no
 * OpenAPI document, so `inventory.json` *is* the vendor contract every tool in
 * `docs/plane-endpoint-map.md` is reviewed against. Two things make it worth
 * trusting, and both are tested here:
 *
 *   - the numbers in `counts` are the numbers the tool list actually has, and every
 *     action that is a single request names the client member it calls, because the
 *     endpoint table is built from those names;
 *   - `--check` really does compare, byte for byte, the inventory it derives against
 *     the committed file: a mutated digest and a mutated action are both reported.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { comparable, firstDifference } from "../scripts/plane/fetch-inventory.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const planDir = join(here, "..", "scripts", "plane");
const inventory = JSON.parse(readFileSync(join(planDir, "inventory.json"), "utf8"));

describe("plane pin", () => {
  it("records a source file for every module it read, with a digest each", () => {
    assert.ok(inventory.sources.length > 0);
    const digests = new Set();
    for (const source of inventory.sources) {
      assert.equal(typeof source.path, "string", "a source without a path");
      assert.match(source.sha256, /^[0-9a-f]{64}$/, `${source.path}: sha256 must be a hex digest`);
      assert.ok(!digests.has(source.path), `${source.path}: listed twice`);
      digests.add(source.path);
      assert.ok(source.bytes > 0);
    }
  });

  it("counts what the tool list actually holds", () => {
    const actions = inventory.tools.flatMap((tool) => tool.actions);
    const shapes = { single: 0, multi: 0, none: 0 };
    for (const action of actions) shapes[action.requestShape] += 1;
    assert.equal(inventory.counts.tools, inventory.tools.length);
    assert.equal(inventory.counts.actions, actions.length);
    assert.equal(inventory.counts.read, actions.filter((action) => action.read).length);
    assert.equal(inventory.counts.destructive, actions.filter((action) => action.destructive).length);
    assert.equal(inventory.counts.shapes.single, shapes.single);
    assert.equal(inventory.counts.shapes.multi, shapes.multi);
    assert.equal(inventory.counts.shapes.none, shapes.none);
  });

  it("records a call site for every action that is a single request", () => {
    // The endpoint table names the member each action calls; an action with no
    // recorded call would leave its endpoint a guess, which is the one thing this
    // provider cannot afford.
    const silent = inventory.tools.flatMap((tool) =>
      tool.actions
        .filter((action) => action.requestShape === "single" && (action.sdkCalls ?? []).length === 0)
        .map((action) => `${tool.tool}.${action.name}`),
    );
    assert.deepEqual(silent, []);
  });

  it("keeps every action's declaration line inside its module", () => {
    // A checkout without the downloaded pin has nothing to measure, and reaching for
    // the network is not a unit test's move: the case skips instead. The guard wraps
    // the reads, not the assertions - a checkout *with* the pin must still fail.
    const cache = join(planDir, ".cache", `plane-mcp-${inventory.source.tag}`);
    if (!existsSync(cache)) return;
    const lines = new Map(
      inventory.sources
        .filter((source) => source.path.startsWith("plane_mcp/tools/"))
        .map((source) => [source.path, readFileSync(join(cache, ...source.path.split("/")), "utf8").split("\n").length]),
    );
    for (const tool of inventory.tools) {
      const total = lines.get(tool.module);
      if (total === undefined) continue; // a module the pin does not read
      for (const action of tool.actions) {
        assert.ok(action.line >= 1 && action.line <= total, `${tool.tool}.${action.name}: line out of range`);
      }
    }
  });
});

describe("plane pin comparison", () => {
  it("reports a mutated digest", () => {
    const mutated = JSON.parse(JSON.stringify(inventory));
    mutated.sources[0].sha256 = "0".repeat(64);
    const difference = firstDifference(comparable(mutated), comparable(inventory));
    assert.ok(difference !== null, "a mutated digest must be visible");
    assert.match(difference, /sources\[0\]\.sha256/);
  });

  it("reports a mutated action", () => {
    const mutated = JSON.parse(JSON.stringify(inventory));
    mutated.tools[0].actions[0].sdkCalls = ["client.something.else"];
    assert.ok(firstDifference(comparable(mutated), comparable(inventory)) !== null);
  });

  it("ignores the release metadata a cache-only check cannot verify", () => {
    const mutated = JSON.parse(JSON.stringify(inventory));
    mutated.source.publishedAt = null;
    assert.equal(firstDifference(comparable(mutated), comparable(inventory)), null);
  });
});

describe("plane pin check", () => {
  const cache = join(planDir, ".cache", `plane-mcp-${inventory.source.tag}`);

  it("agrees with the committed inventory when the pinned source is available", () => {
    if (!existsSync(cache)) {
      // A checkout without the downloaded cache: `--check` would reach the network,
      // which a unit test must not do.
      return;
    }
    const result = spawnSync(process.execPath, ["fetch-inventory.mjs", "--check", "--offline"], {
      cwd: planDir,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /inventory\.json matches the pinned release/);
  });
});
