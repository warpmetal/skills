import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { MCP_TOOL_DEFS } from "../src/integration/mcp-tools/index.js";
import type { McpToolRequest } from "../src/integration/mcp-tools/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures/mcp-requests");

const sampleArgs = JSON.parse(
  readFileSync(join(fixtures, "sample-args.json"), "utf8"),
) as Record<string, Record<string, unknown>>;
const sampleCtx = JSON.parse(
  readFileSync(join(fixtures, "sample-ctx.json"), "utf8"),
) as Record<string, Record<string, string>>;

function readFixture(slug: string): McpToolRequest {
  return JSON.parse(
    readFileSync(join(fixtures, `${slug}.json`), "utf8"),
  ) as McpToolRequest;
}

describe("mcp provider request contracts", () => {
  it("has a fixture for every one of the 955 tools", () => {
    for (const def of MCP_TOOL_DEFS) {
      assert.ok(
        existsSync(join(fixtures, `${def.toolSlug}.json`)),
        `missing fixture for ${def.toolSlug}`,
      );
      assert.ok(
        sampleArgs[def.toolSlug] !== undefined,
        `missing sample args for ${def.toolSlug}`,
      );
    }
  });

  for (const def of MCP_TOOL_DEFS) {
    it(`${def.toolSlug} builds the reviewed request`, () => {
      // Round-trip through JSON so the comparison matches the wire payload
      // (`undefined` fields are dropped exactly as `JSON.stringify` would).
      const actual = JSON.parse(
        JSON.stringify(
          def.build({
            args: sampleArgs[def.toolSlug]!,
            ctx: sampleCtx[def.provider] ?? {},
          }),
        ),
      );
      assert.deepEqual(
        actual,
        readFixture(def.toolSlug),
        `${def.toolSlug} request drifted from its fixture; regen and re-review against the API docs`,
      );
    });
  }

  it("keeps authentication placeholders out of the URL only as a token marker", () => {
    for (const def of MCP_TOOL_DEFS) {
      const request = readFixture(def.toolSlug);
      // `__BASIC__` is only ever a header value; a URL never carries it.
      assert.ok(
        !request.url.includes("__BASIC__"),
        `${def.toolSlug} leaked __BASIC__ into the URL`,
      );
      for (const [name, value] of Object.entries(request.headers ?? {})) {
        assert.ok(
          typeof value === "string",
          `${def.toolSlug} header ${name} must be a string`,
        );
      }
    }
  });
});
