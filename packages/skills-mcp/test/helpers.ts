import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function writeFixtureFile(
  root: string,
  relative: string,
  content: string,
): Promise<void> {
  const path = join(root, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export interface RegistryFixture {
  dir: string;
  registry: Record<string, unknown>;
  cleanup: () => Promise<void>;
}

/**
 * Builds a temporary registry with two skills and correct checksums.
 * The layout mirrors the repository: registry.json + skills/<name>/...
 */
export async function makeRegistryFixture(): Promise<RegistryFixture> {
  const dir = await mkdtemp(join(tmpdir(), "skills-mcp-"));
  const definitions = {
    demo: {
      description: "A demo skill for planner agents.",
      roles: ["planner"],
      hosts: ["opencode"],
      tags: ["demo", "example"],
      files: {
        "SKILL.md":
          "---\nname: demo\ndescription: A demo skill for planner agents.\n---\n\n# Demo\n\nUse this demo skill.\n",
        "references/notes.md": "# Notes\n\nSupporting notes.\n",
      } as Record<string, string>,
    },
    database: {
      description: "Connect a Postgres database for review work.",
      roles: ["reviewer"],
      hosts: ["omp"],
      tags: ["database", "postgres"],
      files: {
        "SKILL.md":
          "---\nname: database\ndescription: Connect a Postgres database for review work.\n---\n\n# Database\n",
      } as Record<string, string>,
    },
  };

  const skills = [];
  for (const [name, definition] of Object.entries(definitions)) {
    const entries = [];
    for (const [relative, content] of Object.entries(definition.files)) {
      await writeFixtureFile(join(dir, "skills", name), relative, content);
      entries.push({ path: relative, sha256: sha256(content) });
    }
    entries.sort((left, right) => left.path.localeCompare(right.path));
    skills.push({
      name,
      version: "0.1.0",
      description: definition.description,
      path: `skills/${name}`,
      roles: definition.roles,
      hosts: definition.hosts,
      tags: definition.tags,
      files: entries,
    });
  }

  const registry = { schemaVersion: 1, registryVersion: "0.1.0", skills };
  await writeFile(join(dir, "registry.json"), JSON.stringify(registry, null, 2), "utf8");

  return {
    dir,
    registry,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}
