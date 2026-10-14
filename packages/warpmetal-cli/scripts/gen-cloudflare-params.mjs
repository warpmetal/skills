/**
 * Generates `test/fixtures/cloudflare-params.json`, the reviewed distillation of
 * the Cloudflare API that `test/cloudflare-params.test.ts` asserts the generated
 * builders against.
 *
 * The full spec is 27 MB of scratch and is not committed, so the test cannot
 * read it. This script reads it once and records, per shipped tool, what the
 * operation actually declares: the method, the path template, its parameters,
 * its body fields and the token permission. That is enough for the test to
 * catch a builder that calls a route Cloudflare does not serve, sends a query
 * key the operation never declared, or drops an argument on the floor - none of
 * which the request fixtures can see, because those are generated from the
 * builders themselves.
 *
 *   node packages/warpmetal-cli/scripts/gen-cloudflare-params.mjs [ruta/openapi.json]
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAllowlist } from "./cloudflare/allowlist.mjs";
import { loadCloudflareSpec } from "./cloudflare/spec.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const outFile = join(here, "..", "test/fixtures/cloudflare-params.json");

const specPath =
  process.argv.slice(2).find((entry) => entry.endsWith(".json")) ?? join(root, "openapi.json");
const spec = loadCloudflareSpec(specPath);
const allowlist = loadAllowlist(join(here, "cloudflare/allowlist.json"), spec);

if (allowlist.problems.length > 0) {
  console.error(`${allowlist.problems.length} problem(s) in the allowlist:`);
  for (const problem of allowlist.problems) console.error(`  ${problem}`);
  process.exit(1);
}

/** Only what the assertions need, so the fixture stays reviewable. */
function parametersOf(items) {
  return items.map((item) => {
    const entry = { name: item.name, arg: item.snake, required: item.required };
    const type = Array.isArray(item.schema.type) ? item.schema.type[0] : item.schema.type;
    if (type) entry.type = type;
    if (item.collection) entry.collection = item.collection;
    if (Array.isArray(item.schema.enum)) entry.enum = item.schema.enum;
    return entry;
  });
}

const tools = {};
for (const entry of allowlist.entries) {
  const op = entry.op;
  tools[entry.toolSlug] = {
    toolSlug: entry.toolSlug,
    method: op.method,
    path: op.path,
    summary: op.summary,
    auth: entry.auth,
    destructive: entry.destructive === true,
    filtered: op.filtered,
    keepFiltered: entry.keepFiltered === true,
    rawBody: entry.rawBody === true,
    bodyKind: op.body?.kind ?? "none",
    bodyContentType: op.body?.contentType ?? null,
    pathParams: parametersOf(op.pathParams),
    queryParams: parametersOf(op.queryParams),
    bodyFields: parametersOf(op.body?.kind === "object" ? op.body.fields : []),
    tokenGroups: op.tokenGroups,
  };
}

const body = {
  version: 1,
  note:
    "Distilacion revisada de openapi.json (Cloudflare API) para los tools de Cloudflare que shipan. " +
    "Generado por scripts/gen-cloudflare-params.mjs; el spec completo no se commitea. " +
    "Regenerar con: node packages/warpmetal-cli/scripts/gen-cloudflare-params.mjs <ruta/openapi.json>",
  source: {
    title: spec.info.title ?? "",
    version: spec.info.version ?? "",
    servers: spec.servers.map((server) => server.url ?? ""),
    document: "https://raw.githubusercontent.com/cloudflare/api-schemas/main/openapi.json",
    reference: "https://developers.cloudflare.com/api/",
    sha256: spec.sha256,
    operations: spec.counts.operations,
    reviewable: spec.counts.reviewable,
  },
  tools,
};

writeFileSync(outFile, `${JSON.stringify(body, null, 2)}\n`);
console.log(`wrote ${Object.keys(tools).length} cloudflare operation(s) to ${outFile}`);
