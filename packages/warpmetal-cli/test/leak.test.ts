import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { childEnv } from "../src/child-env.js";
import { runCli } from "../src/dispatch.js";
import { captureOut } from "../src/output.js";
import { createRunner } from "../src/run.js";
import type { CredentialStore } from "../src/env/store.js";
import { memoryStore } from "./helpers.js";

const PASS = "vault-passphrase-canary-0d5b7c";
const VALUE = "cf-canary-7c1e93aa";

async function run(
  args: readonly string[],
  store: CredentialStore,
): Promise<{ code: number; text: string }> {
  const out = captureOut();
  const code = await runCli(args, { out, store, isTTY: false, platform: "linux", upstream: null });
  return { code, text: out.out.join("") + out.err.join("") };
}

describe("leak proofs", () => {
  it("childEnv removes vault material and keeps everything else", () => {
    const sanitized = childEnv(
      {
        PATH: "/usr/bin",
        HOME: "/home/operator",
        WARPMETAL_VAULT_PASSPHRASE: PASS,
        WARPMETAL_VAULT_TOKEN: "tok",
        X402API_WALLET_PASSWORD: "wallet",
      },
      { WARPMETAL_VAULT_PASSPHRASE: "resurrected", GITHUB_TOKEN: "gh" },
    );

    assert.equal(sanitized["PATH"], "/usr/bin");
    assert.equal(sanitized["HOME"], "/home/operator");
    assert.equal(sanitized["GITHUB_TOKEN"], "gh");
    assert.equal(sanitized["WARPMETAL_VAULT_PASSPHRASE"], undefined);
    assert.equal(sanitized["WARPMETAL_VAULT_TOKEN"], undefined);
    assert.equal(sanitized["X402API_WALLET_PASSWORD"], undefined);
  });

  it("a spawned child cannot see the vault passphrase", async () => {
    // End-to-end rather than a unit assertion about `childEnv`: the child is
    // asked to print what it can see, so the proof covers the spawn call too.
    const previous = process.env["WARPMETAL_VAULT_PASSPHRASE"];
    process.env["WARPMETAL_VAULT_PASSPHRASE"] = PASS;
    try {
      const result = await createRunner()(process.execPath, [
        "-e",
        "process.stdout.write(process.env.WARPMETAL_VAULT_PASSPHRASE ?? 'absent')",
      ]);
      assert.equal(result.stdout, "absent");
      assert.equal(result.stderr, "");
    } finally {
      if (previous === undefined) delete process.env["WARPMETAL_VAULT_PASSPHRASE"];
      else process.env["WARPMETAL_VAULT_PASSPHRASE"] = previous;
    }
  });

  it("an explicit per-call environment cannot reintroduce the passphrase", async () => {
    const previous = process.env["WARPMETAL_VAULT_PASSPHRASE"];
    process.env["WARPMETAL_VAULT_PASSPHRASE"] = PASS;
    try {
      const result = await createRunner()(
        process.execPath,
        ["-e", "process.stdout.write(process.env.WARPMETAL_VAULT_PASSPHRASE ?? 'absent')"],
        { env: { WARPMETAL_VAULT_PASSPHRASE: PASS } },
      );
      assert.equal(result.stdout, "absent");
    } finally {
      if (previous === undefined) delete process.env["WARPMETAL_VAULT_PASSPHRASE"];
      else process.env["WARPMETAL_VAULT_PASSPHRASE"] = previous;
    }
  });

  it("no diagnostic command prints a stored value or the passphrase", async () => {
    const { store } = await memoryStore({ "cloudflare.token": VALUE, "slack.token": VALUE });
    const previous = process.env["WARPMETAL_VAULT_PASSPHRASE"];
    process.env["WARPMETAL_VAULT_PASSPHRASE"] = PASS;
    try {
      const commands: readonly (readonly string[])[] = [
        ["env", "status", "--json"],
        ["env", "status"],
        ["env", "list", "--json"],
        ["env", "plan", "--json"],
        ["env", "doctor", "--json"],
        ["env", "doctor"],
        ["env", "secret", "missing.name", "--stdout"],
      ];
      for (const command of commands) {
        const result = await run(command, store);
        assert.equal(result.text.includes(VALUE), false, `stored value leaked through ${command.join(" ")}`);
        assert.equal(result.text.includes(PASS), false, `passphrase leaked through ${command.join(" ")}`);
      }
    } finally {
      if (previous === undefined) delete process.env["WARPMETAL_VAULT_PASSPHRASE"];
      else process.env["WARPMETAL_VAULT_PASSPHRASE"] = previous;
    }
  });
});
