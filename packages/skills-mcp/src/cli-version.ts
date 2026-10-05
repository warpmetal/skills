/**
 * cli-version.ts - the CLI version floor, and what a version is allowed to mean.
 *
 * The floor is load-bearing rather than advisory. This server derives
 * `--confirm` literals, flag names and an exit-code mapping from one specific
 * CLI contract. An older CLI can print a different usage line or exit with a
 * code that maps to the wrong status, and none of that fails loudly: it makes
 * the gate authorise something other than the sentence it showed a human.
 *
 * The version is read from the CLI's own public manifest, which the executor
 * already opens to locate the binary, so checking it costs no extra process.
 * That also means null is a real answer: an explicit `WARPMETAL_CLI_JS`
 * override, a bare PATH executable or the degraded cmd shim has no manifest to
 * read. Null is *unknown*, never "below", because refusing a CLI on a host this
 * server could not inspect would block work for a fact nobody established.
 */
export const MIN_CLI_VERSION: readonly number[] = [0, 8, 1];
export const INSTALL_SSH_CLI_VERSION: readonly number[] = [0, 8, 10];

/** A loose major.minor.patch read. Anything unparseable is null, never zero. */
export function parseSemver(text: string): number[] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  if (match === null) {
    return null;
  }
  return [Number(match[1] ?? "0"), Number(match[2] ?? "0"), Number(match[3] ?? "0")];
}

export function isBelow(version: readonly number[], floor: readonly number[]): boolean {
  for (let i = 0; i < 3; i += 1) {
    const left = version[i] ?? 0;
    const right = floor[i] ?? 0;
    if (left !== right) {
      return left < right;
    }
  }
  return false;
}

export function joinVersion(version: readonly number[]): string {
  return version.map((part) => String(part)).join(".");
}

export interface VersionVerdict {
  /** The version as it was read, for the message a human will see. */
  observed: string;
  /** Null when the string was not a semantic version. */
  parsed: number[] | null;
  /** True only when a parsed version is genuinely below the floor. */
  belowFloor: boolean;
}

/**
 * The comparison a caller actually wants, so the polarity cannot be got wrong
 * at the call site. Returns null when there was no version to judge at all.
 */
export function judgeCliVersion(
  raw: string | null,
  floor: readonly number[] = MIN_CLI_VERSION,
): VersionVerdict | null {
  if (raw === null || raw.length === 0) {
    return null;
  }
  const parsed = parseSemver(raw);
  return {
    observed: raw,
    parsed,
    belowFloor: parsed !== null && isBelow(parsed, floor),
  };
}
