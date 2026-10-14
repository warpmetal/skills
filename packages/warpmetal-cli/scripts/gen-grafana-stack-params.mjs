/**
 * Generates `test/fixtures/grafana-stack-params.json`, the reviewed distillation
 * of the Grafana HTTP API that `test/grafana-stack-params.test.ts` asserts the
 * Grafana stack builders against.
 *
 * The full spec (`api-merged.json`) is not committed - it is a 700 KB scratch
 * dump - so the test cannot read it. This script reads it once, resolves the
 * operation each builder actually calls, and records only what the test needs:
 * the method, the path template and the operation's parameters.
 *
 *   curl -o api-merged.json https://raw.githubusercontent.com/grafana/grafana/main/public/api-merged.json
 *   node --import tsx scripts/gen-grafana-stack-params.mjs [ruta/a/api-merged.json]
 *
 * Resolution is by (method, path): the built URL's pathname is matched against
 * every template of the spec, and a literal segment beats a `{placeholder}` one
 * (without that rule `/teams/search` also matches `/teams/{team_id}`). If a
 * builder resolves to zero or several operations the script fails loudly rather
 * than writing a fixture nobody can trust.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MCP_TOOL_DEFS } from "../src/integration/mcp-tools/catalog.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "test/fixtures/mcp-requests");
const outFile = join(here, "..", "test/fixtures/grafana-stack-params.json");
const specPath = process.argv[2] ?? join(here, "..", "..", "..", "api-merged.json");
const specUrl = "https://raw.githubusercontent.com/grafana/grafana/main/public/api-merged.json";

let spec;
try {
  spec = JSON.parse(readFileSync(specPath, "utf8"));
} catch (error) {
  if (error && error.code === "ENOENT") {
    console.error(
      `No spec at ${specPath}.\n` +
        "It is scratch and is not committed, so download it first, or pass the path of a copy:\n" +
        `  curl -o api-merged.json ${specUrl}\n` +
        "  node --import tsx scripts/gen-grafana-stack-params.mjs [ruta/a/api-merged.json]\n" +
        "The generated fixture is committed, so `npm test` does not need the spec.",
    );
    process.exit(1);
  }
  throw error;
}
const sampleArgs = JSON.parse(readFileSync(join(fixtures, "sample-args.json"), "utf8"));
const sampleCtx = JSON.parse(readFileSync(join(fixtures, "sample-ctx.json"), "utf8"));

const METHODS = ["get", "post", "put", "patch", "delete"];

/** Turns `/dashboards/uid/{uid}` into a regex anchored on the `/api` prefix. */
function templateToRegex(template) {
  const body = template
    .split("/")
    .map((segment) => {
      if (/^\{[^}]+\}$/.test(segment)) return "[^/]+";
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^/api${body}$`);
}

function placeholderCount(template) {
  return template.split("/").filter((segment) => /^\{[^}]+\}$/.test(segment)).length;
}

const operations = [];
for (const [path, item] of Object.entries(spec.paths ?? {})) {
  for (const method of METHODS) {
    const op = item[method];
    if (!op) continue;
    operations.push({ method: method.toUpperCase(), path, op });
  }
}

/**
 * The parameters as the test consumes them. Swagger 2.0 puts the type on the
 * parameter itself, which is where `api-merged.json` keeps it.
 */
function parametersOf(op) {
  return (op.parameters ?? []).map((parameter) => {
    const entry = { name: parameter.name, in: parameter.in };
    const type = parameter.type ?? parameter.schema?.type;
    if (type) entry.type = type;
    if (parameter.items?.type) entry.items = parameter.items.type;
    if (parameter.collectionFormat) entry.collectionFormat = parameter.collectionFormat;
    if (parameter.enum) entry.enum = parameter.enum;
    if (parameter.required === true) entry.required = true;
    return entry;
  });
}

const tools = {};
const unresolved = [];
for (const def of MCP_TOOL_DEFS.filter((entry) => entry.provider === "grafana-stack")) {
  const request = def.build({
    args: sampleArgs[def.toolSlug] ?? {},
    ctx: sampleCtx[def.provider] ?? {},
  });
  const pathname = new URL(request.url).pathname;

  const matches = operations.filter(
    (candidate) => candidate.method === request.method && templateToRegex(candidate.path).test(pathname),
  );
  const literals = matches.filter((candidate) => placeholderCount(candidate.path) === 0);
  const resolved = literals.length > 0 ? literals : matches;

  if (resolved.length !== 1) {
    unresolved.push(
      `${def.toolSlug}: ${request.method} ${pathname} matched ${resolved.length} operations ` +
        `(${resolved.map((entry) => entry.path).join(", ") || "none"})`,
    );
    continue;
  }

  const { method, path, op } = resolved[0];
  tools[def.toolSlug] = {
    method,
    path,
    operationId: op.operationId ?? "",
    ...(op.summary ? { summary: op.summary } : {}),
    parameters: parametersOf(op),
  };
}

if (unresolved.length > 0) {
  console.error("Every builder must resolve to exactly one operation:");
  for (const line of unresolved) console.error(`  ${line}`);
  process.exit(1);
}

const body = {
  version: 1,
  note:
    "Destilacion revisada de api-merged.json (Grafana HTTP API) para los tools de batch 13. " +
    "Generado por scripts/gen-grafana-stack-params.mjs; el spec completo no se commitea. " +
    "Regenerar con: node --import tsx scripts/gen-grafana-stack-params.mjs <ruta/api-merged.json>",
  source: {
    title: spec.info?.title ?? "",
    version: spec.info?.version ?? "",
    document: "https://github.com/grafana/grafana/blob/main/public/api-merged.json",
    reference: "https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/",
  },
  tools,
};

writeFileSync(outFile, `${JSON.stringify(body, null, 2)}\n`);
console.log(`wrote ${Object.keys(tools).length} grafana-stack operations to ${outFile}`);
