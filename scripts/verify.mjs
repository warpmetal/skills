import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  buildRegistryModel,
  catalogFileName,
  jsonText,
  listRelativeFiles,
  renderCatalogIndex,
  renderMarketplaceCatalogs,
  renderPluginManifest,
} from "./lib/build.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

const model = await buildRegistryModel({ root });

// 1. registry.json: present, valid, schema-conformant, and not stale.
const registryText = await readText(join(root, "registry.json"));
if (registryText === null) {
  failures.push("registry.json is missing; run npm run build");
} else {
  check(registryText === jsonText(model), "registry.json is stale; run npm run build");
  let parsed;
  try {
    parsed = JSON.parse(registryText);
  } catch (error) {
    failures.push(`registry.json is not valid JSON: ${error.message}`);
    parsed = undefined;
  }
  if (parsed !== undefined) {
    const schema = JSON.parse(await readFile(join(root, "registry.schema.json"), "utf8"));
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (!validate(parsed)) {
      for (const error of validate.errors ?? []) {
        failures.push(`schema ${error.instancePath || "/"} ${error.message ?? "is invalid"}`);
      }
    }
  }
}

// 2. checksums: every file accounted for in both directions (skill.json is metadata).
for (const skill of model.skills) {
  const disk = (await listRelativeFiles(join(root, skill.path))).filter(
    (file) => file !== "skill.json",
  );
  const listed = skill.files.map((file) => file.path);
  for (const file of disk) {
    if (!listed.includes(file)) failures.push(`${skill.name}: ${file} is not listed in registry.json`);
  }
  for (const file of listed) {
    if (!disk.includes(file)) failures.push(`${skill.name}: registry lists a missing file: ${file}`);
  }
}

// 3. generated channels are byte-identical to a fresh render.
for (const [relativePath, content] of Object.entries(renderMarketplaceCatalogs(model))) {
  check(
    (await readText(join(root, relativePath))) === content,
    `${relativePath} is stale; run npm run build`,
  );
}
check(
  (await readText(join(root, "plugins/warpmetal/.claude-plugin/plugin.json"))) ===
    renderPluginManifest(model),
  "plugins/warpmetal/.claude-plugin/plugin.json is stale; run npm run build",
);
check(
  (await readText(join(root, "catalog/index.json"))) === renderCatalogIndex(model),
  "catalog/index.json is stale; run npm run build",
);

// 4. mirrored copies match their sources.
for (const skill of model.skills) {
  for (const file of skill.files) {
    const source = await readFile(join(root, skill.path, file.path));
    const pluginCopy = await readFile(
      join(root, "plugins/warpmetal/skills", skill.name, file.path),
    ).catch(() => null);
    check(
      pluginCopy !== null && pluginCopy.equals(source),
      `plugins copy mismatch: ${skill.name}/${file.path}`,
    );
    const catalogCopy = await readFile(
      join(root, "catalog", skill.name, catalogFileName(file.path, skill)),
    ).catch(() => null);
    check(
      catalogCopy !== null && catalogCopy.equals(source),
      `catalog copy mismatch: ${skill.name}/${file.path}`,
    );
  }
}

// 4b. generated trees contain no orphaned skill directories.
for (const tree of [join(root, "catalog"), join(root, "plugins/warpmetal/skills")]) {
  let entries;
  try {
    entries = await readdir(tree, { withFileTypes: true });
  } catch {
    failures.push(`${relative(root, tree)} is missing; run npm run build`);
    continue;
  }
  const known = new Set(model.skills.map((skill) => skill.name));
  for (const entry of entries) {
    if (tree.endsWith("catalog") && entry.name === "index.json") continue;
    if (!known.has(entry.name)) {
      failures.push(`${relative(root, tree)}/${entry.name} is orphaned; run npm run build`);
    }
  }
}

// 5. secret scan over published content.
const SECRET_PATTERNS = [
  { name: "aws access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "private key", regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { name: "github token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: "gitlab token", regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: "openai key", regex: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

const scanRoots = [
  join(root, "skills"),
  join(root, "registry.json"),
  join(root, "plugins"),
  join(root, "catalog"),
  join(root, ".omp-plugin"),
  join(root, ".claude-plugin"),
  join(root, ".agents"),
];

async function collect(paths) {
  const files = [];
  for (const path of paths) {
    let info;
    try {
      info = await stat(path);
    } catch {
      continue;
    }
    if (info.isFile()) {
      files.push(path);
      continue;
    }
    if (!info.isDirectory()) continue;
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      await collectInto(join(path, entry.name), files);
    }
  }
  return files;
}

async function collectInto(path, files) {
  const info = await stat(path);
  if (info.isFile()) {
    files.push(path);
    return;
  }
  if (!info.isDirectory()) return;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    await collectInto(join(path, entry.name), files);
  }
}

for (const file of await collect(scanRoots)) {
  const buffer = await readFile(file);
  if (buffer.includes(0)) continue;
  const text = buffer.toString("utf8");
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(text)) {
      failures.push(`possible ${pattern.name} in ${relative(root, file)}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`verify: ${failures.length} problem(s) found`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`verify: ok (${model.skills.length} skill(s), registry ${model.registryVersion})`);
