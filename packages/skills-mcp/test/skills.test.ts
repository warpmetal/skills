import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { loadRegistry } from "../src/registry.js";
import {
  findSkill,
  listSkills,
  normalizeSkillFilePath,
  parseSkillUri,
  readSkillFile,
  searchSkills,
} from "../src/skills.js";
import { makeRegistryFixture } from "./helpers.js";

test("listSkills filters by role and host", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    assert.deepEqual(
      listSkills(loaded).map((skill) => skill.name),
      ["demo", "database"],
    );
    assert.deepEqual(
      listSkills(loaded, { role: "planner" }).map((skill) => skill.name),
      ["demo"],
    );
    assert.deepEqual(
      listSkills(loaded, { host: "omp" }).map((skill) => skill.name),
      ["database"],
    );
    assert.deepEqual(listSkills(loaded, { role: "nobody" }), []);
  } finally {
    await fixture.cleanup();
  }
});

test("searchSkills ranks name, tag, and description matches", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const hits = searchSkills(loaded, "database");
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.name, "database");
    assert.ok((hits[0]?.score ?? 0) > 0);

    const fuzzy = searchSkills(loaded, "postgres", { limit: 1 });
    assert.equal(fuzzy[0]?.name, "database");

    assert.deepEqual(searchSkills(loaded, "zzz-no-match"), []);
  } finally {
    await fixture.cleanup();
  }
});

test("readSkillFile reads SKILL.md and listed references with checksum verification", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const skill = await readSkillFile(loaded, "demo");
    assert.match(skill.text, /# Demo/);
    assert.equal(skill.file, "SKILL.md");
    assert.equal(skill.mimeType, "text/markdown");

    const notes = await readSkillFile(loaded, "demo", "references/notes.md");
    assert.match(notes.text, /Supporting notes/);
  } finally {
    await fixture.cleanup();
  }
});

test("readSkillFile rejects unlisted files and traversal", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    await assert.rejects(
      () => readSkillFile(loaded, "demo", "secret.md"),
      (error: unknown) => (error as { code?: string }).code === "not_found",
    );
    await assert.rejects(
      () => readSkillFile(loaded, "demo", "../database/SKILL.md"),
      (error: unknown) => (error as { code?: string }).code === "traversal_rejected",
    );
    await assert.rejects(
      () => readSkillFile(loaded, "missing"),
      (error: unknown) => (error as { code?: string }).code === "not_found",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("readSkillFile detects on-disk tampering", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    await writeFile(join(fixture.dir, "skills/demo/references/notes.md"), "tampered\n", "utf8");
    await assert.rejects(
      () => readSkillFile(loaded, "demo", "references/notes.md"),
      (error: unknown) => (error as { code?: string }).code === "integrity_mismatch",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("findSkill returns a bounded not_found error", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    assert.throws(
      () => findSkill(loaded, "unknown"),
      (error: unknown) =>
        (error as { code?: string }).code === "not_found" &&
        /available: demo, database/.test((error as Error).message),
    );
  } finally {
    await fixture.cleanup();
  }
});

test("normalizeSkillFilePath rejects unsafe paths", () => {
  for (const value of ["", "/etc/passwd", "C:/secrets", "a/../../b", "a\\b", "a//b", "./a"]) {
    assert.throws(() => normalizeSkillFilePath(value));
  }
  assert.equal(normalizeSkillFilePath("references/notes.md"), "references/notes.md");
});

test("parseSkillUri resolves URIs and rejects unsafe forms", () => {
  assert.deepEqual(parseSkillUri("skill://demo"), { name: "demo", file: "SKILL.md" });
  assert.deepEqual(parseSkillUri("skill://demo/references/notes.md"), {
    name: "demo",
    file: "references/notes.md",
  });
  assert.deepEqual(parseSkillUri("skill://demo/references%2Fnotes.md"), {
    name: "demo",
    file: "references/notes.md",
  });
  assert.throws(() => parseSkillUri("skill://demo/../../etc/passwd"));
  assert.throws(() => parseSkillUri("skill://demo/"));
  assert.throws(() => parseSkillUri("skill://demo?x=1"));
  assert.throws(() => parseSkillUri("http://example.com"));
  assert.throws(() => parseSkillUri("skill://%ZZ"));
});
