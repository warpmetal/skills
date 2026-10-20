import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$/;
export const MAX_FILE_BYTES = 1_048_576;
export const MAX_SKILL_BYTES = 8 * 1024 * 1024;
export const REPOSITORY_URL = "https://github.com/warpmetal/skills";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function registryVersion(env = process.env) {
  const raw = (env.REGISTRY_VERSION ?? "").trim().replace(/^v/, "");
  if (!raw) return "0.0.0-dev";
  if (!VERSION_PATTERN.test(raw)) {
    throw new Error(`REGISTRY_VERSION is not a semver version: ${raw}`);
  }
  return raw;
}

export function generatedAt(env = process.env) {
  const value = (env.GENERATED_AT ?? "").trim();
  return value.length > 0 ? value : undefined;
}

export async function listRelativeFiles(root) {
  const out = [];
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) out.push(relative(root, path).split(sep).join("/"));
    }
  }
  await walk(root);
  return out;
}

function stringArray(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

function frontmatterField(block, field) {
  const match = block.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  if (!match) return undefined;
  return match[1].trim().replace(/^["']|["']$/g, "");
}

function validateFrontmatter(label, name, content) {
  if (!content.startsWith("---\n")) {
    throw new Error(`${label}/${name}/SKILL.md must start with YAML frontmatter`);
  }
  const end = content.indexOf("\n---", 4);
  if (end === -1) throw new Error(`${label}/${name}/SKILL.md frontmatter is not closed`);
  const block = content.slice(4, end);
  const declaredName = frontmatterField(block, "name");
  if (declaredName === undefined) throw new Error(`${label}/${name}/SKILL.md is missing a name`);
  if (declaredName !== name) {
    throw new Error(
      `${label}/${name}/SKILL.md frontmatter name must be "${name}" (found "${declaredName}")`,
    );
  }
  if (frontmatterField(block, "description") === undefined) {
    throw new Error(`${label}/${name}/SKILL.md is missing a description`);
  }
  // Every skill is opt-in. conventions/safety.md forbids letting an agent
  // auto-invoke a skill, and the rule is enforced here rather than only in
  // scripts/validate-skills.mjs because this one runs for both registries (the
  // public one and internal-skills/) and fails the build rather than the
  // verification pass. There is no escape hatch on purpose: a skill that should
  // be model-invocable is a policy change with its own review, not a field.
  //
  // The match is on the raw line, not through `frontmatterField`, because that
  // helper strips surrounding quotes: `"true"` is a YAML string, and a host is
  // not obliged to read a string as consent for the one field that decides
  // whether an agent may run a mutating skill unasked.
  if (!/^disable-model-invocation:[ \t]*true[ \t]*\r?$/m.test(block)) {
    throw new Error(
      `${label}/${name}/SKILL.md must declare "disable-model-invocation: true" unquoted (see conventions/safety.md)`,
    );
  }
}

/**
 * Builds the registry model from a skills directory.
 *
 * `skillsDir` defaults to `<root>/skills` (the public registry). A different
 * directory builds a different registry from the same tooling: the internal
 * registry passes `<root>/internal-skills`. The per-skill `path` is always
 * `skills/<name>` regardless of the source directory, because that is the only
 * layout the MCP server accepts (`validateRegistry` rejects anything else).
 */
export async function buildRegistryModel({ root, skillsDir, env = process.env }) {
  const skillsRoot = skillsDir ? resolve(skillsDir) : join(root, "skills");
  const label = relative(root, skillsRoot).split(sep).join("/") || "skills";
  const names = (await readdir(skillsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
  if (names.length === 0) throw new Error(`no skills found under ${label}/`);

  const skills = [];
  for (const name of names) {
    if (!NAME_PATTERN.test(name)) {
      throw new Error(`skill directory must be lowercase kebab-case: ${name}`);
    }
    const directory = join(skillsRoot, name);

    let meta;
    try {
      meta = JSON.parse(await readFile(join(directory, "skill.json"), "utf8"));
    } catch (error) {
      throw new Error(`${label}/${name}/skill.json is missing or invalid: ${error.message}`);
    }
    if (meta.name !== name) throw new Error(`${label}/${name}/skill.json name must be "${name}"`);
    if (typeof meta.version !== "string" || !VERSION_PATTERN.test(meta.version)) {
      throw new Error(`${label}/${name}/skill.json version must be semver`);
    }
    if (typeof meta.description !== "string" || meta.description.trim().length === 0) {
      throw new Error(`${label}/${name}/skill.json description is required`);
    }
    if (
      meta.minimumWarpmetalCli !== undefined &&
      typeof meta.minimumWarpmetalCli !== "string"
    ) {
      throw new Error(`${label}/${name}/skill.json minimumWarpmetalCli must be a string`);
    }
    // Declared provider integrations. Validated against the engine catalog by
    // scripts/validate-skills.mjs, because that check needs to read the catalog
    // source; here only the shape is enforced.
    const integrations = stringArray(meta.integrations, `${name}.integrations`);

    validateFrontmatter(label, name, await readFile(join(directory, "SKILL.md"), "utf8"));

    const files = [];
    let total = 0;
    for (const path of await listRelativeFiles(directory)) {
      if (path === "skill.json") continue;
      const bytes = await readFile(join(directory, path));
      if (bytes.byteLength > MAX_FILE_BYTES) {
        throw new Error(`${label}/${name}/${path} exceeds ${MAX_FILE_BYTES} bytes`);
      }
      total += bytes.byteLength;
      files.push({ path, sha256: sha256(bytes) });
    }
    if (total > MAX_SKILL_BYTES) {
      throw new Error(`${label}/${name} exceeds ${MAX_SKILL_BYTES} bytes in total`);
    }

    skills.push({
      name,
      version: meta.version,
      description: meta.description,
      path: `skills/${name}`,
      roles: stringArray(meta.roles, `${name}.roles`),
      hosts: stringArray(meta.hosts, `${name}.hosts`),
      ...(typeof meta.minimumWarpmetalCli === "string"
        ? { minimumWarpmetalCli: meta.minimumWarpmetalCli }
        : {}),
      tags: stringArray(meta.tags, `${name}.tags`),
      ...(integrations.length > 0 ? { integrations } : {}),
      files,
    });
  }

  const timestamp = generatedAt(env);
  return {
    schemaVersion: 1,
    registryVersion: registryVersion(env),
    ...(timestamp ? { generatedAt: timestamp } : {}),
    skills,
  };
}

export function catalogEntryName(skill) {
  return `${skill.name}.md`;
}

export function catalogFileName(file, skill) {
  return file === "SKILL.md" ? catalogEntryName(skill) : file;
}

export function renderMarketplaceCatalogs(model) {
  const claude = {
    $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
    name: "warpmetal",
    owner: { name: "WarpMetal" },
    metadata: {
      description: "WarpMetal Agent Skills: servers, sandboxes, and coding environments.",
      version: model.registryVersion,
      pluginRoot: "plugins",
    },
    plugins: [
      {
        name: "warpmetal",
        description: "WarpMetal skills for shell-capable agents.",
        source: "./plugins/warpmetal",
        homepage: REPOSITORY_URL,
        repository: REPOSITORY_URL,
        license: "UNLICENSED",
        category: "development",
        keywords: ["warpmetal", "agent-skills", "vps"],
      },
    ],
  };
  const codex = {
    name: "warpmetal",
    interface: { displayName: "WarpMetal Skills" },
    plugins: [
      {
        name: "warpmetal",
        source: { source: "local", path: "./plugins/warpmetal" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools",
      },
      {
        name: "warpmetal-chatgpt",
        source: { source: "local", path: "./plugins/warpmetal-chatgpt" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools",
      },
    ],
  };
  return {
    ".omp-plugin/marketplace.json": jsonText(claude),
    ".claude-plugin/marketplace.json": jsonText(claude),
    ".agents/plugins/marketplace.json": jsonText(codex),
  };
}

export function renderPluginManifest(model) {
  return jsonText({
    name: "warpmetal",
    description: "WarpMetal Agent Skills",
    version: model.registryVersion,
    author: { name: "WarpMetal" },
    homepage: REPOSITORY_URL,
    repository: REPOSITORY_URL,
    license: "UNLICENSED",
    keywords: ["warpmetal", "agent-skills", "vps"],
  });
}

export function renderChatgptPluginManifest({ version }) {
  return jsonText({
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "warpmetal-chatgpt",
    version,
    description:
      "Manage and observe WarpMetal VPS servers and Agent Runtime sandboxes from ChatGPT Desktop.",
    author: { name: "WarpMetal", url: REPOSITORY_URL },
    homepage: REPOSITORY_URL,
    repository: REPOSITORY_URL,
    license: "UNLICENSED",
    keywords: ["warpmetal", "vps", "sandbox", "mcp"],
    extensions: {
      "com.openai": {
        interface: {
          displayName: "WarpMetal",
          shortDescription: "Manage and observe WarpMetal servers and sandboxes.",
          longDescription:
            "Read WarpMetal server, sandbox and task state, and plan server/sandbox changes with explicit approval. Payments are out of scope.",
          developerName: "WarpMetal",
          category: "Developer Tools",
          capabilities: ["Read", "Write"],
          websiteURL: "https://warpmetal.com",
          defaultPrompt: ["Use WarpMetal to show my servers and their state."],
        },
      },
    },
  });
}

export function renderChatgptMcpJson() {
  return jsonText({
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: {
      warpmetal: {
        type: "stdio",
        command: "node",
        args: ["${PLUGIN_ROOT}/server/dist/chatgpt.js", "--registry", "${PLUGIN_ROOT}"],
        cwd: "${PLUGIN_ROOT}",
      },
    },
  });
}

export function renderCatalogIndex(model) {
  return jsonText({
    skills: model.skills.map((skill) => ({
      name: skill.name,
      version: skill.version,
      files: skill.files.map((file) => catalogFileName(file.path, skill)).sort(),
    })),
  });
}

/**
 * Copies the exact files listed in the registry into a destination directory.
 * `renameSkillMdTo` supports the OpenCode catalog form (`<name>.md`).
 */
export async function copySkillFiles({ sourceDir, destinationDir, files, renameSkillMdTo }) {
  await rm(destinationDir, { recursive: true, force: true });
  for (const file of files) {
    const source = join(sourceDir, file.path);
    const name = file.path === "SKILL.md" && renameSkillMdTo ? renameSkillMdTo : file.path;
    const destination = join(destinationDir, name);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}
