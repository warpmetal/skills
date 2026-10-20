/**
 * chatgpt-v2-mentions.test.ts - the composer mentions surface on the v2 server.
 *
 * Mentions are a capability plus one read-only, app-only tool. This test drives
 * the real SDK registration against a real v2 `McpServer` and pins the data the
 * handler may return: ids and types only, filtered and capped.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { McpServer } from "@modelcontextprotocol/server";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";

import { searchMentions } from "../src/chatgpt/mentions.js";
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

/** One known server from the local state; no network command is touched. */
const cannedRunner = {
  run: async (key: string): Promise<RunOutcome> => {
    if (key === "stateList") {
      return runOutcome({
        json: { servers: [{ serverId: "srv_1" }], identities: [] },
        jsonFound: true,
      });
    }
    return runOutcome({ json: {}, jsonFound: true });
  },
};

test("mentions registers the read-only, app-only search tool", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const server = new McpServer({ name: "warpmetal-mentions-test", version: "0.0.0" });
    const registered: Array<{ name: string; config: Record<string, unknown> }> = [];
    const loose = server as unknown as { registerTool: LooseRegisterTool };
    const original = loose.registerTool.bind(server);
    loose.registerTool = (name, config, handler) => {
      registered.push({ name, config: config as Record<string, unknown> });
      return original(name, config, handler);
    };

    const extensions = new OpenAIExtensions(server);
    extensions.mentions.setHandler(async () => ({ items: [] }));

    const search = registered.find((entry) => entry.name === "search_mentions");
    assert.ok(search, "the SDK must register search_mentions when a handler is set");
    assert.deepEqual(search.config["annotations"], { readOnlyHint: true });

    const meta = search.config["_meta"] as Record<string, unknown>;
    assert.deepEqual(meta["ui"], { visibility: ["app"] });
  } finally {
    await fixture.cleanup();
  }
});

test("searchMentions returns projected, query-filtered wm:// links", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const deps = buildDeps({
      auditDir: fixture.dir,
      auditEnabled: false,
      runner: cannedRunner,
    });
    deps.tasks.register({
      taskId: "task_1",
      kind: "operation",
      label: "operation",
      observeWith: "wm_task_get",
    });

    const all = await searchMentions(deps, "");
    assert.equal(all.length, 2, "one server and one task");
    assert.deepEqual(all[0], {
      type: "resource_link",
      uri: "wm://server/srv_1",
      name: "srv_1",
      title: "Server",
    });
    assert.deepEqual(all[1], {
      type: "resource_link",
      uri: "wm://task/task_1",
      name: "task_1",
      title: "Task",
    });

    const filtered = await searchMentions(deps, "srv");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.uri, "wm://server/srv_1");

    const none = await searchMentions(deps, "zzz");
    assert.equal(none.length, 0, "a query with no match is an empty list, not an error");

    const serialized = JSON.stringify(all);
    assert.ok(!/token|secret|password|bearer|private|path/i.test(serialized));
  } finally {
    await fixture.cleanup();
  }
});
