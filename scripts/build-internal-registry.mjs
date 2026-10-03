import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRegistryModel, copySkillFiles, jsonText } from "./lib/build.mjs";

/**
 * Builds the internal registry from `internal-skills/`.
 *
 * This is the second registry: same tooling and schema as the public one, a
 * different source directory. It writes `registry.internal.json` and the
 * deployable bundle under `snapshot.internal/`. It generates no marketplace
 * catalog, no OpenCode catalog and no Pages site on purpose: the internal
 * registry is served by a dedicated instance, not published.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const internalSkills = join(root, "internal-skills");

const model = await buildRegistryModel({ root, skillsDir: internalSkills });

await writeFile(join(root, "registry.internal.json"), jsonText(model), "utf8");

// The bundle matches the layout the MCP server requires: `skills/<name>`.
// `skill.path` is already `skills/<name>`, so the copy target mirrors it.
const snapshot = join(root, "snapshot.internal");
await rm(snapshot, { recursive: true, force: true });
await mkdir(snapshot, { recursive: true });
await writeFile(join(snapshot, "registry.json"), jsonText(model), "utf8");
for (const skill of model.skills) {
  await copySkillFiles({
    sourceDir: join(internalSkills, skill.name),
    destinationDir: join(snapshot, skill.path),
    files: skill.files,
  });
}

console.log(
  `internal registry ${model.registryVersion}: ${model.skills.length} skill(s) -> registry.internal.json + snapshot.internal`,
);
