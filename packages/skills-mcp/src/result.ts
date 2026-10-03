/**
 * result.ts - the single result contract for every WarpMetal MCP tool.
 *
 * Two things live here and nothing else may redefine them:
 *   1. the exit-code to status mapping, and
 *   2. the envelope shape returned to the client.
 *
 * The envelope is derived from the agency-skills output convention
 * (skill/client/status/warnings/errors) and from the WarpMetal CLI exit codes.
 * If a status or a code is missing here, that is a bug in this file, not
 * something a tool should work around.
 */
import { z } from "zod";

/** Every status this server may report. Shared statuses first, then the CLI-specific ones. */
export const WM_STATUSES = [
  // shared / terminal
  "READY",
  "OBSERVED",
  "PLANNED",
  "NO_OP",
  "STOPPED",
  "INCONCLUSIVE",
  "FAILED",
  // mapping of the WarpMetal CLI exit codes
  "UNAVAILABLE",
  "DENIED",
  "CONFLICT",
  "MANUAL_REVIEW",
  "PAYMENT_REJECTED",
  "PENDING",
  "APPROVAL_REQUIRED",
] as const;

export type WmStatus = (typeof WM_STATUSES)[number];

/**
 * The authoritative exit-code mapping. Codes come from the vendor's CLI
 * reference (the warpmetal skill's CLI reference).
 *
 *   0 completed or reached its requested safe stopping point
 *   1 unexpected local or API failure
 *   2 invalid command, option, input, or local state
 *   3 purchasing unavailable, rate limited, or API temporarily unavailable
 *   4 missing or rejected credential or SSH proof
 *   5 API conflict, including an idempotency conflict
 *   6 manual review; stop and do not retry the consequential action
 *   7 payment authorization rejected or required
 *   8 operation still pending or wait timeout reached
 *  11 approval not granted (the agency-skills gate convention)
 */
export const EXIT_STATUS: Readonly<Record<number, WmStatus>> = {
  0: "READY",
  1: "FAILED",
  2: "STOPPED",
  3: "UNAVAILABLE",
  4: "DENIED",
  5: "CONFLICT",
  6: "MANUAL_REVIEW",
  7: "PAYMENT_REJECTED",
  8: "PENDING",
  11: "APPROVAL_REQUIRED",
};

export const KNOWN_EXIT_CODES: readonly number[] = Object.keys(EXIT_STATUS)
  .map(Number)
  .sort((a, b) => a - b);

/** The process never started, so the CLI reported nothing. */
export const SPAWN_FAILED_EXIT_CODE = -1;
/** We killed the process on timeout. */
export const TIMEOUT_EXIT_CODE = -2;
/** The server refused before spawning: outside the command registry, or a bad flag. */
export const DENIED_EXIT_CODE = -3;
/** The action is legal but no valid approval token was presented. */
export const APPROVAL_REQUIRED_EXIT_CODE = -4;

/**
 * Codes 0..11 are reserved for what the CLI actually returned. Negative codes
 * are decisions this server made *before* launching anything, which keeps the
 * two sources distinguishable in the envelope and in the audit log.
 */
export const SERVER_EXIT_CODES: readonly number[] = [
  SPAWN_FAILED_EXIT_CODE,
  TIMEOUT_EXIT_CODE,
  DENIED_EXIT_CODE,
  APPROVAL_REQUIRED_EXIT_CODE,
];

/**
 * True when the CLI produced a definitive answer. A timeout or a failed spawn
 * leaves the real-world effect unknown, which matters for approval tokens.
 */
export function isKnownOutcome(exitCode: number): boolean {
  return exitCode !== TIMEOUT_EXIT_CODE && exitCode !== SPAWN_FAILED_EXIT_CODE;
}

export interface ExitMapping {
  status: WmStatus;
  ok: boolean;
  /** False when the code is absent from EXIT_STATUS. Never silently a normal failure. */
  known: boolean;
}

/**
 * Maps an exit code to a status. An unmapped code is reported as FAILED with
 * `known: false` so the caller can add an explicit warning instead of letting
 * an unknown code look like an ordinary failure.
 */
export function mapExitCode(code: number): ExitMapping {
  const status = EXIT_STATUS[code];
  if (status === undefined) {
    return { status: "FAILED", ok: false, known: false };
  }
  return { status, ok: code === 0, known: true };
}

/**
 * Statuses that mean the call itself failed. Everything else is a well-formed
 * observation the client should read, even when the news is bad: UNAVAILABLE
 * and PENDING carry usable data and are not tool errors.
 */
const ERROR_STATUSES: ReadonlySet<WmStatus> = new Set<WmStatus>([
  "FAILED",
  "DENIED",
  "CONFLICT",
  "STOPPED",
  "MANUAL_REVIEW",
  "PAYMENT_REJECTED",
  "APPROVAL_REQUIRED",
]);

export function isErrorStatus(status: WmStatus): boolean {
  return ERROR_STATUSES.has(status);
}

export const wmNextActionSchema = z.strictObject({
  action: z.string().min(1),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});

export type WmNextAction = z.infer<typeof wmNextActionSchema>;

/**
 * Approval state lives in its own typed field rather than buried in `data`,
 * because a token is control-plane material: it must be visible, and it must be
 * impossible to mistake it for payload.
 */
export const WM_APPROVAL_STATES = ["not_required", "required", "granted"] as const;

export const wmApprovalSchema = z.strictObject({
  state: z.enum(WM_APPROVAL_STATES),
  /** Present only when state is `required`: the token the next apply must carry. */
  token: z.string().optional(),
  /** Present only when state is `required`. */
  expires_at: z.string().optional(),
  /**
   * The exact effect the token authorises, in the words the model must relay to
   * the human before asking for approval.
   */
  effect: z.string().optional(),
});

export type WmApproval = z.infer<typeof wmApprovalSchema>;

/**
 * The envelope. Strict on purpose: an unexpected field is a bug, not a
 * feature, and the SDK validates structuredContent against this schema.
 */
export const wmResultSchema = z.strictObject({
  status: z.enum(WM_STATUSES),
  ok: z.boolean(),
  summary: z.string(),
  exit_code: z.number().int(),
  task_id: z.string().optional(),
  data: z.unknown(),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  next_actions: z.array(wmNextActionSchema),
  redacted: z.array(z.string()),
  approval: wmApprovalSchema.optional(),
});

export type WmResult = z.infer<typeof wmResultSchema>;

export interface ResultInput {
  status: WmStatus;
  exitCode: number;
  summary: string;
  data?: unknown;
  warnings?: readonly string[];
  errors?: readonly string[];
  nextActions?: readonly WmNextAction[];
  redacted?: readonly string[];
  taskId?: string;
  approval?: WmApproval;
}

export function makeResult(input: ResultInput): WmResult {
  const result: WmResult = {
    status: input.status,
    ok: !isErrorStatus(input.status),
    summary: input.summary,
    exit_code: input.exitCode,
    data: input.data ?? null,
    warnings: [...(input.warnings ?? [])],
    errors: [...(input.errors ?? [])],
    next_actions: [...(input.nextActions ?? [])],
    redacted: [...(input.redacted ?? [])],
  };
  if (input.taskId !== undefined) {
    result.task_id = input.taskId;
  }
  if (input.approval !== undefined) {
    result.approval = input.approval;
  }
  return result;
}

/** Keeps the last `limit` lines of CLI output, so errors stay readable. */
export function tailLines(text: string, limit = 10): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-limit);
}

/** Caps a string at `max` characters, marking the truncation. */
export function cap(text: string, max = 2000): string {
  return text.length <= max ? text : `${text.slice(0, max)}... [truncated]`;
}
