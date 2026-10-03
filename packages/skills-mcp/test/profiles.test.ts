/**
 * profiles.test.ts - the transport/profile split.
 *
 * This package carries two surfaces in one server: the `skill_*` content tools
 * and the 43 `wm_*` CLI tools. Which ones a client can see is decided by the
 * transport, not by the caller: stdio gets `full`, the unauthenticated HTTP
 * transport gets `content`.
 *
 * The distinction is a security boundary, so it is asserted directly rather than
 * inferred from the HTTP suite: if a future change registered the CLI tools
 * unconditionally, the HTTP client would silently gain the ability to spawn a
 * privileged binary, and only this file would notice.
 *
 * Both servers are built in memory with a fake runner, so nothing here spawns a
 * CLI or touches a real audit directory.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { LoadedRegistry } from "../src/registry.js";
import { loadRegistry } from "../src/registry.js";
import { createSkillsServer, type ServerProfile } from "../src/server.js";
import { ALL_TOOL_SPECS } from "../src/tools/index.js";
import { makeRegistryFixture } from "./helpers.js";

const CONTENT_TOOLS: readonly string[] = ["skill_list", "skill_read", "skill_search"];
/** The documented CLI surface. `conformance.test.ts` asserts the same number. */
const WM_TOOL_COUNT = 43;
const TOTAL_TOOL_COUNT = WM_TOOL_COUNT + CONTENT_TOOLS.length;

async function listToolNames(
  loaded: LoadedRegistry,
  profile: ServerProfile,
  auditDir: string,
): Promise<string[]> {
  const server = createSkillsServer(loaded, {
    profile,
    auditDir,
    auditEnabled: false,
    // A runner that refuses keeps the `full` profile from resolving, let alone
    // spawning, the real CLI. Only `listTools` is exercised here.
    runner: {
      run: () => Promise.reject(new Error("profiles.test.ts must never run the CLI")),
    },
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "skills-mcp-profiles-test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  try {
    const tools = await client.listTools();
    return tools.tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
  }
}

test("the full profile exposes the content surface plus every CLI tool", async () => {
  const fixture = await makeRegistryFixture();
  try {
    assert.equal(ALL_TOOL_SPECS.length, WM_TOOL_COUNT, "the CLI surface must stay 43 tools");

    const loaded = await loadRegistry({ registry: fixture.dir });
    const names = await listToolNames(loaded, "full", fixture.dir);

    assert.equal(
      names.length,
      TOTAL_TOOL_COUNT,
      `full must expose ${String(TOTAL_TOOL_COUNT)} tools (3 content + ${String(WM_TOOL_COUNT)} CLI)`,
    );
    for (const name of CONTENT_TOOLS) {
      assert.ok(names.includes(name), `the full profile is missing ${name}`);
    }
    assert.equal(
      names.filter((name) => name.startsWith("wm_")).length,
      WM_TOOL_COUNT,
      "the full profile must expose every wm_* tool",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("the content profile never exposes a wm_* tool", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const names = await listToolNames(loaded, "content", fixture.dir);

    assert.deepEqual(
      names,
      [...CONTENT_TOOLS].sort(),
      "content must expose exactly the three skill_* tools",
    );
    assert.equal(
      names.filter((name) => name.startsWith("wm_")).length,
      0,
      "the unauthenticated HTTP profile must never reach the CLI surface",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("the content tools are strict and declare an output contract", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const server = createSkillsServer(loaded, {
      profile: "content",
      auditDir: fixture.dir,
      auditEnabled: false,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "skills-mcp-profiles-test", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      // Both content tools that return a JSON payload must publish the contract
      // the payload is validated against, exactly as the `wm_*` specs do.
      const tools = await client.listTools();
      for (const name of ["skill_list", "skill_search"]) {
        const tool = tools.tools.find((entry) => entry.name === name);
        assert.ok(tool, `${name} must be registered`);
        assert.ok(tool.outputSchema, `${name} must declare an output schema`);
      }

      const listed = (await client.callTool({ name: "skill_list", arguments: {} })) as unknown as {
        structuredContent?: unknown;
      };
      assert.ok(listed.structuredContent, "skill_list must return structuredContent");

      // An undeclared field is an error, not something silently ignored. The
      // SDK may answer with an error result or reject the promise; both are a
      // rejection as far as the caller is concerned.
      let rejected = false;
      try {
        const result = await client.callTool({
          name: "skill_list",
          arguments: { unexpectedField: "boom" },
        });
        rejected = result.isError === true;
      } catch {
        rejected = true;
      }
      assert.equal(rejected, true, "an undeclared field must be rejected");
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});
