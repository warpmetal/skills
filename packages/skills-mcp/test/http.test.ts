import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { startHttpServer } from "../src/http.js";
import { loadRegistry } from "../src/registry.js";
import { makeRegistryFixture } from "./helpers.js";

test("http transport serves health endpoints and MCP requests", async () => {
  const fixture = await makeRegistryFixture();
  let running: Awaited<ReturnType<typeof startHttpServer>> | undefined;
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    running = await startHttpServer(loaded, { host: "127.0.0.1", port: 0 });
    const base = `http://127.0.0.1:${running.port}`;

    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const ready = await fetch(`${base}/readyz`);
    assert.equal(ready.status, 200);
    const readyBody = (await ready.json()) as { registryVersion: string; skills: number };
    assert.equal(readyBody.registryVersion, "0.1.0");
    assert.equal(readyBody.skills, 2);

    const missing = await fetch(`${base}/nope`);
    assert.equal(missing.status, 404);

    const client = new Client({ name: "skills-mcp-http-test", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 3);
    const result = await client.callTool({ name: "skill_list", arguments: {} });
    assert.equal(result.isError ?? false, false);
    await client.close();
  } finally {
    await running?.close().catch(() => undefined);
    await fixture.cleanup();
  }
});
