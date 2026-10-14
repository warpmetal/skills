/**
 * Generates `scripts/cloudflare/routes.generated.mjs`, the Cloudflare half of the
 * MCP route table that `gen-mcp-tools.mjs` folds into `mcp-tools/catalog.ts`.
 *
 * The reviewed allowlist decides *which* operations ship; this script decides how
 * each one is called, from the operation the spec describes and nothing else:
 *
 *   - the path is the spec's path, with each `{placeholder}` filled from the
 *     argument of the same name in snake_case, percent-encoded (`pf`), because a
 *     zone name or an object key can carry a character a raw URL would break on;
 *   - the query string carries the spec's own parameter names, so `account.id`
 *     stays `account.id` on the wire while the schema says `account_id`;
 *   - an array parameter is repeated (`repeat`) when the spec says
 *     `explode: true` and comma-joined (`qs`) when it says `explode: false`;
 *   - a JSON body is the fields the spec declares, each one sent only when the
 *     caller supplied it (`?? undefined`), so a PATCH never clears a field it was
 *     not told about. A body whose fields the spec does not publish is forwarded
 *     whole, with the declared arguments taken out of it first; a body the spec
 *     publishes no field list for at all travels as the `body` argument, under
 *     the content type the spec declares.
 *
 *   node packages/warpmetal-cli/scripts/gen-cloudflare-routes.mjs [ruta/openapi.json]
 *
 * Every builder is emitted as source text and only ever evaluated inside
 * catalog.ts, where the shared helpers (`qs`, `repeat`, `pf`, `cfHeaders`) live.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AUTH_NONE, loadAllowlist } from "./cloudflare/allowlist.mjs";
import { API_ORIGIN, loadCloudflareSpec, snakeCase } from "./cloudflare/spec.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const outFile = join(here, "cloudflare/routes.generated.mjs");

const specPath =
  process.argv.slice(2).find((entry) => entry.endsWith(".json")) ?? join(root, "openapi.json");
const spec = loadCloudflareSpec(specPath);
const allowlist = loadAllowlist(join(here, "cloudflare/allowlist.json"), spec);

if (allowlist.problems.length > 0) {
  console.error(`${allowlist.problems.length} problem(s) in the allowlist:`);
  for (const problem of allowlist.problems) console.error(`  ${problem}`);
  process.exit(1);
}

const BACKTICK = "`";

/** A path-parameter or query value as it is written into the builder source. */
function arg(snake) {
  return `args.${snake}`;
}

/**
 * `/zones/{zone_id}/dns_records/{dns_record_id}` -> a template literal:
 * `https://api.cloudflare.com/client/v4/zones/${pf(args.zone_id)}/dns_records`.
 *
 * Built by concatenation rather than by a nested template literal so the `${}`
 * a builder needs stays plain text here; the serializer escapes it once, for
 * the file.
 */
/**
 * `/zones/{zone_id}/dns_records/{dns_record_id}` -> a template literal:
 * `https://api.cloudflare.com/client/v4/zones/${pf(args.zone_id)}/dns_records`.
 *
 * The query string is inside the same template literal, so an empty `qs({})`
 * leaves `...zones?` rather than closing the literal and concatenating - the
 * difference between a URL and a syntax error. Built by concatenation rather
 * than by a nested template literal so the `${}` a builder needs stays plain
 * text here; the serializer escapes it once, for the file.
 */
function urlExpression(op) {
  const segments = op.path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      if (!/^\{[^}]+\}$/.test(segment)) return segment;
      return "$" + "{pf(" + arg(snakeCase(segment.slice(1, -1))) + ")}";
    });
  const query = queryExpression(op);
  const inner =
    API_ORIGIN +
    "/" +
    segments.join("/") +
    (query.needsQuery ? "?" + "${" + query.expression + "}" : "");
  return BACKTICK + inner + BACKTICK;
}

/**
 * One builder, as source text.
 *
 * The shape is the repo's: an arrow function that reads only the arguments its
 * schema declares, and returns `{ method, url, body?, headers? }`.
 */
function buildRoute(entry) {
  const op = entry.op;
  const url = urlExpression(op);
  const body = bodySource(entry);
  const headers = entry.auth === AUTH_NONE ? "" : ", headers: cfHeaders()";

  if (body.raw !== null) {
    // A reviewed `rawBody` tool: the spec publishes no field list, so the one
    // `body` argument travels as it arrives. The content type is stated
    // explicitly - the HTTP layer only invents `application/json` for a
    // structured body, and guessing wrong here would mis-encode the payload -
    // and when the operation needs no credential there is no `cfHeaders()` to
    // spread, so the header is spelled out on its own.
    const contentType = JSON.stringify(body.raw);
    const rawHeaders =
      entry.auth === AUTH_NONE
        ? `, headers: { "Content-Type": ${contentType} }`
        : `, headers: { ...cfHeaders(), "Content-Type": ${contentType} }`;
    return (
      `({args}) => ({ method: ${JSON.stringify(op.method)}, url: ${url}, ` +
      `body: args.body${rawHeaders} })`
    );
  }

  if (body.freeForm) {
    // The declared arguments are removed from the copy that becomes the body,
    // so a path or query argument cannot be sent as a field by accident.
    const declared = [
      ...op.pathParams.map((parameter) => parameter.snake),
      ...op.queryParams.map((parameter) => parameter.snake),
    ];
    const removals = declared.map((name) => `delete body.${name};`).join(" ");
    return (
      `({args}) => { const body = { ...${arg("")}args }; ${removals} ` +
      `return { method: ${JSON.stringify(op.method)}, url: ${url}, body${headers} }; }`
    );
  }

  const bodyPart = body.inline ? `, body: ${body.inline}` : "";
  return `({args}) => ({ method: ${JSON.stringify(op.method)}, url: ${url}${bodyPart}${headers} })`;
}

/** Escapes builder source so it can live inside a template literal in the file. */
function escapeForTemplateLiteral(source) {
  return source.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

const routes = allowlist.entries.map((entry) => ({
  toolSlug: entry.toolSlug,
  source: buildRoute(entry),
}));

const body = [
  "/**",
  " * Auto-generated by scripts/gen-cloudflare-routes.mjs - do not edit by hand.",
  " *",
  " * The Cloudflare route table, keyed by toolSlug. `gen-mcp-tools.mjs` spreads it",
  " * into ROUTES and emits each builder into mcp-tools/catalog.ts, where the shared",
  " * helpers (`qs`, `repeat`, `pf`, `cfHeaders`) are defined.",
  " *",
  " * Regenerate after a change to scripts/cloudflare/allowlist.json:",
  " *   node packages/warpmetal-cli/scripts/gen-cloudflare-routes.mjs",
  " */",
  "export const CLOUDFLARE_ROUTES = {",
  routes
    .map((route) => `  ${JSON.stringify(route.toolSlug)}: \`${escapeForTemplateLiteral(route.source)}\`,`)
    .join("\n"),
  "};",
  "",
].join("\n");

writeFileSync(outFile, body);
console.log(`wrote ${routes.length} cloudflare route(s) to ${outFile}`);

function queryExpression(op) {
  const scalars = op.queryParams.filter((parameter) => parameter.collection !== "multi");
  const multi = op.queryParams.filter((parameter) => parameter.collection === "multi");
  const qsCall =
    scalars.length > 0
      ? "qs({ " +
        scalars
          .map((parameter) => `${JSON.stringify(parameter.name)}: ${arg(parameter.snake)}`)
          .join(", ") +
        " })"
      : null;
  const repeatCalls = multi.map(
    (parameter) => `repeat(${JSON.stringify(parameter.name)}, ${arg(parameter.snake)})`,
  );
  return {
    needsQuery: op.queryParams.length > 0,
    multiCount: multi.length,
    expression: [qsCall, ...repeatCalls].filter(Boolean).join(" + \"&\" + "),
    calls: [qsCall, ...repeatCalls].filter(Boolean),
  };
}

/**
 * The body, as source text.
 *
 * A declared object body sends exactly the fields the caller supplied. A body
 * whose fields the spec does not publish (`free-form`) forwards the rest of the
 * args object, with the declared path and query arguments destructured out of it
 * first so they cannot leak into the payload. An `unsupported` body ships only
 * when the allowlist reviewed it as `rawBody`, and then the `body` argument is
 * the payload, sent verbatim under the content type the spec declares.
 */
function bodySource(entry) {
  const op = entry.op;
  if (!op.body) return { inline: null, freeForm: false, raw: null };
  if (op.body.kind === "object") {
    const fields = op.body.fields.map(
      (field) =>
        `${JSON.stringify(field.name)}: ${field.required ? arg(field.snake) : `${arg(field.snake)} ?? undefined`}`,
    );
    return { inline: `{ ${fields.join(", ")} }`, freeForm: false, raw: null };
  }
  if (op.body.kind === "free-form") return { inline: "body", freeForm: true, raw: null };
  return { inline: null, freeForm: false, raw: op.body.contentType };
}

