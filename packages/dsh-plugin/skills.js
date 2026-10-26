/**
 * skills.js - the WarpMetal Agent Skills as a native DSH skill provider.
 *
 * Without this row a user installs the bundle and still has to copy nine
 * directories into a skills root by hand. A provider reads them from the
 * installed package instead, so the catalog is correct the moment the bundle
 * loads and disappears with it.
 *
 * Two deliberate choices:
 *
 * 1. `rank: 700`. The registry resolves a duplicate name in favour of the lower
 *    rank, and the local provider's own roots sit at 100-600. A copy the user
 *    made in `.dsh/skills` or `.agents/skills` therefore wins, and the bundle
 *    never overrides what the operator installed on purpose.
 * 2. The invocation policy is read from the frontmatter, not forced. Every
 *    WarpMetal SKILL.md declares `disable-model-invocation: true` (the repo's
 *    own safety convention, enforced by `buildRegistryModel`), so these skills
 *    surface as user-invocable entries and the model reaches their content
 *    through the MCP `skill_read` tool, which is a tool call the host can gate.
 *    A provider that published them as model-invocable would quietly overrule
 *    that convention.
 *
 * No `@deepseek-ai` import for the same reason as `index.js`; the frontmatter
 * and candidate helpers are exported so the tests run without a harness.
 */
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const name = "warpmetal-skills";
export const inject = ["skills"];

/** Lower ranks win a duplicate name; the user's own copies must beat this one. */
export const SKILL_RANK = 700;
export const PROVIDER_NAME = "warpmetal";

/** The instruction file every bundle entry must have. */
const ENTRY_FILE = "SKILL.md";
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Parse the YAML subset these bundles use: `key: value` lines, with `true` and
 * `false` coerced to booleans so the two invocation keys keep their meaning.
 *
 * Returns `null` when the block is absent or unterminated; the caller skips
 * that skill instead of failing the whole catalog.
 */
export function parseFrontmatter(body) {
  if (typeof body !== "string") return null;
  const match = FRONTMATTER.exec(body);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (key.length === 0) continue;
    const raw = line.slice(separator + 1).trim();
    // Only the bare literals are booleans. A quoted `"true"` stays a string:
    // a host is not obliged to read a string as consent for the one field that
    // decides whether an agent may run a mutating skill unasked.
    fields[key] =
      raw === "true" ? true : raw === "false" ? false : raw.replace(/^["']|["']$/g, "");
  }
  return fields;
}

function invocationOf(fields) {
  return {
    modelInvocable: fields["disable-model-invocation"] !== true,
    userInvocable: fields["user-invocable"] !== false,
  };
}

function dirsIn(root) {
  return readdir(join(root, "skills")).then(
    (entries) => entries.sort(),
    () => [],
  );
}

/**
 * A provider over the skills shipped inside the installed bundle.
 *
 * Bodies are never cached: `get()` rereads the file, so a skill edited in place
 * is served as edited (the same choice the shipped local provider makes).
 */
export function createWarpmetalSkillProvider(root, options = {}) {
  const warn = options.warn ?? ((message) => console.warn(message));
  const skillsRoot = join(root, "skills");

  return {
    name: PROVIDER_NAME,

    async list({ signal } = {}) {
      const candidates = [];
      for (const dirName of await dirsIn(root)) {
        if (signal?.aborted) break;
        const dir = join(skillsRoot, dirName);
        const file = join(dir, ENTRY_FILE);
        if (!existsSync(file)) continue;

        let body;
        try {
          body = await readFile(file, "utf8");
        } catch {
          // A directory that cannot be read contributes no candidate; the rest
          // of the catalog still loads.
          continue;
        }

        const fields = parseFrontmatter(body);
        const skillName = fields?.name;
        if (typeof skillName !== "string" || !SKILL_NAME.test(skillName)) {
          warn(
            `warpmetal-dsh: skipping skills/${dirName}: ` +
              "no kebab-case `name` in SKILL.md frontmatter",
          );
          continue;
        }

        candidates.push({
          name: skillName,
          description: typeof fields.description === "string" ? fields.description : "",
          path: file,
          invocation: invocationOf(fields),
          source: "bundled",
          provider: PROVIDER_NAME,
          rank: SKILL_RANK,
          locator: { dir },
          resourceBase: { kind: "directory", path: dir },
        });
      }
      candidates.sort((left, right) => left.name.localeCompare(right.name));
      return candidates;
    },

    async get(candidate, lookup = {}) {
      const dir = candidate?.locator?.dir;
      if (typeof dir !== "string" || candidate === undefined) return undefined;
      if (lookup.signal?.aborted) return undefined;

      let body;
      try {
        body = await readFile(join(dir, ENTRY_FILE), "utf8");
      } catch {
        // Removed since discovery: the registry reports the skill as no longer
        // available instead of serving a stale body.
        return undefined;
      }

      const fields = parseFrontmatter(body);
      if (!fields || fields.name !== candidate.name) return undefined;

      return {
        name: candidate.name,
        description: typeof fields.description === "string" ? fields.description : "",
        path: join(dir, ENTRY_FILE),
        invocation: invocationOf(fields),
        source: "bundled",
        provider: PROVIDER_NAME,
        resourceBase: { kind: "directory", path: dir },
        content: body.replace(FRONTMATTER, "").replace(/^(?:\r?\n)+/, ""),
      };
    },
  };
}

export function apply(ctx) {
  const root = fileURLToPath(new URL(".", import.meta.url));
  // `ctx.effect` owns the disposer, so unloading this plugin (or an HMR swap)
  // unregisters the provider instead of leaving a dangling one behind.
  ctx.effect(
    () => ctx.skills.registerProvider(() => createWarpmetalSkillProvider(root)),
    "warpmetal-skills: provider",
  );
}
