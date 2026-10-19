import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { MAX_FILE_BYTES, MAX_SKILL_BYTES, buildRegistryModel } from "./build.mjs";

/**
 * Tests for the registry build's own rules.
 *
 * These run against a temporary fixture registry rather than the real `skills/`
 * tree: the point is to prove each rule *fires*, not that the shipped skills
 * happen to satisfy it (`npm run verify` covers that). A rule that silently
 * stopped matching - the failure mode the frontmatter check and the resolver
 * check both exist to prevent - is exactly what these catch.
 */

const skillMd = (name, extra = "disable-model-invocation: true") =>
  `---\nname: ${name}\n${extra}\ndescription: A fixture skill used by the build tests.\n---\n\n# ${name}\n`;

const meta = (name, overrides = {}) =>
  JSON.stringify({ name, version: "0.1.0", description: "A fixture skill.", ...overrides });

/** Builds a fixture registry rooted in a temp directory. */
async function makeFixture(files) {
  const root = await mkdtemp(join(tmpdir(), "build-fixture-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(root, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
  return {
    root,
    // `env: {}` so a GENERATED_AT on the machine running the tests cannot make
    // the model depend on the environment.
    build: () => buildRegistryModel({ root, skillsDir: join(root, "skills"), env: {} }),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function oneSkill(name, { content, metadata } = {}) {
  return {
    [`skills/${name}/SKILL.md`]: content ?? skillMd(name),
    [`skills/${name}/skill.json`]: metadata ?? meta(name),
  };
}

async function withFixture(files, run) {
  const fixture = await makeFixture(files);
  try {
    return await run(fixture);
  } finally {
    await fixture.cleanup();
  }
}

test("builds a skill that declares disable-model-invocation", async () => {
  await withFixture(oneSkill("demo"), async (fixture) => {
    const model = await fixture.build();
    assert.deepEqual(
      model.skills.map((skill) => [skill.name, skill.version, skill.path]),
      [["demo", "0.1.0", "skills/demo"]],
    );
    assert.deepEqual(
      model.skills[0].files.map((file) => file.path),
      ["SKILL.md"],
    );
    assert.match(model.registryVersion, /^\d+\.\d+\.\d+/);
  });
});

test("rejects a SKILL.md that omits disable-model-invocation", async () => {
  const files = oneSkill("demo", {
    content: `---\nname: demo\ndescription: No opt-in flag here.\n---\n\n# demo\n`,
  });
  await withFixture(files, async (fixture) => {
    await assert.rejects(fixture.build(), /disable-model-invocation: true/);
  });
});

test("rejects disable-model-invocation set to anything other than true", async () => {
  // `false` and a quoted "yes" both read as "the author did not opt in", and
  // admitting either would make the rule advisory rather than enforced.
  for (const value of ["false", '"true"', "yes"]) {
    const files = oneSkill("demo", { content: skillMd("demo", `disable-model-invocation: ${value}`) });
    await withFixture(files, async (fixture) => {
      await assert.rejects(
        fixture.build(),
        /disable-model-invocation: true/,
        `disable-model-invocation: ${value} must not satisfy the rule`,
      );
    });
  }
});

test("rejects a skill directory that is not lowercase kebab-case", async () => {
  await withFixture(oneSkill("Bad_Name"), async (fixture) => {
    await assert.rejects(fixture.build(), /lowercase kebab-case/);
  });
});

test("rejects a skill.json whose name disagrees with its directory", async () => {
  const files = oneSkill("demo", { metadata: meta("other") });
  await withFixture(files, async (fixture) => {
    await assert.rejects(fixture.build(), /skill\.json name must be "demo"/);
  });
});

test("rejects a skill.json that is not valid JSON", async () => {
  const files = oneSkill("demo", { metadata: "{ not json" });
  await withFixture(files, async (fixture) => {
    await assert.rejects(fixture.build(), /skill\.json is missing or invalid/);
  });
});

test("rejects a single file over the 1 MiB limit", async () => {
  const files = {
    ...oneSkill("demo"),
    "skills/demo/references/huge.md": "x".repeat(MAX_FILE_BYTES + 1),
  };
  await withFixture(files, async (fixture) => {
    await assert.rejects(fixture.build(), new RegExp(`exceeds ${String(MAX_FILE_BYTES)} bytes`));
  });
});

test("rejects a skill whose files exceed the 8 MiB total", async () => {
  // The per-file cap is 1 MiB, so beating the total needs several files. Nine
  // just-under-limit files is the cheapest fixture that crosses 8 MiB without
  // tripping the per-file rule first.
  const chunk = "y".repeat(MAX_FILE_BYTES - 1);
  const files = oneSkill("demo");
  for (let index = 0; index < 9; index += 1) {
    files[`skills/demo/references/part-${String(index)}.md`] = chunk;
  }
  await withFixture(files, async (fixture) => {
    await assert.rejects(fixture.build(), new RegExp(`exceeds ${String(MAX_SKILL_BYTES)} bytes`));
  });
});

test("rejects an SKILL.md without frontmatter", async () => {
  await withFixture(oneSkill("demo", { content: "# demo\n" }), async (fixture) => {
    await assert.rejects(fixture.build(), /must start with YAML frontmatter/);
  });
});

test("rejects an empty skills directory", async () => {
  await withFixture({ "skills/.keep": "" }, async (fixture) => {
    await assert.rejects(fixture.build(), /no skills found/);
  });
});
