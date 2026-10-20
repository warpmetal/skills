import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

/**
 * Tests for `registry.schema.json`.
 *
 * Both registries (public and internal) are validated against this schema by
 * `verify.mjs` and `verify-internal.mjs`, so a pattern here is a contract the
 * build relies on. The `files[].path` pattern in particular is defence in depth:
 * the MCP server already rejects traversal at read time, but a registry that
 * cannot express `..` in the first place is one fewer layer that has to be
 * correct.
 */

const SCHEMA_PATH = fileURLToPath(new URL("../registry.schema.json", import.meta.url));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(await readFile(SCHEMA_PATH, "utf8")));

const SHA = "a".repeat(64);

function registryWith(files) {
  return {
    schemaVersion: 1,
    registryVersion: "0.1.0",
    skills: [
      {
        name: "demo",
        version: "0.1.0",
        description: "A fixture skill.",
        path: "skills/demo",
        files,
      },
    ],
  };
}

/** True when the only complaints are about `files/0/path`. */
function failsOnFilePath(document) {
  if (validate(document)) return false;
  return (validate.errors ?? []).every((error) => String(error.instancePath).startsWith("/skills/0/files/0/path"));
}

test("accepts a registry shaped like the real one", () => {
  const document = registryWith([
    { path: "SKILL.md", sha256: SHA },
    { path: "references/notes.md", sha256: SHA },
    { path: "conventions/lib/queue.sh", sha256: SHA },
  ]);
  assert.equal(validate(document), true, JSON.stringify(validate.errors ?? []));
});

test("rejects traversal in a file path", () => {
  // The two spellings a caller reaches for: a leading climb and one buried
  // behind a legitimate-looking prefix.
  for (const path of ["../secret.md", "references/../../outside.md", "a/..", "..", "references/.."]) {
    assert.ok(failsOnFilePath(registryWith([{ path, sha256: SHA }])), `${path} must be rejected`);
  }
});

test("accepts a dot inside a name but not a leading one", () => {
  assert.equal(validate(registryWith([{ path: "references/v1.2.3.md", sha256: SHA }])), true);
  assert.ok(failsOnFilePath(registryWith([{ path: "./SKILL.md", sha256: SHA }])));
  assert.ok(failsOnFilePath(registryWith([{ path: ".hidden", sha256: SHA }])));
  // `references/.` passes the pattern deliberately: it is not a traversal, and it
  // cannot reach a registry that verifies. `verify.mjs` compares the manifest
  // against the files on disk, so a directory cannot be listed as a file, and
  // the MCP server rejects a "." segment on read
  // (`normalizeSkillFilePath`, packages/skills-mcp/src/skills.ts). The pattern
  // exists to forbid the one thing that escapes the root, not to re-implement
  // segment validation in a regex.
});

test("rejects absolute paths and backslashes", () => {
  for (const path of ["/etc/passwd", "C:/Windows", "references\\notes.md", ".hidden"]) {
    assert.ok(failsOnFilePath(registryWith([{ path, sha256: SHA }])), `${path} must be rejected`);
  }
});

test("rejects a sha256 that is not 64 lowercase hex characters", () => {
  for (const sha256 of ["a".repeat(63), "A".repeat(64), "g".repeat(64), "sha256:abc"]) {
    assert.equal(validate(registryWith([{ path: "SKILL.md", sha256 }])), false, `${sha256} must be rejected`);
  }
});

test("rejects an extra property on a file entry", () => {
  const document = registryWith([{ path: "SKILL.md", sha256: SHA, size: 12 }]);
  assert.equal(validate(document), false);
});

test("rejects a skill path that is not skills/<kebab-case>", () => {
  const base = registryWith([{ path: "SKILL.md", sha256: SHA }]);
  for (const path of ["skills/Demo", "other/demo", "skills/demo/extra", "skills/demo-dir/"]) {
    const document = structuredClone(base);
    document.skills[0].path = path;
    assert.equal(validate(document), false, `${path} must be rejected`);
  }
});

test("rejects a registry with no skills and a bad schemaVersion", () => {
  const empty = registryWith([{ path: "SKILL.md", sha256: SHA }]);
  empty.skills = [];
  assert.equal(validate(empty), true, "an empty registry is well-formed; the build rejects it, not the schema");

  const wrongVersion = registryWith([{ path: "SKILL.md", sha256: SHA }]);
  wrongVersion.schemaVersion = 2;
  assert.equal(validate(wrongVersion), false);
});
