/**
 * Generates `src/providers/mapping.ts` from the provider catalog.
 *
 *   node packages/skills-mcp/scripts/gen-mapping.mjs            # write
 *   node packages/skills-mcp/scripts/gen-mapping.mjs --check    # prove the committed file
 *
 * The mapping is what resolves a provider toolSlug to a provider/verb call, so it
 * has to be regenerated whenever a `catalog/<provider>.json` file changes.
 * `--check` compares instead of writing and exits 1 with a `re-run:` line.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from this file rather than the working directory: this is run from CI,
// from the package and from the repository root.
const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, "..", "src", "providers", "mapping.ts");
const dir = join(here, "..", "src", "providers", "catalog");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .sort();
const tools = files.flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")).tools);

function providerFromToolkit(t) {
  if (t === "resend") return "email";
  return t;
}

const entries = tools.map((t) => {
  const mutating = t.annotations?.readOnlyHint === false;
  const provider = providerFromToolkit(t.toolkitId);
  let verb;
  if (t.toolSlug.startsWith(`${t.toolkitId}_`)) {
    verb = t.toolSlug.slice(t.toolkitId.length + 1).replace(/_/g, "-");
  } else {
    verb = t.name.replace(/_/g, "-");
  }
  const gate = mutating
    ? `CONFIRM ${provider.toUpperCase().replace(/-/g, " ")} ${verb.toUpperCase().replace(/-/g, " ")}`
    : undefined;
  return { toolSlug: t.toolSlug, provider, verb, mutating, ...(gate ? { gate } : {}) };
});

const body = `/**
 * Maps MCP provider toolSlugs to warpmetal integration provider/verb calls.
 */
export interface ProviderToolMapping {
  readonly toolSlug: string;
  readonly provider: string;
  readonly verb: string;
  readonly mutating: boolean;
  readonly gate?: string;
}

export const PROVIDER_TOOL_MAPPINGS: readonly ProviderToolMapping[] = ${JSON.stringify(entries, null, 2)} as const;

const BY_SLUG = new Map(PROVIDER_TOOL_MAPPINGS.map((entry) => [entry.toolSlug, entry]));

export function findProviderToolMapping(toolSlug: string): ProviderToolMapping | undefined {
  return BY_SLUG.get(toolSlug);
}

export function mappedProviderToolSlugs(): readonly string[] {
  return PROVIDER_TOOL_MAPPINGS.map((entry) => entry.toolSlug);
}
`;

if (process.argv.includes("--check")) {
  let current = null;
  try {
    current = readFileSync(outFile, "utf8");
  } catch {
    current = null;
  }
  if (current !== body) {
    console.error(`${outFile} is out of date`);
    console.error("re-run: node packages/skills-mcp/scripts/gen-mapping.mjs");
    process.exit(1);
  }
  console.log(`the ${entries.length} mappings are up to date`);
  process.exit(0);
}

writeFileSync(outFile, body);
console.log("wrote", entries.length, "mappings");
