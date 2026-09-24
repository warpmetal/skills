/**
 * cli.ts - the shared way the contract suites talk to the real CLI.
 *
 * Named `cli.ts` rather than `cli.test.ts` on purpose: the glob that runs the
 * suites matches `*.test.js`, so this module is compiled and imported but never
 * treated as a suite of its own.
 *
 * The spawn mirrors the executor - resolved binary, `shell: false`, both streams
 * captured - so a suite that uses this also exercises the resolution path a real
 * client would take, rather than a hand-written `warpmetal` command line.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCliTarget } from "../src/exec.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * `<package>/test` -> the package root, where the pinned devDependency lives.
 *
 * Unlike the origin server, these suites run from source through `tsx`, so the
 * module's own directory is `test/` rather than `dist/test/` and the package
 * root is one level up, not two.
 */
export const PROJECT_ROOT = path.resolve(HERE, "..");

export interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Whether the CLI can be found at all. Callers turn this into a skip with a
 * reason, never into a pass: a contract suite that goes green because the
 * subject is absent is worse than no suite.
 */
export function cliAvailable(): boolean {
  try {
    resolveCliTarget(process.env, process.execPath, PROJECT_ROOT);
    return true;
  } catch {
    return false;
  }
}

export interface CliReadiness {
  ok: boolean;
  /** Empty when `ok`. Otherwise a sentence naming the cause, for a skip reason. */
  reason: string;
}

/**
 * Whether the CLI can read its own local state, which is what the private
 * collections live in. A resolved binary is not enough: an install with no
 * accepted credential, or no state file at all, spawns fine and then answers
 * with an exit code instead of a payload.
 *
 * The distinction matters for a suite that runs in CI. Exit 4 is "missing or
 * rejected credential"; anything else that is not 0 is reported verbatim rather
 * than guessed at, so a chronic skip is legible instead of looking like a pass.
 */
export async function cliStateReady(): Promise<CliReadiness> {
  let run: CliRun;
  try {
    run = await runCli(["state", "list", "--json"]);
  } catch (error) {
    return { ok: false, reason: `the CLI could not be spawned: ${(error as Error).message}` };
  }
  if (run.exitCode === 0) {
    return { ok: true, reason: "" };
  }
  if (run.exitCode === 4) {
    return { ok: false, reason: "the CLI has no accepted credential on this host" };
  }
  return {
    ok: false,
    reason: `\`warpmetal state list\` exited ${String(run.exitCode)}, so the local install could not be read`,
  };
}

export function runCli(args: readonly string[], timeoutMs = 20_000): Promise<CliRun> {
  const target = resolveCliTarget(process.env, process.execPath, PROJECT_ROOT);
  return new Promise<CliRun>((resolve, reject) => {
    const child = spawn(target.command, [...target.prefixArgs, ...args], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout, stderr, timedOut });
    });
  });
}
