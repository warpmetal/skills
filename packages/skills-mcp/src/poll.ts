/**
 * poll.ts - the bounded wait loop, run in this process instead of in the CLI.
 *
 * The CLI is always invoked as a single poll (`--wait` is refused by the
 * executor). The loop lives here for one reason: a client call that blocks
 * inside a subprocess cannot give up gracefully. A loop with its own deadline
 * can, and it reports `PENDING` honestly instead of hanging or pretending.
 *
 * Rules that matter:
 *   - Never sleep less than the floor. A hot loop against the WarpMetal API is
 *     a rate-limit offence, not diligence.
 *   - Stop the moment the answer is already terminal. Exit 4, 5 and 6 mean
 *     "denied", "conflict" and "stop and do not retry"; continuing to poll
 *     something that has already refused is noise.
 *   - A deadline that runs out is `PENDING` with a warning, never success.
 */
import type { CliCommandKey, CliFlags, RunOutcome, Runner } from "./exec.js";
import { isKnownOutcome } from "./result.js";

/** Floor for the interval. Below this, the loop is hammering the API. */
export const MIN_INTERVAL_MS = 2_000;
export const INITIAL_INTERVAL_MS = 2_000;
const BACKOFF_FACTOR = 1.5;
export const MAX_INTERVAL_MS = 15_000;

/** The default budget for one `wm_task_wait` call. */
export const DEFAULT_DEADLINE_SECONDS = 120;
/** Hard ceiling, also enforced by the tool's Zod schema. */
export const MAX_DEADLINE_SECONDS = 300;

/**
 * Exit codes that make further polling pointless: denied, conflict, and the
 * manual-review terminal state that forbids retrying the consequential action.
 */
export const STOP_EXIT_CODES: readonly number[] = [4, 5, 6];

/** Exit 8 means accepted or pending, never applied. */
export const PENDING_EXIT_CODE = 8;

export function exitCodeMeaning(code: number): string {
  switch (code) {
    case 4:
      return "the credential or SSH proof was rejected";
    case 5:
      return "the API reported a conflict";
    case 6:
      return "manual review is required and the action must not be retried";
    default:
      return `exit code ${String(code)}`;
  }
}

export interface PollOptions {
  runner: Runner;
  cli: CliCommandKey;
  flags?: CliFlags;
  /** Everything after the first successful poll uses this budget. */
  deadlineMs: number;
  /**
   * Decides whether the payload is terminal. When omitted, any known exit code
   * other than 8 counts as terminal.
   */
  terminal?: (payload: unknown) => boolean;
  /** Injected so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Called before each attempt. Used to emit progress notifications. */
  onAttempt?: (attempt: number, elapsedMs: number) => void;
}

export interface PollOutcome {
  attempts: number;
  elapsedMs: number;
  final: RunOutcome;
  /** True when the deadline ran out before a terminal answer arrived. */
  exhausted: boolean;
  /** Non-null when polling stopped because the answer was already settled. */
  stoppedBecause: string | null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function pollUntilTerminal(options: PollOptions): Promise<PollOutcome> {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const startedAt = now();

  let interval = INITIAL_INTERVAL_MS;
  let attempts = 0;
  let last: RunOutcome | null = null;
  let stoppedBecause: string | null = null;
  let settled = false;

  for (;;) {
    attempts += 1;
    options.onAttempt?.(attempts, now() - startedAt);

    const outcome = await options.runner.run(options.cli, options.flags ?? {});
    last = outcome;

    if (STOP_EXIT_CODES.includes(outcome.exitCode)) {
      stoppedBecause = exitCodeMeaning(outcome.exitCode);
      settled = true;
      break;
    }

    const payload = outcome.jsonFound ? outcome.json : null;
    settled =
      options.terminal !== undefined
        ? options.terminal(payload)
        : isKnownOutcome(outcome.exitCode) && outcome.exitCode !== PENDING_EXIT_CODE;

    if (settled) {
      break;
    }

    const elapsed = now() - startedAt;
    const remaining = options.deadlineMs - elapsed;
    if (remaining <= 0) {
      break;
    }

    // Never sleep past the deadline, and never below the floor.
    await sleep(Math.max(MIN_INTERVAL_MS, Math.min(interval, remaining)));
    interval = Math.min(MAX_INTERVAL_MS, Math.round(interval * BACKOFF_FACTOR));
  }

  const finalOutcome = last;
  if (finalOutcome === null) {
    throw new Error("pollUntilTerminal ran no attempts");
  }

  return {
    attempts,
    elapsedMs: now() - startedAt,
    final: finalOutcome,
    exhausted: !settled,
    stoppedBecause,
  };
}

/** Human-readable budget, used in warnings so the number is never implied. */
export function describeBudget(deadlineMs: number): string {
  const seconds = Math.round(deadlineMs / 1000);
  return `${String(seconds)}s`;
}
