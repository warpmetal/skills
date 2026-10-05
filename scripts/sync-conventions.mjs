import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy the canonical conventions into every skill that ships them.
 *
 * `conventions/` at the repository root is the single source of truth. Each skill
 * carries its own byte-identical copy because a skill directory has to work on its
 * own once installed - a script resolves `conventions/lib/bootstrap.sh` beside the
 * skill, not from the repository it came from.
 *
 * Those copies are therefore generated, exactly like `catalog/` and `plugins/`:
 * edit `conventions/`, run the build, do not edit the copies. `scripts/verify.mjs`
 * fails on drift so a hand-edit is caught rather than silently overwritten.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const canonical = join(root, "conventions");
const skillsRoot = join(root, "skills");

if (!existsSync(canonical)) {
  console.error("sync-conventions: conventions/ is missing; it is the canonical source");
  process.exit(1);
}

const skillNames = (await readdir(skillsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => entry.name)
  .sort();

const targets = skillNames.filter((name) => existsSync(join(skillsRoot, name, "conventions")));
if (targets.length === 0) {
  console.error("sync-conventions: no skill ships conventions/; nothing to do");
  process.exit(1);
}

// Replace rather than merge, so a file deleted from conventions/ is also removed
// from the skills. A stale library that nothing references is still a hazard.
for (const name of targets) {
  const destination = join(skillsRoot, name, "conventions");
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(canonical, destination, { recursive: true });
}

console.log(`sync-conventions: conventions/ -> ${targets.length} skill(s): ${targets.join(", ")}`);
