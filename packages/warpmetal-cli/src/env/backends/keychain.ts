import type { BackendInfo, PayloadBackend, VaultPayload } from "./types.js";

/**
 * OS keychain backend, used when `@napi-rs/keyring` is installed.
 *
 * The dependency is optional and imported dynamically: a missing native module
 * degrades to the file backend instead of failing the CLI, which matters
 * because a skill may run on a machine where native modules were never built.
 * The whole payload is stored as one keychain item, so the "vault" is a single
 * entry from the OS's point of view and the store keeps owning the semantics.
 */
const SERVICE = "warpmetal-env";
const ACCOUNT = "vault";

interface KeyringEntry {
  getPassword(): string | null;
  setPassword(value: string): void;
  deletePassword(): boolean;
}

interface KeyringModule {
  Entry: new (service: string, account: string) => KeyringEntry;
}

async function loadKeyring(): Promise<KeyringModule | null> {
  // Non-literal specifier: the module is optional, so a missing install must be
  // a runtime `null`, not a compile-time failure.
  const specifier = "@napi-rs/keyring";
  try {
    const loaded = (await import(specifier)) as Partial<KeyringModule> & {
      default?: Partial<KeyringModule>;
    };
    const candidate = loaded.Entry !== undefined ? loaded : loaded.default;
    if (candidate?.Entry === undefined) return null;
    return { Entry: candidate.Entry };
  } catch {
    return null;
  }
}

export class KeychainBackend implements PayloadBackend {
  readonly kind = "keychain" as const;
  readonly #module: KeyringModule;
  readonly #entry: KeyringEntry;

  private constructor(module: KeyringModule) {
    this.#module = module;
    this.#entry = new module.Entry(SERVICE, ACCOUNT);
  }

  /** Returns `null` when the optional keychain module is unavailable. */
  static async tryCreate(): Promise<KeychainBackend | null> {
    const module = await loadKeyring();
    if (module === null) return null;
    try {
      return new KeychainBackend(module);
    } catch {
      return null;
    }
  }

  info(): BackendInfo {
    return {
      kind: "keychain",
      location: `${SERVICE}/${ACCOUNT}`,
      detail: "Stored in the OS keychain. No key material is written to the config directory.",
    };
  }

  async load(): Promise<VaultPayload | null> {
    const raw = this.#entry.getPassword();
    if (raw === null || raw.length === 0) return null;
    try {
      return JSON.parse(raw) as VaultPayload;
    } catch {
      throw new Error("The keychain entry is not valid JSON.");
    }
  }

  async save(payload: VaultPayload): Promise<void> {
    this.#entry.setPassword(JSON.stringify(payload));
  }

  async destroy(): Promise<void> {
    this.#entry.deletePassword();
  }
}
