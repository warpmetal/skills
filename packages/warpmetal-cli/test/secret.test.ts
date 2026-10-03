import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runCli, type CliDeps } from "../src/dispatch.js";
import { captureOut } from "../src/output.js";
import type { CredentialStore } from "../src/env/store.js";
import { memoryStore } from "./helpers.js";

const CANARY = "cf-canary-9f3a2b7c1d4e5a6b";

async function run(
  args: readonly string[],
  store: CredentialStore,
  extra: Partial<CliDeps> = {},
): Promise<{ code: number; text: string; stdout: string; stderr: string }> {
  const out = captureOut();
  const code = await runCli(args, {
    out,
    store,
    isTTY: false,
    platform: "linux",
    upstream: null,
    ...extra,
  });
  const stdout = out.out.join("");
  const stderr = out.err.join("");
  return { code, text: stdout + stderr, stdout, stderr };
}

/** A provider that echoes the credential back, the worst realistic case. */
const echoingFetch = (async () =>
  new Response(JSON.stringify({ result: { status: "active", echo: CANARY } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as unknown as typeof fetch;

describe("secret canary", () => {
  it("has exactly one emission path", async () => {
    const { store } = await memoryStore({ "cloudflare.token": CANARY });

    // Positive control: without this, every "no leak" assertion below would
    // pass trivially if the store were empty.
    const emitted = await run(["env", "secret", "cloudflare.token", "--stdout"], store);
    assert.equal(emitted.code, 0);
    assert.equal(emitted.stdout, CANARY);
    assert.equal(emitted.stderr, "");
  });

  it("never leaks the value into any diagnostic, plan, list or error", async () => {
    const { store } = await memoryStore({ "cloudflare.token": CANARY, "slack.token": CANARY });

    const commands: readonly (readonly string[])[] = [
      ["env", "status", "--json"],
      ["env", "status"],
      ["env", "list", "--json"],
      ["env", "list"],
      ["env", "plan", "--json"],
      ["env", "plan"],
      ["env", "doctor", "--json"],
      ["env", "doctor"],
      ["integration", "list", "--json"],
      ["integration", "list"],
      ["integration", "status", "--json"],
      ["env", "secret", "missing.name", "--stdout"],
      ["env", "not-a-command"],
      ["deploy", "--site", "example.com", "--json"],
    ];

    for (const command of commands) {
      const result = await run(command, store, { fetchFn: echoingFetch });
      assert.equal(
        result.text.includes(CANARY),
        false,
        `secret leaked through: ${command.join(" ")}`,
      );
    }
  });

  it("does not accept a secret as an argument and does not echo it back", async () => {
    const { store } = await memoryStore();
    const result = await run(["env", "store", "set", "cloudflare.token", CANARY], store);
    assert.equal(result.code, 2);
    assert.equal(result.text.includes(CANARY), false);
    assert.match(result.stderr, /never passed as arguments/);
  });

  it("requires the explicit --stdout acknowledgement", async () => {
    const { store } = await memoryStore({ "cloudflare.token": CANARY });
    const bare = await run(["env", "secret", "cloudflare.token"], store);
    assert.equal(bare.code, 2);
    assert.equal(bare.text.includes(CANARY), false);

    const asJson = await run(["env", "secret", "cloudflare.token", "--stdout", "--json"], store);
    assert.equal(asJson.code, 2);
    assert.match(asJson.stderr, /not allowed here/);
  });

  it("refuses to read a secret from an interactive terminal", async () => {
    const { store } = await memoryStore();
    const out = captureOut();
    const code = await runCli(["env", "store", "set", "slack.token", "--stdin"], {
      out,
      store,
      isTTY: true,
      upstream: null,
    });
    assert.equal(code, 2);
    assert.match(out.err.join(""), /Refusing to read a secret from an interactive terminal/);
  });

  it("redacts a value that reaches an error message", async () => {
    const { store } = await memoryStore({ "cloudflare.token": CANARY });
    // A provider that puts the credential in the failure text: the message must
    // still come out clean.
    const hostileFetch = (async () =>
      new Response(JSON.stringify({ error: `invalid token ${CANARY}` }), { status: 500 })) as unknown as typeof fetch;
    const result = await run(["integration", "status", "cloudflare", "--json"], store, { fetchFn: hostileFetch });
    assert.equal(result.text.includes(CANARY), false);
  });
});
