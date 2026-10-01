import { CliError } from "../errors.js";
import { createHttp, type HttpFn } from "../integration/http.js";
import { FileBackend } from "./backends/file.js";
import { KeychainBackend } from "./backends/keychain.js";
import { PayloadKeyAdapter } from "./backends/perkey.js";
import { RemoteBackend, resolveRemoteVault } from "./backends/remote.js";
import {
  assertSecretName,
  assertSecretValue,
  StaleWriteError,
  type BackendInfo,
  type PayloadBackend,
  type SecretBackend,
} from "./backends/types.js";
import { pathsFrom, type EnvPaths } from "./paths.js";

export interface StoreOptions {
  readonly paths?: Partial<EnvPaths> | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  /**
   * Injection point for tests and for a future remote backend; bypasses
   * backend selection entirely. A whole-payload backend is lifted onto the
   * per-name contract here, so callers may pass either.
   */
  readonly backend?: PayloadBackend | SecretBackend | undefined;
  /** `false` forces the file backend even where a keychain exists. */
  readonly preferKeychain?: boolean | undefined;
  readonly passphrase?: string | undefined;
  /** Transport for the remote backend; defaults to `fetch`. */
  readonly vaultHttp?: HttpFn | undefined;
  /** Test seam: overrides the session file read for the remote backend. */
  readonly readSessionFile?: ((path: string) => Promise<string>) | undefined;
  /** Test seam: overrides the clock used for session expiry. */
  readonly now?: (() => number) | undefined;
}

export interface StoreStatus {
  readonly backend: BackendInfo;
  readonly generation: number;
  readonly secretCount: number;
  readonly exists: boolean;
}

/** A payload backend is the one that persists a whole `VaultPayload` at once. */
function isPayloadBackend(backend: PayloadBackend | SecretBackend): backend is PayloadBackend {
  return typeof (backend as PayloadBackend).load === "function";
}

/**
 * The single owner of credential semantics.
 *
 * Callers get names, never payloads: there is no API here that returns the
 * whole vault, so a command cannot accidentally serialize every secret by
 * spreading an object it was handed. Reads are explicit, one name at a time.
 *
 * Nothing is cached. The previous generation of this class memoized the
 * decrypted payload for the process lifetime, which is correct for one
 * short-lived CLI invocation and wrong for anything longer: a value written by
 * another process would be invisible, and a write would silently replay every
 * stale name it was holding. Re-reading per operation is what makes a shared
 * or remote vault coherent.
 */
export class CredentialStore {
  readonly #backend: SecretBackend;

  private constructor(backend: SecretBackend) {
    this.#backend = backend;
  }

  static async open(options: StoreOptions = {}): Promise<CredentialStore> {
    if (options.backend !== undefined) {
      const backend = options.backend;
      return new CredentialStore(
        isPayloadBackend(backend) ? new PayloadKeyAdapter(backend) : backend,
      );
    }

    const paths = pathsFrom(options.paths, options.env);

    // The remote vault wins over every local backend, and a session problem
    // never falls back: `WARPMETAL_VAULT_URL` is the operator's explicit
    // statement that this vault lives on the server.
    const remote = await resolveRemoteVault({
      env: options.env ?? process.env,
      paths,
      readFile: options.readSessionFile,
      now: options.now,
    });
    if (remote !== null) {
      return new CredentialStore(new RemoteBackend(remote, options.vaultHttp ?? createHttp(fetch)));
    }

    if (options.preferKeychain !== false) {
      const keychain = await KeychainBackend.tryCreate();
      if (keychain !== null) return new CredentialStore(new PayloadKeyAdapter(keychain));
    }

    return new CredentialStore(
      new PayloadKeyAdapter(
        new FileBackend({
          vaultFile: paths.vaultFile,
          keyFile: paths.keyFile,
          passphrase: options.passphrase,
          env: options.env,
        }),
      ),
    );
  }

  backendInfo(): BackendInfo {
    return this.#backend.info();
  }

  async status(): Promise<StoreStatus> {
    const [generation, names, exists] = await Promise.all([
      this.#backend.generation(),
      this.#backend.list(),
      this.#backend.exists(),
    ]);
    return {
      backend: this.#backend.info(),
      generation,
      secretCount: names.length,
      exists,
    };
  }

  /** Sorted names only. There is no `values()` and no `dump()`. */
  async list(): Promise<readonly string[]> {
    return this.#backend.list();
  }

  /** Names under a namespace, e.g. `cloudflare.` for `env revoke --service cloudflare`. */
  async listService(service: string): Promise<readonly string[]> {
    const prefix = `${service}.`;
    return (await this.list()).filter((name) => name.startsWith(prefix));
  }

  async has(name: string): Promise<boolean> {
    assertSecretName(name);
    return this.#backend.has(name);
  }

  async read(name: string): Promise<string | null> {
    assertSecretName(name);
    return this.#backend.get(name);
  }

  async write(name: string, value: string): Promise<void> {
    assertSecretName(name);
    assertSecretValue(value);
    await this.#backend.put(name, value);
  }

  async remove(name: string): Promise<boolean> {
    assertSecretName(name);
    return this.#backend.delete(name);
  }

  /** Removes a whole namespace. Returns the names actually removed. */
  async removeService(service: string): Promise<readonly string[]> {
    const prefix = `${service}.`;
    const removed = await this.#backend.deletePrefix(prefix);
    return removed;
  }

  /** Bumps the generation without touching values. */
  async rotate(): Promise<number> {
    return this.#backend.rotate();
  }

  /** Reads and registers a value for redaction in one step. */
  async readForRedaction(name: string): Promise<string | null> {
    const value = await this.read(name);
    return value;
  }

  async destroy(): Promise<void> {
    await this.#backend.destroy();
  }

  /** Fails loudly if the vault on disk belongs to an incompatible version. */
  async assertReadable(): Promise<void> {
    try {
      await this.#backend.list();
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (error instanceof StaleWriteError) {
        throw new CliError("vault_corrupt", error.message);
      }
      throw new CliError("vault_corrupt", (error as Error).message);
    }
  }
}
