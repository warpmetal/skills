/**
 * tasks.ts (tools) - wm_task_list, wm_task_get, wm_task_wait.
 *
 * These are the tools that make `PENDING` survivable. Without them the model has
 * to carry a bare id across turns and hope, and a deferred operation quietly
 * becomes "probably fine".
 *
 * The registry is consulted for *what* to observe; the observing itself is done
 * by the same read command the corresponding read-only tool uses. Nothing here
 * invents an id: an unknown task is refused, not guessed.
 */
import { z } from "zod";

import {
  DEFAULT_DEADLINE_SECONDS,
  MAX_DEADLINE_SECONDS,
  describeBudget,
  pollUntilTerminal,
} from "../poll.js";
import { DENIED_EXIT_CODE, cap, isErrorStatus, isKnownOutcome, makeResult, mapExitCode, type WmResult, type WmStatus } from "../result.js";
import { deadlineSecondsSchema, taskIdSchema } from "../schemas.js";
import type { TaskKind, TaskRecord } from "../tasks.js";
import { redact } from "../audit.js";
import type { CliCommandKey, CliFlags } from "../exec.js";
import {
  GRANT_TERMINAL_STATES,
  OPERATION_TERMINAL_STATES,
  RUNTIME_TERMINAL_STATES,
  SANDBOX_TERMINAL_STATES,
  TASK_TERMINAL_STATES,
  grantRecord,
  operationRecord,
  runtimeRecord,
  sandboxRecord,
  stateOf,
  taskRecord,
} from "../shapes.js";
import { str, type ServerDeps, type WmToolSpec } from "./spec.js";

const READ_ONLY_LOCAL: WmToolSpec["annotations"] = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** Listing the local registry never leaves the process. */
const READ_ONLY_REMOTE: WmToolSpec["annotations"] = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * How each task kind is observed, derived from the identifiers the record
 * already holds. A kind whose identifiers are missing cannot be observed, and
 * that is reported rather than papered over.
 */
interface Observation {
  cli: CliCommandKey;
  flags: CliFlags;
  /** The tool a human would name for this observation. */
  tool: string;
}

export function observationFor(record: TaskRecord): Observation | { missing: string } {
  switch (record.kind) {
    case "runtime": {
      if (record.serverId === undefined) {
        return { missing: "serverId" };
      }
      return { cli: "runtimeGet", flags: { server: record.serverId }, tool: "wm_runtime_get" };
    }
    case "sandbox": {
      if (record.serverId === undefined) {
        return { missing: "serverId" };
      }
      if (record.sandboxId === undefined) {
        return { missing: "sandboxId" };
      }
      return {
        cli: "sandboxGet",
        flags: { server: record.serverId, sandbox: record.sandboxId },
        tool: "wm_sandbox_get",
      };
    }
    case "grant": {
      if (record.serverId === undefined) {
        return { missing: "serverId" };
      }
      if (record.sandboxId === undefined) {
        return { missing: "sandboxId" };
      }
      return {
        cli: "sandboxAccessGet",
        flags: { server: record.serverId, sandbox: record.sandboxId, grant: record.taskId },
        tool: "wm_sandbox_access_get",
      };
    }
    case "operation":
      return { cli: "operationGet", flags: { operation: record.taskId }, tool: "wm_operation_get" };
    case "order":
      return { cli: "orderStatus", flags: { task: record.taskId }, tool: "wm_order_status" };
  }
}

const TERMINAL_STATES: Readonly<Record<TaskKind, readonly string[]>> = {
  runtime: RUNTIME_TERMINAL_STATES,
  sandbox: SANDBOX_TERMINAL_STATES,
  grant: GRANT_TERMINAL_STATES,
  operation: OPERATION_TERMINAL_STATES,
  order: TASK_TERMINAL_STATES,
};

/**
 * The record that carries the state for each kind, because the nesting differs
 * per command: a runtime nests it under `runtime`, an order under `task`, a grant
 * under `accessGrant`, and a sandbox under `sandbox` or inside `sandboxes`.
 */
function observationRecord(kind: TaskKind, payload: unknown): Record<string, unknown> | null {
  switch (kind) {
    case "runtime":
      return runtimeRecord(payload);
    case "sandbox":
      return sandboxRecord(payload);
    case "grant":
      return grantRecord(payload);
    case "operation":
      return operationRecord(payload);
    case "order":
      return taskRecord(payload);
  }
}

export function terminalFor(kind: TaskKind): (payload: unknown) => boolean {
  return (payload) => {
    const record = observationRecord(kind, payload);
    if (record === null) {
      return false;
    }
    if (record["completedAt"] !== undefined && record["completedAt"] !== null) {
      return true;
    }
    // A sandbox whose observed state has caught up with its desired state has
    // settled, even if the payload's own status word is unfamiliar.
    const observed = str(record["observedState"]);
    const desired = str(record["desiredState"]);
    if (observed !== null && desired !== null && observed === desired) {
      return true;
    }
    const state = stateOf(record);
    return state !== null && TERMINAL_STATES[kind].includes(state);
  };
}

const SUBCOMMAND = "wm_task_registry";

function taskFailure(spec: string, message: string, nextActions: WmResult["next_actions"] = []): WmResult {
  return makeResult({
    status: "DENIED",
    exitCode: DENIED_EXIT_CODE,
    summary: `${spec} refused: ${message}`,
    errors: [message],
    nextActions,
  });
}

/** Builds the envelope for one observation, using the same exit mapping as every other tool. */
function resultFromObservation(
  record: TaskRecord,
  outcome: { exitCode: number; warnings: string[]; stderr: string; jsonFound: boolean; json: unknown },
  extraWarnings: readonly string[],
  detail: string,
): WmResult {
  const mapping = mapExitCode(outcome.exitCode);
  const status: WmStatus = outcome.exitCode === 0 ? "OBSERVED" : mapping.status;
  const { value: data, redacted } = redact(outcome.jsonFound ? outcome.json : null);

  const warnings = [...extraWarnings];
  if (!mapping.known && isKnownOutcome(outcome.exitCode)) {
    warnings.push(
      `unknown_exit_code: ${String(outcome.exitCode)} is absent from the documented exit-code table`,
    );
  }

  const state = stateOf(observationRecord(record.kind, data));
  const summary = state === null ? detail : `${detail}, state ${state}`;

  const errors: string[] = [];
  if (isErrorStatus(status)) {
    const stderr = outcome.stderr.trim();
    errors.push(
      stderr.length > 0
        ? cap(stderr, 600)
        : `${detail} exited ${String(outcome.exitCode)} with no diagnostic on stderr`,
    );
  }

  return makeResult({
    status,
    exitCode: outcome.exitCode,
    summary,
    data,
    warnings,
    errors,
    redacted,
    taskId: record.taskId,
  });
}

async function observeOnce(deps: ServerDeps, record: TaskRecord): Promise<WmResult> {
  const observation = observationFor(record);
  if ("missing" in observation) {
    return taskFailure(
      "wm_task_get",
      `the record for ${record.taskId} does not carry the ${observation.missing} needed to observe it`,
    );
  }
  const outcome = await deps.runner.run(observation.cli, observation.flags);
  const terminal = terminalFor(record.kind)(outcome.jsonFound ? outcome.json : null);
  const warnings = terminal
    ? []
    : [
        "task_not_terminal: this is a single poll and the task has not settled; use wm_task_wait to poll within a bounded budget",
      ];
  const result = resultFromObservation(
    record,
    outcome,
    warnings,
    `${record.label} observed via ${observation.tool}`,
  );
  if (!terminal && !isErrorStatus(result.status)) {
    result.next_actions.push({
      action: "poll within a bounded budget until the task settles",
      tool: "wm_task_wait",
      args: { taskId: record.taskId },
    });
  }
  deps.tasks.update(record.taskId, {
    lastStatus: stateOf(observationRecord(record.kind, outcome.json ?? null)) ?? result.status,
  });
  return result;
}

export const taskTools: readonly WmToolSpec[] = [
  {
    name: "wm_task_list",
    title: "List observed tasks",
    description:
      "Lists the long-running tasks this server has observed in this session, most recent first. Read-only and local: it never contacts WarpMetal, and it is deliberately empty after a restart because the registry is not persisted. A task flagged stale has not been re-observed recently, so its recorded status is history, not current state.",
    input: z.strictObject({}),
    annotations: READ_ONLY_LOCAL,
    kind: "task",
    successStatus: "OBSERVED",
    summary: () => "",
    run: async ({ deps }) => {
      const records = deps.tasks.list().map((record) => deps.tasks.observed(record));
      const stale = records.filter((entry) => entry.stale).length;
      const warnings = records.length === 0
        ? [
            "task_registry_empty: no task has been observed in this session. The registry is in memory only, so a restart empties it; re-apply or re-observe the operation to populate it.",
          ]
        : [];
      if (stale > 0) {
        warnings.push(
          `tasks_stale: ${String(stale)} task(s) have not been observed recently; their status is a historical record, not current state`,
        );
      }
      return {
        subcommand: SUBCOMMAND,
        result: makeResult({
          status: "OBSERVED",
          exitCode: 0,
          summary: `${String(records.length)} task(s) in this session's registry`,
          data: { tasks: records, count: records.length, staleCount: stale },
          warnings,
          nextActions:
            records.length === 0
              ? []
              : [
                  {
                    action: "read one task and poll it if it has not settled",
                    tool: "wm_task_get",
                    args: { taskId: records[0]?.taskId ?? "" },
                  },
                ],
        }),
      };
    },
  },
  {
    name: "wm_task_get",
    title: "Observe one task once",
    description:
      "Observes one known task exactly once, using the read command that matches its kind. It never waits, so a task that has not settled is reported as PENDING with a pointer to wm_task_wait. The taskId must come from this session's registry; an unknown id is refused rather than guessed.",
    input: z.strictObject({ taskId: taskIdSchema }),
    annotations: READ_ONLY_REMOTE,
    kind: "task",
    successStatus: "OBSERVED",
    summary: () => "",
    run: async ({ args, deps }) => {
      const taskId = String(args["taskId"]);
      const record = deps.tasks.get(taskId);
      if (record === null) {
        return {
          subcommand: SUBCOMMAND,
          result: taskFailure(
            "wm_task_get",
            `task ${taskId} is not in this session's registry. The registry is in memory only, so a restart empties it, and an id from a previous session cannot be observed here.`,
            [{ action: "list the tasks this session has observed", tool: "wm_task_list", args: {} }],
          ),
        };
      }
      const result = await observeOnce(deps, record);
      return { subcommand: SUBCOMMAND, result };
    },
  },
  {
    name: "wm_task_wait",
    title: "Poll a task until it settles",
    description:
      "Polls one known task until it settles or the deadline runs out, whichever comes first. The waiting happens here, in bounded single polls, never inside the CLI. Stops immediately when the answer is already terminal, including denied, conflict or manual review. Running out of budget is reported as PENDING with an explicit warning that the operation may still be running; it is never reported as applied.",
    input: z.strictObject({
      taskId: taskIdSchema,
      deadlineSeconds: deadlineSecondsSchema.optional(),
    }),
    annotations: READ_ONLY_REMOTE,
    kind: "task",
    successStatus: "OBSERVED",
    summary: () => "",
    run: async ({ args, deps, progress }) => {
      const taskId = String(args["taskId"]);
      const record = deps.tasks.get(taskId);
      if (record === null) {
        return {
          subcommand: SUBCOMMAND,
          result: taskFailure(
            "wm_task_wait",
            `task ${taskId} is not in this session's registry, so there is nothing to poll`,
            [{ action: "list the tasks this session has observed", tool: "wm_task_list", args: {} }],
          ),
        };
      }
      const observation = observationFor(record);
      if ("missing" in observation) {
        return {
          subcommand: SUBCOMMAND,
          result: taskFailure(
            "wm_task_wait",
            `the record for ${taskId} does not carry the ${observation.missing} needed to observe it`,
          ),
        };
      }

      const requested = args["deadlineSeconds"];
      const deadlineSeconds =
        typeof requested === "number"
          ? Math.min(Math.max(1, Math.floor(requested)), MAX_DEADLINE_SECONDS)
          : DEFAULT_DEADLINE_SECONDS;

      const outcome = await pollUntilTerminal({
        runner: deps.runner,
        cli: observation.cli,
        flags: observation.flags,
        deadlineMs: deadlineSeconds * 1000,
        terminal: terminalFor(record.kind),
        onAttempt: (attempt, elapsedMs) => {
          void progress(
            attempt,
            `${record.label}: attempt ${String(attempt)} after ${describeBudget(elapsedMs)}`,
          );
        },
      });

      const extra: string[] = [];
      if (outcome.stoppedBecause !== null) {
        extra.push(
          `poll_stopped: the task is settled or unrecoverable — ${outcome.stoppedBecause}. Polling stopped early on purpose.`,
        );
      }
      if (outcome.exhausted) {
        extra.push(
          `deadline_exhausted: polled ${String(outcome.attempts)} time(s) over ${describeBudget(outcome.elapsedMs)} without reaching a settled state. The operation may still be running; this is not a failure and not an application of the change.`,
        );
      }

      const result = resultFromObservation(
        record,
        outcome.final,
        extra,
        `${record.label} polled via ${observation.tool}`,
      );

      if (outcome.exhausted) {
        // The one rule that matters most here: a spent budget is PENDING, never
        // a success, even though the last poll exited 0 with a non-final body.
        result.status = "PENDING";
        result.ok = true;
        result.next_actions.unshift({
          action: "poll again with a fresh budget, or check the resource directly",
          tool: "wm_task_wait",
          args: { taskId },
        });
      }

      deps.tasks.update(taskId, {
        lastStatus:
          stateOf(observationRecord(record.kind, outcome.final.json)) ?? result.status,
      });

      return { subcommand: SUBCOMMAND, result };
    },
  },
];
