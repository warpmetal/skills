/**
 * chatgpt-profile.test.ts - the ChatGPT desktop surface.
 *
 * `chatgpt-local` is the stdio profile the ChatGPT plugin runs: the content
 * tools plus the 43 `wm_*` CLI tools, and *never* the provider tools. The count
 * is asserted directly because it is the whole point of the profile - a
 * regression that registered providers here would silently hand a third-party
 * account surface to a client that asked for 46 tools.
 *
 * The server is built in memory with a runner that refuses, so nothing here
 * spawns a CLI or touches a real audit directory.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { LoadedRegistry } from "../src/registry.js";
import { loadRegistry } from "../src/registry.js";
import { createSkillsServer, type ServerProfile } from "../src/server.js";
import { providerToolSlugs } from "../src/providers/index.js";
import { ALL_TOOL_SPECS } from "../src/tools/index.js";
import { makeRegistryFixture } from "./helpers.js";

const CONTENT_TOOLS: readonly string[] = ["skill_list", "skill_read", "skill_search"];
/** The documented CLI surface. `profiles.test.ts` asserts the same number. */
const WM_TOOL_COUNT = 43;
const CHATGPT_TOOL_COUNT = CONTENT_TOOLS.length + WM_TOOL_COUNT;
const PROVIDER_TOOL_SLUGS = new Set(providerToolSlugs());

async function listToolNames(
  loaded: LoadedRegistry,
  profile: ServerProfile,
  auditDir: string,
): Promise<string[]> {
  const server = createSkillsServer(loaded, {
    profile,
    auditDir,
    auditEnabled: false,
    // A runner that refuses keeps this suite from resolving, let alone spawning,
    // the real CLI. Only `listTools` is exercised here.
    runner: {
      run: () => Promise.reject(new Error("chatgpt-profile.test.ts must never run the CLI")),
    },
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "skills-mcp-chatgpt-profile-test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  try {
    const tools = await client.listTools();
    return tools.tools.map((tool) => tool.name).sort();
  } finally {
    await client.close();
  }
}

test("chatgpt-local exposes the content surface plus every CLI tool and no providers", async () => {
  const fixture = await makeRegistryFixture();
  try {
    assert.equal(ALL_TOOL_SPECS.length, WM_TOOL_COUNT, "the CLI surface must stay 43 tools");

    const loaded = await loadRegistry({ registry: fixture.dir });
    const names = await listToolNames(loaded, "chatgpt-local", fixture.dir);

    assert.equal(
      names.length,
      CHATGPT_TOOL_COUNT,
      `chatgpt-local must expose exactly ${String(CHATGPT_TOOL_COUNT)} tools (3 content + ${String(WM_TOOL_COUNT)} CLI)`,
    );
    for (const name of CONTENT_TOOLS) {
      assert.ok(names.includes(name), `chatgpt-local is missing ${name}`);
    }
    assert.equal(
      names.filter((name) => name.startsWith("wm_")).length,
      WM_TOOL_COUNT,
      "chatgpt-local must expose every wm_* tool",
    );
    assert.equal(
      names.filter((name) => PROVIDER_TOOL_SLUGS.has(name)).length,
      0,
      "chatgpt-local must never register a provider tool",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("chatgpt-local ignores an injected provider invoker instead of registering providers", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const server = createSkillsServer(loaded, {
      profile: "chatgpt-local",
      auditDir: fixture.dir,
      auditEnabled: false,
      runner: {
        run: () => Promise.reject(new Error("chatgpt-profile.test.ts must never run the CLI")),
      },
      // A non-null invoker would register the provider surface on `full`. On
      // `chatgpt-local` it must be ignored, because the profile's contract is
      // the absence of providers rather than their being unconfigured.
      providers: {} as never,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "skills-mcp-chatgpt-profile-test", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const tools = await client.listTools();
      assert.equal(
        tools.tools.length,
        CHATGPT_TOOL_COUNT,
        "an injected provider invoker must not change the chatgpt-local tool count",
      );
      assert.equal(
        tools.tools.filter((tool) => PROVIDER_TOOL_SLUGS.has(tool.name)).length,
        0,
        "an injected provider invoker must not register provider tools on chatgpt-local",
      );
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});
