/**
 * gen-experimental.mjs - derives the `experimental` provider-tool set.
 *
 * The experimental marker is a fact about a tool's request shape, not a
 * hand-edited list. It is the union of:
 *
 *   - every tool the credential-free route probe proved does not exist
 *     (`verdict: "invalid-route"` and not `weakSignal`) - the provider answers
 *     404/405 where our builder says the route is; and
 *   - a small, reasoned override map for tools whose route exists but whose
 *     credential mode this server does not support (`experimental-overrides.json`).
 *
 * The probe verdicts live in the committed `probe-verdicts.json` fixture and are
 * refreshed by the scheduled `probe-drift.yml` workflow, so this generator and
 * its `--check` mode need no network and are deterministic.
 *
 *   node packages/skills-mcp/scripts/gen-experimental.mjs            # write
 *   node packages/skills-mcp/scripts/gen-experimental.mjs --check    # prove the committed file
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const verdictsPath = join(
  root,
  "packages",
  "warpmetal-cli",
  "test",
  "fixtures",
  "probe-verdicts.json",
);
const overridesPath = join(here, "experimental-overrides.json");
const outFile = join(here, "..", "src", "providers", "experimental.slugs.json");

const GENERIC_REASON =
  "the credential-free route probe answered 404/405 for this route, so the provider does not serve the path this tool targets";

/**
 * The pure derivation: which tool slugs are experimental, and why. `verdictRows`
 * is the probe's `rows` array (`{ toolSlug, verdict, weakSignal }`); `overrides`
 * is the reasoned map for routes the probe cannot judge (`slug -> reason`).
 */
export function deriveExperimental(verdictRows, overrides = {}) {
  const derived = verdictRows
    .filter((row) => row.verdict === "invalid-route" && !row.weakSignal)
    .map((row) => row.toolSlug);
  const slugs = [...new Set([...derived, ...Object.keys(overrides)])].sort();
  const reasons = {};
  for (const slug of slugs) {
    reasons[slug] = overrides[slug] ?? GENERIC_REASON;
  }
  return { slugs, reasons };
}

function main() {
  const verdicts = JSON.parse(readFileSync(verdictsPath, "utf8"));
  const overrides = JSON.parse(readFileSync(overridesPath, "utf8"));
  if (!Array.isArray(verdicts.rows)) {
    throw new Error(`${verdictsPath} must declare a "rows" array`);
  }

  const { slugs, reasons } = deriveExperimental(verdicts.rows, overrides);
  const document = { version: 1, slugs, reasons };
  const serialized = `${JSON.stringify(document, null, 2)}\n`;

  if (process.argv.includes("--check")) {
    let current = null;
    try {
      current = readFileSync(outFile, "utf8");
    } catch {
      current = null;
    }
    if (current !== serialized) {
      console.error(`${outFile} is out of date`);
      console.error("re-run: node packages/skills-mcp/scripts/gen-experimental.mjs");
      process.exit(1);
    }
    console.log(`the ${slugs.length} experimental tool(s) are up to date`);
    process.exit(0);
  }

  writeFileSync(outFile, serialized);
  console.log(`wrote ${slugs.length} experimental tool(s) to ${outFile}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
