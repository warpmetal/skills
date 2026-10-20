/**
 * chatgpt-v2-app.test.ts - the MCP App surface on the v2 server.
 *
 * The dashboard is one `ui://` resource plus one tool that carries the
 * `openai/ui` entrypoints. This test drives the real registration against a real
 * v2 `McpServer`, with `registerTool`/`registerResource` wrapped so the names,
 * the metadata and the rendered payload can be asserted while the real methods
 * still run - which also proves the v2 server accepts the configs.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { McpServer } from "@modelcontextprotocol/server";

import {
  DASHBOARD_RESOURCE_URI,
  DASHBOARD_TOOL_NAME,
  UI_MIME_TYPE,
  registerChatgptApp,
} from "../src/chatgpt/app.js";
import { DASHBOARD_OUTPUT } from "../src/chatgpt/dashboard.js";
import { registerChatgptSurface } from "../src/chatgpt/register.js";
import { DASHBOARD_HTML } from "../src/chatgpt/ui/dashboard.js";
import type { RunOutcome } from "../src/exec.js";
import { loadRegistry } from "../src/registry.js";
import { buildDeps } from "../src/server.js";
import { ALL_TOOL_SPECS } from "../src/tools/index.js";
import { makeRegistryFixture } from "./helpers.js";

const CONTENT_TOOLS = ["skill_list", "skill_read", "skill_search"];

type LooseRegisterTool = (name: string, config: unknown, handler: unknown) => unknown;
type LooseRegisterResource = (name: string, uri: string, config: unknown, handler: unknown) => unknown;

interface RegisteredTool {
  name: string;
  config: Record<string, unknown>;
  handler: (args: unknown, context: unknown) => Promise<unknown>;
}

interface RegisteredResource {
  uri: string;
  config: Record<string, unknown>;
}

function spy(server: McpServer): {
  tools: RegisteredTool[];
  resources: RegisteredResource[];
} {
  const loose = server as unknown as {
    registerTool: LooseRegisterTool;
    registerResource: LooseRegisterResource;
  };
  const tools: RegisteredTool[] = [];
  const resources: RegisteredResource[] = [];

  const originalTool = loose.registerTool.bind(server);
  const originalResource = loose.registerResource.bind(server);

  loose.registerTool = (name, config, handler) => {
    tools.push({
      name,
      config: config as Record<string, unknown>,
      handler: handler as RegisteredTool["handler"],
    });
    return originalTool(name, config, handler);
  };
  loose.registerResource = (name, uri, config, handler) => {
    resources.push({ uri, config: config as Record<string, unknown> });
    return originalResource(name, uri, config, handler);
  };

  return { tools, resources };
}

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

/** Canned CLI answers: a version, a health payload and one known server. */
const cannedRunner = {
  run: async (key: string): Promise<RunOutcome> => {
    switch (key) {
      case "version":
        return runOutcome({ stdout: "0.8.12\n" });
      case "health":
        return runOutcome({ json: { status: "ok" }, jsonFound: true });
      case "stateList":
        return runOutcome({
          json: { servers: [{ serverId: "srv_1", state: "running" }], identities: [] },
          jsonFound: true,
        });
      default:
        return runOutcome({ json: {}, jsonFound: true });
    }
  },
};

test("the app registers the dashboard resource and tool beside the 46 core tools", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const deps = buildDeps({
      auditDir: fixture.dir,
      auditEnabled: false,
      runner: cannedRunner,
    });

    const server = new McpServer({ name: "warpmetal-app-test", version: "0.0.0" });
    const { tools, resources } = spy(server);

    registerChatgptSurface(server, loaded, deps);
    registerChatgptApp(server, deps);

    assert.equal(
      tools.length,
      CONTENT_TOOLS.length + ALL_TOOL_SPECS.length + 1,
      "the app adds exactly one tool on top of the 46 core tools",
    );
    const dashboard = tools.find((tool) => tool.name === DASHBOARD_TOOL_NAME);
    assert.ok(dashboard, "the dashboard tool must be registered");

    const meta = dashboard.config["_meta"] as Record<string, unknown>;
    assert.deepEqual(meta["ui"], { resourceUri: DASHBOARD_RESOURCE_URI });
    assert.deepEqual(meta["openai/ui"], {
      entrypoints: [{ type: "global" }, { type: "thread" }],
    });

    assert.equal(resources.length, 1, "the app registers exactly one UI resource");
    assert.equal(resources[0]?.uri, DASHBOARD_RESOURCE_URI);
    assert.equal(resources[0]?.config["mimeType"], UI_MIME_TYPE);
  } finally {
    await fixture.cleanup();
  }
});

test("the dashboard payload is projected, capped and contract-checked", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const deps = buildDeps({
      auditDir: fixture.dir,
      auditEnabled: false,
      runner: cannedRunner,
    });

    const server = new McpServer({ name: "warpmetal-app-test", version: "0.0.0" });
    const { tools } = spy(server);
    registerChatgptSurface(server, loaded, deps);
    registerChatgptApp(server, deps);

    const dashboard = tools.find((tool) => tool.name === DASHBOARD_TOOL_NAME);
    assert.ok(dashboard, "the dashboard tool must be registered");

    const call = (await dashboard.handler({}, {})) as {
      content: Array<{ type: string; text?: string }>;
      structuredContent: Record<string, unknown>;
      isError?: boolean;
    };

    assert.notEqual(call.isError, true);
    assert.ok(Array.isArray(call.content) && call.content.length > 0, "a text fallback is required");
    assert.equal(call.content[0]?.type, "text");

    const payload = call.structuredContent;
    assert.deepEqual(DASHBOARD_OUTPUT.parse(payload), payload, "the payload must match its contract");
    assert.deepEqual(payload["cli"], { version: "0.8.12", health: "OBSERVED", available: true });
    assert.deepEqual(payload["servers"], [{ id: "srv_1", state: "running" }]);
    assert.deepEqual(payload["tasks"], []);

    // Nothing that must stay out of the app may be in the payload.
    const serialized = JSON.stringify(payload);
    assert.ok(!/token|secret|password|bearer|private/i.test(serialized));
  } finally {
    await fixture.cleanup();
  }
});

test("the dashboard document is a self-contained MCP App with the spec handshake", () => {
  assert.ok(DASHBOARD_HTML.startsWith("<!DOCTYPE html>"));
  assert.ok(DASHBOARD_HTML.includes("ui/initialize"));
  assert.ok(DASHBOARD_HTML.includes("ui/notifications/initialized"));
  assert.ok(DASHBOARD_HTML.includes("ui/notifications/tool-result"));
  // No external origins: the MCP Apps CSP default only allows inline script/style.
  assert.ok(!/https?:\/\//.test(DASHBOARD_HTML), "the app must not reference an external origin");
});
