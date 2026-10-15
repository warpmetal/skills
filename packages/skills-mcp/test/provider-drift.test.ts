/**
 * provider-drift.test.ts - the guard against two generators disagreeing.
 *
 * `src/providers/mapping.ts` (this package) and `integration/mcp-tools/catalog.ts`
 * (the CLI) are both generated from the same provider catalog JSON, but by two
 * separate scripts (`gen-mapping.mjs` and `gen-mcp-tools.mjs`). Each package's
 * own tests validate its own copy, so nothing would notice if one generator were
 * re-run and the other were not. This compares the two artifacts directly, so a
 * half-applied regeneration fails here rather than at a provider call.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  PROVIDER_TOOL_COUNT,
  PROVIDER_TOOL_MAPPINGS,
  mappedProviderToolSlugs,
} from "../src/providers/index.js";
import { MCP_TOOL_DEFS } from "../../warpmetal-cli/src/integration/mcp-tools/catalog.js";

test("the MCP mapping and the CLI catalog describe the same provider tools", () => {
  assert.equal(MCP_TOOL_DEFS.length, PROVIDER_TOOL_COUNT, "CLI catalog size");
  assert.equal(MCP_TOOL_DEFS.length, PROVIDER_TOOL_MAPPINGS.length, "mapping size");

  const bySlug = new Map(MCP_TOOL_DEFS.map((def) => [def.toolSlug, def]));
  assert.equal(bySlug.size, MCP_TOOL_DEFS.length, "duplicate toolSlug in the CLI catalog");

  for (const mapping of PROVIDER_TOOL_MAPPINGS) {
    const def = bySlug.get(mapping.toolSlug);
    assert.ok(def, `CLI catalog is missing ${mapping.toolSlug}`);
    assert.equal(def.provider, mapping.provider, `${mapping.toolSlug}: provider`);
    assert.equal(def.verb, mapping.verb, `${mapping.toolSlug}: verb`);
    assert.equal(def.mutating, mapping.mutating, `${mapping.toolSlug}: mutating`);
    assert.equal(def.gate, mapping.gate, `${mapping.toolSlug}: gate`);
  }

  assert.deepEqual(
    [...mappedProviderToolSlugs()].sort(),
    MCP_TOOL_DEFS.map((def) => def.toolSlug).sort(),
    "the two generators must cover exactly the same slugs",
  );
});
