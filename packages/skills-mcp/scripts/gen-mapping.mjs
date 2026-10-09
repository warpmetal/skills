import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "packages/skills-mcp/src/providers/catalog";
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

writeFileSync("packages/skills-mcp/src/providers/mapping.ts", body);
console.log("wrote", entries.length, "mappings");
