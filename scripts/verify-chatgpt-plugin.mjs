/**
 * verify-chatgpt-plugin.mjs - validates the generated portable package.
 *
 * Skipped when the artifact is absent (it is gitignored and built on demand).
 * These are local shape/consistency checks; the agent-plugins.org JSON schemas
 * are enforced at submission time, not here.
 */
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { buildRegistryModel, jsonText } from "./lib/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const pluginRoot = join(root, "plugins", "warpmetal-chatgpt");
const nodeModules = join(pluginRoot, "server", "node_modules");

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(pluginRoot))) {
  console.log(
    "verify-chatgpt-plugin: skipped (plugins/warpmetal-chatgpt not built; run npm run build:chatgpt-plugin)",
  );
  process.exit(0);
}

// 1. Required files.
for (const file of ["plugin.json", "mcp.json", "registry.json", "README.md"]) {
  check(await exists(join(pluginRoot, file)), `plugins/warpmetal-chatgpt/${file} is missing`);
}
check(
  await exists(join(pluginRoot, "server", "dist", "chatgpt.js")),
  "server/dist/chatgpt.js is missing; run npm run build:chatgpt-plugin",
);
check(
  await exists(join(nodeModules, "@modelcontextprotocol")),
  "server/node_modules is missing; run npm run build:chatgpt-plugin",
);

// 2. registry.json matches the scoped skill on disk.
try {
  const model = await buildRegistryModel({ root: pluginRoot });
  const registryText = await readFile(join(pluginRoot, "registry.json"), "utf8");
  check(registryText === jsonText(model), "registry.json is stale; run npm run build:chatgpt-plugin");
  check(model.skills.length === 1 && model.skills[0]?.name === "warpmetal", "the plugin must serve exactly the warpmetal skill");
} catch (error) {
  failures.push(`registry/skill invalid: ${error.message}`);
}

// 3. Manifests carry the right wiring.
try {
  const plugin = JSON.parse(await readFile(join(pluginRoot, "plugin.json"), "utf8"));
  check(plugin.name === "warpmetal-chatgpt", "plugin.json name must be warpmetal-chatgpt");
  check(typeof plugin.version === "string" && plugin.version.length > 0, "plugin.json version is missing");
  check(
    plugin.extensions?.["com.openai"]?.interface?.displayName === "WarpMetal",
    "plugin.json interface.displayName must be WarpMetal",
  );
} catch (error) {
  failures.push(`plugin.json is not valid JSON: ${error.message}`);
}
try {
  const mcp = JSON.parse(await readFile(join(pluginRoot, "mcp.json"), "utf8"));
  const server = mcp.mcpServers?.["warpmetal"];
  check(server?.type === "stdio", "mcp.json server must be stdio");
  check(
    Array.isArray(server?.args) && server.args.includes("${PLUGIN_ROOT}/server/dist/chatgpt.js"),
    "mcp.json must launch chatgpt.js from ${PLUGIN_ROOT}",
  );
  check(Array.isArray(server?.args) && server.args.includes("--registry"), "mcp.json must pin --registry");
} catch (error) {
  failures.push(`mcp.json is not valid JSON: ${error.message}`);
}

// 4. Payments are absent from the scoped skill.
const skillDir = join(pluginRoot, "skills", "warpmetal");
for (const absent of ["references/payments.md", "references/renewals.md"]) {
  check(!(await exists(join(skillDir, absent))), `${absent} must not be shipped`);
}

// 5. No symlinks, and no absolute checkout path in the text files.
async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      out.push({ path, symlink: true });
      continue;
    }
    if (entry.isDirectory()) {
      await walk(path, out);
    } else {
      out.push({ path });
    }
  }
  return out;
}

const checkout = root.replaceAll("\\", "/");
for (const file of await walk(pluginRoot)) {
  const rel = relative(root, file.path).split("\\").join("/");
  if (file.symlink) {
    failures.push(`${rel} is a symlink`);
    continue;
  }
  if (rel.startsWith("plugins/warpmetal-chatgpt/server/node_modules/")) continue;
  const text = await readFile(file.path, "utf8").catch(() => null);
  if (text === null) continue;
  if (text.includes(checkout)) {
    failures.push(`${rel} contains the checkout path`);
  }
}

if (failures.length > 0) {
  console.error(`verify-chatgpt-plugin: ${failures.length} problem(s) found`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("verify-chatgpt-plugin: ok");
