/**
 * build-chatgpt-plugin.mjs - assembles the portable ChatGPT plugin.
 *
 * The artifact under `plugins/warpmetal-chatgpt/` ships production dependencies,
 * so it is gitignored and generated on demand. The committed marketplace entry
 * points at it; a host skips that entry until this script has run.
 */
import { execSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRegistryModel,
  jsonText,
  renderChatgptMcpJson,
  renderChatgptPluginManifest,
} from "./lib/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const pluginRoot = join(root, "plugins", "warpmetal-chatgpt");
const sourceRoot = join(root, "packages", "chatgpt-plugin");
const canonicalSkill = join(root, "skills", "warpmetal");

const REFERENCES = ["cli-reference.md", "safety.md", "runtime.md"];

await rm(pluginRoot, { recursive: true, force: true });

// Scoped skill: the two committed source files, plus the shared references and
// the OpenAI interface metadata. payments.md / renewals.md are deliberately
// absent, and the scoped SKILL.md says so.
const skillDir = join(pluginRoot, "skills", "warpmetal");
await mkdir(join(skillDir, "references"), { recursive: true });
await mkdir(join(skillDir, "agents"), { recursive: true });
await cp(join(sourceRoot, "skills", "warpmetal", "SKILL.md"), join(skillDir, "SKILL.md"));
await cp(join(sourceRoot, "skills", "warpmetal", "skill.json"), join(skillDir, "skill.json"));
for (const ref of REFERENCES) {
  await cp(join(canonicalSkill, "references", ref), join(skillDir, "references", ref));
}
await cp(join(canonicalSkill, "agents", "openai.yaml"), join(skillDir, "agents", "openai.yaml"));

// Registry: the plugin serves its own (single-skill, offline) registry, so the
// MCP never needs the network or the user's cache.
const model = await buildRegistryModel({ root: pluginRoot });
await writeFile(join(pluginRoot, "registry.json"), jsonText(model));

// Manifests.
await writeFile(
  join(pluginRoot, "plugin.json"),
  renderChatgptPluginManifest({ version: model.registryVersion }),
);
await writeFile(join(pluginRoot, "mcp.json"), renderChatgptMcpJson());

// README.
await cp(join(sourceRoot, "README.md"), join(pluginRoot, "README.md"));

// Server: the compiled output plus its production dependencies, installed from
// the pinned lockfile.
const serverDir = join(pluginRoot, "server");
await mkdir(serverDir, { recursive: true });
await cp(join(root, "packages", "skills-mcp", "dist"), join(serverDir, "dist"), {
  recursive: true,
});
await cp(join(root, "packages", "skills-mcp", "package.json"), join(serverDir, "package.json"));
await cp(
  join(root, "packages", "skills-mcp", "package-lock.json"),
  join(serverDir, "package-lock.json"),
);
execSync("npm ci --omit=dev", { cwd: serverDir, stdio: "inherit" });

console.log(`chatgpt-plugin: built ${pluginRoot}`);
