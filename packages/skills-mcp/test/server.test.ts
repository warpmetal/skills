import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { makeRegistryFixture } from "./helpers.js";

const SERVER_ENTRY = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));

function parseJsonText(result: { content?: Array<{ type: string; text?: string }> }): unknown {
  const block = result.content?.find((entry) => entry.type === "text");
  assert.ok(block?.text, "expected a text content block");
  return JSON.parse(block.text);
}

test("stdio server exposes tools and serves skills end to end", async () => {
  const fixture = await makeRegistryFixture();
  const client = new Client({ name: "skills-mcp-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY, "--registry", fixture.dir],
    cwd: PACKAGE_ROOT,
  });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    // stdio gets the `full` profile: the three content tools plus the 43 CLI
    // tools. The unauthenticated HTTP transport is what narrows this down to the
    // `skill_*` surface, and `test/profiles.test.ts` holds that pair of counts.
    const names = tools.tools.map((tool) => tool.name).sort();
    assert.equal(names.length, 46, "stdio must expose the full 46-tool surface");
    assert.deepEqual(
      names.filter((name) => name.startsWith("skill_")),
      ["skill_list", "skill_read", "skill_search"],
    );
    assert.ok(
      names.some((name) => name.startsWith("wm_")),
      "the full profile must include the WarpMetal CLI tools",
    );

    const listed = parseJsonText(
      await client.callTool({ name: "skill_list", arguments: {} }),
    ) as { registryVersion: string; skills: Array<{ name: string }> };
    assert.equal(listed.registryVersion, "0.1.0");
    assert.deepEqual(
      listed.skills.map((skill) => skill.name).sort(),
      ["database", "demo"],
    );

    const filtered = parseJsonText(
      await client.callTool({
        name: "skill_list",
        arguments: { role: "planner" },
      }),
    ) as { skills: Array<{ name: string }> };
    assert.deepEqual(filtered.skills.map((skill) => skill.name), ["demo"]);

    const search = parseJsonText(
      await client.callTool({
        name: "skill_search",
        arguments: { query: "postgres" },
      }),
    ) as { hits: Array<{ name: string }> };
    assert.equal(search.hits[0]?.name, "database");

    const read = await client.callTool({
      name: "skill_read",
      arguments: { name: "demo" },
    });
    assert.match(read.content[0]?.type === "text" ? (read.content[0].text ?? "") : "", /# Demo/);

    const tampered = await client.callTool({
      name: "skill_read",
      arguments: { name: "demo", file: "../database/SKILL.md" },
    });
    assert.equal(tampered.isError, true);

    const resources = await client.listResources();
    assert.deepEqual(
      resources.resources.map((resource) => resource.uri).sort(),
      ["skill://database", "skill://demo"],
    );

    const resource = await client.readResource({ uri: "skill://demo" });
    const first = resource.contents[0];
    assert.ok(first && "text" in first);
    assert.match(first.text ?? "", /# Demo/);

    const reference = await client.readResource({ uri: "skill://demo/references/notes.md" });
    const referenceContent = reference.contents[0];
    assert.ok(referenceContent && "text" in referenceContent);
    assert.match(referenceContent.text ?? "", /Supporting notes/);

    await assert.rejects(() => client.readResource({ uri: "skill://demo/%2E%2E/secret" }));
  } finally {
    await client.close().catch(() => undefined);
    await fixture.cleanup();
  }
});
