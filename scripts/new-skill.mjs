import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { NAME_PATTERN, jsonText } from "./lib/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const name = process.argv[2];

if (name === undefined || !NAME_PATTERN.test(name)) {
  console.error("usage: npm run new:skill -- <kebab-case-name>");
  process.exit(2);
}

const directory = join(root, "skills", name);
const skillPath = join(directory, "SKILL.md");
const metaPath = join(directory, "skill.json");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if ((await exists(skillPath)) || (await exists(metaPath))) {
  console.error(`skills/${name} already exists; choose another name or edit it directly`);
  process.exit(2);
}

await mkdir(directory, { recursive: true });

await writeFile(
  skillPath,
  `---
name: ${name}
description: One or two sentences that tell the model when to use this skill.
---

# ${name}

Describe the workflow. Prefer an official CLI or documented commands as the
executable interface instead of reconstructing behavior with ad hoc recipes.

## Steps

1. Describe the first action.
2. Describe the next action.

Keep supporting material in \`references/\` and read it only when the task
needs it.
`,
  "utf8",
);

await writeFile(
  metaPath,
  jsonText({
    name,
    version: "0.1.0",
    description: "One or two sentences that tell the model when to use this skill.",
    roles: ["planner", "builder", "reviewer"],
    hosts: ["omp", "opencode", "codex", "claude", "cursor", "dsh", "agents", "mcp"],
    tags: [name],
  }),
  "utf8",
);

console.log(`Created skills/${name}/SKILL.md and skills/${name}/skill.json

Next:
  1. Author the skill, removing any hosts that do not apply.
  2. npm run build && npm run check
  3. Commit and open a PR (CODEOWNERS review required).
When content changes, bump the version in skills/${name}/skill.json.`);
