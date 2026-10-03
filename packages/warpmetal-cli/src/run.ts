import { spawn } from "node:child_process";

/**
 * The only place the CLI starts a child process.
 *
 * Always `shell: false` with an argv array: no input from a manifest, a flag or
 * an API response is ever concatenated into a command string. A tool that is
 * not installed is a normal, reportable outcome (exit 127) rather than an
 * exception, because "the `gh` CLI is missing" must degrade visibly and never
 * be mistaken for "the token is bad".
 */
export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: { readonly stdin?: string; readonly env?: Readonly<Record<string, string>> },
) => Promise<RunResult>;

export function createRunner(): CommandRunner {
  return (command, args, options) =>
    new Promise<RunResult>((resolve) => {
      let child;
      try {
        const env = options?.env === undefined ? undefined : { ...process.env, ...options.env };
        child = spawn(command, [...args], { shell: false, windowsHide: true, ...(env !== undefined ? { env } : {}) });
      } catch (error) {
        resolve({ code: 127, stdout: "", stderr: (error as Error).message });
        return;
      }

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` });
      });
      child.on("close", (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
      if (options?.stdin !== undefined) {
        child.stdin?.end(options.stdin);
      }
    });
}

/** True when the tool can be started at all. Probed, never assumed. */
export async function toolAvailable(run: CommandRunner, command: string): Promise<boolean> {
  const result = await run(command, ["--version"]);
  return result.code !== 127;
}
