/**
 * catalog-layout.test.ts - the guard for the one-file-per-provider layout.
 *
 * `src/providers/catalog/index.ts` is generated from the JSON files sitting next
 * to it (`scripts/gen-catalog-barrel.mjs`). Without this test, adding a provider
 * file without re-running the generator would fail silently - the new tools
 * would simply never be registered - and a mis-named file would register its
 * tools under the wrong provider.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { CATALOG_FILES } from "../src/providers/catalog/index.js";
import { PROVIDER_TOOL_COUNT } from "../src/providers/index.js";

const catalogDir = fileURLToPath(new URL("../src/providers/catalog/", import.meta.url));

function providerFileNames(): string[] {
  return readdirSync(catalogDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

test("the generated barrel lists exactly the provider files on disk", () => {
  const onDisk = providerFileNames().map((name) => name.replace(/\.json$/, ""));
  assert.deepEqual(
    CATALOG_FILES.map((file) => file.provider),
    onDisk,
    "regenerate with: node packages/skills-mcp/scripts/gen-catalog-barrel.mjs",
  );
});

test("every provider file declares its own toolkitId and holds only its tools", () => {
  let total = 0;
  for (const name of providerFileNames()) {
    const provider = name.replace(/\.json$/, "");
    const file = JSON.parse(readFileSync(join(catalogDir, name), "utf8")) as {
      version: number;
      provider: string;
      source: string;
      extractedAt: string;
      tools: { toolSlug: string; toolkitId: string }[];
    };

    assert.equal(file.provider, provider, `${name}: provider must mirror the file name`);
    assert.equal(typeof file.version, "number", `${name}: version`);
    assert.ok(file.source.length > 0, `${name}: source`);
    assert.ok(!Number.isNaN(Date.parse(file.extractedAt)), `${name}: extractedAt`);

    for (const tool of file.tools) {
      assert.equal(tool.toolkitId, provider, `${name}: ${tool.toolSlug}`);
      total += 1;
    }
  }

  assert.equal(total, PROVIDER_TOOL_COUNT, "provider tool count");
  assert.ok(PROVIDER_TOOL_COUNT > 0, "provider tool count must not be empty");
});
