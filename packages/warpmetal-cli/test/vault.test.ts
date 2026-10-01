import assert from "node:assert/strict";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CliError } from "../src/errors.js";
import { PayloadKeyAdapter } from "../src/env/backends/perkey.js";
import { CredentialStore } from "../src/env/store.js";
import { memoryStore, tempEnv } from "./helpers.js";

describe("credential store", () => {
  it("round-trips a secret and bumps the generation per write", async () => {
    const { store, backend } = await memoryStore();

    assert.equal(await store.read("cloudflare.token"), null);
    await store.write("cloudflare.token", "value-one");
    assert.equal(await store.read("cloudflare.token"), "value-one");

    await store.write("cloudflare.token", "value-two");
    assert.equal(await store.read("cloudflare.token"), "value-two");

    const status = await store.status();
    assert.equal(status.generation, 2);
    assert.equal(status.secretCount, 1);
    assert.equal(backend.saves, 2);
  });

  it("removes a single secret and a whole service namespace", async () => {
    const { store } = await memoryStore({
      "cloudflare.token": "a",
      "cloudflare.zone": "b",
      "slack.token": "c",
    });

    assert.deepEqual(await store.listService("cloudflare"), ["cloudflare.token", "cloudflare.zone"]);
    assert.equal(await store.remove("slack.token"), true);
    assert.equal(await store.remove("slack.token"), false);

    const removed = await store.removeService("cloudflare");
    assert.deepEqual(removed, ["cloudflare.token", "cloudflare.zone"]);
    assert.deepEqual(await store.list(), []);
  });

  it("rotates the generation without touching values", async () => {
    const { store } = await memoryStore({ "slack.token": "keep-me" });
    const generation = await store.rotate();
    assert.equal(generation, 2);
    assert.equal(await store.read("slack.token"), "keep-me");
  });

  it("rejects names that are not namespaced identifiers", async () => {
    const { store } = await memoryStore();
    for (const name of ["", "Upper", "with space", "a".repeat(129), "trailing.", ".leading"]) {
      await assert.rejects(() => store.write(name, "x"), /Invalid secret name/);
    }
  });

  it("refuses an empty value and a NUL byte", async () => {
    const { store } = await memoryStore();
    await assert.rejects(() => store.write("slack.token", ""), /empty secret/);
    await assert.rejects(() => store.write("slack.token", "a\0b"), /NUL byte/);
  });

  it("never exposes a whole-vault accessor", async () => {
    const { store } = await memoryStore({ "slack.token": "x" });
    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
    // The list API is names-only on purpose; a `values`/`dump` accessor would
    // make accidental serialization possible from any call site.
    assert.equal(surface.includes("values"), false);
    assert.equal(surface.includes("dump"), false);
    assert.equal(surface.includes("payload"), false);
  });

  // A whole-payload write is read-modify-write. Without serialization, two
  // writes interleave as read N / read N / write N+1 / write N+1 and the
  // second silently drops the first. Each name must survive on its own.
  it("does not lose a concurrent write to a different name", async () => {
    const { store, backend } = await memoryStore();

    await Promise.all([
      store.write("cloudflare.token", "cf"),
      store.write("slack.token", "slack"),
      store.write("github.token", "gh"),
    ]);

    assert.equal(await store.read("cloudflare.token"), "cf");
    assert.equal(await store.read("slack.token"), "slack");
    assert.equal(await store.read("github.token"), "gh");
    assert.equal(backend.saves, 3);
  });

  it("rejects a write against a stale generation and leaves the vault intact", async () => {
    const { backend } = await memoryStore({ "slack.token": "x" });
    const adapter = new PayloadKeyAdapter(backend);
    const stale = await adapter.generation();

    await adapter.put("cloudflare.token", "cf");

    await assert.rejects(
      () => adapter.put("github.token", "gh", { ifGeneration: stale }),
      /stale vault version/,
    );
    assert.equal(await adapter.get("github.token"), null);
    assert.equal(await adapter.get("cloudflare.token"), "cf");
  });
});

describe("file backend", () => {
  it("persists across store instances and does not leave plaintext on disk", async () => {
    const temp = await tempEnv();
    try {
      const first = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await first.write("cloudflare.token", "plaintext-canary-value-123456");

      const second = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      assert.equal(await second.read("cloudflare.token"), "plaintext-canary-value-123456");

      const raw = readFileSync(join(temp.dir, "env", "vault.enc"), "utf8");
      assert.equal(raw.includes("plaintext-canary-value-123456"), false);
      assert.equal(raw.includes("cloudflare.token"), false);
    } finally {
      await temp.cleanup();
    }
  });

  it("writes the vault and key with 0600", async (context) => {
    if (process.platform === "win32") {
      context.skip("POSIX file modes are not enforced on Windows.");
      return;
    }
    const temp = await tempEnv();
    try {
      const store = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await store.write("slack.token", "value");
      for (const name of ["vault.enc", "vault.key"]) {
        const mode = statSync(join(temp.dir, "env", name)).mode & 0o777;
        assert.equal(mode, 0o600, `${name} should be 0600, was ${mode.toString(8)}`);
      }
    } finally {
      await temp.cleanup();
    }
  });

  it("reports a corrupt vault instead of crashing", async () => {
    const temp = await tempEnv();
    try {
      const store = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await store.write("slack.token", "value");
      writeFileSync(join(temp.dir, "env", "vault.enc"), "not json at all", "utf8");

      const reopened = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await assert.rejects(
        () => reopened.read("slack.token"),
        (error: unknown) => error instanceof CliError && error.code === "vault_corrupt" && error.exitCode === 6,
      );
    } finally {
      await temp.cleanup();
    }
  });

  it("rejects a tampered ciphertext", async () => {
    const temp = await tempEnv();
    try {
      const store = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await store.write("slack.token", "value");

      const path = join(temp.dir, "env", "vault.enc");
      const envelope = JSON.parse(readFileSync(path, "utf8")) as { ciphertext: string };
      const bytes = Buffer.from(envelope.ciphertext, "base64");
      bytes[0] = bytes[0] === 0 ? 1 : bytes[0]! - 1;
      envelope.ciphertext = bytes.toString("base64");
      writeFileSync(path, JSON.stringify(envelope), "utf8");

      const reopened = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await assert.rejects(() => reopened.read("slack.token"), /Cannot decrypt the vault/);
    } finally {
      await temp.cleanup();
    }
  });

  it("rejects a vault written under a different key", async () => {
    const temp = await tempEnv();
    try {
      const store = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await store.write("slack.token", "value");

      // A different key file: the vault must not open, and the error must not
      // say which of the two cases it was.
      writeFileSync(join(temp.dir, "env", "vault.key"), `${Buffer.alloc(32, 7).toString("base64")}\n`, "utf8");
      const reopened = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await assert.rejects(() => reopened.read("slack.token"), /wrong passphrase, wrong key file, or a tampered vault/);
    } finally {
      await temp.cleanup();
    }
  });

  it("destroys the vault and the local key material", async () => {
    const temp = await tempEnv();
    try {
      const store = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await store.write("slack.token", "value");
      await store.destroy();

      const reopened = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      assert.equal(await reopened.read("slack.token"), null);
      assert.deepEqual(await reopened.list(), []);
    } finally {
      await temp.cleanup();
    }
  });
});
