import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadRegistry, validateRegistry } from "../src/registry.js";
import { makeRegistryFixture } from "./helpers.js";

test("loads a local registry with resolved root directory", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    assert.equal(loaded.source, "local");
    assert.equal(loaded.rootDir, fixture.dir);
    assert.equal(loaded.baseUrl, null);
    assert.equal(loaded.stale, false);
    assert.equal(loaded.registry.registryVersion, "0.1.0");
    assert.deepEqual(
      loaded.registry.skills.map((skill) => skill.name),
      ["demo", "database"],
    );
  } finally {
    await fixture.cleanup();
  }
});

test("missing registry file reports registry_unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skills-mcp-empty-"));
  try {
    await assert.rejects(
      () => loadRegistry({ registry: directory }),
      (error: unknown) =>
        (error as { code?: string }).code === "registry_unavailable",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid JSON reports registry_unavailable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "skills-mcp-json-"));
  try {
    await writeFile(join(directory, "registry.json"), "{ not json", "utf8");
    await assert.rejects(
      () => loadRegistry({ registry: directory }),
      (error: unknown) => (error as { code?: string }).code === "registry_unavailable",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("validateRegistry rejects duplicate names, bad semver, and unsafe paths", () => {
  const base = {
    schemaVersion: 1,
    registryVersion: "1.0.0",
    skills: [
      {
        name: "demo",
        version: "0.1.0",
        description: "demo",
        path: "skills/demo",
        files: [{ path: "SKILL.md", sha256: "0".repeat(64) }],
      },
    ],
  };

  assert.throws(
    () => validateRegistry({ ...base, skills: [...base.skills, ...base.skills] }, "test"),
    /duplicate skill name/,
  );
  assert.throws(
    () => validateRegistry({ ...base, registryVersion: "latest" }, "test"),
    /registryVersion/,
  );
  assert.throws(
    () =>
      validateRegistry(
        {
          ...base,
          skills: [
            {
              ...base.skills[0],
              files: [{ path: "../escape.md", sha256: "0".repeat(64) }],
            },
          ],
        },
        "test",
      ),
    /unsafe file path/,
  );
  assert.throws(
    () =>
      validateRegistry(
        {
          ...base,
          skills: [{ ...base.skills[0], path: "skills/other" }],
        },
        "test",
      ),
    /path must be/,
  );
});

test("validateRegistry accepts the fixture and fills optional fields", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const registry = validateRegistry(fixture.registry, "fixture");
    assert.deepEqual(registry.skills[0]?.hosts, ["opencode"]);
    assert.deepEqual(registry.skills[1]?.tags, ["database", "postgres"]);
    assert.equal(registry.skills[0]?.minimumWarpmetalCli, undefined);
  } finally {
    await fixture.cleanup();
  }
});
