import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { buildRegistryModel, jsonText, listRelativeFiles } from "./lib/build.mjs";

/**
 * Verifies the internal registry. It mirrors the public `verify.mjs` for the
 * checks that apply to a second registry built from `internal-skills/`, and adds
 * one the public verifier cannot do: proving the public registry does not list
 * any internal skill.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const internalSkills = join(root, "internal-skills");
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

const model = await buildRegistryModel({ root, skillsDir: internalSkills });

// 1. registry.internal.json: present, valid, schema-conformant, and not stale.
const registryText = await readText(join(root, "registry.internal.json"));
if (registryText === null) {
  failures.push("registry.internal.json is missing; run npm run build:internal");
} else {
  check(
    registryText === jsonText(model),
    "registry.internal.json is stale; run npm run build:internal",
  );
  let parsed;
  try {
    parsed = JSON.parse(registryText);
  } catch (error) {
    failures.push(`registry.internal.json is not valid JSON: ${error.message}`);
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
  const disk = (await listRelativeFiles(join(internalSkills, skill.name))).filter(
    (file) => file !== "skill.json",
  );
  const listed = skill.files.map((file) => file.path);
  for (const file of disk) {
    if (!listed.includes(file)) {
      failures.push(`${skill.name}: ${file} is not listed in registry.internal.json`);
    }
  }
  for (const file of listed) {
    if (!disk.includes(file)) failures.push(`${skill.name}: registry lists a missing file: ${file}`);
  }
}

// 3. the deployable bundle is byte-identical to a fresh render.
for (const skill of model.skills) {
  for (const file of skill.files) {
    const source = await readFile(join(internalSkills, skill.name, file.path));
    const copy = await readFile(join(root, "snapshot.internal", skill.path, file.path)).catch(
      () => null,
    );
    check(
      copy !== null && copy.equals(source),
      `snapshot.internal mismatch: ${skill.name}/${file.path} (run npm run build:internal)`,
    );
  }
}
check(
  (await readText(join(root, "snapshot.internal", "registry.json"))) === jsonText(model),
  "snapshot.internal/registry.json is stale; run npm run build:internal",
);

// 4. the bundle contains no orphaned skill directories.
const known = new Set(model.skills.map((skill) => skill.name));
try {
  const entries = await readdir(join(root, "snapshot.internal", "skills"), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !known.has(entry.name)) {
      failures.push(`snapshot.internal/skills/${entry.name} is orphaned; run npm run build:internal`);
    }
  }
} catch {
  failures.push("snapshot.internal/skills/ is missing; run npm run build:internal");
}

// 5. the isolation guard: no internal skill name may appear in the public
//    registry. This is what keeps the public catalog from listing them.
const publicRegistryText = (await readText(join(root, "registry.json"))) ?? "";
for (const skill of model.skills) {
  if (publicRegistryText.includes(skill.name)) {
    failures.push(
      `isolation: internal skill "${skill.name}" appears in the public registry.json`,
    );
  }
}

// 6. secret scan over everything that ships internally.
const SECRET_PATTERNS = [
  { name: "aws access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "private key", regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { name: "github token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/ },
  { name: "gitlab token", regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { name: "openai key", regex: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "slack webhook", regex: /hooks\.slack\.com\/services\/[A-Za-z0-9+/]{8,}/ },
  { name: "cloudflare global key", regex: /\b[0-9a-f]{37}\b/ },
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

async function collectInto(path, files) {
  const info = await stat(path);
  if (info.isFile()) {
    files.push(path);
    return;
  }
  if (!info.isDirectory()) return;
  for (const entry of await readdir(path)) {
    if (entry === "node_modules" || entry === ".git") continue;
    await collectInto(join(path, entry), files);
  }
}

const files = [];
for (const target of [
  internalSkills,
  join(root, "registry.internal.json"),
  join(root, "snapshot.internal"),
]) {
  try {
    await collectInto(target, files);
  } catch {
    // Missing targets are reported by the checks above.
  }
}
for (const file of files) {
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
  console.error(`verify:internal: ${failures.length} problem(s) found`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  `verify:internal: ok (${model.skills.length} internal skill(s), not in the public registry)`,
);
