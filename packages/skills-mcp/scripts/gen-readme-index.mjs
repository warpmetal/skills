/**
 * Generates the provider index in `README.md`.
 *
 * The index used to be a hand-maintained numbered list of every tool, which
 * worked for 175 of them and cannot work for the Cloudflare surface: a reader
 * cannot review 1,200 numbered lines, and the numbering drifts on every
 * addition. This script writes the block between the two markers from the
 * catalog files that the server actually registers, so the README cannot claim
 * a tool that does not exist or miss one that does.
 *
 * The per-tool detail stays where it is generated and tested: one JSON file per
 * provider under `src/providers/catalog/`, and for Cloudflare the reviewed
 * operation-by-operation record in `docs/cloudflare-api-inventory.md`.
 *
 *   node packages/skills-mcp/scripts/gen-readme-index.mjs
 *   node packages/skills-mcp/scripts/gen-readme-index.mjs --check
 *
 * `--check` runs in `check:providers-offline`, i.e. on every pull request. It did
 * not before, and the block was therefore only compared by the two scheduled drift
 * jobs: a PR could merge a README whose tool table no longer matched the catalog
 * that ships beside it.
 *
 * Only the block between the markers is generated. The summary totals that appear
 * in the prose above it (1377 tools, 43 providers, 1331 provider tools) are written
 * by hand and are *not* checked here; the block is authoritative when they
 * disagree. Deriving them too is recorded under "Pending" in ROADMAP.md.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const readmePath = join(root, "packages/skills-mcp/README.md");
const catalogDir = join(root, "packages/skills-mcp/src/providers/catalog");
const allowlistPath = join(root, "packages/warpmetal-cli/scripts/cloudflare/allowlist.json");

const BEGIN = "<!-- provider-index:begin -->";
const END = "<!-- provider-index:end -->";

/** Every provider, with the tools it registers, in file order. */
function providers() {
  return readdirSync(catalogDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const file = JSON.parse(readFileSync(join(catalogDir, name), "utf8"));
      return {
        file: name,
        provider: file.provider,
        tools: (file.tools ?? []).map((tool) => tool.name ?? tool.toolSlug),
      };
    });
}

/** The reviewed Cloudflare waves, with the tools each one actually ships. */
function cloudflareWaves() {
  const document = JSON.parse(readFileSync(allowlistPath, "utf8"));
  const counts = new Map();
  for (const tool of document.tools ?? []) {
    counts.set(tool.wave, (counts.get(tool.wave) ?? 0) + 1);
  }
  return Object.entries(document.waves ?? {}).map(([wave, meta]) => ({
    wave,
    count: counts.get(wave) ?? 0,
    status: meta.status ?? "",
    scope: meta.scope ?? "",
  }));
}

/** A provider whose tools are short enough to name keeps them; the rest point. */
const NAME_LIMIT = 12;

function renderIndex() {
  const rows = providers();
  const total = rows.reduce((sum, row) => sum + row.tools.length, 0);
  const lines = [
    BEGIN,
    "",
    `## Providers (${String(rows.length)} providers, ${String(total)} tools)`,
    "",
    "Every tool below is registered on the `full` (stdio) profile and calls `warpmetal integration",
    "<provider> <verb>` with secrets from the WarpMetal vault; the arguments, the endpoint and the",
    "token permission are declared in the provider's own catalog file under `src/providers/catalog/`.",
    "A provider with more tools than fit on one line points at its file instead of listing them.",
    "",
    "| Provider | Tools | Registered |",
    "| -------- | ----- | ---------- |",
  ];
  for (const row of rows) {
    const registered =
      row.tools.length <= NAME_LIMIT
        ? row.tools.map((name) => `\`${name}\``).join(", ")
        : `\`catalog/${row.file}\``;
    lines.push(`| \`${row.provider}\` | ${String(row.tools.length)} | ${registered} |`);
  }
  lines.push(
    `| **${String(rows.length)} providers** | **${String(total)}** | \`src/providers/catalog/\` |`,
    "",
  );
  lines.push(
    "Cloudflare's record is the reviewed one:",
    "[`docs/cloudflare-api-inventory.md`](../../docs/cloudflare-api-inventory.md) accounts for every",
    "operation of the API - the filter that dropped it or the tool that shipped for it - grouped by",
    "the wave it was reviewed in.",
    "",
    "| Wave | Tools | Status | Scope |",
    "| ---- | ----- | ------ | ----- |",
  );
  for (const wave of cloudflareWaves()) {
    lines.push(
      `| \`${wave.wave}\` | ${String(wave.count)} | ${wave.status} | ${wave.scope} |`,
    );
  }
  lines.push("", END);
  return lines.join("\n");
}

const readme = readFileSync(readmePath, "utf8");
const start = readme.indexOf(BEGIN);
const end = readme.indexOf(END);
if (start < 0 || end < 0 || end < start) {
  console.error(`${readmePath}: the ${BEGIN} / ${END} markers are missing`);
  process.exit(1);
}

const updated = `${readme.slice(0, start)}${renderIndex()}${readme.slice(end + END.length)}`;

if (process.argv.includes("--check")) {
  if (updated !== readme) {
    console.error("the provider index in README.md is out of date");
    console.error("re-run: node packages/skills-mcp/scripts/gen-readme-index.mjs");
    process.exit(1);
  }
  console.log("the provider index is up to date");
  process.exit(0);
}

writeFileSync(readmePath, updated);
console.log("wrote the provider index to", readmePath);
