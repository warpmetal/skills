/**
 * audit.ts - redaction and the append-only audit trail.
 *
 * The audit log is the most likely place for a secret to leak, because it is
 * written automatically on every call. Two rules keep it honest:
 *
 *   1. Values are never written. The log records the tool, the subcommand (a
 *      constant from the closed registry), the exit code, the status, the
 *      duration, and the *names* of the fields that were redacted.
 *   2. A redaction is never silent. Every field that gets scrubbed is reported
 *      back in `redacted[]` of the result, so a caller can tell the difference
 *      between "nothing sensitive here" and "we hid something".
 */
import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { WmStatus } from "./result.js";
import { CONSEQUENCE_CLASSES } from "./schemas.js";

const PLACEHOLDER = "[REDACTED]";
/** Distinct from `PLACEHOLDER` on purpose: a path is not a credential, and the two must stay tellable apart. */
const PATH_PLACEHOLDER = "[REDACTED:path]";

/**
 * Field names that never carry a usable value into a client.
 *
 * Two matchers, because a single rule cannot be both safe and useful here:
 *
 *   - EXACT, after normalisation, so `accessToken`, `access_token` and
 *     `access-token` all match, while `credentialStored` and
 *     `accessTokenExpiresAt` (a presence boolean and a timestamp) survive.
 *   - SUBSTRING, only for fragments that are unambiguous on their own. This is
 *     what catches `privateKeyPath` and `publicKeyPath` neighbours such as
 *     `privateKeyFilename`, which an exact matcher would let through.
 */
const DENY_KEY_EXACT: ReadonlySet<string> = new Set([
  "token",
  "accesstoken",
  "ownertoken",
  "refreshtoken",
  "idtoken",
  "nodetoken",
  "sessiontoken",
  "managementtoken",
  "apikey",
  "authorization",
  "bootstrap",
  "runtimebootstrap",
  "challengehandle",
  "handle",
  "seed",
  "mnemonic",
  "privatekey",
  "password",
  "passphrase",
  "secret",
  "clientsecret",
  "keystore",
  "artifact",
  "paymentartifact",
  "requestenvelope",
  "signature",
  "credential",
  "credentials",
]);

const DENY_KEY_SUBSTRING: readonly string[] = [
  "privatekey",
  "seedphrase",
  "mnemonic",
  "passphrase",
  "clientsecret",
  "keystore",
];

/**
 * Absolute-path shapes, matched against the **whole** value.
 *
 * Key names alone are not a policy: a rename from `privateKeyPath` to
 * `sshIdentityPath` would otherwise walk straight past the deny list above.
 * A value is treated as a path only when the entire string is one, so a
 * sentence that happens to mention a directory stays readable, and a URL is
 * never a path even when its path component looks like one.
 */
const ABSOLUTE_PATH_PATTERNS: readonly RegExp[] = [
  /^[A-Za-z]:[\\/](?:[^\\/\0]+[\\/])*[^\\/\0]*$/, // C:\dir\file
  /^\\\\[^\\/\0]+[\\/][^\0]*$/, // \\host\share\file
  /^~[\\/][^\0]*$/, // ~/dir/file
  /^\/(?:[^/\0]+\/)*[^/\0]*$/, // /dir/file
];

const URL_PREFIX = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * True when the whole string is an absolute filesystem path.
 *
 * Relative paths are deliberately not classified: `keys/id_ed25519` is
 * indistinguishable from an ordinary identifier, and redacting it would make
 * legitimate values unreadable without closing a real gap.
 */
export function isAbsolutePath(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 4096) return false;
  if (URL_PREFIX.test(trimmed)) return false;
  return ABSOLUTE_PATH_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isDeniedKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (DENY_KEY_EXACT.has(normalized)) {
    return true;
  }
  return DENY_KEY_SUBSTRING.some((fragment) => normalized.includes(fragment));
}

/**
 * `humanCheckout.url` and `humanCheckout.qrPayload` are expiring bearer
 * capabilities: whoever holds the URL can authorise the charge. They are
 * handled by path, not by key name, so an unrelated `url` stays untouched.
 */
const BEARER_PATH_PATTERN = /(^|\.)humanCheckout\.(url|qrPayload)$/;

interface ScrubPattern {
  readonly kind: string;
  readonly pattern: RegExp;
}

const SCRUB_PATTERNS: readonly ScrubPattern[] = [
  {
    // Home-rooted locations only. The point is the leak that matters - an
    // identity or config path under a user's home - without turning every
    // `/api/v1/...` route inside an error message into noise.
    kind: "home-path",
    pattern: /(?:[A-Za-z]:[\\/]Users[\\/]|\/(?:home|Users)\/|\/root[\\/])[^\s"',;:)\]]*/g,
  },
  {
    kind: "private-key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { kind: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g },
  { kind: "slack-token", pattern: /\bxox[bapr]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "aws-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "long-base64", pattern: /[A-Za-z0-9+/]{200,}={0,2}/g },
];

export interface ScrubResult {
  text: string;
  kinds: string[];
}

/** Replaces secret-shaped substrings inside a single string. */
export function scrubText(text: string): ScrubResult {
  let output = text;
  const kinds: string[] = [];
  for (const { kind, pattern } of SCRUB_PATTERNS) {
    const before = output;
    output = output.replace(pattern, `[REDACTED:${kind}]`);
    if (output !== before) {
      kinds.push(kind);
    }
  }
  return { text: output, kinds };
}

export interface RedactionOutcome {
  value: unknown;
  /** Dotted paths of everything that was scrubbed. Names only, never values. */
  redacted: string[];
}

function isBearerPath(pathLabel: string): boolean {
  return BEARER_PATH_PATTERN.test(pathLabel);
}

function walk(value: unknown, pathLabel: string, sink: string[]): unknown {
  if (typeof value === "string") {
    const scrubbed = scrubText(value);
    for (const kind of scrubbed.kinds) {
      sink.push(`${pathLabel} (${kind})`);
    }
    // A value that is *entirely* a filesystem path never reaches a client, even
    // under a key name this file has never heard of.
    if (isAbsolutePath(scrubbed.text)) {
      sink.push(`${pathLabel} (path)`);
      return PATH_PLACEHOLDER;
    }
    return scrubbed.text;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => walk(item, `${pathLabel}[${String(index)}]`, sink));
  }

  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(source)) {
      const childPath = `${pathLabel}.${key}`;
      if (isDeniedKey(key) || isBearerPath(childPath)) {
        output[key] = PLACEHOLDER;
        sink.push(childPath);
        continue;
      }
      output[key] = walk(child, childPath, sink);
    }
    return output;
  }

  return value;
}

/** Deep-copies `input`, redacting denied keys and secret-shaped values. */
export function redact(input: unknown): RedactionOutcome {
  const sink: string[] = [];
  const value = walk(input, "$", sink);
  return { value, redacted: sink };
}

export interface AuditRecord {
  ts: string;
  tool: string;
  subcommand: string;
  exit_code: number;
  status: WmStatus;
  duration_ms: number;
  redacted: string[];
  /**
   * How the approval gate resolved for this call. A bare enum, never a token:
   * the whole point of the field is to make refusals visible without making the
   * log a credential store.
   */
  approval: AuditApprovalState;
  /**
   * The consequence the call demanded, or `none`. This is what makes a refusal
   * auditable: it records that damage was on the table, not just that the tool
   * declined.
   */
  consequence: AuditConsequenceState;
  /** How the manual_review memory resolved: cleared, refused, or written. */
  latch: AuditLatchState;
}

export const AUDIT_APPROVAL_STATES = [
  "not_required",
  "granted",
  // The latch stopped the call before the token was ever looked at, so saying
  // "refused_missing" would blame the caller for a credential it may well have
  // held. This value only exists for that path.
  "not_attempted",
  "refused_missing",
  "refused_invalid",
  "refused_expired",
  "refused_consumed",
  "refused_mismatch",
] as const;

export type AuditApprovalState = (typeof AUDIT_APPROVAL_STATES)[number];

/**
 * What the consequence gate did. `none` is the honest answer for a tool that
 * declares no irreversible damage, and it is deliberately not the same value as
 * "the caller acknowledged nothing": one is a property of the action, the other
 * would be a gap in the record.
 */
export const AUDIT_CONSEQUENCE_STATES = ["none", ...CONSEQUENCE_CLASSES] as const;
export type AuditConsequenceState = (typeof AUDIT_CONSEQUENCE_STATES)[number];

/**
 * How the `manual_review` latch resolved for this call. It is recorded because
 * a refusal is the interesting event: without it, "the tool did nothing" and
 * "the tool was stopped by a memory of a terminal state" look identical.
 */
export const AUDIT_LATCH_STATES = ["not_checked", "clear", "refused", "recorded"] as const;
export type AuditLatchState = (typeof AUDIT_LATCH_STATES)[number];

export function auditEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["WARPMETAL_MCP_AUDIT"] !== "0";
}

export function resolveAuditDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env["WARPMETAL_MCP_AUDIT_DIR"];
  if (override !== undefined && override.length > 0) {
    return override;
  }
  const localAppData = env["LOCALAPPDATA"];
  if (process.platform === "win32" && localAppData !== undefined && localAppData.length > 0) {
    return path.join(localAppData, "warpmetal-mcp");
  }
  const xdgState = env["XDG_STATE_HOME"];
  if (xdgState !== undefined && xdgState.length > 0) {
    return path.join(xdgState, "warpmetal-mcp");
  }
  return path.join(homedir(), ".local", "state", "warpmetal-mcp");
}

export interface AuditOutcome {
  ok: boolean;
  path: string;
  error?: string;
}

/**
 * Appends one JSONL record. Never throws: a failing audit log degrades the
 * call visibly (the caller adds a warning) instead of breaking the tool.
 * No argv and no flag values are written, so there is nothing to route around.
 */
export function appendAudit(record: AuditRecord, dir: string): AuditOutcome {
  const file = path.join(dir, "audit.jsonl");
  try {
    // `mode` only applies when the directory is created, so the chmod narrows
    // one left at 0755 by an earlier version. Both steps are best-effort:
    // Windows expresses permissions as ACLs, and a directory this process
    // cannot chmod must still receive its audit line.
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(dir, 0o700);
    } catch {
      // A read-only or foreign-owned directory is reported by the caller's
      // warning path, not by losing the log entry.
    }
    appendFileSync(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    return { ok: true, path: file };
  } catch (error) {
    return {
      ok: false,
      path: file,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
