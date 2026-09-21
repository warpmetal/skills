export type SkillErrorCode =
  | "not_found"
  | "invalid_request"
  | "invalid_path"
  | "traversal_rejected"
  | "too_large"
  | "integrity_mismatch"
  | "registry_unavailable";

/** Bounded, redacted error taxonomy for the skills MCP server. */
export class SkillError extends Error {
  readonly code: SkillErrorCode;

  constructor(code: SkillErrorCode, message: string) {
    super(message);
    this.name = "SkillError";
    this.code = code;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof SkillError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}
