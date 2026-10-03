/**
 * Bounded, redacted error taxonomy for the warpmetal CLI.
 *
 * Exit codes follow the contract frozen in docs/coding-env-skill-plan.md:
 *   0 ok; 2 usage/config error; 3 needs agent host; 4 needs provider auth;
 *   5 apply failed; 6 integrity/unsupported platform.
 *
 * A code maps to exactly one exit code so a caller never has to guess. The
 * message is always safe to print: it never carries a secret value, only the
 * name of the thing that failed.
 */
export type CliErrorCode =
  | "usage_error"
  | "invalid_request"
  | "invalid_path"
  | "secret_missing"
  | "backend_unavailable"
  | "vault_corrupt"
  | "provider_auth"
  | "provider_error"
  | "unsupported";

export const EXIT = {
  OK: 0,
  USAGE: 2,
  NEEDS_HOST: 3,
  NEEDS_AUTH: 4,
  APPLY_FAILED: 5,
  INTEGRITY: 6,
} as const;

const EXIT_BY_CODE: Record<CliErrorCode, number> = {
  usage_error: EXIT.USAGE,
  invalid_request: EXIT.USAGE,
  invalid_path: EXIT.USAGE,
  // "not found" is a lookup miss, not a usage error; 3 is the documented
  // generic "needs something first" code shared with the host requirement.
  secret_missing: EXIT.NEEDS_HOST,
  backend_unavailable: EXIT.INTEGRITY,
  vault_corrupt: EXIT.INTEGRITY,
  provider_auth: EXIT.NEEDS_AUTH,
  provider_error: EXIT.APPLY_FAILED,
  unsupported: EXIT.INTEGRITY,
};

export class CliError extends Error {
  readonly code: CliErrorCode;
  readonly exitCode: number;

  constructor(code: CliErrorCode, message: string, exitCode?: number) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode ?? EXIT_BY_CODE[code];
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof CliError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function exitCodeFor(error: unknown): number {
  if (error instanceof CliError) return error.exitCode;
  return EXIT.APPLY_FAILED;
}

export function errorCodeFor(error: unknown): CliErrorCode {
  if (error instanceof CliError) return error.code;
  return "provider_error";
}
