/**
 * check-action-pins.mjs - enforce that GitHub Actions are pinned to commit SHAs.
 *
 * A tag (`@v4`, `@main`, `@latest`) is a mutable pointer: whoever can push a tag
 * can replace what a workflow runs. A full 40-char commit SHA is immutable, so a
 * workflow that references `owner/repo@<sha>` runs exactly the reviewed code.
 * This check fails any external action reference that is not pinned, so a future
 * `@v4` cannot slip back in.
 *
 * Local reusable workflows (`uses: ./.github/workflows/verify.yml`) and other
 * `uses:` forms (e.g. `docker://`) are not external actions and are ignored.
 *
 *   node scripts/check-action-pins.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workflowsDir = join(here, "..", ".github", "workflows");

const SHA_PATTERN = /^[0-9a-f]{40}$/;

/** Classifies one `uses:` value into local / external / other. */
export function classifyUses(value) {
  if (value.startsWith(".")) return { kind: "local" };
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)@(.+)$/.exec(value);
  if (match) {
    return { kind: "external", ref: match[3], pinned: SHA_PATTERN.test(match[3]) };
  }
  return { kind: "other" };
}

/** 1-based line numbers of `uses:` external actions that are not SHA-pinned. */
export function unpinnedActions(text) {
  const out = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = /^\s*-\s*uses:\s*(\S+)/.exec(line);
    if (!match) continue;
    const classification = classifyUses(match[1]);
    if (classification.kind === "external" && !classification.pinned) {
      out.push({ line: index + 1, value: match[1] });
    }
  }
  return out;
}

function main() {
  const failures = [];
  for (const name of readdirSync(workflowsDir).filter((entry) => entry.endsWith(".yml")).sort()) {
    const text = readFileSync(join(workflowsDir, name), "utf8");
    for (const { line, value } of unpinnedActions(text)) {
      failures.push(`.github/workflows/${name}:${line}: ${value} is not pinned to a full commit SHA`);
    }
  }
  if (failures.length > 0) {
    console.error(`${failures.length} unpinned action(s):`);
    for (const failure of failures) console.error(`  ${failure}`);
    console.error("re-run: pin each to its commit SHA (e.g. uses: actions/checkout@<40-hex-sha> # v4)");
    process.exit(1);
  }
  console.log("all GitHub Actions are pinned to commit SHAs");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
