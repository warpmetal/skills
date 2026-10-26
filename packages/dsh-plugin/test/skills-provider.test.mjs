import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import {
  PROVIDER_NAME,
  SKILL_RANK,
  createWarpmetalSkillProvider,
  parseFrontmatter,
} from "../skills.js";

const roots = [];

after(async () => {
  await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
});

function skill(body) {
  return `---\n${body}\n---\n\n# Body\n\nInstructions.\n`;
}

async function bundle(skills) {
  const dir = await mkdtemp(join(tmpdir(), "warpmetal-dsh-skills-"));
  roots.push(dir);
  for (const [name, body] of Object.entries(skills)) {
    await mkdir(join(dir, "skills", name), { recursive: true });
    await writeFile(join(dir, "skills", name, "SKILL.md"), body, "utf8");
  }
  return dir;
}

function collectingProvider(root) {
  const warnings = [];
  const provider = createWarpmetalSkillProvider(root, {
    warn: (message) => warnings.push(message),
  });
  return { provider, warnings };
}

describe("parseFrontmatter", () => {
  test("reads the keys these bundles use and coerces booleans", () => {
    const fields = parseFrontmatter(
      skill("name: sample\ndescription: Does a thing\ndisable-model-invocation: true"),
    );
    assert.deepEqual(fields, {
      name: "sample",
      description: "Does a thing",
      "disable-model-invocation": true,
    });
  });

  test("keeps a quoted boolean as the string it is", () => {
    const fields = parseFrontmatter(skill('name: sample\ndisable-model-invocation: "true"'));
    assert.equal(fields["disable-model-invocation"], "true");
  });

  test("returns null for a body without a closed block", () => {
    assert.equal(parseFrontmatter("# no frontmatter\n"), null);
    assert.equal(parseFrontmatter("---\nname: sample\n"), null);
    assert.equal(parseFrontmatter(undefined), null);
  });
});

describe("createWarpmetalSkillProvider", () => {
  test("lists only readable bundles with a kebab-case name, sorted", async () => {
    const root = await bundle({
      beta: skill("name: beta\ndescription: Second"),
      alpha: skill("name: alpha\ndescription: First"),
      "Bad_Name": skill("name: Bad_Name\ndescription: Not kebab-case"),
      "no-frontmatter": "# plain markdown\n",
    });
    // A directory without SKILL.md is not a skill.
    await mkdir(join(root, "skills", "empty"), { recursive: true });

    const { provider, warnings } = collectingProvider(root);
    const candidates = await provider.list();

    assert.deepEqual(
      candidates.map((candidate) => candidate.name),
      ["alpha", "beta"],
    );
    assert.equal(warnings.length, 2);
    assert.ok(warnings.every((warning) => warning.startsWith("warpmetal-dsh: skipping")));

    const alpha = candidates[0];
    assert.equal(alpha.description, "First");
    assert.equal(alpha.provider, PROVIDER_NAME);
    assert.equal(alpha.rank, SKILL_RANK);
    assert.equal(alpha.source, "bundled");
    assert.deepEqual(alpha.resourceBase, {
      kind: "directory",
      path: join(root, "skills", "alpha"),
    });
    assert.ok(alpha.path.endsWith(join("skills", "alpha", "SKILL.md")));
    assert.equal(provider.name, PROVIDER_NAME);
  });

  test("projects the invocation policy instead of forcing it", async () => {
    const root = await bundle({
      // The shape every WarpMetal skill ships: opt-in, human-invoked.
      optin: skill("name: optin\ndisable-model-invocation: true"),
      "user-only": skill("name: user-only\nuser-invocable: false"),
      both: skill("name: both"),
    });
    const { provider } = collectingProvider(root);
    const byName = new Map((await provider.list()).map((entry) => [entry.name, entry.invocation]));

    assert.deepEqual(byName.get("optin"), { modelInvocable: false, userInvocable: true });
    assert.deepEqual(byName.get("user-only"), { modelInvocable: true, userInvocable: false });
    assert.deepEqual(byName.get("both"), { modelInvocable: true, userInvocable: true });
  });

  test("get() rereads the body and strips the frontmatter", async () => {
    const root = await bundle({
      sample: skill("name: sample\ndescription: Before"),
    });
    const { provider } = collectingProvider(root);
    const [candidate] = await provider.list();

    const first = await provider.get(candidate);
    assert.match(first.content, /^# Body/);
    assert.doesNotMatch(first.content, /^---/);
    assert.equal(first.description, "Before");
    assert.equal(first.name, "sample");

    await writeFile(
      join(root, "skills", "sample", "SKILL.md"),
      skill("name: sample\ndescription: After"),
      "utf8",
    );
    const second = await provider.get(candidate);
    assert.equal(second.description, "After");
  });

  test("get() reports a skill that no longer matches or exists", async () => {
    const root = await bundle({ sample: skill("name: sample") });
    const { provider } = collectingProvider(root);
    const [candidate] = await provider.list();

    assert.equal(await provider.get({ ...candidate, name: "renamed" }), undefined);

    await rm(join(root, "skills", "sample"), { recursive: true, force: true });
    assert.equal(await provider.get(candidate), undefined);
  });

  test("degrades to an empty catalog without a skills directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "warpmetal-dsh-empty-"));
    roots.push(dir);
    const { provider } = collectingProvider(dir);
    assert.deepEqual(await provider.list(), []);
  });

  test("stops discovery when the caller aborts", async () => {
    const root = await bundle({ sample: skill("name: sample") });
    const { provider } = collectingProvider(root);
    const controller = new AbortController();
    controller.abort();
    assert.deepEqual(await provider.list({ signal: controller.signal }), []);
    assert.equal(
      await provider.get({ locator: { dir: join(root, "skills", "sample") } }, {
        signal: controller.signal,
      }),
      undefined,
    );
  });
});
