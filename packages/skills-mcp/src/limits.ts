/**
 * limits.ts - the ceiling on how many CLI processes this server runs at once.
 *
 * Without one, N tool calls in flight are N spawns and N concurrent requests
 * against someone else's API. That is not a correctness bug in any single call:
 * it is a resource bug that only shows up under the load a model actually
 * produces, and it shows up on the far side of the network.
 *
 * The ceiling queues instead of refusing. A refusal would make a call's outcome
 * depend on timing the caller cannot see or reason about, whereas a FIFO queue
 * is the same work in the same order, merely bounded; a caller that waited is
 * told so in its own envelope's warnings, so the delay has an attributable
 * cause rather than looking like a slow API.
 *
 * The wait happens before the process exists, and the slot is released on
 * success, on error and on timeout. That ordering is load-bearing:
 * `sandbox access refresh` is given a 25 s CLI wait budget and a 30 s death
 * clock, and neither may be spent on queueing.
 */
export const DEFAULT_MAX_CONCURRENT_CLI = 4;

/**
 * A ceiling on the ceiling. Raising the parallelism is a legitimate thing to
 * want; turning a mistyped environment variable into an unbounded fleet is not.
 */
const MAX_MAX_CONCURRENT_CLI = 64;

/**
 * Reads WM_MAX_CONCURRENT_CLI. Anything that is not a positive decimal integer
 * falls back to the default rather than being coerced: `parseInt("4abc")` is 4,
 * and silently honouring a typo is worse than ignoring it.
 */
export function resolveConcurrencyLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["WM_MAX_CONCURRENT_CLI"];
  if (raw === undefined) {
    return DEFAULT_MAX_CONCURRENT_CLI;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return DEFAULT_MAX_CONCURRENT_CLI;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < 1) {
    return DEFAULT_MAX_CONCURRENT_CLI;
  }
  return Math.min(parsed, MAX_MAX_CONCURRENT_CLI);
}

/**
 * A FIFO semaphore with no timer of its own.
 *
 * `acquire()` resolves with whether the caller had to wait, which is what lets
 * the executor warn honestly instead of guessing from a snapshot of the counter.
 * `release()` hands the slot straight to the next waiter rather than freeing it
 * and letting whoever arrives next in the same tick win: a caller that queued
 * must not lose its position to a caller that did not.
 */
export class Semaphore {
  private available: number;
  private readonly ceiling: number;
  private readonly waiting: Array<() => void> = [];

  constructor(limit: number) {
    this.ceiling = Math.max(1, Math.floor(limit));
    this.available = this.ceiling;
  }

  get limit(): number {
    return this.ceiling;
  }

  /** Slots currently held. */
  get active(): number {
    return this.ceiling - this.available;
  }

  /** Callers parked in the queue. */
  get queued(): number {
    return this.waiting.length;
  }

  async acquire(): Promise<boolean> {
    if (this.available > 0) {
      this.available -= 1;
      return false;
    }
    await new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
    return true;
  }

  release(): void {
    const next = this.waiting.shift();
    if (next !== undefined) {
      next();
      return;
    }
    this.available = Math.min(this.ceiling, this.available + 1);
  }
}
