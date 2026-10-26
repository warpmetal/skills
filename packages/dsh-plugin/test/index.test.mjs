import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import { applyAt, nodeRuntime, resolveLocalPaths, resolveNodeCommand } from "../index.js";

const ENTRY = join("server", "dist", "index.js");

/** A CLI/web host: the harness process is Node, so execPath is the command. */
const HOST_RUNTIME = { execPath: "/host/node", isElectron: false, win32: true };
/** The desktop host: the harness process is the Electron binary. */
const ELECTRON_RUNTIME = {
  execPath: "/apps/DeepSeek Harness.exe",
  isElectron: true,
  win32: true,
};
const NODE_BIN_TAIL = join(
  "resources",
  "runtime",
  "primary-runtime",
  "dependencies",
  "node",
  "bin",
  "node.exe",
);

const roots = [];
async function scratch() {
  const dir = await mkdtemp(join(tmpdir(), "warpmetal-dsh-local-"));
  roots.push(dir);
  return dir;
}

after(async () => {
  await Promise.all(roots.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("nodeRuntime", () => {
  test("detects a plain Node host", () => {
    const runtime = nodeRuntime({ execPath: "/host/node", platform: "win32", versions: {} });
    assert.equal(runtime.execPath, "/host/node");
    assert.equal(runtime.isElectron, false);
    assert.equal(runtime.win32, true);
  });

  test("detects the Electron desktop host", () => {
    const runtime = nodeRuntime({
      execPath: "/apps/DeepSeek Harness.exe",
      platform: "win32",
      versions: { electron: "38.0.0" },
    });
    assert.equal(runtime.isElectron, true);
  });
});

describe("resolveLocalPaths", () => {
  test("defaults to the chatgpt-local surface and the host's own Node", () => {
    const resolved = resolveLocalPaths("/bundle", {}, {}, HOST_RUNTIME);
    assert.equal(resolved.profile, "chatgpt-local");
    assert.equal(resolved.command, "/host/node");
    assert.deepEqual(resolved.args.slice(1), [
      "--profile",
      "chatgpt-local",
      "--registry",
      "/bundle",
    ]);
  });

  test("accepts the full surface and rejects anything else", () => {
    assert.equal(resolveLocalPaths("/bundle", { profile: "full" }, {}, HOST_RUNTIME).profile, "full");
    assert.throws(
      () => resolveLocalPaths("/bundle", { profile: "content" }, {}, HOST_RUNTIME),
      /invalid profile/,
    );
  });

  test("prefers the explicit override over the environment over the runtime", () => {
    const env = { WARPMETAL_DSH_NODE: "/node-a", DSH_NODE: "/node-b" };
    assert.equal(resolveLocalPaths("/bundle", {}, env, HOST_RUNTIME).command, "/node-a");
    assert.equal(resolveLocalPaths("/bundle", {}, { DSH_NODE: "/node-b" }, HOST_RUNTIME).command, "/node-b");
    assert.equal(
      resolveLocalPaths("/bundle", { command: "/node-c" }, env, HOST_RUNTIME).command,
      "/node-c",
    );
  });

  test("always launches the bundled entry, never a checkout path", () => {
    const resolved = resolveLocalPaths("/bundle", {}, {}, HOST_RUNTIME);
    assert.equal(resolved.root, "/bundle");
    assert.equal(resolved.args[0], resolved.entry);
    assert.ok(resolved.entry.endsWith(ENTRY));
  });
});

describe("resolveNodeCommand", () => {
  test("under Electron it resolves the harness Node, never execPath", () => {
    const command = resolveNodeCommand({}, {}, ELECTRON_RUNTIME);
    assert.notEqual(command, ELECTRON_RUNTIME.execPath);
    assert.ok(command.endsWith(NODE_BIN_TAIL));
  });

  test("uses the .exe on Windows and the plain name elsewhere", () => {
    const win = resolveNodeCommand({}, {}, { ...ELECTRON_RUNTIME, win32: true });
    const nix = resolveNodeCommand({}, {}, { ...ELECTRON_RUNTIME, win32: false });
    assert.ok(win.endsWith("node.exe"));
    assert.ok(nix.endsWith("node") && !nix.endsWith(".exe"));
  });

  test("under a Node host it returns execPath", () => {
    assert.equal(resolveNodeCommand({}, {}, HOST_RUNTIME), "/host/node");
  });

  test("an explicit override beats Electron", () => {
    assert.equal(resolveNodeCommand({}, { DSH_NODE: "/d" }, ELECTRON_RUNTIME), "/d");
    assert.equal(resolveNodeCommand({ command: "/c" }, { DSH_NODE: "/d" }, ELECTRON_RUNTIME), "/c");
  });
});

describe("applyAt", () => {
  test("throws an actionable error when the artifact has no server", async () => {
    const dir = await scratch();
    const ctx = { provide: () => assert.fail("must not provide a broken service") };
    assert.throws(() => applyAt(ctx, dir, {}, {}, HOST_RUNTIME), /incomplete/);
  });

  test("provides a frozen service the MCP row can read", async () => {
    const dir = await scratch();
    await mkdir(join(dir, "server", "dist"), { recursive: true });
    await writeFile(join(dir, "server", "dist", "index.js"), "// stub\n", "utf8");

    let provided;
    const ctx = {
      provide(serviceName, value) {
        provided = { serviceName, value };
      },
    };

    applyAt(ctx, dir, {}, { DSH_NODE: "/node-b" }, HOST_RUNTIME);

    assert.equal(provided.serviceName, "warpmetalLocal");
    assert.ok(Object.isFrozen(provided.value));
    assert.equal(provided.value.root, dir);
    assert.equal(provided.value.command, "/node-b");
    assert.deepEqual(provided.value.args, [
      join(dir, "server", "dist", "index.js"),
      "--profile",
      "chatgpt-local",
      "--registry",
      dir,
    ]);
  });

  test("degrades to `node` on PATH when the resolved command is missing", async () => {
    const dir = await scratch();
    await mkdir(join(dir, "server", "dist"), { recursive: true });
    await writeFile(join(dir, "server", "dist", "index.js"), "// stub\n", "utf8");

    let provided;
    const ctx = { provide: (_name, value) => (provided = value) };
    // A non-existent absolute command (a harness whose layout moved).
    applyAt(ctx, dir, {}, {}, { execPath: join(dir, "gone.exe"), isElectron: false, win32: true });

    assert.equal(provided.command, "node");
    assert.equal(provided.root, dir);
  });
});
