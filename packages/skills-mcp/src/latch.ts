/**
 * latch.ts - the persistent memory of `manual_review`.
 *
 * The WarpMetal safety rules are unambiguous about this state: `manual_review`
 * is terminal for payments and mutations, and a later read-only status check may
 * observe the backend reconciling it. Nothing may retry the consequential action.
 *
 * Propagating the state as a status field and a warning is exactly where it
 * stops being enough. A warning is advice to the model on the
 * turn it appears, and the turn after that is a fresh context with no memory of
 * it. The failure mode is quiet and expensive: an order refuses once, the model
 * reads the same id on a later turn, and retries the payment it was told not to
 * retry. So the fact is written down instead of repeated.
 *
 * Three properties keep that from becoming a liability:
 *
 *   1. It stores identifiers and enums, never a payload. The fields are the id,
 *      a kind, a short code and a timestamp. There is no place for a token, an
 *      argv value, a path or an identity name to land, which is what makes the
 *      file safe to keep at all.
 *   2. It is bounded twice: an entry older than the window is dropped on load,
 *      and the file is compacted once it exceeds the entry ceiling. Neither
 *      requires an operator to do anything.
 *   3. It is advisory in the safe direction. It can only refuse; it can never
 *      approve, mint, or unblock something. A latch that is wrong costs a
 *      refusal and a human reading it, which is recoverable. The opposite
 *      mistake is not.
 *
 * The honest limit, in the same spirit as the approval token: this only knows
 * what *this* server observed. An id that reached `manual_review` through a
 * different tool, a different machine or a direct CLI call is invisible here.
 * That is why every read feeds it, not only mutations - the cheapest way to
 * widen the net is to latch on whatever is seen.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** What the latched identifier refers to. A closed set, so the file stays typed. */
export const LATCH_KINDS = ["server", "sandbox", "grant", "task", "operation"] as const;
export type LatchKind = (typeof LATCH_KINDS)[number];

export interface LatchEntry {
  /** ISO timestamp of the observation. */
  ts: string;
  id: string;
  kind: LatchKind;
  /** A short machine code for why it latched, e.g. `manual_review`. */
  code: string;
}

export interface LatchOutcome {
  ok: boolean;
  path: string;
  /** True when the id was already latched, so nothing was written. */
  duplicate?: boolean;
  error?: string;
}

/** Past this many entries the file is rewritten with only the newest. */
export const DEFAULT_MAX_ENTRIES = 500;
/** Older than this and an entry is dropped: a review that old has been resolved or abandoned. */
export const DEFAULT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * An id is only accepted in a shape the CLI issues. `:` is allowed because a
 * locally derived task key (`runtime:srv_x`) uses it. Anything else is dropped
 * rather than escaped, so the file cannot be used as a text sink.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** Codes are enums from the API or this server, never prose. */
const SAFE_CODE = /^[a-z0-9_]{1,64}$/;

export function isSafeLatchId(id: string): boolean {
  return SAFE_ID.test(id);
}

export function isSafeLatchCode(code: string): boolean {
  return SAFE_CODE.test(code);
}

function parseEntry(line: string): LatchEntry | null {
  if (line.trim().length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const id = record["id"];
    const kind = record["kind"];
    const code = record["code"];
    const ts = record["ts"];
    if (typeof id !== "string" || !SAFE_ID.test(id)) {
      return null;
    }
    if (typeof ts !== "string" || Number.isNaN(Date.parse(ts))) {
      return null;
    }
    if (typeof kind !== "string" || !(LATCH_KINDS as readonly string[]).includes(kind)) {
      return null;
    }
    if (typeof code !== "string" || !SAFE_CODE.test(code)) {
      return null;
    }
    return { ts, id, kind: kind as LatchKind, code };
  } catch {
    // A corrupt line is skipped, not fatal: a latch that cannot parse must not
    // prevent the server from starting.
    return null;
  }
}

export interface LatchOptions {
  maxEntries?: number;
  maxAgeMs?: number;
  /** Injected for tests so the window can be exercised without waiting. */
  now?: () => number;
}

export class LatchStore {
  private readonly entries = new Map<string, LatchEntry>();
  private readonly dir: string;
  private readonly file: string;
  private readonly maxEntries: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;
  /** Set once the store has observed it cannot write, so it stops retrying. */
  private writeFailure: string | null = null;

  constructor(dir: string, options: LatchOptions = {}) {
    this.dir = dir;
    this.file = path.join(dir, "manual-review.jsonl");
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.now = options.now ?? Date.now;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.file)) {
      return;
    }
    try {
      const raw = readFileSync(this.file, "utf8");
      const cutoff = this.now() - this.maxAgeMs;
      for (const line of raw.split(/\r?\n/)) {
        const entry = parseEntry(line);
        if (entry === null || Date.parse(entry.ts) < cutoff) {
          continue;
        }
        // Later lines win, so a re-observation refreshes the entry.
        this.entries.set(entry.id, entry);
      }
    } catch {
      // Unreadable is treated as empty. Failing open here would be a silent
      // loss of a safety signal, so it is surfaced by the caller's warning
      // instead - see `lastError`.
      this.writeFailure = `could not read ${this.file}`;
    }
  }

  /**
   * Records one observation. Idempotent: an id already latched is not rewritten,
   * so a status polled every few seconds does not grow the file.
   */
  record(id: string, kind: LatchKind, code: string): LatchOutcome {
    if (!SAFE_ID.test(id) || !SAFE_CODE.test(code)) {
      return {
        ok: false,
        path: this.file,
        error: "refused to latch a value that is not a plain identifier or code",
      };
    }
    const existing = this.entries.get(id);
    if (existing !== undefined && existing.code === code) {
      return { ok: true, path: this.file, duplicate: true };
    }

    const entry: LatchEntry = { ts: new Date(this.now()).toISOString(), id, kind, code };
    this.entries.set(id, entry);

    try {
      mkdirSync(this.dir, { recursive: true });
      appendFileSync(this.file, `${JSON.stringify(entry)}\n`, { encoding: "utf8", mode: 0o600 });
    } catch (error) {
      this.writeFailure = error instanceof Error ? error.message : String(error);
      return { ok: false, path: this.file, error: this.writeFailure };
    }

    if (this.entries.size > this.maxEntries) {
      this.compact();
    }
    return { ok: true, path: this.file };
  }

  /**
   * Rewrites the file with the newest entries only. A rewrite, not an append,
   * because the point is to shrink: the alternative is a file that grows for
   * the life of the installation.
   */
  private compact(): void {
    const cutoff = this.now() - this.maxAgeMs;
    const kept = [...this.entries.values()]
      .filter((entry) => Date.parse(entry.ts) >= cutoff)
      .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
      .slice(-this.maxEntries);

    this.entries.clear();
    for (const entry of kept) {
      this.entries.set(entry.id, entry);
    }

    const tmp = `${this.file}.tmp`;
    try {
      writeFileSync(tmp, kept.map((entry) => `${JSON.stringify(entry)}\n`).join(""), {
        encoding: "utf8",
        mode: 0o600,
      });
      renameSync(tmp, this.file);
    } catch (error) {
      this.writeFailure = error instanceof Error ? error.message : String(error);
    }
  }

  isLatched(id: string): boolean {
    return this.entries.has(id);
  }

  /** The entry for an id, or null. Used to name the reason in a refusal. */
  get(id: string): LatchEntry | null {
    return this.entries.get(id) ?? null;
  }

  /** Newest first, so a human reading the list sees the recent refusals. */
  list(): LatchEntry[] {
    return [...this.entries.values()].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  }

  get size(): number {
    return this.entries.size;
  }

  get location(): string {
    return this.file;
  }

  /** Non-null when a read or write has failed; surfaced to callers as a warning. */
  get lastError(): string | null {
    return this.writeFailure;
  }
}
