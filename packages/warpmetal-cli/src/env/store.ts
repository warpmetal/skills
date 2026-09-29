import { CliError } from "../errors.js";
import { FileBackend } from "./backends/file.js";
import { KeychainBackend } from "./backends/keychain.js";
import {
  assertSecretName,
  assertSecretValue,
  type BackendInfo,
  type SecretBackend,
  type VaultPayload,
} from "./backends/types.js";
import { pathsFrom, type EnvPaths } from "./paths.js";

export interface StoreOptions {
  readonly paths?: Partial<EnvPaths> | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  /** Injection point for tests; bypasses backend selection entirely. */
  readonly backend?: SecretBackend | undefined;
  /** `false` forces the file backend even where a keychain exists. */
  readonly preferKeychain?: boolean | undefined;
  readonly passphrase?: string | undefined;
}

export interface StoreStatus {
  readonly backend: BackendInfo;
  readonly generation: number;
  readonly secretCount: number;
  readonly exists: boolean;
}

/**
 * The single owner of credential semantics.
 *
 * Callers get names, never payloads: there is no API here that returns the
 * whole vault, so a command cannot accidentally serialize every secret by
 * spreading an object it was handed. Reads are explicit, one name at a time.
 */
export class CredentialStore {
  readonly #backend: SecretBackend;
  #payload: VaultPayload | null = null;
  #loaded = false;

  private constructor(backend: SecretBackend) {
    this.#backend = backend;
  }

  static async open(options: StoreOptions = {}): Promise<CredentialStore> {
    if (options.backend !== undefined) return new CredentialStore(options.backend);

    if (options.preferKeychain !== false) {
      const keychain = await KeychainBackend.tryCreate();
      if (keychain !== null) return new CredentialStore(keychain);
    }

    const paths = pathsFrom(options.paths, options.env);
    return new CredentialStore(
      new FileBackend({
        vaultFile: paths.vaultFile,
        keyFile: paths.keyFile,
        passphrase: options.passphrase,
        env: options.env,
      }),
    );
  }

  backendInfo(): BackendInfo {
    return this.#backend.info();
  }

  async #load(): Promise<VaultPayload> {
    if (!this.#loaded) {
      this.#payload = await this.#backend.load();
      this.#loaded = true;
    }
    return this.#payload ?? { generation: 0, secrets: {} };
  }

  async status(): Promise<StoreStatus> {
    const payload = await this.#load();
    return {
      backend: this.#backend.info(),
      generation: payload.generation,
      secretCount: Object.keys(payload.secrets).length,
      exists: this.#payload !== null,
    };
  }

  /** Sorted names only. There is no `values()` and no `dump()`. */
  async list(): Promise<readonly string[]> {
    const payload = await this.#load();
    return Object.keys(payload.secrets).sort((left, right) => left.localeCompare(right));
  }

  /** Names under a namespace, e.g. `cloudflare.` for `env revoke --service cloudflare`. */
  async listService(service: string): Promise<readonly string[]> {
    const prefix = `${service}.`;
    return (await this.list()).filter((name) => name.startsWith(prefix));
  }

  async has(name: string): Promise<boolean> {
    const payload = await this.#load();
    return Object.prototype.hasOwnProperty.call(payload.secrets, name);
  }

  async read(name: string): Promise<string | null> {
    assertSecretName(name);
    const payload = await this.#load();
    return payload.secrets[name] ?? null;
  }

  async write(name: string, value: string): Promise<void> {
    assertSecretName(name);
    assertSecretValue(value);
    const payload = await this.#load();
    const secrets = { ...payload.secrets, [name]: value };
    const next: VaultPayload = { generation: payload.generation + 1, secrets };
    await this.#backend.save(next);
    this.#payload = next;
    this.#loaded = true;
  }

  async remove(name: string): Promise<boolean> {
    assertSecretName(name);
    const payload = await this.#load();
    if (!Object.prototype.hasOwnProperty.call(payload.secrets, name)) return false;
    const secrets = { ...payload.secrets };
    delete secrets[name];
    const next: VaultPayload = { generation: payload.generation + 1, secrets };
    await this.#backend.save(next);
    this.#payload = next;
    this.#loaded = true;
    return true;
  }

  /** Removes a whole namespace. Returns the names actually removed. */
  async removeService(service: string): Promise<readonly string[]> {
    const names = await this.listService(service);
    if (names.length === 0) return [];
    const payload = await this.#load();
    const secrets = { ...payload.secrets };
    for (const name of names) delete secrets[name];
    const next: VaultPayload = { generation: payload.generation + 1, secrets };
    await this.#backend.save(next);
    this.#payload = next;
    this.#loaded = true;
    return names;
  }

  /** Bumps the generation without touching values. */
  async rotate(): Promise<number> {
    const payload = await this.#load();
    const next: VaultPayload = { generation: payload.generation + 1, secrets: payload.secrets };
    await this.#backend.save(next);
    this.#payload = next;
    this.#loaded = true;
    return next.generation;
  }

  /** Reads and registers a value for redaction in one step. */
  async readForRedaction(name: string): Promise<string | null> {
    const value = await this.read(name);
    return value;
  }

  async destroy(): Promise<void> {
    await this.#backend.destroy();
    this.#payload = null;
    this.#loaded = true;
  }

  /** Fails loudly if the vault on disk belongs to an incompatible version. */
  async assertReadable(): Promise<void> {
    try {
      await this.#load();
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError("vault_corrupt", (error as Error).message);
    }
  }
}
