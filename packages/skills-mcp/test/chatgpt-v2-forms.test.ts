/**
 * chatgpt-v2-forms.test.ts - the extended forms surface (legacy elicitation).
 *
 * The picker only collects a selection. This test pins that it is read-only,
 * renders exactly the known servers, and never invents a selection when the
 * user dismisses the form or when there is nothing to pick.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { McpServer } from "@modelcontextprotocol/server";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";

import { pickServer, registerChatgptForms } from "../src/chatgpt/forms.js";
import type { RunOutcome } from "../src/exec.js";
import { buildDeps } from "../src/server.js";
import { makeRegistryFixture } from "./helpers.js";

type LooseRegisterTool = (name: string, config: unknown, handler: unknown) => unknown;

function runOutcome(partial: Partial<RunOutcome>): RunOutcome {
  return {
    exitCode: 0,
    timedOut: false,
    stdout: "",
    stderr: "",
    json: null,
    jsonFound: false,
    durationMs: 1,
    warnings: [],
    subcommand: "test",
    ...partial,
  };
}

function runnerWith(servers: Array<{ serverId: string }>) {
  return {
    run: async (key: string): Promise<RunOutcome> => {
      if (key === "stateList") {
        return runOutcome({ json: { servers, identities: [] }, jsonFound: true });
      }
      return runOutcome({ json: {}, jsonFound: true });
    },
  };
}

interface LooseElicit {
  elicitInputLegacy: (context: unknown, params: unknown) => Promise<unknown>;
}

test("wm_pick_server registers read-only and renders the known servers", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const server = new McpServer({ name: "warpmetal-forms-test", version: "0.0.0" });
    const registered: Array<{ name: string; config: Record<string, unknown>; handler: unknown }> = [];
    const loose = server as unknown as { registerTool: LooseRegisterTool };
    const original = loose.registerTool.bind(server);
    loose.registerTool = (name, config, handler) => {
      registered.push({ name, config: config as Record<string, unknown>, handler });
      return original(name, config, handler);
    };

    const deps = buildDeps({
      auditDir: fixture.dir,
      auditEnabled: false,
      runner: runnerWith([{ serverId: "srv_1" }, { serverId: "srv_2" }]),
    });
    const extensions = new OpenAIExtensions(server);

    let seen: Record<string, unknown> | null = null;
    (extensions as unknown as LooseElicit).elicitInputLegacy = async (_context, params) => {
      seen = params as Record<string, unknown>;
      return { action: "accept", content: { serverId: "srv_2" } };
    };

    registerChatgptForms(server, extensions, deps);

    const tool = registered.find((entry) => entry.name === "wm_pick_server");
    assert.ok(tool, "wm_pick_server must be registered");
    assert.deepEqual(tool.config["annotations"], { readOnlyHint: true });

    const call = (await (tool.handler as (args: unknown, context: unknown) => Promise<unknown>)(
      {},
      {},
    )) as { structuredContent?: { serverId?: string } };
    assert.equal(call.structuredContent?.serverId, "srv_2");

    const schema = seen as unknown as {
      requestedSchema: { properties: { serverId: { oneOf: unknown[] } } };
    };
    assert.deepEqual(schema.requestedSchema.properties.serverId.oneOf, [
      { const: "srv_1", title: "srv_1" },
      { const: "srv_2", title: "srv_2" },
    ]);
  } finally {
    await fixture.cleanup();
  }
});

test("a dismissed picker returns no selection", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const deps = buildDeps({
      auditDir: fixture.dir,
      auditEnabled: false,
      runner: runnerWith([{ serverId: "srv_1" }]),
    });
    const extensions = {
      elicitInputLegacy: async () => ({ action: "decline" }),
    } as unknown as OpenAIExtensions;

    const result = await pickServer(extensions, {} as never, deps, "Choose a server");
    assert.deepEqual(result, { action: "decline", serverId: null });
  } finally {
    await fixture.cleanup();
  }
});

test("no known servers degrades without opening a form", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const deps = buildDeps({
      auditDir: fixture.dir,
      auditEnabled: false,
      runner: runnerWith([]),
    });
    let opened = false;
    const extensions = {
      elicitInputLegacy: async () => {
        opened = true;
        return { action: "accept", content: { serverId: "srv_1" } };
      },
    } as unknown as OpenAIExtensions;

    const result = await pickServer(extensions, {} as never, deps, "Choose a server");
    assert.deepEqual(result, { action: "unavailable", serverId: null });
    assert.equal(opened, false, "an empty server list must not open a form");
  } finally {
    await fixture.cleanup();
  }
});
