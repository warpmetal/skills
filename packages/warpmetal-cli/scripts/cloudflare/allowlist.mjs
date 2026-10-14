/**
 * The reviewed Cloudflare tool decisions.
 *
 * `allowlist.json` is the artifact a human reviews; the generators only obey it.
 * Every tool the MCP surface gains is one line here, with the reason it was
 * chosen, and anything the generators cannot express (a deliberate rename, a
 * body whose fields the spec does not publish, an operation the spec hides but
 * that is already shipped) has to be said out loud in the same line.
 *
 * The validator is the part that matters. It refuses to let the inventory be
 * built from a name that disagrees with the path, a tool for an operation that
 * is not in the spec, an omitted reason, or a free-form body nobody reviewed -
 * each of which would otherwise be discovered by a caller rather than by CI.
 */
import { readFileSync } from "node:fs";

import { opKey } from "./spec.mjs";

export const AUTH_API_TOKEN = "api-token";
export const AUTH_NONE = "none";

const SLUG = /^cloudflare_[a-z0-9]+(_[a-z0-9]+)*$/;

/**
 * Content types a reviewed `rawBody` tool may carry verbatim.
 *
 * Some operations publish no field list at all: the body is an array of records,
 * a newline-delimited stream, or a plain-text query. The tool then exposes one
 * `body` string argument and the builder sends it unchanged, with the content
 * type the spec declares.
 *
 * A binary or multipart body is deliberately absent. A JSON argument cannot
 * carry bytes, and giving the surface an encoding it does not have would be a
 * second, unstated protocol; those operations stay out of the allowlist instead,
 * which the validator enforces with the message below.
 */
const RAW_BODY_TYPES = new Set(["application/json", "application/x-ndjson", "text/plain"]);

/**
 * Content types the generated builder can send as JSON.
 *
 * Every declared body is serialized by `JSON.stringify` under
 * `application/json`, so an operation whose body is `multipart/form-data` or
 * `application/x-www-form-urlencoded` cannot travel through it at all: the
 * fields would arrive mis-encoded. Such an operation is either shipped as a
 * reviewed `rawBody` (when the payload is text) or left out.
 */
function jsonType(contentType) {
  return contentType === "application/json" || String(contentType).endsWith("+json");
}

/** Whether a reviewed `rawBody` can carry this payload as text. */
function rawBodyType(contentType) {
  return RAW_BODY_TYPES.has(contentType) || String(contentType).endsWith("+json");
}

function reason(entry) {
  const text = entry.reason;
  return typeof text === "string" && text.trim().length >= 12;
}

/**
 * Reads and validates the allowlist against the spec.
 *
 * Returns `problems` (fatal: the inventory and the generators must not run) and
 * `warnings` (reported in the docs: a deprecated operation, a rename, a
 * confirmation gate). Both are strings a reader can act on.
 */
export function loadAllowlist(path, spec, file) {
  const document = file ?? JSON.parse(readFileSync(path, "utf8"));
  const problems = [];
  const warnings = [];
  const entries = [];
  const seen = new Set();

  if (document.version !== 1) {
    problems.push(`allowlist: version must be 1, found ${String(document.version)}`);
  }
  // The digest is the only tie between the reviewed decisions and the document
  // they were made against. `spec.mjs` hashes the file it parsed, so a spec that
  // moved under the allowlist - a renamed field, a new required parameter, an
  // operation that now means something else - is caught here rather than by a
  // caller of the shipped tool.
  const expectedDigest = document.spec?.sha256;
  if (
    typeof expectedDigest === "string" &&
    typeof spec.sha256 === "string" &&
    expectedDigest !== spec.sha256
  ) {
    problems.push(
      `allowlist: spec.sha256 is ${expectedDigest} but the loaded document hashes to ${spec.sha256}; ` +
        "the reviewed decisions were made against a different Cloudflare document",
    );
  }
  const waves = new Set(Object.keys(document.waves ?? {}));
  if (waves.size === 0) problems.push("allowlist: no waves declared");

  for (const entry of document.tools ?? []) {
    const where = entry.toolSlug ?? `${entry.method ?? "?"} ${entry.path ?? "?"}`;
    if (typeof entry.toolSlug !== "string" || !SLUG.test(entry.toolSlug)) {
      problems.push(`${where}: toolSlug must look like cloudflare_<module>_<verb>`);
      continue;
    }
    if (seen.has(entry.toolSlug)) {
      problems.push(`${where}: duplicate toolSlug`);
      continue;
    }
    seen.add(entry.toolSlug);

    const op = spec.byKey.get(opKey(entry.method, entry.path));
    if (!op) {
      problems.push(`${where}: ${String(entry.method)} ${String(entry.path)} is not an operation in the spec`);
      continue;
    }
    if (!reason(entry)) problems.push(`${where}: needs a reason (at least 12 characters)`);
    if (!waves.has(entry.wave)) problems.push(`${where}: wave "${String(entry.wave)}" is not declared`);
    if (entry.auth !== AUTH_NONE && entry.auth !== AUTH_API_TOKEN) {
      problems.push(`${where}: auth must be "${AUTH_API_TOKEN}" or "${AUTH_NONE}"`);
    }
    if (entry.auth === AUTH_NONE && !op.publicHint && !reason({ reason: entry.authNote })) {
      problems.push(
        `${where}: auth "none" on an operation the spec does not mark public needs an authNote`,
      );
    }
    if (typeof entry.destructive !== "boolean") {
      problems.push(`${where}: destructive must be true or false`);
    } else if (entry.destructive && op.method === "GET") {
      problems.push(`${where}: a GET cannot be destructive`);
    }
    if (op.filtered && entry.keepFiltered !== true) {
      problems.push(
        `${where}: ${op.hidden ? "x-forge-hidden" : "x-fern-ignore"} operation; add keepFiltered: true to include it deliberately`,
      );
    }
    if (entry.rawBody !== undefined && typeof entry.rawBody !== "boolean") {
      problems.push(`${where}: rawBody must be true or false`);
    }
    const contentType = op.body?.contentType ?? null;
    if (op.body?.kind === "unsupported") {
      if (entry.rawBody !== true) {
        problems.push(
          `${where}: its request body is ${contentType}, which has no field list to expose; ` +
            "add rawBody: true to send it verbatim as a string",
        );
      } else if (!rawBodyType(contentType)) {
        problems.push(
          `${where}: its request body is ${contentType}, which a JSON argument cannot carry; ` +
            "leave the operation out of the allowlist",
        );
      }
    } else if (op.body && !jsonType(contentType)) {
      // A declared body (object or free-form) that is not JSON. The builder
      // serializes every declared body with `JSON.stringify` under
      // `application/json`, so these fields would reach Cloudflare mis-encoded.
      problems.push(
        `${where}: its request body is ${contentType}, which the JSON builder cannot send` +
          (entry.rawBody === true
            ? "; a multipart or form payload is not text a JSON argument can carry"
            : "; leave the operation out of the allowlist"),
      );
    } else if (entry.rawBody === true) {
      problems.push(
        `${where}: rawBody only applies to a body the spec does not publish as fields (this one is ${op.body?.kind ?? "none"})`,
      );
    }
    if (op.body?.kind === "free-form" && entry.freeFormBody !== true) {
      problems.push(`${where}: the spec does not name its body fields; add freeFormBody: true to forward them`);
    }
    if (entry.toolSlug !== op.toolSlug && entry.override !== true) {
      problems.push(
        `${where}: the path derives "${op.toolSlug}"; add override: true to pin a different name`,
      );
    }
    if (entry.toolSlug === op.toolSlug && entry.override === true) {
      warnings.push(`${where}: override is set but the name matches the path's derivation`);
    }
    if (op.deprecated) warnings.push(`${where}: the spec marks this operation deprecated`);
    if (entry.confirmGate !== true && op.confirm && op.method !== "GET" && entry.destructive !== true) {
      warnings.push(`${where}: Cloudflare marks this operation as confirmation-worthy`);
    }
    entries.push({ ...entry, op });
  }

  const declared = new Set(entries.map((entry) => entry.toolSlug));
  for (const slug of document.retired ?? []) {
    if (declared.has(slug)) problems.push(`${slug}: both retired and included`);
  }

  return {
    document,
    entries,
    bySlug: new Map(entries.map((entry) => [entry.toolSlug, entry])),
    problems,
    warnings,
    waves,
  };
}
