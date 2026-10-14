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
    if (op.body?.kind === "unsupported") {
      problems.push(`${where}: its request body is ${op.body.contentType}, which has no field list to expose`);
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
