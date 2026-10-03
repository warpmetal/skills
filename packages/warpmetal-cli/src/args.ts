import { CliError } from "./errors.js";

/**
 * A deliberately small argument parser.
 *
 * It reproduces the upstream CLI's shape (`--flag value`, `--flag=value`,
 * boolean `--flag`) without attempting to be a general framework. Anything this
 * parser does not understand is a usage error rather than a guess, because the
 * one thing that must never happen is silently running a mutation with a flag
 * the operator thought they had passed.
 */
export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly flags: ReadonlyMap<string, string | true>;
}

const FLAG_NAME = /^--?[A-Za-z][A-Za-z0-9-]*$/;

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) break;

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("-") && token !== "-") {
      const equals = token.indexOf("=");
      const rawName = equals === -1 ? token : token.slice(0, equals);
      const name = rawName.replace(/^--?/, "");
      if (!FLAG_NAME.test(rawName) || name.length === 0) {
        throw new CliError("usage_error", `Unknown argument: ${token}`);
      }
      if (flags.has(name)) {
        throw new CliError("usage_error", `Repeated argument: --${name}`);
      }
      if (equals !== -1) {
        flags.set(name, token.slice(equals + 1));
        continue;
      }
      const next = argv[index + 1];
      // A following token that looks like a flag is never consumed as a value,
      // so `--json --confirm X` cannot silently swallow `--confirm`.
      if (next !== undefined && !(next.startsWith("--") && next.length > 2)) {
        flags.set(name, next);
        index += 1;
      } else {
        flags.set(name, true);
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, flags };
}

export function flagString(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function flagBool(parsed: ParsedArgs, name: string): boolean {
  return parsed.flags.has(name);
}

export function requireFlag(parsed: ParsedArgs, name: string): string {
  const value = flagString(parsed, name);
  if (value === undefined || value.length === 0) {
    throw new CliError("usage_error", `Missing required argument: --${name}`);
  }
  return value;
}

/**
 * A typed confirmation gate. The toolkit's convention is that a mutating
 * operation names the damage in an uppercase literal; a missing or wrong
 * literal performs no mutation at all.
 */
export function requireConfirm(parsed: ParsedArgs, expected: string): void {
  const provided = flagString(parsed, "confirm");
  if (provided !== expected) {
    throw new CliError(
      "usage_error",
      `Approval required. Re-run with --confirm "${expected}"`,
    );
  }
}

export function knownFlags(
  parsed: ParsedArgs,
  allowed: readonly string[],
): void {
  const allow = new Set(allowed);
  for (const name of parsed.flags.keys()) {
    if (!allow.has(name)) {
      throw new CliError("usage_error", `Unknown argument: --${name}`);
    }
  }
}
