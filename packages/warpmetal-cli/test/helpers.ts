import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SecretBackend, VaultPayload } from "../src/env/backends/types.js";
import { CredentialStore } from "../src/env/store.js";

/** A backend that never touches the disk. Fast, and used by most tests. */
export class MemoryBackend implements SecretBackend {
  readonly kind = "file" as const;
  payload: VaultPayload | null = null;
  saves = 0;
  destroyed = false;
  /** How many times the vault was opened. Lets a test assert "never consulted". */
  loads = 0;

  info() {
    return { kind: "file" as const, location: "memory://vault", detail: "in-memory test backend" };
  }

  async load(): Promise<VaultPayload | null> {
    this.loads += 1;
    return this.payload;
  }

  async save(next: VaultPayload): Promise<void> {
    this.payload = next;
    this.saves += 1;
  }

  async destroy(): Promise<void> {
    this.payload = null;
    this.destroyed = true;
  }
}

export async function memoryStore(seed: Record<string, string> = {}): Promise<{
  store: CredentialStore;
  backend: MemoryBackend;
}> {
  const backend = new MemoryBackend();
  if (Object.keys(seed).length > 0) {
    backend.payload = { generation: 1, secrets: { ...seed } };
  }
  const store = await CredentialStore.open({ backend });
  return { store, backend };
}

export interface TempEnv {
  readonly dir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly cleanup: () => Promise<void>;
}

/** An isolated config root, so the real `~/.config/warpmetal` is never touched. */
export async function tempEnv(): Promise<TempEnv> {
  const dir = await mkdtemp(join(tmpdir(), "warpmetal-cli-"));
  return {
    dir,
    env: { ...process.env, WARPMETAL_CONFIG_DIR: dir },
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function jsonOf(text: string): unknown {
  return JSON.parse(text) as unknown;
}
