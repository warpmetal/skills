/**
 * chatgpt-v2-profile.test.ts - the v2 registration path serves the profile.
 *
 * The v2 entrypoint must register exactly the `chatgpt-local` surface: the three
 * content tools and the 43 `wm_*` specs, never a provider tool. This test drives
 * the real adapter against a real v2 `McpServer`, with `registerTool` wrapped so
 * the registered names can be asserted while the real method still runs - which
 * also proves the v2 server accepts the configs the shared builders produce.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { McpServer } from "@modelcontextprotocol/server";

import { registerChatgptSurface } from "../src/chatgpt/register.js";
import { loadRegistry } from "../src/registry.js";
import { buildDeps, contentToolRegistrations } from "../src/server.js";
import { ALL_TOOL_SPECS } from "../src/tools/index.js";
import { makeRegistryFixture } from "./helpers.js";

const CONTENT_TOOLS = ["skill_list", "skill_read", "skill_search"];

type LooseRegister = (name: string, config: unknown, handler: unknown) => unknown;

function spyOnRegistration(server: McpServer): string[] {
  const loose = server as unknown as { registerTool: LooseRegister };
  // Captured before the replacement, so the real method still runs.
  const original = loose.registerTool.bind(server);
  const registered: string[] = [];
  loose.registerTool = (name, config, handler) => {
    registered.push(name);
    return original(name, config, handler);
  };
  return registered;
}

test("the v2 chatgpt-local surface registers exactly 3 content + 43 wm_* tools", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const deps = buildDeps({
      auditDir: fixture.dir,
      auditEnabled: false,
      runner: {
        run: () => Promise.reject(new Error("chatgpt-v2-profile.test.ts must never run the CLI")),
      },
    });

    const server = new McpServer({ name: "warpmetal-chatgpt-test", version: "0.0.0" });
    const registered = spyOnRegistration(server);

    registerChatgptSurface(server, loaded, deps);

    assert.equal(ALL_TOOL_SPECS.length, 43, "the shared CLI surface must stay 43 tools");
    assert.equal(
      registered.length,
      CONTENT_TOOLS.length + ALL_TOOL_SPECS.length,
      "chatgpt-local must register 3 content + 43 CLI tools",
    );
    const expected = [...CONTENT_TOOLS, ...ALL_TOOL_SPECS.map((spec) => spec.name)].sort();
    assert.deepEqual([...registered].sort(), expected);
  } finally {
    await fixture.cleanup();
  }
});

test("the content registrations are transport-agnostic and keep their output contracts", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const tools = contentToolRegistrations(loaded);

    assert.equal(tools.length, 3, "content must stay 3 tools");
    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      [...CONTENT_TOOLS].sort(),
    );

    for (const tool of tools) {
      if (tool.name === "skill_read") {
        assert.equal(
          tool.config.outputSchema,
          undefined,
          "skill_read streams text, so it must not declare a structured output",
        );
      } else {
        assert.ok(tool.config.outputSchema, `${tool.name} must keep its output schema`);
      }
      assert.equal(tool.config.annotations.readOnlyHint, true);
    }
  } finally {
    await fixture.cleanup();
  }
});
