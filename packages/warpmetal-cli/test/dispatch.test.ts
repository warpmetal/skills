import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { runCli } from "../src/dispatch.js";
import { captureOut } from "../src/output.js";
import { resolveUpstream, type InheritSpawn } from "../src/upstream.js";
import { memoryStore } from "./helpers.js";

function recorder(): { spawn: InheritSpawn; calls: Array<{ command: string; args: readonly string[] }> } {
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  return {
    calls,
    spawn: async (command, args) => {
      calls.push({ command, args });
      return 0;
    },
  };
}

const FAKE_UPSTREAM = { command: "node", prefix: ["/fake/upstream.js"], description: "test double" };

describe("dispatcher", () => {
  it("keeps `env` and `integration` local", async () => {
    const { store } = await memoryStore();
    const { spawn, calls } = recorder();

    for (const argv of [
      ["env", "status", "--json"],
      ["integration", "list", "--json"],
    ]) {
      const out = captureOut();
      const code = await runCli(argv, { out, store, upstream: FAKE_UPSTREAM, spawnInherit: spawn, isTTY: false });
      assert.equal(code, 0, `${argv.join(" ")} should succeed`);
      assert.equal(calls.length, 0, `${argv.join(" ")} must not be delegated`);
    }
  });

  it("forwards everything else verbatim, in order, with no reinterpretation", async () => {
    const { store } = await memoryStore();
    const { spawn, calls } = recorder();
    const argv = ["deploy", "--site", "example.com", "--confirm", "CONFIRM DEPLOY", "--json"];

    const out = captureOut();
    const code = await runCli(argv, { out, store, upstream: FAKE_UPSTREAM, spawnInherit: spawn, isTTY: false });

    assert.equal(code, 0);
    assert.deepEqual(calls, [{ command: "node", args: ["/fake/upstream.js", ...argv] }]);
  });

  it("reports a missing upstream instead of guessing", async () => {
    const { store } = await memoryStore();
    const out = captureOut();
    const code = await runCli(["deploy", "--site", "example.com"], {
      out,
      store,
      upstream: null,
      isTTY: false,
    });
    assert.equal(code, 2);
    assert.match(out.err.join(""), /upstream warpmetal CLI is not installed/);
  });

  it("emits a machine-readable error document when --json was requested", async () => {
    const { store } = await memoryStore();
    const out = captureOut();
    const code = await runCli(["env", "not-a-command", "--json"], { out, store, upstream: null, isTTY: false });

    assert.equal(code, 2);
    const document = JSON.parse(out.out.join("")) as { ok: boolean; error: string };
    assert.equal(document.ok, false);
    assert.equal(document.error, "usage_error");
  });

  it("reports the local version and the upstream it resolves", async () => {
    const { store } = await memoryStore();
    const out = captureOut();
    const code = await runCli(["--version"], { out, store, upstream: null, isTTY: false });

    assert.equal(code, 0);
    const text = out.out.join("");
    assert.match(text, /^warpmetal \d+\.\d+\.\d+/);
    assert.match(text, /upstream not installed/);
  });
});

describe("upstream resolution", () => {
  const packageRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

  it("resolves the alias to a real binary and never to itself", () => {
    const target = resolveUpstream({ fromDir: packageRoot, env: {} });
    if (target === null) {
      // The dependency is declared; if it is not installed the contract test
      // says so explicitly rather than passing silently.
      assert.fail("warpmetal-upstream should resolve from node_modules after `npm install`.");
    }
    assert.equal(target.command, process.execPath);
    const entry = target.prefix[0]!;
    assert.equal(existsSync(entry), true, `${entry} should exist on disk`);
    assert.equal(entry.includes(join("warpmetal-cli", "dist")), false, "must not resolve to this CLI");
  });

  it("honours WARPMETAL_UPSTREAM_CLI_JS and refuses a missing file", () => {
    const fake = join(packageRoot, "package.json");
    const target = resolveUpstream({ fromDir: packageRoot, env: { WARPMETAL_UPSTREAM_CLI_JS: fake } });
    assert.equal(target?.prefix[0], fake);

    assert.throws(
      () => resolveUpstream({ fromDir: packageRoot, env: { WARPMETAL_UPSTREAM_CLI_JS: join(packageRoot, "nope.js") } }),
      /missing file/,
    );
  });
});
