import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRegistryModel,
  catalogEntryName,
  copySkillFiles,
  renderCatalogIndex,
  renderMarketplaceCatalogs,
  renderPluginManifest,
} from "./lib/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

// Regenerate from scratch so a deleted skill cannot leave orphaned copies
// behind in the catalog or plugin tree.
await rm(join(root, "catalog"), { recursive: true, force: true });
await rm(join(root, "plugins/warpmetal/skills"), { recursive: true, force: true });

const model = await buildRegistryModel({ root });

for (const [relativePath, content] of Object.entries(renderMarketplaceCatalogs(model))) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

const pluginRoot = join(root, "plugins/warpmetal");
const pluginManifest = join(pluginRoot, ".claude-plugin/plugin.json");
await mkdir(dirname(pluginManifest), { recursive: true });
await writeFile(pluginManifest, renderPluginManifest(model), "utf8");

for (const skill of model.skills) {
  await copySkillFiles({
    sourceDir: join(root, skill.path),
    destinationDir: join(pluginRoot, "skills", skill.name),
    files: skill.files,
  });
  await copySkillFiles({
    sourceDir: join(root, skill.path),
    destinationDir: join(root, "catalog", skill.name),
    files: skill.files,
    renameSkillMdTo: catalogEntryName(skill),
  });
}

await mkdir(join(root, "catalog"), { recursive: true });
await writeFile(join(root, "catalog/index.json"), renderCatalogIndex(model), "utf8");

console.log(
  `catalogs ${model.registryVersion}: marketplaces, plugin, and OpenCode catalog generated`,
);
