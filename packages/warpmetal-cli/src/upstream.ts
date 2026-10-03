import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { CliError } from "./errors.js";

/**
 * Delegation to the published upstream CLI.
 *
 * The rule is verbatim: this package owns `env` and `integration` and forwards
 * every other argv untouched. It never rewrites a flag, never reorders
 * arguments and never inspects meaning - so an upstream release that adds a
 * command works here without a code change.
 *
 * Recursion is the failure mode that must be designed out. The published
 * package's binary is also named `warpmetal`, so a PATH lookup would find this
 * very CLI. Resolution therefore only ever looks inside `node_modules`, and
 * rejects any candidate whose real path is this file.
 */
export interface UpstreamTarget {
  /** Executable to run. */
  readonly command: string;
  /** Args that precede the forwarded argv. */
  readonly prefix: readonly string[];
  /** Human-readable origin, for `--version` and errors. */
  readonly description: string;
}

export type InheritSpawn = (command: string, args: readonly string[]) => Promise<number>;

export function defaultInheritSpawn(): InheritSpawn {
  return (command, args) =>
    new Promise<number>((resolve2) => {
      const child = spawn(command, [...args], { stdio: "inherit", shell: false, windowsHide: true });
      child.on("error", () => resolve2(127));
      child.on("close", (code) => resolve2(code ?? 1));
    });
}

interface PackageBin {
  readonly name: string;
  readonly binPath: string;
}

function readPackageBin(packageDir: string): PackageBin | null {
  const manifest = join(packageDir, "package.json");
  if (!existsSync(manifest)) return null;
  let parsed: { name?: unknown; bin?: unknown };
  try {
    parsed = JSON.parse(readFileSync(manifest, "utf8")) as { name?: unknown; bin?: unknown };
  } catch {
    return null;
  }
  const name = typeof parsed.name === "string" ? parsed.name : null;
  if (name === null) return null;

  let relative: string | null = null;
  if (typeof parsed.bin === "string") {
    relative = parsed.bin;
  } else if (parsed.bin !== null && typeof parsed.bin === "object") {
    const entries = parsed.bin as Record<string, unknown>;
    const preferred = entries["warpmetal"];
    if (typeof preferred === "string") relative = preferred;
    else {
      const first = Object.values(entries).find((entry): entry is string => typeof entry === "string");
      relative = first ?? null;
    }
  }
  if (relative === null) return null;
  return { name, binPath: resolve(packageDir, relative) };
}

/** Candidate package names, in order. The alias exists to dodge the bin clash. */
const CANDIDATE_PACKAGES = ["warpmetal-upstream", "warpmetal"] as const;

function findInNodeModules(fromDir: string): UpstreamTarget | null {
  let current = resolve(fromDir);
  for (let depth = 0; depth < 8; depth += 1) {
    for (const candidate of CANDIDATE_PACKAGES) {
      const packageDir = join(current, "node_modules", candidate);
      const found = readPackageBin(packageDir);
      if (found === null) continue;
      // The guard that prevents this CLI from delegating to itself.
      if (resolve(found.binPath) === resolve(thisFile())) continue;
      return {
        command: process.execPath,
        prefix: [found.binPath],
        description: `${found.name} (${found.binPath})`,
      };
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function thisFile(): string {
  return new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
}

export interface ResolveUpstreamOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fromDir?: string;
}

export function resolveUpstream(options: ResolveUpstreamOptions = {}): UpstreamTarget | null {
  const env = options.env ?? process.env;
  const fromDir = options.fromDir ?? dirname(thisFile());

  const explicit = env["WARPMETAL_UPSTREAM_CLI_JS"];
  if (explicit !== undefined && explicit.length > 0) {
    if (!existsSync(explicit)) {
      throw new CliError("usage_error", `WARPMETAL_UPSTREAM_CLI_JS points at a missing file: ${explicit}`);
    }
    return { command: process.execPath, prefix: [explicit], description: `WARPMETAL_UPSTREAM_CLI_JS (${explicit})` };
  }

  return findInNodeModules(fromDir);
}

export async function upstreamVersion(
  target: UpstreamTarget | null,
  spawnInherit: InheritSpawn,
): Promise<string> {
  void spawnInherit;
  if (target === null) return "not installed";
  // Version is read with a captured runner rather than inherited stdio so the
  // caller can compose a single `--version` document.
  const { createRunner } = await import("./run.js");
  const result = await createRunner()(target.command, [...target.prefix, "--version"]);
  if (result.code !== 0) return "unknown";
  return result.stdout.trim().split("\n")[0] ?? "unknown";
}

export async function delegate(
  argv: readonly string[],
  target: UpstreamTarget,
  spawnInherit: InheritSpawn,
): Promise<number> {
  return spawnInherit(target.command, [...target.prefix, ...argv]);
}
