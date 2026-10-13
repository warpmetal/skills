/**
 * Generates the request-contract fixtures for every MCP provider tool.
 *
 * For each `McpToolDef` it derives deterministic sample arguments from the
 * catalog JSON schema, calls `def.build`, and writes the resulting request to
 * `test/fixtures/mcp-requests/<toolSlug>.json`. The fixtures are the source of
 * truth for `test/mcp-request-contract.test.ts`; regenerate with:
 *
 *   node --import tsx scripts/gen-mcp-contract-fixtures.mjs
 *
 * Any diff in a fixture is a real change to the request shape and must be
 * reviewed against the provider's API documentation.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { MCP_TOOL_DEFS } from "../src/integration/mcp-tools/catalog.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const catalogDir = join(root, "packages/skills-mcp/src/providers/catalog");
const outDir = join(here, "..", "test/fixtures/mcp-requests");

/** Deterministic value for a JSON-schema property, keyed by its type. */
function sampleValue(key, schema) {
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  switch (type) {
    case "integer":
    case "number":
      return 1;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return `sample_${key}`;
  }
}

/** Maps every schema property of every tool to a deterministic sample value. */
function sampleArgsFor(inputSchema) {
  const args = {};
  for (const [key, schema] of Object.entries(inputSchema.properties ?? {})) {
    args[key] = sampleValue(key, schema);
  }
  return args;
}

/** Context secrets that providers interpolate into URLs and headers. */
const SAMPLE_CTX = {
  jira: { jiraBase: "https://acme.atlassian.net", jiraEmail: "ops@acme.test" },
  confluence: { confluenceBase: "https://acme.atlassian.net", confluenceEmail: "ops@acme.test" },
  shopify: { shop: "acme.myshopify.com" },
  snowflake: { snowflakeBase: "https://acme.snowflakecomputing.com", warehouse: "COMPUTE_WH" },
  posthog: { posthogBase: "https://us.posthog.com" },
  mailchimp: { mailchimpDc: "us1" },
  pagerduty: { pagerdutyEmail: "ops@acme.test" },
  zendesk: { zendeskSubdomain: "acme", zendeskEmail: "ops@acme.test" },
  "grafana-stack": { grafanaStack: "acme" },
};

const schemaBySlug = new Map();
for (const file of readdirSync(catalogDir).filter((f) => f.endsWith(".json")).sort()) {
  for (const tool of JSON.parse(readFileSync(join(catalogDir, file), "utf8")).tools) {
    schemaBySlug.set(tool.toolSlug, tool.inputSchema ?? { properties: {} });
  }
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const sampleArgs = {};
let written = 0;
for (const def of MCP_TOOL_DEFS) {
  const inputSchema = schemaBySlug.get(def.toolSlug);
  if (!inputSchema) throw new Error(`No schema for ${def.toolSlug}`);
  const args = sampleArgsFor(inputSchema);
  sampleArgs[def.toolSlug] = args;
  const ctx = SAMPLE_CTX[def.provider] ?? {};
  const request = def.build({ args, ctx });
  writeFileSync(join(outDir, `${def.toolSlug}.json`), `${JSON.stringify(request, null, 2)}\n`);
  written += 1;
}

writeFileSync(join(outDir, "sample-args.json"), `${JSON.stringify(sampleArgs, null, 2)}\n`);
writeFileSync(join(outDir, "sample-ctx.json"), `${JSON.stringify(SAMPLE_CTX, null, 2)}\n`);
console.log("wrote", written, "request fixtures to", outDir);
