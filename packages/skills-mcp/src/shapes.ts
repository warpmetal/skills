/**
 * shapes.ts - where each field actually lives in a WarpMetal JSON payload.
 *
 * Every command nests its record differently, and the differences are silent:
 *
 *   server get           -> { task: { state, osName, planId, ... } }
 *   order status         -> { task: { id, state, ... }, ... }
 *   operation get        -> { operation: { state, ... } }
 *   runtime get|enable   -> { runtime: { state, desiredRevision, ... } }
 *   sandbox get|action   -> { sandbox: { id, observedState, desiredState, ... } }
 *   sandbox list|create  -> { runtime, sandboxes: [ { id, name, observedState } ] }
 *   sandbox access get   -> { accessGrant: { id, observedState, ... } }
 *   sandbox access list  -> { accessGrants: [ { accessGrant: { ... } } ] }
 *
 * Reading `payload.status` on one of those returns `null`, and a null is
 * indistinguishable from a real negative. That is the dangerous part: a check
 * that reads the wrong path does not throw, it just answers "no". A summary
 * quietly degrades to something generic, and - far worse - a plan that gates a
 * mutation on "must be ready" refuses every server forever while looking
 * perfectly healthy in review.
 *
 * So the paths are declared exactly once, here, next to the CLI handler each one
 * was read from in `node_modules/warpmetal/src/cli.js`. Fallbacks are deliberate
 * and narrow: they let a renamed field degrade into a generic answer instead of a
 * wrong one. Nothing here parses, validates or invents a value.
 */
import { asRecord, str } from "./tools/spec.js";

type Rec = Record<string, unknown>;

/** `handleServerGet` and `handleTaskStatus` both wrap the record in `task`. */
export function taskRecord(payload: unknown): Rec | null {
  return asRecord(asRecord(payload)?.["task"]);
}

/** `handleOperationGet` and `handleServerPower`. */
export function operationRecord(payload: unknown): Rec | null {
  return asRecord(asRecord(payload)?.["operation"]);
}

/** `handleRuntimeGet`, `handleRuntimeEnable`. */
export function runtimeRecord(payload: unknown): Rec | null {
  return asRecord(asRecord(payload)?.["runtime"]);
}

/**
 * The runtime's lifecycle state. The CLI's own vocabulary is exactly
 * `ready | degraded | offline | needs_reinstall`, taken from
 * `RUNTIME_TERMINAL_STATES` in `src/cli.js`; `ready` is the only healthy one.
 * Returns null when the payload does not describe a runtime at all, which a
 * caller must treat as "unknown", never as "fine".
 */
export function runtimeState(payload: unknown): string | null {
  const record = runtimeRecord(payload);
  return str(record?.["state"]) ?? str(record?.["status"]);
}

/** `handleSandboxGet`, `handleSandboxAction`, and the single item of a create. */
export function sandboxRecord(payload: unknown): Rec | null {
  const direct = asRecord(asRecord(payload)?.["sandbox"]);
  if (direct !== null) {
    return direct;
  }
  return asRecord(sandboxList(payload)[0]);
}

/** `handleSandboxList` and `handleSandboxCreate`: flat items, never wrapped. */
export function sandboxList(payload: unknown): unknown[] {
  const list = asRecord(payload)?.["sandboxes"];
  return Array.isArray(list) ? list : [];
}

/** `handleAccessGet` and `handleAccessGrant`. */
export function grantRecord(payload: unknown): Rec | null {
  const direct = asRecord(asRecord(payload)?.["accessGrant"]);
  return direct ?? asRecord(grantList(payload)[0]);
}

/**
 * `handleAccessList`: each item is an envelope around one grant. A flat item and
 * a `grant`-keyed item are both tolerated, because the cost of tolerating them is
 * a generic summary rather than a missing grant.
 */
export function grantList(payload: unknown): unknown[] {
  const list = asRecord(payload)?.["accessGrants"];
  if (!Array.isArray(list)) {
    return [];
  }
  return list.map((entry) => asRecord(entry)?.["accessGrant"] ?? asRecord(entry)?.["grant"] ?? entry);
}

/**
 * The observed lifecycle state of anything the API reports progress for. The
 * order matters: `observedState` is what the API actually saw, and `desiredState`
 * is only what was asked for. Reporting the desired one as if it were observed is
 * how "stop requested" becomes "stopped".
 */
export function stateOf(record: Rec | null): string | null {
  if (record === null) {
    return null;
  }
  return (
    str(record["observedState"]) ??
    str(record["state"]) ??
    str(record["status"]) ??
    str(record["desiredState"])
  );
}

/**
 * The terminal sets are copied verbatim from `src/cli.js`. Copying them rather
 * than inventing a superset matters: a state this server thinks is terminal but
 * the CLI does not would end a poll early on a moving target, and a state it
 * thinks is non-terminal but the CLI considers done would poll a finished job
 * until the deadline.
 */
export const TASK_TERMINAL_STATES: readonly string[] = [
  "ready",
  "expired",
  "cancellation_pending",
  "cancelled",
  "failed",
  "manual_review",
];

export const OPERATION_TERMINAL_STATES: readonly string[] = ["succeeded", "failed", "manual_review"];

export const RUNTIME_TERMINAL_STATES: readonly string[] = [
  "ready",
  "degraded",
  "offline",
  "needs_reinstall",
];

export const SANDBOX_TERMINAL_STATES: readonly string[] = [
  "running",
  "stopped",
  "deleted",
  "failed",
];

export const GRANT_TERMINAL_STATES: readonly string[] = ["applied", "revoked", "failed"];

/** The grant's own identifier. `handleAccessGrant` reads it as `.id`. */
export function grantIdOf(record: Rec | null): string | null {
  if (record === null) {
    return null;
  }
  return str(record["id"]) ?? str(record["grantId"]);
}

/** The sandbox's own identifier, as `handleSandboxCreate` reads it. */
export function sandboxIdOf(record: Rec | null): string | null {
  if (record === null) {
    return null;
  }
  return str(record["id"]) ?? str(record["sandboxId"]);
}

/**
 * `agentRuntime.capacity` is published per product, and every published size
 * carries the resource numbers it consumes, so the sum can be compared exactly
 * the way `validateRuntimeCatalog` in `src/runtime.js` compares it. The one thing
 * neither this server nor the CLI can see is capacity already consumed by
 * sandboxes that exist and were not listed, which is why the result carries a note
 * rather than a promise.
 */
export interface CapacityCheck {
  checked: boolean;
  requested: Record<string, number>;
  capacity: Record<string, number>;
  exceeds: string | null;
  note: string;
}

const CAPACITY_FIELDS = ["cpuMillicores", "memoryMiB", "workspaceDiskGiB"] as const;

export function checkCapacity(
  runtime: Rec | null,
  sizes: readonly (Rec | null)[],
): CapacityCheck {
  const requested: Record<string, number> = { cpuMillicores: 0, memoryMiB: 0, workspaceDiskGiB: 0 };
  const capacity = asRecord(runtime?.["capacity"]);
  const note =
    "capacity is per product and pre-existing sandboxes are not subtracted from it, so a pass here is not an admission guarantee; the API re-checks";

  if (capacity === null || sizes.some((size) => size === null)) {
    return { checked: false, requested, capacity: {}, exceeds: null, note };
  }

  const capacityNumbers: Record<string, number> = {};
  for (const field of CAPACITY_FIELDS) {
    const value = capacity[field];
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return { checked: false, requested, capacity: capacityNumbers, exceeds: null, note };
    }
    capacityNumbers[field] = numeric;
  }

  for (const size of sizes) {
    for (const field of CAPACITY_FIELDS) {
      const value = size === null ? undefined : size[field];
      const numeric = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(numeric)) {
        return { checked: false, requested, capacity: capacityNumbers, exceeds: null, note };
      }
      requested[field] = (requested[field] ?? 0) + numeric;
    }
  }

  const exceeds =
    CAPACITY_FIELDS.find((field) => (requested[field] ?? 0) > (capacityNumbers[field] ?? 0)) ?? null;
  return { checked: true, requested, capacity: capacityNumbers, exceeds, note };
}

/**
 * Whether the catalog says a product's operating system can host Agent Runtime.
 * `validateRuntimeCatalog` in `src/runtime.js` requires both the product-level
 * `agentRuntime.supported` and the per-OS `agentRuntimeSupported`, and a plan that
 * checks only the first will mint a token for a command the CLI then refuses.
 */
export function osSupportsRuntime(product: Rec | null, osName: string | null): boolean | null {
  if (product === null || osName === null) {
    return null;
  }
  const systems = product["operatingSystems"];
  if (!Array.isArray(systems)) {
    return null;
  }
  const match = systems
    .map((entry) => asRecord(entry))
    .find((entry) => str(entry?.["name"]) === osName);
  if (match === undefined || match === null) {
    return null;
  }
  const supported = match["agentRuntimeSupported"];
  return typeof supported === "boolean" ? supported : null;
}
