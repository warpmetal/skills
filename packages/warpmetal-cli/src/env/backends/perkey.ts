import { EMPTY_PAYLOAD, StaleWriteError } from "./types.js";
import type { BackendInfo, PayloadBackend, SecretBackend, VaultPayload } from "./types.js";

/**
 * Lifts a whole-payload backend onto the per-name contract.
 *
 * This exists so `file.ts` and `keychain.ts` stay exactly as they were: a local
 * vault is genuinely one sealed blob, and forcing them to pretend otherwise
 * would either break their at-rest format or make every write a merge the
 * caller cannot see.
 *
 * The adapter deliberately caches nothing. A local payload is re-read per
 * operation, which is what keeps `MemoryBackend.loads` honest for callers that
 * assert "the store was never consulted", and what makes the compare-and-set
 * precondition meaningful rather than decorative.
 *
 * Mutations are serialized through one in-process queue. A whole-payload write
 * is read-modify-write, so without the queue two concurrent writes to two
 * different names would both read generation N, both write generation N+1, and
 * the second would silently drop the first. The queue restores per-name
 * independence for local backends; a remote backend gets the same guarantee
 * from its own compare-and-set instead.
 */
export class PayloadKeyAdapter implements SecretBackend {
  readonly kind: "file" | "keychain";
  readonly #backend: PayloadBackend;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(backend: PayloadBackend) {
    this.#backend = backend;
    this.kind = backend.kind;
  }

  info(): BackendInfo {
    return this.#backend.info();
  }

  /** Runs one mutation at a time; the chain survives a rejected action. */
  #exclusive<T>(action: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(action, action);
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async #read(): Promise<VaultPayload> {
    return (await this.#backend.load()) ?? EMPTY_PAYLOAD;
  }

  async list(): Promise<readonly string[]> {
    const payload = await this.#read();
    return Object.keys(payload.secrets).sort((left, right) => left.localeCompare(right));
  }

  async get(name: string): Promise<string | null> {
    const payload = await this.#read();
    return payload.secrets[name] ?? null;
  }

  async has(name: string): Promise<boolean> {
    const payload = await this.#read();
    return Object.prototype.hasOwnProperty.call(payload.secrets, name);
  }

  put(
    name: string,
    value: string,
    options?: { readonly ifGeneration?: number },
  ): Promise<number> {
    return this.#exclusive(async () => {
      const payload = await this.#read();
      if (options?.ifGeneration !== undefined && payload.generation !== options.ifGeneration) {
        throw new StaleWriteError(options.ifGeneration, payload.generation);
      }
      const secrets = { ...payload.secrets, [name]: value };
      const next: VaultPayload = { generation: payload.generation + 1, secrets };
      await this.#backend.save(next);
      return next.generation;
    });
  }

  delete(name: string): Promise<boolean> {
    return this.#exclusive(async () => {
      const payload = await this.#read();
      if (!Object.prototype.hasOwnProperty.call(payload.secrets, name)) return false;
      const secrets = { ...payload.secrets };
      delete secrets[name];
      await this.#backend.save({ generation: payload.generation + 1, secrets });
      return true;
    });
  }

  async generation(): Promise<number> {
    return (await this.#read()).generation;
  }

  async exists(): Promise<boolean> {
    return (await this.#backend.load()) !== null;
  }

  /** Vault-level: one generation for the whole vault, not one per name. */
  rotate(): Promise<number> {
    return this.#exclusive(async () => {
      const payload = await this.#read();
      const next: VaultPayload = { generation: payload.generation + 1, secrets: payload.secrets };
      await this.#backend.save(next);
      return next.generation;
    });
  }

  /** Vault-level: one generation for the whole namespace removal. */
  deletePrefix(prefix: string): Promise<readonly string[]> {
    return this.#exclusive(async () => {
      const payload = await this.#read();
      const names = Object.keys(payload.secrets)
        .filter((name) => name.startsWith(prefix))
        .sort((left, right) => left.localeCompare(right));
      if (names.length === 0) return [];
      const secrets = { ...payload.secrets };
      for (const name of names) delete secrets[name];
      await this.#backend.save({ generation: payload.generation + 1, secrets });
      return names;
    });
  }

  async destroy(): Promise<void> {
    await this.#backend.destroy();
  }
}
