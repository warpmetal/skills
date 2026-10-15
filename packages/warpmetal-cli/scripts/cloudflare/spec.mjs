/**
 * The Cloudflare API spec, normalized for the generators.
 *
 * `openapi.json` (27 MB, Cloudflare's single public OpenAPI document) is
 * scratch: it is not committed, so this module reads it from a path and the
 * artifacts built from it are what gets reviewed. It is the *one* reading of
 * that document - the route, catalog and inventory generators all consume these
 * records, so the three cannot disagree about what an operation says.
 *
 * Two decisions live here rather than in each generator:
 *
 *  - A tool is named after its path, not after `operationId`. Cloudflare's
 *    `operationId`s are not a naming source a reviewer can defend
 *    (`zones-get`, `dns-records-for-a-zone-list-dns-records`,
 *    `account-api-tokens-list-tokens`), so `deriveToolSlug` proposes
 *    `cloudflare_<module>_<verb>` and the reviewed allowlist pins the final
 *    name. A proposal and a reviewed name may differ only behind an explicit
 *    `override` in the allowlist, which keeps a rename a reviewed decision.
 *  - An argument keeps the spec's name in snake_case (`account.id` ->
 *    `account_id`, `name.exact` -> `name_exact`) and the mapping back to the
 *    wire name is recorded per tool, so the schema is snake_case while the
 *    query string stays `account.id`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const API_ORIGIN = "https://api.cloudflare.com/client/v4";

/** The HTTP methods the MCP surface supports; anything else is out of scope. */
export const METHODS = ["get", "post", "put", "patch", "delete"];

/** How deep a `$ref`/`allOf` chain is followed before it counts as cyclic. */
const MAX_DEPTH = 8;

/**
 * Segments that name an action rather than a resource. `POST
 * /zones/{zone_id}/dns_records/batch` is not "create a dns_records_batch
 * collection", it is the batch action, and `cloudflare_dns_records_batch` says
 * so; without this list the tool would be called
 * `cloudflare_dns_records_batch_create` and a reader would look for a
 * collection that does not exist. The word has to be the last path segment, so
 * `/zones/{zone_id}/purge_cache` is an action while `/accounts/{account_id}/r2/
 * buckets/{bucket_name}` (a `PUT` whose last segment is a parameter) is not.
 */
const ACTION_TOKENS = new Set([
  "activate",
  "batch",
  "check",
  "copy",
  "deactivate",
  "disable",
  "download",
  "enable",
  "execute",
  "export",
  "import",
  "move",
  "preview",
  "purge",
  "purge_cache",
  "query",
  "refresh",
  "reload",
  "reset",
  "restart",
  "restore",
  "resume",
  "revoke",
  "rollback",
  "rotate",
  "run",
  "scan",
  "search",
  "suspend",
  "test",
  "topup",
  "trigger",
  "upload",
  "validate",
  "verify",
]);

/** `account.id` -> `account_id`, `includeShadowMetadata` -> `include_shadow_metadata`. */
export function snakeCase(name) {
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[.\-\s]+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

function isParamSegment(segment) {
  return typeof segment === "string" && /^\{[^}]+\}$/.test(segment);
}

function paramName(segment) {
  return snakeCase(segment.slice(1, -1));
}

function normalizeSegment(segment) {
  return isParamSegment(segment) ? paramName(segment) : segment.replace(/[.\-]/g, "_");
}

/** Walks a local JSON pointer (`#/components/parameters/x`). */
function pointer(root, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return undefined;
  let node = root;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object") return undefined;
    node = node[key];
  }
  return node;
}

/**
 * Merges object union branches into one property list.
 *
 * A field present in several branches keeps the first branch's schema; when two
 * branches disagree about its type both are kept as `anyOf`, so a record whose
 * `content` is a string in one branch and an object in another is still
 * described. Only the fields *every* branch requires stay required: a field one
 * branch demands and another rejects cannot be demanded of the caller.
 */
function mergeUnionBranches(branches) {
  const objects = branches.filter(
    (branch) =>
      branch && typeof branch === "object" && (branch.type === "object" || branch.properties),
  );
  if (objects.length === 0 || objects.length !== branches.length) return null;
  const properties = {};
  let common = null;
  for (const branch of objects) {
    for (const [name, schema] of Object.entries(branch.properties ?? {})) {
      const existing = properties[name];
      if (existing === undefined) {
        properties[name] = schema;
        continue;
      }
      if (existing.type === schema.type) continue;
      const options = [...(existing.anyOf ?? [existing]), ...(schema.anyOf ?? [schema])];
      const deduped = [];
      for (const option of options) {
        if (!deduped.some((seen) => JSON.stringify(seen) === JSON.stringify(option))) {
          deduped.push(option);
        }
      }
      const replacement = { ...existing, anyOf: deduped };
      delete replacement.type;
      properties[name] = replacement;
    }
    const required = new Set(branch.required ?? []);
    common = common === null ? required : new Set([...common].filter((name) => required.has(name)));
  }
  return {
    type: "object",
    properties,
    ...(common && common.size > 0 ? { required: [...common] } : {}),
  };
}

/**
 * Inlines `$ref` and `allOf` until the schema is plain JSON.
 *
 * A `$ref` already on the current branch (a recursive schema) or a chain longer
 * than `MAX_DEPTH` collapses to an open object: the alternative is an unbounded
 * walk of a 27 MB document, and a request field that recurses is an object the
 * caller can still send.
 */
export function resolveSchema(node, root, depth = 0, seen = new Set()) {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return {};

  if (typeof node.$ref === "string") {
    if (seen.has(node.$ref) || depth >= MAX_DEPTH) {
      return { type: "object", additionalProperties: true };
    }
    const target = pointer(root, node.$ref);
    if (target === undefined) return {};
    const next = new Set(seen);
    next.add(node.$ref);
    return resolveSchema(target, root, depth + 1, next);
  }

  const merged = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "allOf" || key === "$ref") continue;
    merged[key] = value;
  }

  // A union becomes one flat object when every branch is an object: the
  // DNS-record create body is an `anyOf` over `without-data`/`with-data`, and
  // each of those is a `oneOf` over the record types, so the field list a caller
  // needs only exists after the merge. A union with a non-object branch keeps
  // its `anyOf`, which `jsonSchemaToZodObject` already understands.
  const unionKey =
    Array.isArray(node.anyOf) && node.anyOf.length > 0
      ? "anyOf"
      : Array.isArray(node.oneOf) && node.oneOf.length > 0
        ? "oneOf"
        : null;
  if (unionKey) {
    const mergedUnion = mergeUnionBranches(
      node[unionKey].map((branch) => resolveSchema(branch, root, depth + 1, seen)),
    );
    if (mergedUnion) {
      delete merged.anyOf;
      delete merged.oneOf;
      merged.type = "object";
      merged.properties = { ...mergedUnion.properties, ...(merged.properties ?? {}) };
      if (mergedUnion.required) merged.required = mergedUnion.required;
      return merged;
    }
  }

  if (Array.isArray(node.allOf) && node.allOf.length > 0) {
    const properties = {};
    const required = new Set(Array.isArray(merged.required) ? merged.required : []);
    for (const part of node.allOf) {
      const resolved = resolveSchema(part, root, depth + 1, seen);
      if (resolved.properties) Object.assign(properties, resolved.properties);
      for (const name of resolved.required ?? []) required.add(name);
      for (const [key, value] of Object.entries(resolved)) {
        if (key === "properties" || key === "required" || key === "allOf") continue;
        if (merged[key] === undefined) merged[key] = value;
      }
    }
    if (Object.keys(properties).length > 0 || merged.type === "object") {
      merged.type = merged.type ?? "object";
      merged.properties = { ...properties, ...(merged.properties ?? {}) };
    }
    if (required.size > 0) merged.required = [...required];
  }

  return merged;
}

/** The path's own shape, which is what a tool name is derived from. */
export function pathShape(path) {
  const segments = String(path).split("/").filter(Boolean);
  const scope = segments[0] ?? "";
  const hasScopeId = isParamSegment(segments[1]);
  // When there is no scope id the scope segment stays part of the module:
  // `/user/tokens` must not derive the same name as `/accounts/{account_id}/tokens`.
  const rest = hasScopeId ? segments.slice(2) : segments;
  const last = rest[rest.length - 1];
  // An item is a path that ends in an id (`/user/tokens/{token_id}`), or one
  // whose only remaining segment is the scope's own id (`/accounts/{account_id}`
  // addresses the account), so its name says `get`/`delete` rather than `list`.
  const item = isParamSegment(last) || (hasScopeId && rest.length === 0);
  const moduleSegments = isParamSegment(last) ? rest.slice(0, -1) : rest;
  const tail = moduleSegments[moduleSegments.length - 1];
  const itemParam = !item
    ? null
    : isParamSegment(last)
      ? paramName(last)
      : paramName(segments[1]);
  return {
    scope,
    scopeParam: hasScopeId ? paramName(segments[1]) : null,
    item,
    itemParam,
    module: moduleSegments.length > 0 ? moduleSegments.map(normalizeSegment).join("_") : scope,
    // Any word of the last segment can carry the action: `purge_cache` and
    // `activation_check` are actions, `dns_records` is a collection.
    action: Boolean(
      tail &&
        tail
          .split("_")
          .some((word) => ACTION_TOKENS.has(word)),
    ),
  };
}



/** The proposed toolSlug for an operation; the allowlist may pin another. */
export function deriveToolSlug(method, path) {
  const shape = pathShape(path);
  const base = `cloudflare_${shape.module}`;
  if (shape.action) return base;
  switch (String(method).toUpperCase()) {
    case "GET":
      return `${base}_${shape.item ? "get" : "list"}`;
    case "POST":
      return `${base}_create`;
    case "PUT":
      return `${base}_${shape.item ? "replace" : "put"}`;
    case "PATCH":
      return `${base}_${shape.item ? "update" : "patch"}`;
    case "DELETE":
      return `${base}_delete`;
    default:
      return base;
  }
}

/**
 * How an array travels on the query string. OpenAPI's default for a query array
 * is `form`/`explode: true`, which repeats the key; `explode: false` joins with
 * commas. `qs` joins with commas, so the two cases need different builders.
 */
function collectionOf(parameter, schema) {
  if ((schema.type ?? parameter.type) !== "array") return null;
  const explode = parameter.explode ?? schema.explode;
  const style = parameter.style ?? schema.style;
  if (style === "pipeDelimited" || style === "spaceDelimited") return "csv";
  return explode === false ? "csv" : "multi";
}

function parameterRecord(parameter, root) {
  const schema = resolveSchema(parameter.schema ?? {}, root);
  return {
    name: parameter.name,
    snake: snakeCase(parameter.name),
    in: parameter.in,
    required: parameter.required === true || parameter.in === "path",
    collection: collectionOf(parameter, schema),
    schema,
  };
}

/** Path-item parameters and operation parameters, with the operation winning. */
function parametersOf(item, op, root) {
  const byKey = new Map();
  for (const parameter of [...(item.parameters ?? []), ...(op.parameters ?? [])]) {
    const resolved = typeof parameter.$ref === "string" ? pointer(root, parameter.$ref) : parameter;
    if (!resolved || resolved.in === "header" || resolved.in === "cookie") continue;
    byKey.set(`${resolved.in}:${resolved.name}`, parameterRecord(resolved, root));
  }
  return [...byKey.values()];
}

/**
 * The request body, flattened to its top-level properties.
 *
 * Only a JSON object body becomes a schema: a body that is an array, a string
 * or `multipart/form-data` has no field list to expose, so it is reported as
 * `unsupported` rather than pretended into an argument list. A JSON object with
 * no declared properties is `free-form`: the caller's fields cannot be named,
 * so the whole args object is forwarded (recorded per tool, reviewed).
 */
function bodyOf(op, root) {
  const requestBody = op.requestBody;
  if (!requestBody || typeof requestBody !== "object") return null;
  const dereferenced =
    typeof requestBody.$ref === "string" ? (pointer(root, requestBody.$ref) ?? {}) : requestBody;
  const content = resolveSchema(dereferenced, root).content ?? {};
  const preferred =
    content["application/json"] ??
    content["application/x-www-form-urlencoded"] ??
    (Object.keys(content).length === 1 ? Object.values(content)[0] : undefined);
  if (!preferred) return null;
  const contentType = content["application/json"]
    ? "application/json"
    : content["application/x-www-form-urlencoded"]
      ? "application/x-www-form-urlencoded"
      : Object.keys(content)[0];
  const schema = resolveSchema(preferred.schema ?? {}, root);
  const required = new Set(schema.required ?? []);
  const properties = schema.properties ?? {};
  const freeForm = Object.keys(properties).length === 0;
  return {
    contentType,
    required: dereferenced.required === true,
    kind: freeForm
      ? schema.type === "object" || schema.additionalProperties
        ? "free-form"
        : "unsupported"
      : "object",
    fields: Object.entries(properties).map(([name, property]) => ({
      name,
      snake: snakeCase(name),
      required: required.has(name),
      schema: resolveSchema(property, root),
    })),
  };
}

function tokenGroupsOf(op) {
  const raw = op["x-api-token-group"] ?? op["x-api-token-groups"] ?? [];
  return [...new Set((Array.isArray(raw) ? raw : [raw]).filter((value) => typeof value === "string"))];
}

function permissionsOf(op) {
  const raw = op["x-cfPermissionsRequired"];
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.enum)
      ? raw.enum
      : typeof raw.enum === "string"
        ? [raw.enum]
        : [];
  return [...new Set(list.filter((value) => typeof value === "string"))];
}


/**
 * Reads and normalizes the spec.
 *
 * `ops` keeps every documented operation, including the ones the filter drops,
 * because the inventory has to account for all of them: a reader asking "where
 * did the access endpoints go" gets an answer from the same file that lists
 * what was included.
 */
export function loadCloudflareSpec(specPath) {
  const text = readFileSync(specPath, "utf8");
  const spec = JSON.parse(text);
  const ops = [];

  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op || typeof op !== "object") continue;
      const parameters = parametersOf(item, op, spec);
      // A path placeholder with no declared parameter (a handful in this spec)
      // is still a required argument: the URL cannot be built without it.
      const declaredPath = new Set(
        parameters.filter((entry) => entry.in === "path").map((entry) => entry.snake),
      );
      for (const segment of String(path).split("/")) {
        if (!isParamSegment(segment)) continue;
        const name = paramName(segment);
        if (declaredPath.has(name)) continue;
        declaredPath.add(name);
        parameters.push({
          name,
          snake: name,
          in: "path",
          required: true,
          collection: null,
          schema: { type: "string" },
        });
      }
      const hidden = op["x-forge-hidden"] !== undefined;
      const fernIgnore = op["x-fern-ignore"] === true;
      ops.push({
        method: method.toUpperCase(),
        path,
        summary: op.summary ?? "",
        stability: op["x-stability"] ?? null,
        plan: op["x-cfPlanAvailability"] ?? null,
        confirm: op["x-forge-require-confirmation"] !== undefined,
        tokenGroups: tokenGroupsOf(op),
        permissions: permissionsOf(op),
        // `security: []` says "no credential", and the spec only says it for a
        // handful of operations; the allowlist still decides (Radar is public in
        // the docs but not marked). This is a hint, not a verdict.
        publicHint: Array.isArray(op.security) && op.security.length === 0,
        hidden,
        fernIgnore,
        // `x-cfDeprecation` is Cloudflare's own mark; `deprecated` is the
        // OpenAPI one. Both are reported, neither excludes by itself: a
        // deprecated operation can still be the only way to do something.
        cfDeprecation: op["x-cfDeprecation"] !== undefined,
        deprecated: Boolean(op["x-cfDeprecation"] ?? op.deprecated),
        // What a filter drops without review: hidden and Fern-ignored
        // operations are not part of the published surface at all.
        filtered: hidden || fernIgnore,
        shape: pathShape(path),
        toolSlug: deriveToolSlug(method, path),
        pathParams: parameters.filter((entry) => entry.in === "path"),
        queryParams: parameters.filter((entry) => entry.in === "query"),
        body: bodyOf(op, spec),
      });
    }
  }

  const counts = {
    paths: Object.keys(spec.paths ?? {}).length,
    operations: ops.length,
    hidden: ops.filter((op) => op.hidden).length,
    fernIgnore: ops.filter((op) => op.fernIgnore).length,
    cfDeprecation: ops.filter((op) => op.cfDeprecation).length,
    deprecated: ops.filter((op) => op.deprecated).length,
    filtered: ops.filter((op) => op.filtered).length,
    reviewable: ops.filter((op) => !op.filtered).length,
    publicHint: ops.filter((op) => op.publicHint).length,
    confirm: ops.filter((op) => op.confirm).length,
    unsupportedBody: ops.filter((op) => op.body?.kind === "unsupported").length,
    freeFormBody: ops.filter((op) => op.body?.kind === "free-form").length,
  };


  return {
    info: spec.info ?? {},
    servers: spec.servers ?? [],
    sha256: createHash("sha256").update(text, "utf8").digest("hex"),
    counts,
    ops,
    byKey: new Map(ops.map((op) => [`${op.method} ${op.path}`, op])),
  };
}

/** `GET /zones/{zone_id}/dns_records` -> the key both sides agree on. */
export function opKey(method, path) {
  return `${String(method).toUpperCase()} ${path}`;
}

/** The `group` an inventory row is filed under: scope, then first module word. */
export function groupOf(op) {
  const scope = op.path.split("/").filter(Boolean)[0] ?? "";
  const first = op.shape.module.split("_")[0] ?? "";
  return `${scope}/${first}`;
}




