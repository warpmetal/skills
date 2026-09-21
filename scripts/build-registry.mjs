import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRegistryModel, copySkillFiles, jsonText } from "./lib/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

const model = await buildRegistryModel({ root });

await writeFile(join(root, "registry.json"), jsonText(model), "utf8");

const snapshot = join(root, "packages/skills-mcp/snapshot");
await rm(snapshot, { recursive: true, force: true });
await mkdir(snapshot, { recursive: true });
await writeFile(join(snapshot, "registry.json"), jsonText(model), "utf8");
for (const skill of model.skills) {
  await copySkillFiles({
    sourceDir: join(root, skill.path),
    destinationDir: join(snapshot, skill.path),
    files: skill.files,
  });
}

console.log(
  `registry ${model.registryVersion}: ${model.skills.length} skill(s) -> registry.json + packages/skills-mcp/snapshot`,
);
