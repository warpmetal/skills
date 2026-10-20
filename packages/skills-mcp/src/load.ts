/**
 * load.ts - registry resolution shared by both entrypoints.
 *
 * The v1 entrypoint (`index.ts`) and the v2 ChatGPT entrypoint (`chatgpt.ts`)
 * resolve the registry identically: the same flags, the same token-file
 * handling, the same fallbacks. Keeping that in one place means the two
 * transports cannot disagree about which registry they are serving.
 */
import { readFile } from "node:fs/promises";

import type { CliOptions } from "./cli.js";
import { SkillError } from "./errors.js";
import { loadRegistry, type LoadedRegistry } from "./registry.js";

/**
 * `--registry-token-file` exists so hosts that scrub `*TOKEN*` environment
 * variables can still pass a credential without putting it in the process list
 * or the environment.
 */
export async function readTokenFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new SkillError(
      "invalid_request",
      `--registry-token-file: cannot read ${path}: ${(error as Error).message}`,
    );
  }
}

/** Resolves the registry exactly as the CLI flags asked for it. */
export async function loadRegistryForCli(options: CliOptions): Promise<LoadedRegistry> {
  const registryToken = options.registryTokenFile
    ? await readTokenFile(options.registryTokenFile)
    : undefined;

  return loadRegistry({
    registry: options.registry,
    tag: options.tag,
    cacheDir: options.cacheDir,
    offline: options.offline,
    noFallback: options.noFallback,
    registryToken,
  });
}
