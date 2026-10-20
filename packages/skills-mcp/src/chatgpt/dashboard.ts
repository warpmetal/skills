/**
 * chatgpt/dashboard.ts - the data contract behind the dashboard app.
 *
 * The app is read-only and renders exactly one payload. That payload is built
 * from read tools the server already exposes, so the dashboard cannot reach the
 * CLI in a way the model could not, and it inherits their redaction, warnings
 * and audit entries.
 *
 * Every section is projected through an allowlist rather than copied from the
 * CLI: the payload crosses into the app and into the conversation, so a field
 * the dashboard does not need is a field it must not carry.
 */
import { z } from "zod";

import type { WmResult } from "../result.js";
import { ALL_TOOL_SPECS } from "../tools/index.js";
import { asRecord, bool, str, toolSpecHandler, type ServerDeps, type WmToolSpec } from "../tools/spec.js";

const MAX_SERVERS = 20;
const MAX_TASKS = 10;

export const DASHBOARD_OUTPUT = z.strictObject({
  generatedAt: z.string(),
  cli: z.strictObject({
    version: z.string().nullable(),
    health: z.string().nullable(),
    available: z.boolean(),
  }),
  servers: z.array(
    z.strictObject({
      id: z.string(),
      state: z.string().nullable(),
    }),
  ),
  tasks: z.array(
    z.strictObject({
      taskId: z.string(),
      status: z.string().nullable(),
      stale: z.boolean(),
    }),
  ),
  warnings: z.array(z.string()),
});

export type DashboardPayload = z.infer<typeof DASHBOARD_OUTPUT>;

const SPECS_BY_NAME = new Map<string, WmToolSpec>(
  ALL_TOOL_SPECS.map((spec) => [spec.name, spec]),
);

interface ReadResult {
  /** The `WmResult` envelope, or null when the read could not run at all. */
  result: WmResult | null;
  warnings: string[];
}

/**
 * Runs one read tool through the shared handler, so the dashboard inherits the
 * executor, the redaction and the audit entry instead of re-implementing them.
 * A failure becomes a warning, never an exception.
 */
async function readTool(deps: ServerDeps, name: string): Promise<ReadResult> {
  const spec = SPECS_BY_NAME.get(name);
  if (spec === undefined) {
    return { result: null, warnings: ["dashboard_missing_spec: " + name + " is not registered"] };
  }
  try {
    const call = await toolSpecHandler(spec, deps)({}, {});
    const result = (call.structuredContent ?? null) as WmResult | null;
    return {
      result,
      warnings: Array.isArray(result?.warnings)
        ? result.warnings.filter((warning): warning is string => typeof warning === "string")
        : [],
    };
  } catch (error) {
    return {
      result: null,
      warnings: ["dashboard_read_failed: " + name + ": " + (error as Error).message],
    };
  }
}

/** Servers: an id and a state. Never a path, a credential or a raw record. */
function serverRows(data: unknown): DashboardPayload["servers"] {
  const servers = asRecord(data)?.["servers"];
  if (!Array.isArray(servers)) {
    return [];
  }
  const rows: DashboardPayload["servers"] = [];
  for (const entry of servers) {
    const record = asRecord(entry);
    const id = str(record?.["serverId"]) ?? str(record?.["id"]);
    if (id === null) {
      continue;
    }
    rows.push({ id, state: str(record?.["state"]) ?? str(record?.["status"]) });
    if (rows.length >= MAX_SERVERS) {
      break;
    }
  }
  return rows;
}

/** Tasks: the id, its last observed status and whether that status is stale. */
function taskRows(data: unknown): DashboardPayload["tasks"] {
  const tasks = asRecord(data)?.["tasks"];
  if (!Array.isArray(tasks)) {
    return [];
  }
  const rows: DashboardPayload["tasks"] = [];
  for (const entry of tasks) {
    const record = asRecord(entry);
    const taskId = str(record?.["taskId"]);
    if (taskId === null) {
      continue;
    }
    rows.push({
      taskId,
      status: str(record?.["lastStatus"]) ?? str(record?.["status"]),
      stale: bool(record?.["stale"]) ?? false,
    });
    if (rows.length >= MAX_TASKS) {
      break;
    }
  }
  return rows;
}

/**
 * Builds the dashboard payload. The four reads run concurrently; each one
 * degrades on its own so a missing CLI or an unreachable service still leaves
 * the app with something to render.
 */
export async function buildDashboardPayload(
  deps: ServerDeps,
): Promise<{ payload: DashboardPayload; summary: string }> {
  const [version, health, state, tasks] = await Promise.all([
    readTool(deps, "wm_version"),
    readTool(deps, "wm_health"),
    readTool(deps, "wm_state_list"),
    readTool(deps, "wm_task_list"),
  ]);

  const versionText = str(asRecord(version.result?.data)?.["version"]) ?? null;
  const healthStatus = health.result?.status ?? null;
  const payload: DashboardPayload = {
    generatedAt: new Date().toISOString(),
    cli: {
      version: versionText,
      health: healthStatus,
      available: versionText !== null,
    },
    servers: serverRows(state.result?.data),
    tasks: taskRows(tasks.result?.data),
    warnings: [...version.warnings, ...health.warnings, ...state.warnings, ...tasks.warnings],
  };

  const summary = payload.cli.available
    ? "WarpMetal " +
      (payload.cli.version ?? "") +
      ": " +
      String(payload.servers.length) +
      " server(s), " +
      String(payload.tasks.length) +
      " task(s)"
    : "WarpMetal CLI unavailable: " +
      String(payload.servers.length) +
      " server(s), " +
      String(payload.tasks.length) +
      " task(s)";

  return { payload, summary };
}
