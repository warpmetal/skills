/**
 * approval.ts - the two-phase approval broker.
 *
 * A mutation is never launched from a single call. The `_plan` tool mints a
 * token bound to the exact resolved argv; the `_apply` tool accepts only that
 * token, for that same effect, once. Three properties make it worth the
 * ceremony:
 *
 *   1. The token binds to the *resolved argv*, not to the raw arguments. A
 *      token minted for `--action restart` cannot be replayed as `--action
 *      stop`, because the hash covers the argv that will actually run,
 *      including the server-supplied `--confirm` constants.
 *   2. It is single-use. Burning happens on a *known* outcome only: a timeout
 *      or a failed spawn leaves the real-world effect unknown, so the token
 *      survives and the operator can settle the question deliberately. Burning
 *      it there would force a fresh approval for an action that may never have
 *      happened.
 *   3. The payload carries no flag values, only their hash. A token is
 *      therefore not a new channel through which a path, a hostname or a name
 *      could leak into a transcript.
 *
 * What this does *not* prove: that a human read the effect. The server cannot
 * verify that. The guarantee is "one approval, one exact effect, once", and the
 * `effect` text is what the model must relay before asking. That limit is
 * stated in the description of every `_plan` tool rather than hidden here.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Tokens are short-lived: long enough to read an effect and answer, no more. */
export const DEFAULT_APPROVAL_TTL_MS = 10 * 60 * 1000;

const TOKEN_VERSION = 1;
const DIGEST_ALGORITHM = "sha256";

/**
 * Per-process secret. Never persisted and never logged, so tokens die with the
 * server. That is the intended behaviour: the task registry is ephemeral too,
 * and a token that outlived its process would be a credential nobody rotates.
 */
const SECRET: Buffer = randomBytes(32);

/**
 * Canonical form of an effect: the exact resolved argv. Hashing the argv rather
 * than the raw arguments is what makes the cross-effect guard airtight, because
 * it includes the server-supplied `--confirm` constants and `--json`.
 */
export function canonicalEffect(argv: readonly string[]): string {
  return JSON.stringify(argv);
}

/**
 * The idempotency key a token would authorise, if the command takes one.
 * Derived from the nonce rather than stored, so the token payload still carries
 * no flag value, and a retry with the same token recomputes the same key
 * without either side having to persist it.
 */
export function idempotencyKeyFor(nonce: string): string {
  return `mcp-${nonce}`;
}

/**
 * The argv as it will actually run. Appending the key here, inside the digest,
 * is what makes it impossible to mint a token for one key and run another.
 *
 * `idempotent` is false for most commands, so this is a documented
 * pass-through: see `CLI_COMMANDS` in `exec.ts` for which commands a source
 * confirms the flag for. The wiring is kept because it is what turns
 * "one approval" into "one request" the day a command is marked.
 */
export function effectiveArgv(
  argv: readonly string[],
  nonce: string,
  idempotent: boolean,
): string[] {
  if (!idempotent || argv.includes("--idempotency-key")) {
    return [...argv];
  }
  return [...argv, "--idempotency-key", idempotencyKeyFor(nonce)];
}

export function hashEffect(argv: readonly string[]): string {
  return createHmac(DIGEST_ALGORITHM, SECRET).update(canonicalEffect(argv)).digest("hex");
}

interface TokenPayload {
  v: number;
  tool: string;
  subcommand: string;
  argsHash: string;
  nonce: string;
  iat: number;
  exp: number;
}

export interface MintInput {
  tool: string;
  subcommand: string;
  argv: readonly string[];
  effect: string;
  /** True when the command accepts `--idempotency-key`, so the key is bound in. */
  idempotent: boolean;
  ttlMs?: number;
  now?: number;
}

export interface MintedApproval {
  token: string;
  expiresAt: string;
  effect: string;
  nonce: string;
  /** The argv the effect was hashed over, with the key already appended. */
  argv: string[];
}

function sign(payload: string): string {
  return createHmac(DIGEST_ALGORITHM, SECRET).update(payload).digest("base64url");
}

function decodePayload(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [body, signature] = parts as [string, string];
  const expected = sign(body);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (parsed === null || typeof parsed !== "object") {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record["v"] !== "number" ||
      typeof record["tool"] !== "string" ||
      typeof record["subcommand"] !== "string" ||
      typeof record["argsHash"] !== "string" ||
      typeof record["nonce"] !== "string" ||
      typeof record["iat"] !== "number" ||
      typeof record["exp"] !== "number"
    ) {
      return null;
    }
    return {
      v: record["v"],
      tool: record["tool"],
      subcommand: record["subcommand"],
      argsHash: record["argsHash"],
      nonce: record["nonce"],
      iat: record["iat"],
      exp: record["exp"],
    };
  } catch {
    return null;
  }
}

/** Why an approval was refused. Recorded in the audit log as a bare enum. */
export type ApprovalRefusal =
  | "missing"
  | "invalid"
  | "expired"
  | "consumed"
  | "mismatch";

export type ApprovalVerification =
  | { ok: true; nonce: string; argv: string[] }
  | { ok: false; reason: ApprovalRefusal };

export class ApprovalStore {
  private readonly consumed = new Set<string>();

          mint(input: MintInput): MintedApproval {
            const now = input.now ?? Date.now();
            const ttl = input.ttlMs ?? DEFAULT_APPROVAL_TTL_MS;
            const nonce = randomBytes(16).toString("hex");
            // The nonce exists before the digest, so the key it implies can be
            // part of the digest. That ordering is the whole trick: the token
            // authorises an effect that includes the key, and the apply
            // recomputes the same key from the nonce it just verified.
            const argv = effectiveArgv(input.argv, nonce, input.idempotent);
            const payload: TokenPayload = {
              v: TOKEN_VERSION,
              tool: input.tool,
              subcommand: input.subcommand,
              argsHash: hashEffect(argv),
              nonce,
              iat: now,
              exp: now + ttl,
            };
            const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
            return {
              token: `${body}.${sign(body)}`,
              expiresAt: new Date(payload.exp).toISOString(),
              effect: input.effect,
              nonce,
              argv,
            };
          }

  /**
   * Checks signature, version, window, consumption and effect match. Does not
   * consume: consumption is a separate, deliberate step so the caller can
   * decide based on whether the outcome was known.
   *
   * The caller passes the argv *without* an idempotency key; this recomputes the
   * key from the token's own nonce and hashes the effective argv. That is what
   * lets a retry of the same token reach the API as the same request.
   */
  verify(
    token: string | undefined,
    expected: { tool: string; subcommand: string; argv: readonly string[]; idempotent: boolean },
    now: number = Date.now(),
  ): ApprovalVerification {
    if (token === undefined || token.length === 0) {
      return { ok: false, reason: "missing" };
    }
    const payload = decodePayload(token);
    if (payload === null || payload.v !== TOKEN_VERSION) {
      return { ok: false, reason: "invalid" };
    }
    if (payload.exp <= now) {
      return { ok: false, reason: "expired" };
    }
    if (this.consumed.has(payload.nonce)) {
      return { ok: false, reason: "consumed" };
    }
    if (payload.tool !== expected.tool || payload.subcommand !== expected.subcommand) {
      return { ok: false, reason: "mismatch" };
    }
    // The cross-effect guard: same tool, different resolved argv.
    const argv = effectiveArgv(expected.argv, payload.nonce, expected.idempotent);
    if (payload.argsHash !== hashEffect(argv)) {
      return { ok: false, reason: "mismatch" };
    }
    return { ok: true, nonce: payload.nonce, argv };
  }

  /** Burns the token so it can never authorise a second effect. */
  consume(nonce: string): void {
    this.consumed.add(nonce);
  }

  /** Only for tests and diagnostics; the count is not a secret. */
  get consumedCount(): number {
    return this.consumed.size;
  }
}
