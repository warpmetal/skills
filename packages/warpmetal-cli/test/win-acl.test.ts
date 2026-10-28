import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runCli } from "../src/dispatch.js";
import { captureOut } from "../src/output.js";
import type { CommandRunner } from "../src/run.js";
import { CredentialStore } from "../src/env/store.js";
import { checkWindowsAcl, findWorldAces } from "../src/env/win-acl.js";
import { tempEnv } from "./helpers.js";

/** Captured from a real Windows host: owner-only vault file. */
const CLEAN_SDDL =
  "O:S-1-5-21-1-2-3-1001G:S-1-5-21-1-2-3-513D:AI(A;ID;FA;;;SY)(A;ID;FA;;;BA)(A;ID;FA;;;S-1-5-21-1-2-3-1001)";

/** Captured after `icacls <dir> /grant *S-1-1-0:(OI)(CI)R`: Everyone inherited read. */
const EXPOSED_SDDL =
  "O:S-1-5-21-1-2-3-1001G:S-1-5-21-1-2-3-513D:AI(A;ID;FR;;;WD)(A;ID;FA;;;SY)(A;ID;FA;;;BA)";

function fakeRun(
  stdout: string,
  code = 0,
  stderr = "",
): { run: CommandRunner; calls: Array<{ command: string; args: readonly string[]; env?: Record<string, string> }> } {
  const calls: Array<{ command: string; args: readonly string[]; env?: Record<string, string> }> = [];
  const run: CommandRunner = async (command, args, options) => {
    calls.push({ command, args, ...(options?.env !== undefined ? { env: { ...options.env } } : {}) });
    return { code, stdout, stderr };
  };
  return { run, calls };
}

describe("windows acl", () => {
  it("classifies ACEs by the trustee field only", () => {
    assert.deepEqual(findWorldAces(CLEAN_SDDL), []);
    assert.deepEqual(findWorldAces(EXPOSED_SDDL), ["WD"]);
    // The SID spellings must work too: a descriptor may use either form.
    assert.deepEqual(findWorldAces("(A;;FR;;;S-1-1-0)"), ["S-1-1-0"]);
    assert.deepEqual(findWorldAces("(A;;FR;;;BU)(A;;FR;;;AU)"), ["BU", "AU"]);
    // A GUID or rights string containing the letters WD is not a trustee.
    assert.deepEqual(findWorldAces("(A;;WD;;;SY)"), []);
    // A deny ACE restricts access, so it is the opposite of exposure: hardened
    // hosts put `(D;CIID;DT;;;WD)` on the directories they create.
    assert.deepEqual(findWorldAces("(D;CIID;DT;;;WD)"), []);
    assert.deepEqual(findWorldAces("(D;;FR;;;S-1-1-0)"), []);
    assert.deepEqual(findWorldAces("not a descriptor"), []);
  });

  it("reads the descriptor through the environment, never through the command string", async () => {
    const fake = fakeRun(CLEAN_SDDL);
    const verdict = await checkWindowsAcl(fake.run, "C:\\Users\\op\\.config\\warpmetal\\env", "win32");

    assert.equal(verdict.status, "ok");
    assert.equal(fake.calls.length, 1);
    const call = fake.calls[0]!;
    assert.equal(call.command, "powershell.exe");
    assert.ok(!call.args.join(" ").includes("warpmetal"), "the path must not be interpolated into argv");
    assert.equal(call.env?.["WARPMETAL_ACL_PATH"], "C:\\Users\\op\\.config\\warpmetal\\env");
    // A caller launched from PowerShell 7 would otherwise hand 5.1 a module
    // path that shadows the module owning Get-Acl, and a healthy host would be
    // reported as unknown.
    const modulePath = call.env?.["PSModulePath"] ?? "";
    assert.ok(modulePath.includes("WindowsPowerShell\\v1.0\\Modules"), modulePath);
    assert.equal(modulePath.includes("PowerShell\\7"), false, modulePath);
  });

  it("reports exposed when a broad trustee is present", async () => {
    const fake = fakeRun(EXPOSED_SDDL);
    const verdict = await checkWindowsAcl(fake.run, "C:\\vault", "win32");
    assert.equal(verdict.status, "exposed");
    assert.deepEqual(verdict.trustees, ["WD"]);
  });

  it("never rounds an unreadable descriptor up to ok", async () => {
    const failing = fakeRun("", 1);
    assert.equal((await checkWindowsAcl(failing.run, "C:\\vault", "win32")).status, "unknown");

    const garbage = fakeRun("Access is denied.");
    assert.equal((await checkWindowsAcl(garbage.run, "C:\\vault", "win32")).status, "unknown");

    // The verdict must explain itself: an unexplained `unknown` in a CI log is
    // indistinguishable from a flake.
    const explained = fakeRun(
      "",
      1,
      "The 'Get-Acl' command was found in the module 'Microsoft.PowerShell.Security', but the module could not be loaded.",
    );
    const explainedVerdict = await checkWindowsAcl(explained.run, "C:\\vault", "win32");
    assert.equal(explainedVerdict.status, "unknown");
    assert.match(explainedVerdict.detail, /could not be loaded/);

    const offWindows = fakeRun(CLEAN_SDDL);
    assert.equal((await checkWindowsAcl(offWindows.run, "/home/op", "linux")).status, "unknown");
    assert.equal(offWindows.calls.length, 0, "no process may start off Windows");
  });

  it("surfaces the verdict through env doctor", async () => {
    const temp = await tempEnv();
    try {
      // A passphrase, not a key file: the point of this test is the ACL check,
      // and `key-material` would rightly fail `doctor` for a different reason.
      const env = { ...temp.env, WARPMETAL_VAULT_PASSPHRASE: "doctor-test-passphrase" };
      const store = await CredentialStore.open({ env, preferKeychain: false });
      await store.write("demo.token", "value");

      const exposed = fakeRun(EXPOSED_SDDL);
      const exposedOut = captureOut();
      const exposedCode = await runCli(["env", "doctor", "--json"], {
        out: exposedOut,
        store,
        env,
        platform: "win32",
        run: exposed.run,
        isTTY: false,
        upstream: null,
      });
      const document = JSON.parse(exposedOut.out.join("")) as {
        checks: Array<{ name: string; status: string; detail: string }>;
        warnings: string[];
      };
      const permissions = document.checks.find((check) => check.name === "permissions");
      assert.equal(permissions?.status, "warn");
      assert.match(permissions?.detail ?? "", /WD/);
      assert.ok(document.warnings.some((warning) => warning.includes("ACL")));
      assert.equal(exposedCode, 0, "an ACL warning must not fail doctor");

      const clean = fakeRun(CLEAN_SDDL);
      const cleanOut = captureOut();
      await runCli(["env", "doctor", "--json"], {
        out: cleanOut,
        store,
        env,
        platform: "win32",
        run: clean.run,
        isTTY: false,
        upstream: null,
      });
      const cleanDocument = JSON.parse(cleanOut.out.join("")) as {
        checks: Array<{ name: string; status: string; detail: string }>;
      };
      const cleanPermissions = cleanDocument.checks.find((check) => check.name === "permissions");
      assert.equal(cleanPermissions?.status, "ok");
      assert.match(cleanPermissions?.detail ?? "", /no broad-read ACE/);

      const unknown = fakeRun("", 1);
      const unknownOut = captureOut();
      await runCli(["env", "doctor", "--json"], {
        out: unknownOut,
        store,
        env,
        platform: "win32",
        run: unknown.run,
        isTTY: false,
        upstream: null,
      });
      const unknownDocument = JSON.parse(unknownOut.out.join("")) as {
        checks: Array<{ name: string; status: string }>;
      };
      assert.equal(unknownDocument.checks.find((check) => check.name === "permissions")?.status, "warn");
    } finally {
      await temp.cleanup();
    }
  });

  it("detects a real Everyone grant on Windows", async (context) => {
    if (process.platform !== "win32") {
      context.skip("the icacls round trip only exists on Windows");
      return;
    }
    const temp = await tempEnv();
    const { createRunner } = await import("../src/run.js");
    const run = createRunner();
    try {
      // The directory only exists after the first write, and `icacls` on a
      // missing path is a different failure than the one under test.
      const store = await CredentialStore.open({ env: temp.env, preferKeychain: false });
      await store.write("demo.token", "value");
      const vaultDir = join(temp.dir, "env");

      // A directory under %TEMP% inherits whatever ACL the host gives it, so the
      // test cannot claim the baseline is clean. What it can prove is that the
      // check reacts to a real ACL change: the descriptor is readable, the
      // Everyone grant is detected, and removing it restores the baseline.
      const before = await checkWindowsAcl(run, vaultDir, "win32");
      assert.notEqual(before.status, "unknown", `descriptor unreadable on this host: ${before.detail}`);

      const grant = await run("icacls", [vaultDir, "/grant", "*S-1-1-0:(OI)(CI)R"]);
      assert.equal(grant.code, 0, grant.stderr);

      const exposed = await checkWindowsAcl(run, vaultDir, "win32");
      assert.equal(exposed.status, "exposed", exposed.detail);
      assert.ok(exposed.trustees.includes("WD"), exposed.detail);

      const remove = await run("icacls", [vaultDir, "/remove:g", "*S-1-1-0"]);
      assert.equal(remove.code, 0, remove.stderr);
      const restored = await checkWindowsAcl(run, vaultDir, "win32");
      assert.equal(restored.status, before.status, restored.detail);
    } finally {
      await temp.cleanup();
    }
  });
});
