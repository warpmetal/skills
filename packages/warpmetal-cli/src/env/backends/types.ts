/**
 * The credential store's contracts.
 *
 * A backend is a dumb, whole-payload read/write. All semantics that must not
 * vary between backends - name validation, generation counting, rotation
 * bookkeeping - live in `store.ts`, so swapping the backend can never change
 * what a caller observes.
 */

/** What is persisted. Secrets are name -> value; names are dotted namespaces. */
export interface VaultPayload {
  /** Monotonic counter, bumped by `env store rotate`. */
  readonly generation: number;
  /** Secret name -> secret value. Never logged, never serialized unencrypted. */
  readonly secrets: Record<string, string>;
}

export interface BackendInfo {
  readonly kind: "file" | "keychain";
  /** Where the payload lives, for `env status`. Never contains a secret. */
  readonly location: string;
  /** One-line honesty note about what this backend does and does not protect. */
  readonly detail: string;
}

export interface SecretBackend {
  readonly kind: "file" | "keychain";
  info(): BackendInfo;
  /** `null` means "the vault does not exist yet", not an error. */
  load(): Promise<VaultPayload | null>;
  save(payload: VaultPayload): Promise<void>;
  /** Removes the payload and any local key material for the file backend. */
  destroy(): Promise<void>;
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
