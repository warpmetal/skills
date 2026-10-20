/**
 * chatgpt-runtime.test.ts - the two server generations must coexist.
 *
 * The package carries the v1 runtime (`@modelcontextprotocol/sdk`, which serves
 * `full`/`content`) and, as of Fase 2, the v2 runtime
 * (`@modelcontextprotocol/server` plus `@openai/mcp-extensions`, which the
 * ChatGPT surface will use). This file builds both in one process: if a future
 * dependency change made those two collide - duplicate core, clashing zod, a
 * singleton broken by a second copy - it surfaces here rather than inside the
 * ChatGPT host.
 *
 * It deliberately does not import `src/chatgpt.ts`: that entrypoint starts a
 * stdio server at module load.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { McpServer as V2McpServer } from "@modelcontextprotocol/server";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";

import { loadRegistry } from "../src/registry.js";
import { createSkillsServer } from "../src/server.js";
import { ALL_TOOL_SPECS } from "../src/tools/index.js";
import { makeRegistryFixture } from "./helpers.js";

test("the v2 runtime and the OpenAI extensions construct beside the v1 server", async () => {
  const v2 = new V2McpServer({ name: "warpmetal-spike", version: "0.0.0" });
  const extensions = new OpenAIExtensions(v2);

  assert.equal(typeof v2.registerTool, "function", "the v2 McpServer must expose registerTool");
  assert.ok(extensions, "OpenAIExtensions must construct over a v2 McpServer");

  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const v1 = createSkillsServer(loaded, {
      profile: "chatgpt-local",
      auditDir: fixture.dir,
      auditEnabled: false,
      runner: {
        run: () => Promise.reject(new Error("chatgpt-runtime.test.ts must never run the CLI")),
      },
    });

    assert.ok(v1, "the v1 server must still build with the v2 runtime installed");
    assert.equal(ALL_TOOL_SPECS.length, 43, "the shared core must stay reachable from this file");
  } finally {
    await fixture.cleanup();
  }
});
