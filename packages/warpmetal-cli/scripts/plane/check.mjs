#!/usr/bin/env node
/**
 * Validates the reviewed Plane decisions without writing anything.
 *
 * The generators refuse to run on a problem in the allowlist, so this exists for
 * the other two moments: a review that wants the numbers before generating, and a
 * `check` that wants the rules exercised without touching a file. It prints what
 * the pin says, what we ship, what we left out and what is still pending, then the
 * warnings - which are the things worth a second look rather than errors.
 *
 *     node packages/warpmetal-cli/scripts/plane/check.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAllowlist } from "./allowlist.mjs";
import { ENDPOINTS } from "./endpoints.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const inventory = JSON.parse(readFileSync(join(here, "inventory.json"), "utf8"));
const allowlist = loadAllowlist(join(here, "allowlist.json"), inventory, ENDPOINTS);

const waves = new Map();
for (const entry of allowlist.entries) {
  waves.set(entry.wave, (waves.get(entry.wave) ?? 0) + 1);
}

console.log(`pin            ${inventory.source.repository} ${inventory.source.tag} (${inventory.source.license})`);
console.log(
  `pin surface    ${inventory.counts.tools} tools, ${inventory.counts.actions} actions ` +
    `(single ${inventory.counts.shapes.single}, multi ${inventory.counts.shapes.multi}, none ${inventory.counts.shapes.none})`,
);
console.log(`shipped        ${allowlist.entries.length} tools (${[...waves].map(([wave, count]) => `${wave} ${count}`).join(", ")})`);
console.log(`excluded       ${allowlist.excluded.length} actions`);
console.log(`pending        ${allowlist.document.pending?.length ?? 0} actions`);

if (allowlist.problems.length > 0) {
  console.error(`\n${allowlist.problems.length} problem(s):`);
  for (const problem of allowlist.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
if (allowlist.warnings.length > 0) {
  console.log(`\n${allowlist.warnings.length} warning(s):`);
  for (const warning of allowlist.warnings) console.log(`  - ${warning}`);
}
console.log("\nthe plane allowlist is consistent with the pin and the endpoint table");
