/**
 * tasks.ts - the ephemeral, in-process task registry.
 *
 * WarpMetal tasks outlive a single CLI call: an accepted mutation returns
 * `PENDING` and must be observed later. Without a registry the model has to
 * remember a bare identifier across turns, which it does badly, and `PENDING`
 * quietly becomes "probably fine".
 *
 * The registry holds identifiers only, never a token, an argv value or an
 * identity name, and it is deliberately not persisted. Two consequences, both
 * intentional: there is no storage surface to redact, and a restart empties it
 * rather than resurrecting a task list whose underlying state nobody re-checked.
 */
import { cap } from "./result.js";

export const TASK_KINDS = ["runtime", "sandbox", "grant", "operation", "order"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** Roughly a working session's worth; beyond that the oldest entry is evicted. */
export const DEFAULT_MAX_TASKS = 200;

/**
 * After this long without a fresh observation, a record is still listed but
 * flagged. `wm_task_list` must never present a stale status as current.
 */
export const STALE_AFTER_MS = 15 * 60 * 1000;

export interface TaskRecord {
  taskId: string;
  kind: TaskKind;
  label: string;
  createdAt: number;
  /** Which read tool observes this task. Kept here so a caller never guesses. */
  observeWith: string;
  serverId?: string;
  sandboxId?: string;
  sandboxName?: string;
  lastStatus?: string;
  lastObservedAt?: number;
}

export interface RegisterInput {
  taskId: string;
  kind: TaskKind;
  label: string;
  observeWith: string;
  serverId?: string;
  sandboxId?: string;
  sandboxName?: string;
  lastStatus?: string;
}

export interface ObservedTask extends TaskRecord {
  stale: boolean;
  stalenessMs: number;
}

export class TaskRegistry {
  private readonly records = new Map<string, TaskRecord>();
  private readonly maxTasks: number;

  constructor(maxTasks: number = DEFAULT_MAX_TASKS) {
    this.maxTasks = maxTasks;
  }

  register(input: RegisterInput, now: number = Date.now()): TaskRecord {
    const existing = this.records.get(input.taskId);
    // A re-registration refreshes the observation rather than duplicating the
    // entry: the same task seen twice is one task.
    const record: TaskRecord = {
      taskId: input.taskId,
      kind: input.kind,
      label: cap(input.label, 200),
      observeWith: input.observeWith,
      createdAt: existing?.createdAt ?? now,
      lastObservedAt: now,
    };
    if (input.serverId !== undefined) {
      record.serverId = input.serverId;
    }
    if (input.sandboxId !== undefined) {
      record.sandboxId = input.sandboxId;
    }
    if (input.sandboxName !== undefined) {
      record.sandboxName = input.sandboxName;
    }
    const status = input.lastStatus ?? existing?.lastStatus;
    if (status !== undefined) {
      record.lastStatus = cap(status, 100);
    }

    // Delete first so a refresh moves the entry to the recent end of the
    // insertion order, which is what makes eviction oldest-first correct.
    this.records.delete(input.taskId);
    this.records.set(input.taskId, record);
    this.evict();
    return record;
  }

  get(taskId: string): TaskRecord | null {
    return this.records.get(taskId) ?? null;
  }

  /** Most recently touched first. */
  list(): TaskRecord[] {
    return [...this.records.values()].reverse();
  }

  update(
    taskId: string,
    patch: { lastStatus?: string; sandboxId?: string },
    now: number = Date.now(),
  ): TaskRecord | null {
    const record = this.records.get(taskId);
    if (record === undefined) {
      return null;
    }
    if (patch.lastStatus !== undefined) {
      record.lastStatus = cap(patch.lastStatus, 100);
    }
    if (patch.sandboxId !== undefined) {
      record.sandboxId = patch.sandboxId;
    }
    record.lastObservedAt = now;
    return record;
  }

  get size(): number {
    return this.records.size;
  }

  /** Wraps a record with the staleness judgement, so callers cannot forget it. */
  observed(record: TaskRecord, now: number = Date.now()): ObservedTask {
    const last = record.lastObservedAt ?? record.createdAt;
    const stalenessMs = Math.max(0, now - last);
    return { ...record, stale: stalenessMs > STALE_AFTER_MS, stalenessMs };
  }

  private evict(): void {
    while (this.records.size > this.maxTasks) {
      const oldest = this.records.keys().next();
      if (oldest.done === true) {
        return;
      }
      this.records.delete(oldest.value);
    }
  }
}
