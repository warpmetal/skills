import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize, resolve } from "node:path";
import test from "node:test";

import { loadRegistry, registryUrlForTag } from "../src/registry.js";
import { readSkillFile } from "../src/skills.js";
import { makeRegistryFixture } from "./helpers.js";

async function startStaticServer(root: string): Promise<{ server: Server; url: string }> {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const target = normalize(join(root, pathname));
    if (!target.startsWith(resolve(root))) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        "content-type": "application/json",
        etag: `"${body.byteLength}"`,
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
}

test("dynamic resolution targets the catalog latest tag", () => {
  assert.equal(registryUrlForTag("latest"), "https://skills.warpmetal.com/latest/registry.json");
  assert.equal(registryUrlForTag("v1.2.3"), "https://skills.warpmetal.com/v1.2.3/registry.json");
});

test("catalog base URL is configurable", () => {
  const previous = process.env.WARPMETAL_SKILLS_REGISTRY_URL;
  process.env.WARPMETAL_SKILLS_REGISTRY_URL = "https://example.test/catalog/";
  try {
    assert.equal(
      registryUrlForTag("latest"),
      "https://example.test/catalog/latest/registry.json",
    );
  } finally {
    if (previous === undefined) delete process.env.WARPMETAL_SKILLS_REGISTRY_URL;
    else process.env.WARPMETAL_SKILLS_REGISTRY_URL = previous;
  }
});

test("remote registry loads and verifies files over http", async () => {
  const fixture = await makeRegistryFixture();
  const cache = await mkdtemp(join(tmpdir(), "skills-mcp-cache-"));
  const staticServer = await startStaticServer(fixture.dir);
  try {
    const loaded = await loadRegistry({
      registry: `${staticServer.url}/registry.json`,
      cacheDir: cache,
    });
    assert.equal(loaded.source, "remote");
    assert.equal(loaded.stale, false);
    assert.equal(loaded.baseUrl, `${staticServer.url}/`);

    const skill = await readSkillFile(loaded, "demo");
    assert.match(skill.text, /# Demo/);
  } finally {
    await closeServer(staticServer.server);
    await rm(cache, { recursive: true, force: true });
    await fixture.cleanup();
  }
});

test("cached manifest is served stale when the catalog is unreachable", async () => {
  const fixture = await makeRegistryFixture();
  const cache = await mkdtemp(join(tmpdir(), "skills-mcp-cache-"));
  const staticServer = await startStaticServer(fixture.dir);
  const registryUrl = `${staticServer.url}/registry.json`;
  try {
    await loadRegistry({ registry: registryUrl, cacheDir: cache });
    await closeServer(staticServer.server);

    const cached = await loadRegistry({ registry: registryUrl, cacheDir: cache });
    assert.equal(cached.stale, true);
    assert.equal(cached.registry.registryVersion, "0.1.0");
    assert.deepEqual(
      cached.registry.skills.map((skill) => skill.name),
      ["demo", "database"],
    );

    // File bodies are not cached; reads require the network in this mode.
    await assert.rejects(
      () => readSkillFile(cached, "demo"),
      (error: unknown) => (error as { code?: string }).code === "registry_unavailable",
    );

    const offline = await loadRegistry({ registry: registryUrl, cacheDir: cache, offline: true });
    assert.equal(offline.stale, true);
    assert.equal(offline.registry.registryVersion, "0.1.0");
  } finally {
    await closeServer(staticServer.server).catch(() => undefined);
    await rm(cache, { recursive: true, force: true });
    await fixture.cleanup();
  }
});

test("a failed cache write does not fail a successful fetch", async () => {
  const fixture = await makeRegistryFixture();
  const cacheRoot = await mkdtemp(join(tmpdir(), "skills-mcp-cachefile-"));
  const occupied = join(cacheRoot, "not-a-directory");
  await writeFile(occupied, "occupied", "utf8");
  const staticServer = await startStaticServer(fixture.dir);
  try {
    const loaded = await loadRegistry({
      registry: `${staticServer.url}/registry.json`,
      cacheDir: occupied,
    });
    assert.equal(loaded.source, "remote");
    assert.equal(loaded.stale, false);
    const skill = await readSkillFile(loaded, "demo");
    assert.match(skill.text, /# Demo/);
  } finally {
    await closeServer(staticServer.server);
    await rm(cacheRoot, { recursive: true, force: true });
    await fixture.cleanup();
  }
});
