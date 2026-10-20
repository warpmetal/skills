/**
 * Generates `scripts/plane/routes.generated.mjs`, the Plane half of the MCP route
 * table that `gen-mcp-tools.mjs` folds into `mcp-tools/catalog.ts`.
 *
 * The reviewed allowlist decides *which* tools ship; `endpoints.mjs` decides how
 * each one is called. This script only writes that decision out as source:
 *
 *   - the URL is `https://api.plane.so/api/v1` + the reviewed path, with each
 *     `{name}` filled from the argument of that name, percent-encoded, and a
 *     trailing slash - the one the SDK's own `_build_url` appends to every call;
 *   - `{workspace}` is filled from `ctx.planeWorkspace`, the `plane.workspace_slug`
 *     secret, so no caller can aim a tool at another workspace;
 *   - a `query: "args"` listing sends every non-path argument through `qs`, which
 *     drops the ones the caller left out rather than sending empty strings;
 *   - `body: "args"` sends the remaining arguments as JSON fields with
 *     `args.x ?? undefined`, so a field nobody supplied is absent - an update
 *     never clears a field it was not told about - while a field the caller set to
 *     `null` on purpose still travels;
 *   - a path that depends on an argument becomes a ternary over that argument, and
 *     the refusal for the values we do not ship is emitted as the tool's
 *     `validate`, so a fork we narrowed is a named refusal and not a wrong request.
 *
 *   node packages/warpmetal-cli/scripts/gen-plane-routes.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAllowlist } from "./plane/allowlist.mjs";
import { API_ORIGIN, ENDPOINTS } from "./plane/endpoints.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, "plane/routes.generated.mjs");
const inventory = JSON.parse(readFileSync(join(here, "plane/inventory.json"), "utf8"));

const allowlist = loadAllowlist(join(here, "plane/allowlist.json"), inventory, ENDPOINTS);
if (allowlist.problems.length > 0) {
  console.error(`${allowlist.problems.length} problem(s) in the Plane allowlist:`);
  for (const problem of allowlist.problems) console.error(`  ${problem}`);
  process.exit(1);
}
for (const warning of allowlist.warnings) console.warn(`warning: ${warning}`);

const API_PREFIX = "/api/v1";

/**
 * A reviewed path as the URL expression of a builder.
 *
 * Written by concatenation rather than as a nested template literal so the `${}`
 * the builder needs stays plain text here; the serializer escapes it once, for
 * the file.
 */
function urlExpression(path) {
  const pieces = [];
  const pattern = /\{([a-z_0-9]+)\}/g;
  let cursor = 0;
  let found = pattern.exec(path);
  while (found !== null) {
    // The literal parts go in raw: this is the inside of a template literal, so
    // quoting them would put the quotes in the URL.
    if (found.index > cursor) pieces.push(path.slice(cursor, found.index));
    const name = found[1];
    pieces.push(name === "workspace" ? "${pf(ctx.planeWorkspace)}" : `\${pf(args.${name})}`);
    cursor = found.index + found[0].length;
    found = pattern.exec(path);
  }
  if (cursor < path.length) pieces.push(path.slice(cursor));
  return `\`\${API_BASE}${pieces.join("")}/\``;
}

/** The query string, as `+ \`?${qs({...})}\``, or "" when the endpoint has none. */
function queryExpression(names) {
  if (names.length === 0) return "";
  const pairs = names.map((name) => `${JSON.stringify(name)}: args.${name}`).join(", ");
  return ` + \`?\${qs({ ${pairs} })\}\``;
}

/** The body, as `, body: { ... }`, or "" when there is none. */
function bodyExpression(endpoint, names) {
  const body = endpoint.body;
  if (body === undefined || body === null) return "";
  if (body === "args") {
    const fields = names.map((name) => `${JSON.stringify(name)}: args.${name} ?? undefined`).join(", ");
    return `, body: { ${fields} }`;
  }
  if (body.arg !== undefined) return `, body: args.${body.arg}`;
  const fields = Object.entries(body)
    .map(([key, name]) => `${JSON.stringify(key)}: args.${name} ?? undefined`)
    .join(", ");
  return `, body: { ${fields} }`;
}

/** What the table says the request is, as source text. */
function buildRoute(entry) {
  const endpoint = entry.endpoint;
  const declared = [...(entry.action.requires ?? []), ...(entry.action.optional ?? [])];
  const paths = typeof endpoint.path === "string" ? [endpoint.path] : Object.values(endpoint.path.cases);
  const placeholders = new Set(
    paths.flatMap((path) => [...path.matchAll(/\{([a-z_0-9]+)\}/g)].map((match) => match[1])),
  );
  const queries =
    endpoint.query === "args"
      ? declared.filter((name) => !placeholders.has(name))
      : Array.isArray(endpoint.query)
        ? endpoint.query
        : [];
  const bodyArgs =
    endpoint.body === "args"
      ? declared.filter((name) => !placeholders.has(name) && !queries.includes(name))
      : endpoint.body?.arg !== undefined
        ? [endpoint.body.arg]
        : endpoint.body
          ? Object.values(endpoint.body)
          : [];

  const url =
    typeof endpoint.path === "string"
      ? urlExpression(endpoint.path)
      : `(${Object.entries(endpoint.path.cases)
          .map(([value, path]) => `String(args.${endpoint.path.arg}) === ${JSON.stringify(value)} ? ${urlExpression(path)}`)
          .join(" : ")} : ${urlExpression(Object.values(endpoint.path.cases)[0])})`;

  const source =
    `({args, ctx}) => ({ method: ${JSON.stringify(endpoint.method)}, url: ${url}${queryExpression(queries)}` +
    `${bodyExpression(endpoint, bodyArgs)}, headers: planeHeaders() })`;
  return source;
}

/** The refusals the table implies, as the tool's `validate`, or null. */
function buildValidator(entry) {
  const checks = [];
  for (const name of entry.endpoint.requireArgs ?? []) {
    checks.push(
      `if (args.${name} === undefined) return "Provide ${name}: this tool targets the endpoint that names it, " +` +
        ` "and the branch the vendor picks without it is not exposed by ${entry.toolSlug}.";`,
    );
  }
  if (typeof entry.endpoint.path === "object") {
    const choices = Object.keys(entry.endpoint.path.cases);
    checks.push(
      `if (!${JSON.stringify(choices)}.includes(String(args.${entry.endpoint.path.arg}))) return ` +
        `"Provide ${entry.endpoint.path.arg} as one of ${choices.join(", ")}.";`,
    );
  }
  if (checks.length === 0) return null;
  return `(args) => { ${checks.join(" ")} return null; }`;
}

const routes = allowlist.entries.map((entry) => ({ slug: entry.toolSlug, source: buildRoute(entry) }));
const validators = allowlist.entries
  .map((entry) => ({ slug: entry.toolSlug, source: buildValidator(entry) }))
  .filter((entry) => entry.source !== null);

/** Escapes builder source so it can live inside a template literal in the file. */
function escapeForTemplateLiteral(source) {
  return source.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

const body = [
  "/**",
  " * Auto-generated by scripts/gen-plane-routes.mjs - do not edit by hand.",
  " *",
  " * The Plane route table, keyed by toolSlug, plus the argument refusals the",
  " * reviewed endpoint table implies. `gen-mcp-tools.mjs` spreads the routes into",
  " * ROUTES and the refusals into VALIDATORS, and emits each builder into",
  " * mcp-tools/catalog.ts, where the shared helpers (`qs`, `pf`, `planeHeaders`) live.",
  " *",
  " * Regenerate after a change to scripts/plane/allowlist.json or endpoints.mjs:",
  " *   node packages/warpmetal-cli/scripts/gen-plane-routes.mjs",
  " */",
  "export const PLANE_ROUTES = {",
  routes
    .map((route) => `  ${JSON.stringify(route.slug)}: \`${escapeForTemplateLiteral(route.source)}\`,`)
    .join("\n"),
  "};",
  "",
  "export const PLANE_VALIDATORS = {",
  validators
    .map((entry) => `  ${JSON.stringify(entry.slug)}: \`${escapeForTemplateLiteral(entry.source)}\`,`)
    .join("\n"),
  "};",
  "",
].join("\n");

if (process.argv.includes("--check")) {
  let current = null;
  try {
    current = readFileSync(outFile, "utf8");
  } catch {
    current = null;
  }
  if (current !== body) {
    console.error(`${outFile} is out of date`);
    console.error("re-run: node packages/warpmetal-cli/scripts/gen-plane-routes.mjs");
    process.exit(1);
  }
  console.log("the plane routes are up to date");
  process.exit(0);
}

writeFileSync(outFile, body);
console.log(
  `wrote ${routes.length} plane route(s) and ${validators.length} argument check(s) to ${outFile}` +
    ` (origin ${API_ORIGIN})`,
);

