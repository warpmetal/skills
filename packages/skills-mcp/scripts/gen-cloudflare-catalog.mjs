/**
 * Generates `src/providers/catalog/cloudflare.json` from the Cloudflare API
 * spec and the reviewed allowlist.
 *
 * The catalog is what the MCP surface is built from: `registerProviderTools`
 * registers one tool per entry and `gen-mapping.mjs` turns the same file into
 * the provider/verb mapping. So the entry has to say three things and no less:
 *
 *   - the arguments, in snake_case, with the type the spec declares;
 *   - the endpoint the tool calls, in the description, byte for byte, so a
 *     caller can check the request against Cloudflare's own reference;
 *   - the token permission the operation needs, also in the description, read
 *     from `x-api-token-group`.
 *
 * One entry per allowlist entry, in allowlist order, with no invention: a
 * property the spec does not declare does not appear, and a field the spec marks
 * required is required here too.
 *
 * The spec half is shared with the CLI's route generator: both import
 * `packages/warpmetal-cli/scripts/cloudflare/*` so the two artifacts cannot
 * disagree about what an operation is.
 *
 *   node packages/skills-mcp/scripts/gen-cloudflare-catalog.mjs [ruta/openapi.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AUTH_NONE, loadAllowlist } from "../../warpmetal-cli/scripts/cloudflare/allowlist.mjs";
import { loadCloudflareSpec } from "../../warpmetal-cli/scripts/cloudflare/spec.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const outFile = join(here, "..", "src/providers/catalog/cloudflare.json");
const allowlistPath = join(root, "packages/warpmetal-cli/scripts/cloudflare/allowlist.json");

const specPath =
  process.argv.slice(2).find((entry) => entry.endsWith(".json")) ?? join(root, "openapi.json");
const spec = loadCloudflareSpec(specPath);
const allowlist = loadAllowlist(allowlistPath, spec);

if (allowlist.problems.length > 0) {
  console.error(`${allowlist.problems.length} problem(s) in ${allowlistPath}:`);
  for (const problem of allowlist.problems) console.error(`  ${problem}`);
  process.exit(1);
}

/** The one-line "when to use this" note, by the verb the name ends in. */
const VERB_HINTS = {
  list: "Use it to browse.",
  get: "Use it when the id is already known.",
  create: "Use it to add one; the response echoes what Cloudflare created.",
  update: "Only the fields you pass are sent, so a field you leave out is kept.",
  replace: "The record is replaced whole: a field you leave out is cleared.",
  delete: "What it removes is gone; check the id before calling it.",
  put: "It writes the whole object, so read the current state first.",
};

function verbOf(op) {
  const suffix = op.toolSlug.split("_").pop();
  return VERB_HINTS[suffix] ? suffix : null;
}

/** The hint, naming the get tool only when this provider actually ships one. */
function hintOf(op) {
  const verb = verbOf(op);
  if (!verb) return null;
  if (verb === "list" && allowlist.bySlug.has(op.toolSlug.replace(/_list$/, "_get"))) {
    return "Use it to browse; the get tool reads one when its id is already known.";
  }
  return VERB_HINTS[verb];
}


/** The title Cloudflare's own summary gives, or one derived from the path. */
function titleOf(op) {
  if (op.summary) return op.summary;
  const verb = op.method === "GET" ? (op.shape.item ? "Get" : "List") : op.method[0] + op.method.slice(1).toLowerCase();
  return `${verb} ${op.shape.module.replace(/_/g, " ")}`;
}

/**
 * The description: what it does, the exact endpoint, the permission it needs,
 * and any caveat the spec published. A caller should be able to check every
 * sentence against Cloudflare's reference.
 */
function descriptionOf(entry) {
  const op = entry.op;
  const parts = [];
  parts.push(op.summary ? `${op.summary}.` : `${titleOf(op)}.`);
  parts.push(`${op.method} ${op.path}.`);
  const hint = hintOf(op);
  if (hint) parts.push(hint);
  if (entry.auth === AUTH_NONE) {
    parts.push("This endpoint needs no credential.");
  } else if (op.tokenGroups.length > 0 && op.tokenGroups.length <= 3) {
    parts.push(`Requires a token with the ${op.tokenGroups.join(" or ")} permission.`);
  } else if (op.tokenGroups.length > 3) {
    parts.push("Requires any one of a long list of token permissions; see the scope doc.");
  }
  if (op.body?.kind === "free-form") {
    parts.push(
      "Cloudflare does not publish its body fields, so the declared arguments are removed and the rest of the arguments are sent as the body.",
    );
  }
  if (entry.rawBody === true) {
    parts.push(
      `The body is a ${op.body.contentType} payload sent verbatim, so pass exactly the text the operation documents.`,
    );
  }
  if (op.confirm) parts.push("Cloudflare flags this operation as one that asks for confirmation.");
  if (op.deprecated) parts.push("Cloudflare marks this operation deprecated.");
  if (op.stability && op.stability !== "stable") {
    parts.push(`Cloudflare documents this API as ${op.stability}.`);
  }
  if (op.body?.required === true && op.body.kind === "object") {
    parts.push("The request body is required.");
  }
  return parts.join(" ");
}

/**
 * The input schema: every declared argument, in snake_case, alphabetically (the
 * order the rest of the catalog uses), with the spec's type.
 *
 * Two names can only collide when one operation declares the same word twice -
 * a body field and a query filter, say - and that would silently make one of
 * them unreachable, so it is reported rather than merged.
 */
function inputSchemaOf(entry) {
  const op = entry.op;
  const properties = {};
  const required = new Set();
  const collisions = [];
  // A reviewed drop: the operation's body declares a field the caller cannot
  // meaningfully send (a duplicate of the path's own identifier), so it is not
  // exposed and the collision it would cause never happens.
  const droppedBodyFields = new Set(entry.dropBodyFields ?? []);
  // A reviewed `rawBody` tool takes the payload as a single string: the spec
  // publishes no field list, so there is nothing to name. It is declared before
  // the groups below so a path or query parameter that happened to be called
  // `body` is reported as the collision it is instead of being swallowed.
  if (entry.rawBody === true) {
    properties.body = {
      description: `The request body, sent verbatim with content type ${op.body.contentType}.`,
      type: "string",
    };
    required.add("body");
  }
  const groups = [
    { label: "Path parameter", items: op.pathParams },
    { label: "Query parameter", items: op.queryParams },
    {
      label: "Body field",
      items: (op.body?.kind === "object" ? op.body.fields : []).filter(
        (field) => !droppedBodyFields.has(field.name),
      ),
    },
  ];
  for (const group of groups) {
    for (const item of group.items) {
      if (properties[item.snake]) {
        collisions.push(`${item.snake} (${group.label.toLowerCase()} ${item.name})`);
        continue;
      }
      const condensed = catalogSchema(item.schema);
      const described = `${group.label} ${item.name}.`;
      properties[item.snake] = {
        ...condensed,
        // A handful of Cloudflare fields (`value` of a zone setting) are typed
        // per-setting, so the spec declares no type at all. Saying so is better
        // than a property that silently accepts anything.
        description:
          condensed.type === undefined && condensed.anyOf === undefined
            ? `${described} The spec does not declare its type, so any JSON value is accepted.`
            : described,
      };
      if (item.required) required.add(item.snake);
    }
  }

  const sorted = {};
  for (const name of Object.keys(properties).sort()) sorted[name] = properties[name];
  return {
    collisions,
    schema: {
      additionalProperties: op.body?.kind === "free-form",
      properties: sorted,
      ...(required.size > 0 ? { required: [...required].sort() } : {}),
      type: "object",
    },
  };
}

/**
 * The spec's schema, reduced to what `jsonSchemaToZodObject` reads.
 *
 * A nullable field is spelled `["integer", "null"]`, which is how the rest of
 * the catalog spells one and what the Zod bridge turns back into a nullable
 * schema. Everything else (formats, bounds, examples) is dropped: the bridge
 * ignores it, and keeping it would bloat the file with values nothing reads.
 */
function catalogSchema(schema, { depth = 0 } = {}) {
  const out = {};
  if (schema.type !== undefined) out.type = schema.type;
  if (schema.nullable === true && typeof out.type === "string") {
    out.type = [out.type, "null"];
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) out.enum = schema.enum;
  if (schema.default !== undefined) out.default = schema.default;
  if (out.type === "array" || schema.items) {
    out.type = "array";
    out.items = depth < 4 ? catalogSchema(schema.items ?? {}, { depth: depth + 1 }) : {};
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0 && depth < 4) {
    delete out.type;
    out.anyOf = schema.anyOf.map((option) => catalogSchema(option, { depth: depth + 1 }));
  }
  const properties = schema.properties ?? {};
  if (out.type === "object" || Object.keys(properties).length > 0) {
    out.type = "object";
    const mapped = {};
    for (const [name, property] of Object.entries(properties)) {
      mapped[name] = depth < 4 ? catalogSchema(property, { depth: depth + 1 }) : {};
    }
    out.properties = mapped;
    out.required = Array.isArray(schema.required) ? schema.required : [];
    out.additionalProperties = schema.additionalProperties === false ? false : true;
  }
  return out;
}

/** Cloudflare's API version, which is what the `/client/v4` base in every route says. */
const CATALOG_VERSION = "v4";

const problems = [];
const tools = allowlist.entries.map((entry) => {
  const { schema, collisions } = inputSchemaOf(entry);
  for (const collision of collisions) {
    problems.push(`${entry.toolSlug}: two arguments collapse to "${collision}"`);
  }
  const title = titleOf(entry.op);
  const description = descriptionOf(entry);
  if (description.length <= 10) {
    problems.push(`${entry.toolSlug}: description is too short to be useful`);
  }
  return {
    toolSlug: entry.toolSlug,
    name: entry.toolSlug.replace(/^cloudflare_/, ""),
    title,
    description,
    toolkitId: "cloudflare",
    version: CATALOG_VERSION,
    inputSchema: schema,
    outputSchema: { additionalProperties: true, type: "object" },
    annotations: {
      title,
      readOnlyHint: entry.op.method === "GET",
      // A GET, a PUT and a DELETE reach the same state whether they run once or
      // five times; a POST and a PATCH do not.
      idempotentHint: ["GET", "PUT", "DELETE"].includes(entry.op.method),
      openWorldHint: true,
      // Must match `src/providers/destructive.ts` exactly: providers.test.ts
      // asserts the registered annotation equals membership in that set.
      destructiveHint: entry.destructive === true,
    },
  };
});

if (problems.length > 0) {
  console.error(`${problems.length} problem(s) building the catalog:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const document = {
  version: 1,
  provider: "cloudflare",
  source: "warpmetal-providers",
  extractedAt: allowlist.document.extractedAt,
  spec: {
    title: spec.info.title ?? "",
    version: spec.info.version ?? "",
    operations: spec.counts.operations,
    reviewable: spec.counts.reviewable,
    sha256: spec.sha256,
  },
  tools,
};

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
    console.error("re-run: node packages/skills-mcp/scripts/gen-cloudflare-catalog.mjs");
    process.exit(1);
  }
  console.log("the cloudflare catalog is up to date");
  process.exit(0);
}

writeFileSync(outFile, serialized);
console.log(`wrote ${tools.length} cloudflare tool(s) to ${outFile}`);

