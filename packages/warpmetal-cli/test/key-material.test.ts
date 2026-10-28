import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CliError } from "../src/errors.js";
import { CredentialStore } from "../src/env/store.js";
import type { BackendInfo, PayloadBackend, VaultPayload } from "../src/env/backends/types.js";
import { tempEnv } from "./helpers.js";

const PASSPHRASE = "vault-passphrase-canary-4f1c9a";

/** A keychain stand-in, so the selection branch is exercised without a native module. */
class FakeKeychain implements PayloadBackend {
  readonly kind = "keychain" as const;
  payload: VaultPayload | null = null;

  info(): BackendInfo {
    return {
      kind: "keychain",
      location: "warpmetal-env/vault",
      detail: "test keychain; no key material is written to the config directory",
    };
  }

  async load(): Promise<VaultPayload | null> {
    return this.payload;
  }

  async save(payload: VaultPayload): Promise<void> {
    this.payload = payload;
  }

  async destroy(): Promise<void> {
    this.payload = null;
  }
}

/** The config root with the local-key acceptance removed, which is the shipped default. */
function withoutAcceptance(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy = { ...env };
  delete copy["WARPMETAL_ACCEPT_LOCAL_KEY"];
  delete copy["WARPMETAL_VAULT_PASSPHRASE"];
  return copy;
}

describe("vault key material", () => {
  it("refuses to create a key file beside the vault without explicit acceptance", async () => {
    const temp = await tempEnv();
    try {
      const store = await CredentialStore.open({ env: withoutAcceptance(temp.env), preferKeychain: false });
      await assert.rejects(
        () => store.write("cloudflare.token", "value"),
        (error: unknown) =>
          error instanceof CliError && error.code === "key_required" && error.exitCode === 4,
      );
      // The refusal happens before anything is written: no half-created vault,
      // no weak key, nothing for a later reader to find.
      assert.equal(existsSync(join(temp.dir, "env", "vault.enc")), false);
      assert.equal(existsSync(join(temp.dir, "env", "vault.key")), false);
    } finally {
      await temp.cleanup();
    }
  });

  it("names every way out in the refusal", async () => {
    const temp = await tempEnv();
    try {
      const store = await CredentialStore.open({ env: withoutAcceptance(temp.env), preferKeychain: false });
      await assert.rejects(
        () => store.write("slack.token", "value"),
        (error: unknown) => {
          assert.ok(error instanceof CliError);
          assert.match(error.message, /@napi-rs\/keyring/);
          assert.match(error.message, /WARPMETAL_VAULT_PASSPHRASE/);
          assert.match(error.message, /WARPMETAL_ACCEPT_LOCAL_KEY/);
          return true;
        },
      );
    } finally {
      await temp.cleanup();
    }
  });

  it("uses an external passphrase without writing a key file", async () => {
    const temp = await tempEnv();
    try {
      const env = { ...withoutAcceptance(temp.env), WARPMETAL_VAULT_PASSPHRASE: PASSPHRASE };
      const store = await CredentialStore.open({ env, preferKeychain: false });
      await store.write("cloudflare.token", "value");

      assert.equal(existsSync(join(temp.dir, "env", "vault.key")), false, "no key file may be created");
      const status = await store.status();
      assert.equal(status.keySource, "passphrase");
      assert.equal(status.keyFilePresent, false);

      // The passphrase must not be recoverable from the vault itself.
      const raw = readFileSync(join(temp.dir, "env", "vault.enc"), "utf8");
      assert.equal(raw.includes(PASSPHRASE), false, "the passphrase leaked into the vault");

      const reopened = await CredentialStore.open({ env, preferKeychain: false });
      assert.equal(await reopened.read("cloudflare.token"), "value");
    } finally {
      await temp.cleanup();
    }
  });

  it("still opens an existing key file, so an accepted install keeps working", async () => {
    const temp = await tempEnv();
    try {
      const first = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await first.write("slack.token", "kept");
      assert.equal(existsSync(join(temp.dir, "env", "vault.key")), true);

      // Reopened with the acceptance removed: reading an existing key is fine,
      // only creating a new one is gated.
      const second = await CredentialStore.open({ env: withoutAcceptance(temp.env), preferKeychain: false });
      assert.equal(await second.read("slack.token"), "kept");
      const status = await second.status();
      assert.equal(status.keySource, "key-file");
      assert.equal(status.keyFilePresent, true);
    } finally {
      await temp.cleanup();
    }
  });

  it("removes the key file on destroy even when a passphrase was in use", async () => {
    const temp = await tempEnv();
    try {
      const first = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await first.write("slack.token", "value");

      // Migrating to a passphrase must not leave the old key behind: it still
      // opens every backup of the vault it sealed.
      const migrated = await CredentialStore.open({
        env: { ...temp.env, WARPMETAL_VAULT_PASSPHRASE: PASSPHRASE },
        preferKeychain: false,
      });
      await migrated.destroy();

      assert.equal(existsSync(join(temp.dir, "env", "vault.key")), false, "the key file survived destroy");
      assert.equal(existsSync(join(temp.dir, "env", "vault.enc")), false);
    } finally {
      await temp.cleanup();
    }
  });

  it("selects the keychain when one is available, and writes no file", async () => {
    const temp = await tempEnv();
    try {
      const keychain = new FakeKeychain();
      const store = await CredentialStore.open({
        env: withoutAcceptance(temp.env),
        keychainFactory: async () => keychain,
      });
      await store.write("github.token", "gh-value");

      const status = await store.status();
      assert.equal(status.keySource, "keychain");
      assert.equal(status.keyFilePresent, false);
      assert.equal(keychain.payload?.secrets["github.token"], "gh-value");
      assert.equal(existsSync(join(temp.dir, "env", "vault.enc")), false);
      assert.equal(existsSync(join(temp.dir, "env", "vault.key")), false);
    } finally {
      await temp.cleanup();
    }
  });

  it("keeps an injected keychain when the environment disables the implicit probe", async () => {
    const temp = await tempEnv();
    try {
      const keychain = new FakeKeychain();
      const store = await CredentialStore.open({
        // CI sets this for the whole job so the optional native module cannot
        // make the suite nondeterministic. It must not reach past an explicit
        // factory and swap the backend the test asked for.
        env: { ...withoutAcceptance(temp.env), WARPMETAL_DISABLE_KEYCHAIN: "1" },
        keychainFactory: async () => keychain,
      });
      await store.write("github.token", "gh-value");

      assert.equal((await store.status()).keySource, "keychain");
      assert.equal(keychain.payload?.secrets["github.token"], "gh-value");
      assert.equal(existsSync(join(temp.dir, "env", "vault.enc")), false);
      assert.equal(existsSync(join(temp.dir, "env", "vault.key")), false);
    } finally {
      await temp.cleanup();
    }
  });

  it("still forces the file backend when the caller opts out of the keychain", async () => {
    const temp = await tempEnv();
    try {
      const keychain = new FakeKeychain();
      const store = await CredentialStore.open({
        env: temp.env,
        preferKeychain: false,
        keychainFactory: async () => keychain,
      });
      await store.write("github.token", "gh-value");

      assert.equal((await store.status()).keySource, "key-file");
      assert.equal(keychain.payload, null, "the factory must not be consulted");
    } finally {
      await temp.cleanup();
    }
  });
});
