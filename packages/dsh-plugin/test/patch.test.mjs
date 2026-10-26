import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

async function readText(file) {
  return readFile(join(packageRoot, file), "utf8");
}

const patch = await readText("cordis.patch.yml");
const manifest = JSON.parse(await readText("package.json"));

const ids = [...patch.matchAll(/^\s*-\s*id:\s*(\S+)\s*$/gm)].map((match) => match[1]);
const names = [...patch.matchAll(/^\s*name:\s*'([^']+)'\s*$/gm)].map((match) => match[1]);

describe("bundle manifest", () => {
  test("declares the patch layer the installer reconciles", () => {
    assert.equal(manifest.dsh?.bundle?.patch, "./cordis.patch.yml");
  });

  test("gates on the DSH release it was written against", () => {
    assert.match(manifest.engines?.dsh ?? "", /^>=\d+\.\d+\.\d+(-[0-9A-Za-z.]+)? <\d+\.\d+\.\d+$/);
    assert.match(manifest.engines?.dsh ?? "", /0\.2\.0-rc\.2/);
  });

  test("ships every file the patch rows and the MCP row need", () => {
    for (const file of ["index.js", "skills.js", "cordis.patch.yml", "skills", "server", "registry.json"]) {
      assert.ok(manifest.files.includes(file), `${file} must be in files`);
    }
  });

  test("imports nothing and depends on nothing", () => {
    assert.equal(manifest.dependencies, undefined);
    assert.equal(manifest.peerDependencies, undefined);
  });
});

describe("cordis.patch.yml", () => {
  test("inserts the three rows in load order", () => {
    assert.deepEqual(ids, ["warpmetal-local", "warpmetal-skills", "mcp-warpmetal"]);
  });

  test("names the local rows by a real export subpath", () => {
    assert.deepEqual(names.slice(0, 2), ["@warpmetal/dsh-plugin", "@warpmetal/dsh-plugin/skills"]);
    assert.equal(manifest.exports["."], "./index.js");
    assert.equal(manifest.exports["./skills"], "./skills.js");
    assert.equal(manifest.name, "@warpmetal/dsh-plugin");
  });

  test("serves the MCP server over stdio on the local-only surface", () => {
    assert.match(patch, /serverName: warpmetal$/m);
    assert.match(patch, /transport: stdio$/m);
    assert.match(patch, /failOnStartupError: false$/m);
    // The profile is chosen by index.js; the patch must not pin `full` here.
    assert.doesNotMatch(patch, /--profile/);
  });

  test("reads the computed values from the service, never a literal path", () => {
    const lines = patch.split(/\r?\n/);
    // Comments are documentation and may mention the tag; only values count.
    const dynamic = lines.filter(
      (line) => !line.trimStart().startsWith("#") && line.includes("!!js"),
    );
    assert.deepEqual(
      dynamic.map((line) => line.trim().replace(/^(\w+):.*$/, "$1")),
      ["command", "args", "cwd"],
    );
    for (const line of dynamic) {
      assert.match(line, /!!js ctx\.warpmetalLocal\.(command|args|root)$/);
      // Only `config` values are interpolated, and only at this depth.
      assert.match(line, /^ {8}\w+: !!js /);
    }
    assert.doesNotMatch(patch, /[A-Za-z]:\\/);
    assert.doesNotMatch(patch, /server[\\/]dist/);
  });

  test("carries no credential-shaped environment", () => {
    assert.match(patch, /^\s*env: \{\}$/m);
    for (const line of patch.split(/\r?\n/)) {
      if (line.trimStart().startsWith("#")) continue;
      assert.doesNotMatch(line, /\b(?:[A-Z_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z_]*)\s*:/i);
    }
  });

  test("declares the injection the !!js expressions depend on", () => {
    assert.match(patch, /inject: \[warpmetalLocal\]/);
  });
});
