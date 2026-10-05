/**
 * The credential store's contracts.
 *
 * Two layers, on purpose:
 *
 *  - `PayloadBackend` is a dumb, whole-payload read/write. Local backends
 *    (file, keychain) implement it directly, because that is genuinely how
 *    they persist - one sealed blob, one key material.
 *  - `SecretBackend` is the per-name contract the store actually consumes.
 *    A local payload backend is lifted onto it by `PayloadKeyAdapter`; a
 *    remote backend implements it natively so a single write never has to
 *    send every other secret to a server.
 *
 * All semantics that must not vary between backends - name validation,
 * generation counting, rotation bookkeeping - live in `store.ts` and in the
 * adapter, so swapping the backend can never change what a caller observes.
 */

/** What is persisted. Secrets are name -> value; names are dotted namespaces. */
export interface VaultPayload {
  /** Monotonic counter, bumped by `env store rotate`. */
  readonly generation: number;
  /** Secret name -> secret value. Never logged, never serialized unencrypted. */
  readonly secrets: Record<string, string>;
}

export interface BackendInfo {
  readonly kind: "file" | "keychain" | "remote";
  /** Where the payload lives, for `env status`. Never contains a secret. */
  readonly location: string;
  /** One-line honesty note about what this backend does and does not protect. */
  readonly detail: string;
}

/**
 * A whole-payload backend. Used by the local, single-file persistences.
 *
 * `load()` returns `null` for "the vault does not exist yet", which is not an
 * error: a first write must not require an existing file.
 */
export interface PayloadBackend {
  readonly kind: "file" | "keychain";
  info(): BackendInfo;
  load(): Promise<VaultPayload | null>;
  save(payload: VaultPayload): Promise<void>;
  /** Removes the payload and any local key material for the file backend. */
  destroy(): Promise<void>;
}

/**
 * The per-name backend the store talks to.
 *
 * `put` returns the new generation and accepts an optional compare-and-set
 * precondition. A remote backend enforces that precondition atomically; a
 * local one checks it before writing. Callers treat a rejected precondition as
 * "re-read and decide", never as success.
 */
export interface SecretBackend {
  readonly kind: "file" | "keychain" | "remote";
  info(): BackendInfo;
  /** Sorted names only. Never values. */
  list(): Promise<readonly string[]>;
  get(name: string): Promise<string | null>;
  /**
   * Presence without disclosure.
   *
   * `env plan` and `env doctor` ask about dozens of names and never need the
   * values. Keeping presence separate means a remote backend can answer from
   * metadata instead of shipping every secret to the client.
   */
  has(name: string): Promise<boolean>;
  put(
    name: string,
    value: string,
    options?: { readonly ifGeneration?: number },
  ): Promise<number>;
  /** `false` when the name was not present. */
  delete(name: string): Promise<boolean>;
  generation(): Promise<number>;
  /** `false` when no vault exists yet; distinguishable from an empty one. */
  exists(): Promise<boolean>;
  /**
   * Bumps the generation without touching values.
   *
   * Vault-level, not per-name: the generation is one number for the whole
   * vault. A local backend does it as a single whole-payload write; a remote
   * one as a single server-side version bump.
   */
  rotate(): Promise<number>;
  /**
   * Removes a namespace in one act. Returns the names actually removed.
   *
   * Vault-level for the same reason as `rotate`: it must cost one generation,
   * not one per name, or a revoke would invalidate every other holder's
   * compare-and-set precondition.
   */
  deletePrefix(prefix: string): Promise<readonly string[]>;
  destroy(): Promise<void>;
}

/**
 * Raised when a compare-and-set precondition fails.
 *
 * Deliberately not a `CliError`: it is an expected, retryable interleaving, and
 * the frozen exit-code taxonomy has no slot for it. The store retries once and
 * only then surfaces a bounded, redacted error.
 */
export class StaleWriteError extends Error {
  readonly expected: number;
  readonly actual: number;

  constructor(expected: number, actual: number) {
    super(`stale vault version: expected generation ${expected}, found ${actual}`);
    this.name = "StaleWriteError";
    this.expected = expected;
    this.actual = actual;
  }
}

export const EMPTY_PAYLOAD: VaultPayload = { generation: 0, secrets: {} };

/** Secret names are namespaced identifiers: `cloudflare.token`, `slack.webhook`. */
const SECRET_NAME = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export function assertSecretName(name: string): void {
  if (name.length === 0 || name.length > 128 || !SECRET_NAME.test(name)) {
    // Echo the shape, never the value: a rejected name may have been a
    // mis-pasted secret.
    throw new Error(
      "Invalid secret name. Use lowercase namespaces like `cloudflare.token`.",
    );
  }
}

export function assertSecretValue(value: string): void {
  if (value.length === 0) throw new Error("Refusing to store an empty secret.");
  if (value.includes("\0")) throw new Error("Refusing to store a secret with a NUL byte.");
}
