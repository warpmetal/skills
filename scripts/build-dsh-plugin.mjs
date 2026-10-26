/**
 * build-dsh-plugin.mjs - assembles the DeepSeek Harness bundle.
 *
 * The artifact under `plugins/warpmetal-dsh/` embeds the compiled MCP server and
 * its production dependencies, so it is gitignored and generated on demand, the
 * same arrangement the ChatGPT plugin uses. Unlike that one it also carries all
 * nine skills, because the bundle registers them as a native provider.
 *
 * Nothing here is smart about DSH versions: `engines.dsh` in the package
 * manifest is what a harness checks, and `verify-dsh-plugin.mjs` is what this
 * repository checks.
 */
import { execSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRegistryModel, copySkillFiles, jsonText } from "./lib/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const pluginRoot = join(root, "plugins", "warpmetal-dsh");
const sourceRoot = join(root, "packages", "dsh-plugin");

/** Files the bundle ships verbatim from its source package. */
const BUNDLE_FILES = [
  "index.js",
  "skills.js",
  "client.js",
  "cordis.patch.yml",
  "package.json",
  "README.md",
];

// Regenerate from scratch: a renamed or deleted skill must not survive as an
// orphan in the artifact's catalog.
//
// An installed bundle cannot be rebuilt in place: the MCP server the profile
// spawns runs with this directory as its working directory, so Windows holds the
// directory itself (EBUSY on rmdir) until that process exits. Say that instead of
// printing a stack trace.
try {
  await rm(pluginRoot, { recursive: true, force: true });
} catch (error) {
  if (error?.code !== "EBUSY" && error?.code !== "EPERM" && error?.code !== "ENOTEMPTY") throw error;
  console.error(
    `dsh-plugin: cannot rebuild ${pluginRoot} because it is in use.\n` +
      "An installed profile spawns the MCP server with this directory as its working\n" +
      "directory, so the directory stays locked until that process exits. Quit DeepSeek\n" +
      "Harness (or stop the profile that uses this bundle), then run the build again.",
  );
  process.exit(1);
}
await mkdir(pluginRoot, { recursive: true });

for (const file of BUNDLE_FILES) {
  await cp(join(sourceRoot, file), join(pluginRoot, file));
}

const model = await buildRegistryModel({ root });

for (const skill of model.skills) {
  const sourceDir = join(root, skill.path);
  await copySkillFiles({
    sourceDir,
    destinationDir: join(pluginRoot, "skills", skill.name),
    files: skill.files,
  });
  // `copySkillFiles` copies the registry's file list, which excludes the
  // metadata file on purpose (it is not part of a skill's content). The
  // artifact's own registry needs it, so it is copied separately.
  await cp(join(sourceDir, "skill.json"), join(pluginRoot, "skills", skill.name, "skill.json"));
}

// The plugin serves its own registry, so the MCP row needs no network and no
// cached copy: `--registry <pluginRoot>` reads this file.
const localModel = await buildRegistryModel({ root: pluginRoot });
await writeFile(join(pluginRoot, "registry.json"), jsonText(localModel));

// The server, prebuilt, with production dependencies installed from the pinned
// lockfile. `npm ci` is the only step that needs a package registry, and it runs
// at build time here rather than on the user's machine.
//
// Build the server first: copying `dist` as-is silently ships whatever was last
// compiled, so a source change without a `tsc` run would reach users as a stale
// binary that no check can see.
const serverDir = join(pluginRoot, "server");
await mkdir(serverDir, { recursive: true });
execSync("npm --prefix packages/skills-mcp run build", { cwd: root, stdio: "inherit" });
await cp(join(root, "packages", "skills-mcp", "dist"), join(serverDir, "dist"), {
  recursive: true,
});
await cp(join(root, "packages", "skills-mcp", "package.json"), join(serverDir, "package.json"));
await cp(
  join(root, "packages", "skills-mcp", "package-lock.json"),
  join(serverDir, "package-lock.json"),
);
execSync("npm ci --omit=dev", { cwd: serverDir, stdio: "inherit" });

console.log(
  `dsh-plugin: built ${pluginRoot} (${String(localModel.skills.length)} skills, ` +
    `registry ${localModel.registryVersion})`,
);
