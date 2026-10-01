import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { CliError } from "../../errors.js";
import type { BackendInfo, PayloadBackend, VaultPayload } from "./types.js";

/**
 * AES-256-GCM + scrypt backend. The default on every platform, and the only
 * backend on platforms without a working OS keychain.
 *
 * Threat model, stated honestly: this protects the payload at rest against
 * accidental disclosure - a copied config directory, a backup tarball, a
 * `grep -r` across dotfiles, a committed file. It does **not** protect against
 * a local attacker who can read the whole config directory, because the key
 * file sits beside the vault. Use the keychain backend, or
 * `WARPMETAL_VAULT_PASSPHRASE` from an external secret manager, when that
 * attacker is in scope.
 */
export interface FileBackendOptions {
  readonly vaultFile: string;
  readonly keyFile: string;
  readonly passphrase?: string | undefined;
  readonly env?: NodeJS.ProcessEnv;
}

const ENVELOPE_VERSION = 1;
const AAD = Buffer.from("warpmetal-env:v1", "utf8");
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;
// 2^15 with r=8 is ~32 MiB of memory per derivation: enough to make offline
// guessing expensive, small enough for a laptop CLI. maxmem must be raised
// above node's 32 MiB default or scryptSync throws.
const KDF = { n: 32768, r: 8, p: 1 } as const;
const KDF_MAXMEM = 96 * 1024 * 1024;

interface Envelope {
  readonly version: number;
  readonly kdf: { readonly name: string; readonly n: number; readonly r: number; readonly p: number; readonly salt: string };
  readonly cipher: { readonly name: string; readonly iv: string; readonly tag: string };
  readonly ciphertext: string;
}

export class FileBackend implements PayloadBackend {
  readonly kind = "file" as const;
  readonly #options: FileBackendOptions;

  constructor(options: FileBackendOptions) {
    this.#options = options;
  }

  info(): BackendInfo {
    return {
      kind: "file",
      location: this.#options.vaultFile,
      detail:
        "AES-256-GCM with a scrypt-derived key. Protects the vault at rest (backups, copied dotfiles, accidental commits); does not protect against an attacker who can read this config directory.",
    };
  }

  async load(): Promise<VaultPayload | null> {
    if (!existsSync(this.#options.vaultFile)) return null;

    let raw: string;
    try {
      raw = readFileSync(this.#options.vaultFile, "utf8");
    } catch (error) {
      throw new CliError("backend_unavailable", `Cannot read the vault: ${(error as Error).message}`);
    }

    let envelope: Envelope;
    try {
      envelope = JSON.parse(raw) as Envelope;
    } catch {
      throw new CliError("vault_corrupt", "The vault file is not valid JSON.");
    }

    if (envelope.version !== ENVELOPE_VERSION) {
      throw new CliError(
        "vault_corrupt",
        `Unsupported vault version ${String(envelope.version)}. Expected ${ENVELOPE_VERSION}.`,
      );
    }
    if (envelope.kdf.name !== "scrypt" || envelope.cipher.name !== "aes-256-gcm") {
      throw new CliError("vault_corrupt", "The vault header names an unknown algorithm.");
    }

    const key = scryptSync(
      this.#passphrase(),
      Buffer.from(envelope.kdf.salt, "base64"),
      KEY_BYTES,
      { N: envelope.kdf.n, r: envelope.kdf.r, p: envelope.kdf.p, maxmem: KDF_MAXMEM },
    );

    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(envelope.cipher.iv, "base64"),
      );
      decipher.setAAD(AAD);
      decipher.setAuthTag(Buffer.from(envelope.cipher.tag, "base64"));
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, "base64")),
        decipher.final(),
      ]);
    } catch {
      // Indistinguishable on purpose: a wrong passphrase and a tampered file
      // must not be told apart by the error text.
      throw new CliError(
        "vault_corrupt",
        "Cannot decrypt the vault: wrong passphrase, wrong key file, or a tampered vault.",
      );
    }

    let payload: VaultPayload;
    try {
      payload = JSON.parse(plaintext.toString("utf8")) as VaultPayload;
    } catch {
      throw new CliError("vault_corrupt", "The decrypted vault is not valid JSON.");
    }
    if (typeof payload.generation !== "number" || typeof payload.secrets !== "object" || payload.secrets === null) {
      throw new CliError("vault_corrupt", "The decrypted vault has an unexpected shape.");
    }
    return payload;
  }

  async save(payload: VaultPayload): Promise<void> {
    const salt = randomBytes(SALT_BYTES);
    const key = scryptSync(this.#passphrase(), salt, KEY_BYTES, {
      N: KDF.n,
      r: KDF.r,
      p: KDF.p,
      maxmem: KDF_MAXMEM,
    });
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
      cipher.final(),
    ]);
    const envelope: Envelope = {
      version: ENVELOPE_VERSION,
      kdf: { name: "scrypt", n: KDF.n, r: KDF.r, p: KDF.p, salt: salt.toString("base64") },
      cipher: { name: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") },
      ciphertext: ciphertext.toString("base64"),
    };

    const path = this.#options.vaultFile;
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    // Write-then-rename so an interrupted write cannot leave a half vault that
    // would fail to decrypt later.
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  }

  async destroy(): Promise<void> {
    rmSync(this.#options.vaultFile, { force: true });
    // A leftover key file is dead weight but also a hint; remove both.
    if (this.#options.passphrase === undefined) {
      rmSync(this.#options.keyFile, { force: true });
    }
  }

  #passphrase(): string {
    if (this.#options.passphrase !== undefined && this.#options.passphrase.length > 0) {
      return this.#options.passphrase;
    }
    const fromEnv = this.#options.env?.["WARPMETAL_VAULT_PASSPHRASE"];
    if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
    return this.#readOrCreateKeyFile();
  }

  #readOrCreateKeyFile(): string {
    if (existsSync(this.#options.keyFile)) {
      const existing = readFileSync(this.#options.keyFile, "utf8").trim();
      if (existing.length > 0) return existing;
    }
    const generated = randomBytes(KEY_BYTES).toString("base64");
    mkdirSync(dirname(this.#options.keyFile), { recursive: true, mode: 0o700 });
    writeFileSync(this.#options.keyFile, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(this.#options.keyFile, 0o600);
    return generated;
  }
}
