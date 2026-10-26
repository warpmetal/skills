/**
 * WarpMetal provider invoker: resolves the CLI and runs
 * `warpmetal integration <provider> <verb> --args-json … --json`.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CliResolutionError,
  DEFAULT_TIMEOUT_MS,
  extractJson,
  findProjectRoot,
  resolveIntegrationCliTarget,
  type CliTarget,
} from "../exec.js";
import { childEnv } from "../child-env.js";
import { findProviderToolMapping } from "./mapping.js";
import type { ProviderInvokeError, ProviderInvokeErrorCode, ProviderInvoker } from "./types.js";

const MAX_OUTPUT_CHARS = 5 * 1024 * 1024;

export function providerError(
  code: ProviderInvokeErrorCode,
  message: string,
  cause?: unknown,
): Error & { provider: ProviderInvokeError } {
  const error = new Error(message, cause instanceof Error ? { cause } : undefined) as Error & {
    provider: ProviderInvokeError;
  };
  error.provider = { code, message };
  return error;
}

function isProviderError(error: unknown): error is Error & { provider: ProviderInvokeError } {
  if (!(error instanceof Error)) return false;
  const provider = (error as Error & { provider?: unknown }).provider;
  return (
    typeof provider === "object" &&
    provider !== null &&
    typeof (provider as ProviderInvokeError).code === "string"
  );
}

export class WarpMetalProviderInvoker implements ProviderInvoker {
  readonly configured: boolean;
  private readonly env: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;
  private cachedTarget: CliTarget | null = null;

  constructor(
    options: {
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
      configured?: boolean;
      target?: CliTarget;
    } = {},
  ) {
    this.env = options.env ?? process.env;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.cachedTarget = options.target ?? null;
    if (options.configured !== undefined) {
      this.configured = options.configured;
    } else {
      this.configured = this.tryResolve() !== null;
    }
  }

  async invoke(toolSlug: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.configured) {
      throw providerError(
        "provider_unconfigured",
        "Provider tools require the WarpMetal CLI (@warpmetal/cli). Install it in the project or set WARPMETAL_CLI_JS to the CLI entry, then restart warpmetal-skills-mcp (stdio / full profile).",
      );
    }

    const mapping = findProviderToolMapping(toolSlug);
    if (mapping === undefined) {
      throw providerError(
        "provider_not_implemented",
        `No WarpMetal mapping for tool ${toolSlug}.`,
      );
    }

    const target = this.resolveTarget();
    const argv = [
      "integration",
      mapping.provider,
      mapping.verb,
      "--args-stdin",
      "--json",
    ];
    if (mapping.mutating) {
      if (!mapping.gate) {
        throw providerError(
          "provider_invalid_args",
          `Mutating tool ${toolSlug} is missing a confirm gate in the mapping.`,
        );
      }
      argv.push("--confirm", mapping.gate);
    }

    try {
      // Same boundary as the wm_* executor: the provider CLI gets a sanitized
      // copy of the environment, never the one this process inherited.
      return await spawnIntegration(target, argv, this.timeoutMs, JSON.stringify(args), childEnv(this.env));
    } catch (error) {
      if (isProviderError(error)) throw error;
      throw providerError(
        "provider_invoke_failed",
        error instanceof Error ? error.message : String(error),
        error,
      );
    }
  }

  private tryResolve(): CliTarget | null {
    try {
      return this.resolveTarget();
    } catch {
      return null;
    }
  }

  private resolveTarget(): CliTarget {
    if (this.cachedTarget !== null) return this.cachedTarget;
    const projectRoot =
      this.env["WARPMETAL_MCP_CLI_ROOT"] ??
      findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));
    try {
      this.cachedTarget = resolveIntegrationCliTarget(this.env, process.execPath, projectRoot);
      return this.cachedTarget;
    } catch (error) {
      if (error instanceof CliResolutionError) {
        throw providerError("provider_unconfigured", error.message, error);
      }
      throw error;
    }
  }
}

export async function spawnIntegration(
  target: CliTarget,
  argv: readonly string[],
  timeoutMs: number,
  stdinPayload?: string,
  env?: NodeJS.ProcessEnv,
): Promise<unknown> {
  let stdout = "";
  let stderr = "";
  let truncated = false;

  const append = (which: "stdout" | "stderr", chunk: string): void => {
    const current = which === "stdout" ? stdout : stderr;
    if (current.length >= MAX_OUTPUT_CHARS) {
      truncated = true;
      return;
    }
    const next = current + chunk;
    if (next.length > MAX_OUTPUT_CHARS) {
      truncated = true;
      if (which === "stdout") stdout = next.slice(0, MAX_OUTPUT_CHARS);
      else stderr = next.slice(0, MAX_OUTPUT_CHARS);
      return;
    }
    if (which === "stdout") stdout = next;
    else stderr = next;
  };

  const exitCode = await new Promise<number>((resolve) => {
    let settled = false;
    const child = spawn(target.command, [...target.prefixArgs, ...argv], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      ...(env !== undefined ? { env } : {}),
    });
    // The payload goes over stdin, never argv, so it cannot be read from the
    // process list. Always end the stream: `--args-stdin` waits for EOF.
    child.stdin?.on("error", () => {
      // A child that exits before reading (e.g. a usage error) closes the pipe;
      // that is not an executor failure, the exit code and stderr carry it.
    });
    child.stdin?.end(stdinPayload ?? "");
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: string) => append("stderr", chunk));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    const finish = (code: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code);
    };

    child.on("error", (error: Error) => {
      append("stderr", `\nspawn error: ${error.message}`);
      finish(127);
    });
    child.on("close", (code) => finish(code ?? 127));
  });

  const parsed = extractJson(stdout);
  const document =
    parsed.found && typeof parsed.value === "object" && parsed.value !== null
      ? (parsed.value as Record<string, unknown>)
      : null;

  if (exitCode === 4) {
    const message =
      firstWarning(document) ??
      (stderr.trim() ||
        "Provider authentication required. Store the secret with warpmetal env store set.");
    throw providerError("provider_unconfigured", message);
  }

  if (exitCode !== 0) {
    const message =
      firstError(document) ??
      (stderr.trim() || `warpmetal integration exited ${String(exitCode)}`);
    throw providerError("provider_invoke_failed", truncated ? `${message} (output truncated)` : message);
  }

  if (document === null) {
    throw providerError(
      "provider_invoke_failed",
      stderr.trim() || "Provider call succeeded but emitted no parseable JSON.",
    );
  }

  const results = Array.isArray(document["results"]) ? document["results"] : null;
  if (results && results.length > 0) {
    const first = results[0] as Record<string, unknown>;
    if (first["status"] === "NEEDS_AUTH") {
      throw providerError(
        "provider_unconfigured",
        firstWarning({ results }) ?? "Provider authentication required.",
      );
    }
    if (first["status"] === "ERROR") {
      throw providerError(
        "provider_invoke_failed",
        firstError({ results }) ?? "Provider rejected the action.",
      );
    }
    return first["data"] ?? first;
  }

  return document["data"] ?? document;
}

function firstWarning(document: Record<string, unknown> | null): string | null {
  if (!document) return null;
  const results = Array.isArray(document["results"]) ? document["results"] : null;
  if (results?.[0] && typeof results[0] === "object" && results[0] !== null) {
    const warnings = (results[0] as { warnings?: unknown }).warnings;
    if (Array.isArray(warnings) && typeof warnings[0] === "string") return warnings[0];
  }
  return null;
}

function firstError(document: Record<string, unknown> | null): string | null {
  if (!document) return null;
  if (typeof document["message"] === "string") return document["message"];
  const results = Array.isArray(document["results"]) ? document["results"] : null;
  if (results?.[0] && typeof results[0] === "object" && results[0] !== null) {
    const errors = (results[0] as { errors?: unknown }).errors;
    if (Array.isArray(errors) && typeof errors[0] === "string") return errors[0];
  }
  return null;
}

export function createProviderInvokerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProviderInvoker {
  return new WarpMetalProviderInvoker({ env });
}

/** Test helper: invoker that never spawns the CLI. */
export function createMockProviderInvoker(options: {
  configured?: boolean;
  invoke?: (toolSlug: string, args: Record<string, unknown>) => Promise<unknown>;
}): ProviderInvoker {
  const configured = options.configured ?? false;
  return {
    configured,
    async invoke(toolSlug, args) {
      if (!configured) {
        throw providerError(
          "provider_unconfigured",
          "Provider tools require the WarpMetal CLI (@warpmetal/cli).",
        );
      }
      if (options.invoke) return options.invoke(toolSlug, args);
      return { ok: true, tool: toolSlug, args };
    },
  };
}
