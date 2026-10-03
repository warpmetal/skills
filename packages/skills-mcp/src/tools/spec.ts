/**
 * spec.ts - the declarative tool contract and its single generic handler.
 *
 * Every tool is a data record, not bespoke code. That is what makes the
 * invariants checkable: the tests walk the registry and can prove that no tool
 * declares a blocking flag, that no input schema exposes a `confirm` field, and
 * that no argv contains a value the client supplied for a safety constant.
 *
 * Four tool kinds, and the difference between them is what they are allowed to
 * do, not how they are written:
 *
 *   read   - one CLI call, observation only
 *   plan   - no CLI call at all; probes live data and mints an approval token
 *   apply  - one CLI call, but gated behind a valid token bound to its argv
 *   task   - no single command; consults the registry and polls what it names
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { ApprovalStore, ApprovalRefusal } from "../approval.js";
import { idempotencyKeyFor } from "../approval.js";
import {
  appendAudit,
  redact,
  scrubText,
  type AuditApprovalState,
  type AuditConsequenceState,
  type AuditLatchState,
} from "../audit.js";
import type { LatchKind, LatchStore } from "../latch.js";
import { isSafeLatchCode, isSafeLatchId } from "../latch.js";
import { MIN_CLI_VERSION, joinVersion, judgeCliVersion } from "../cli-version.js";
import type { ConsequenceClass } from "../schemas.js";
import {
  CLI_COMMANDS,
  CliDeniedError,
  CliResolutionError,
  acceptsIdempotencyKey,
  buildArgv,
  stderrTail,
  stdoutErrorTail,
  type CliCommandKey,
  type CliFlagValue,
  type CliFlags,
  type RunOutcome,
  type Runner,
} from "../exec.js";
import {
  APPROVAL_REQUIRED_EXIT_CODE,
  DENIED_EXIT_CODE,
  SPAWN_FAILED_EXIT_CODE,
  isErrorStatus,
  isKnownOutcome,
  makeResult,
  mapExitCode,
  wmResultSchema,
  type WmNextAction,
  type WmResult,
  type WmStatus,
} from "../result.js";
import type { RegisterInput, TaskRegistry } from "../tasks.js";

/**
 * Declared locally rather than imported so the tool contract does not depend on
 * an internal SDK export path. Structurally identical to the SDK's type.
 */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export type ToolKind = "read" | "plan" | "apply" | "task";

export interface ToolContext {
  data: unknown;
  args: Record<string, unknown>;
  status: WmStatus;
  exitCode: number;
}

/** How a declaration resolves to an argv. Shared by the plan and the apply half. */
export interface EffectDeclaration {
  /** The apply tool name the token is bound to. */
  tool: string;
  cli: CliCommandKey;
  flags: Readonly<Record<string, string>>;
  /**
   * Flags the server always supplies, derived from the resolved flags so that
   * `--confirm <same-action>` can mirror the action. Never client-controllable.
   * A `true` value renders as a bare boolean flag, which is how
   * `--power-off-first` and `--acknowledge-agent-runtime-reset` are expressed.
   */
  constants?: (flags: Record<string, CliFlagValue>) => Record<string, CliFlagValue>;
  /**
   * The class of irreversible damage this effect does, given the same arguments
   * the effect was computed from. Declared here, on the apply's own declaration,
   * so the plan can name the exact word the apply will demand without holding a
   * second copy that could drift from it.
   */
  consequence?: (args: Record<string, unknown>) => ConsequenceClass | null;
}

export interface ProbeResult {
  exitCode: number;
  payload: unknown;
  jsonFound: boolean;
  /** Set when the probe could not run at all, e.g. the CLI is missing. */
  error: string | null;
}

export interface PreflightContext {
  args: Record<string, unknown>;
  flags: Record<string, CliFlagValue>;
  /** Runs a registry command. Redaction is applied by the handler afterwards. */
  probe: (cli: CliCommandKey, flags?: CliFlags) => Promise<ProbeResult>;
}

export interface PreflightOutcome {
  /** Short-circuits the plan with this result, without minting a token. */
  refuse?: { status: WmStatus; summary: string; errors?: readonly string[] };
  data?: unknown;
  warnings?: readonly string[];
}

export interface TaskRunContext {
  args: Record<string, unknown>;
  deps: ServerDeps;
  /** Emits a progress notification when the client asked for one. */
  progress: (done: number, message: string, total?: number) => Promise<void>;
}

export interface TaskRunOutcome {
  result: WmResult;
  /** Stable, value-free label for the audit log. */
  subcommand: string;
}

export interface WmToolSpec {
  name: string;
  title: string;
  description: string;
  input: z.ZodType;
  annotations: ToolAnnotations;
  /** Defaults to `read`. The default is the safe one, so a spec that forgets stays harmless. */
  kind?: ToolKind;

  /** Required for `read` and `apply`. Absent for `plan` and `task`. */
  cli?: CliCommandKey;
  /** Maps a CLI flag name (without the leading --) to an argument field. */
  flags?: Readonly<Record<string, string>>;
  /** Safety constants the server supplies. Never readable from the input schema. */
  constants?: (flags: Record<string, CliFlagValue>) => Record<string, CliFlagValue>;

  /** `plan` only: the effect this plan will authorise. */
  mintsFor?: EffectDeclaration;
  /** `plan` only: the sentence the human must be shown before approving. */
  effect?: (args: Record<string, unknown>, flags: Record<string, CliFlagValue>) => string;
  /** `apply` only: the plan tool that issues tokens for this effect. */
  approvalSource?: string;
  /** `plan` only: runs live checks before a token is minted. */
  preflight?: (ctx: PreflightContext) => Promise<PreflightOutcome>;
  /**
   * `apply` only, and only for an irreversible action: the class of damage this
   * effect does, given the same arguments the effect was computed from. When it
   * returns non-null the caller must echo that exact class in
   * `acknowledgedConsequence` or the call is refused before anything spawns.
   *
   * Returning null is a real case, not a cop-out: `boot` cannot be destructive,
   * because there is no running state to destroy.
   */
  consequence?: (args: Record<string, unknown>) => ConsequenceClass | null;
  /** `task` only: full control over the call. */
  run?: (ctx: TaskRunContext) => Promise<TaskRunOutcome>;

  /** Status reported on exit 0. Read-only tools observe; they never claim READY. */
  successStatus?: WmStatus;
  summary: (ctx: ToolContext) => string;
  nextActions?: (ctx: ToolContext) => WmNextAction[];
  /** Extra warnings derived from the payload. Used to surface degradations. */
  extraWarnings?: (ctx: ToolContext) => string[];
  /** For commands that print plain text instead of JSON (wm_version). */
  parseText?: (stdout: string) => unknown;
  /** Records the resulting task so it can be observed later. */
  registers?: (ctx: ToolContext) => RegisterInput | null;
}

export interface ServerDeps {
  runner: Runner;
  auditDir: string;
  auditEnabled: boolean;
  approvals: ApprovalStore;
  tasks: TaskRegistry;
  /**
   * The persistent `manual_review` memory. Injected rather than constructed here
   * so it can be pointed at another directory, and so the server has one
   * instance for the whole process instead of one per call.
   */
  latch: LatchStore;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function num(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function describeError(error: unknown): string {
  if (error instanceof CliResolutionError) {
    const tried = error.tried.map((entry) => `  tried: ${entry}`).join("\n");
    return `${error.message}\n${tried}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Resolves client arguments plus server constants into CLI flags. Constants are
 * applied last so they always win: a client cannot weaken a safety literal.
 */
export function resolveFlags(
  decl: {
    flags?: Readonly<Record<string, string>>;
    constants?: (flags: Record<string, CliFlagValue>) => Record<string, CliFlagValue>;
  },
  args: Record<string, unknown>,
): Record<string, CliFlagValue> {
  const flags: Record<string, CliFlagValue> = {};
  for (const [flag, field] of Object.entries(decl.flags ?? {})) {
    const value = args[field];
    if (value === undefined || value === null) {
      continue;
    }
    flags[flag] = String(value);
  }
  if (decl.constants !== undefined) {
    for (const [name, value] of Object.entries(decl.constants(flags))) {
      flags[name] = value;
    }
  }
  return flags;
}

/** The argv an apply will run, computed identically at plan time so the hashes match. */
export function resolveEffectArgv(decl: EffectDeclaration, args: Record<string, unknown>): string[] {
  return buildArgv(decl.cli, resolveFlags(decl, args) as CliFlags);
}

function extractData(spec: WmToolSpec, outcome: RunOutcome): unknown {
  if (outcome.exitCode === 0 && spec.parseText !== undefined) {
    return spec.parseText(outcome.stdout);
  }
  return outcome.jsonFound ? outcome.json : null;
}

function buildResult(
  spec: WmToolSpec,
  outcome: RunOutcome,
  args: Record<string, unknown>,
): WmResult {
  const mapping = mapExitCode(outcome.exitCode);
  const status: WmStatus = outcome.exitCode === 0 ? (spec.successStatus ?? "OBSERVED") : mapping.status;

  const { value: data, redacted } = redact(extractData(spec, outcome));

  const warnings: string[] = [];
  for (const warning of outcome.warnings) {
    warnings.push(scrubText(warning).text);
  }
  if (!mapping.known) {
    warnings.push(
      `unknown_exit_code: ${String(outcome.exitCode)} is absent from the documented exit-code table`,
    );
  }

  const errors: string[] = [];
  if (isErrorStatus(status)) {
    // Two channels, in the order a reader wants them. The CLI reports its
    // failures as JSON on stdout, so that is usually the real explanation; the
    // stderr tail is progress noise that only matters when nothing else
    // survives, which is why it is appended rather than substituted.
    for (const line of stdoutErrorTail(outcome)) {
      errors.push(scrubText(line).text);
    }
    for (const line of stderrTail(outcome)) {
      errors.push(scrubText(line).text);
    }
    if (errors.length === 0) {
      errors.push(
        `${spec.name} exited ${String(outcome.exitCode)} with no diagnostic on stdout or stderr`,
      );
    }
  }

  const ctx: ToolContext = { data, args, status, exitCode: outcome.exitCode };

  for (const extra of safeCall(() => spec.extraWarnings?.(ctx) ?? [], [])) {
    warnings.push(scrubText(extra).text);
  }

  return makeResult({
    status,
    exitCode: outcome.exitCode,
    summary: summaryFor(spec, ctx, errors),
    data,
    warnings,
    errors,
    nextActions: safeCall(() => spec.nextActions?.(ctx) ?? [], []),
    redacted,
  });
}

/**
 * An `apply` summary is written as an assertion about a completed action -
 * "delete accepted", "install submitted" - so it is only true when the CLI
 * actually accepted it. Emitting it after a failure makes the envelope claim
 * something the caller has no way to check, and it contradicts `status` in the
 * same object, which is the one contradiction a reader cannot resolve.
 *
 * Read summaries need no such guard: they are derived from the payload, and the
 * existing ones deliberately degrade to the status when it is missing.
 */
function summaryFor(spec: WmToolSpec, ctx: ToolContext, diagnostics: readonly string[]): string {
  if (spec.kind === "apply" && isErrorStatus(ctx.status)) {
    const detail = diagnostics[0] ?? `the CLI exited ${String(ctx.exitCode)} without a diagnostic`;
    return `${spec.name} did not succeed (${ctx.status}): ${detail}`;
  }
  return safeCall(() => spec.summary(ctx), `${spec.name}: ${ctx.status}`);
}

function buildFailureResult(spec: WmToolSpec, error: unknown): WmResult {
  const denied = error instanceof CliDeniedError;
  const unresolved = error instanceof CliResolutionError;
  return makeResult({
    status: denied ? "DENIED" : "FAILED",
    exitCode: denied ? DENIED_EXIT_CODE : -1,
    summary: `${spec.name} could not run: ${describeError(error)}`,
    warnings: unresolved
      ? ["cli_unavailable: the warpmetal CLI could not be located on this host"]
      : [],
    errors: [describeError(error)],
  });
}

const REFUSAL_TEXT: Readonly<Record<ApprovalRefusal, string>> = {
  missing: "no approvalToken was supplied",
  invalid: "the approvalToken is not a token this server issued",
  expired: "the approvalToken has expired; run the plan tool again",
  consumed: "the approvalToken was already used; run the plan tool again",
  mismatch:
    "the approvalToken authorises a different effect; it was issued for other arguments",
};

function approvalRefusalResult(
  spec: WmToolSpec,
  reason: ApprovalRefusal,
): WmResult {
  const missing = reason === "missing";
  const planTool = spec.approvalSource ?? "the matching plan tool";
  const detail = REFUSAL_TEXT[reason];
  return makeResult({
    status: missing ? "APPROVAL_REQUIRED" : "DENIED",
    exitCode: missing ? APPROVAL_REQUIRED_EXIT_CODE : DENIED_EXIT_CODE,
    summary: `${spec.name} did not run: ${detail}`,
    warnings: missing
      ? [`approval_required: run ${planTool} first and show its effect to the human before applying`]
      : [`approval_refused: ${detail}`],
    errors: [detail],
    approval: { state: "required" },
    nextActions: [
      {
        action: `plan this action and obtain approval before applying it`,
        tool: planTool,
        args: {},
      },
    ],
  });
}

/**
 * The refusal a caller gets when it holds a valid token but has not named the
 * damage. Distinct from an approval refusal on purpose: the token was fine, the
 * missing thing is the acknowledgement, so re-planning would not help and the
 * `next_actions` must not imply that it would.
 */
function consequenceRefusalResult(spec: WmToolSpec, required: ConsequenceClass): WmResult {
  return makeResult({
    status: "DENIED",
    exitCode: DENIED_EXIT_CODE,
    summary: `${spec.name} did not run: the irreversible consequence of this action was not acknowledged`,
    warnings: [
      `consequence_not_acknowledged: pass acknowledgedConsequence="${required}" so the damage is stated, not assumed`,
    ],
    errors: [
      `this action's consequence is "${required}"; acknowledgedConsequence must equal it exactly`,
    ],
    approval: { state: "granted" },
  });
}

/** The refusal a caller gets for an id this server has already seen reach manual_review. */
function latchRefusalResult(spec: WmToolSpec, id: string, code: string): WmResult {
  return makeResult({
    status: "DENIED",
    exitCode: DENIED_EXIT_CODE,
    summary: `${spec.name} did not run: ${id} reached manual_review and must not be mutated again`,
    warnings: [
      `manual_review_latched: ${id} was observed at manual_review (${code}) in this state directory. Read-only status checks may observe the backend reconciling it; nothing may retry the consequential action.`,
    ],
    errors: [`${id} is latched; no mutation is accepted for it`],
    nextActions: [
      { action: "read the latched ids and their reason", tool: "wm_manual_review_list", args: {} },
    ],
  });
}

/**
 * The refusal a caller gets when the installed CLI is older than the contract
 * this server enforces. It is a refusal rather than a warning because the gate
 * derives `--confirm` literals, flag names and an exit-code mapping from a
 * specific version: an older CLI does not fail loudly, it quietly means
 * something else, and a token would authorise a sentence nobody verified.
 *
 * Nothing is spawned and nothing is spent, so upgrading and calling the plan
 * tool again is the whole remedy.
 */
function cliTooOldResult(spec: WmToolSpec, observed: string): WmResult {
  const floor = joinVersion(MIN_CLI_VERSION);
  return makeResult({
    status: "DENIED",
    exitCode: DENIED_EXIT_CODE,
    summary: `${spec.name} did not run: the installed warpmetal CLI is ${observed}, below the ${floor} this server was built against`,
    warnings: [
      `cli_too_old: the installed warpmetal CLI is ${observed} and this server requires ${floor} or newer. Nothing was spawned and no approval was spent; upgrade with npm install -g warpmetal@latest and run the plan tool again.`,
    ],
    errors: [
      `warpmetal ${observed} is below the supported floor ${floor}; its usage lines, --confirm literals and exit codes may differ from the contract this server enforces`,
    ],
    nextActions: [
      { action: "re-read the installed CLI version after upgrading", tool: "wm_version", args: {} },
    ],
  });
}

/**
 * The CLI version floor, as a refusal or null. Null covers the two honest cases:
 * a runner that cannot report a version at all, and a version that is at or
 * above the floor. Only a version that was actually read and is actually below
 * produces a refusal.
 */
async function cliVersionRefusal(spec: WmToolSpec, deps: ServerDeps): Promise<WmResult | null> {
  let raw: string | null;
  try {
    raw = (await deps.runner.cliVersion?.()) ?? null;
  } catch {
    // Reading the version is never allowed to be the thing that breaks a call.
    raw = null;
  }
  const verdict = judgeCliVersion(raw);
  if (verdict === null || !verdict.belowFloor) {
    return null;
  }
  return cliTooOldResult(spec, verdict.observed);
}

/** Argument names that name an id, mapped to what they refer to. */
const ARG_ID_KINDS: Readonly<Record<string, LatchKind>> = {
  serverId: "server",
  sandboxId: "sandbox",
  grantId: "grant",
  taskId: "task",
  operationId: "operation",
};

/**
 * How narrow a target is. The latch records only the most specific identifier a
 * call names, because that is the subject of the operation and the broader ids
 * are just how the CLI reaches it: `sandbox access revoke` carries a server, a
 * sandbox and a grant, but it is not *about* the server.
 *
 * Recording the broader ids too would be a quiet overreach. One sandbox whose
 * grant hit manual_review would freeze every mutation on the whole server, and a
 * guard that blocks unrelated work is a guard an operator learns to route
 * around. The narrow record is the accurate one.
 */
const LATCH_SPECIFICITY: Readonly<Record<LatchKind, number>> = {
  server: 1,
  task: 2,
  operation: 2,
  sandbox: 3,
  grant: 4,
};

/** Which kind a bare `id` field refers to, decided by the wrapper it sits in. */
const WRAPPER_KINDS: Readonly<Record<string, LatchKind>> = {
  task: "task",
  operation: "operation",
  sandbox: "sandbox",
  accessGrant: "grant",
  grant: "grant",
  runtime: "server",
  server: "server",
};

const RESULT_ID_KEYS: readonly string[] = [
  "serverId",
  "sandboxId",
  "grantId",
  "taskId",
  "operationId",
  "id",
];

/** Every id the arguments name, with what each refers to. */
function argIds(args: Record<string, unknown>): Array<{ id: string; kind: LatchKind }> {
  const found: Array<{ id: string; kind: LatchKind }> = [];
  for (const [key, kind] of Object.entries(ARG_ID_KINDS)) {
    const value = str(args[key]);
    if (value !== null && isSafeLatchId(value)) {
      found.push({ id: value, kind });
    }
  }
  return found;
}

/** The ids the payload named, which are usually the same ones the arguments did. */
function payloadIds(payload: unknown): Array<{ id: string; kind: LatchKind }> {
  const found: Array<{ id: string; kind: LatchKind }> = [];
  const top = asRecord(payload);
  if (top === null) {
    return found;
  }
  const containers: Array<{ record: Record<string, unknown>; kind: LatchKind | null }> = [
    { record: top, kind: null },
  ];
  for (const [key, kind] of Object.entries(WRAPPER_KINDS)) {
    const nested = asRecord(top[key]);
    if (nested !== null) {
      containers.push({ record: nested, kind });
    }
  }
  for (const { record, kind } of containers) {
    for (const key of RESULT_ID_KEYS) {
      const value = str(record[key]);
      if (value === null || !isSafeLatchId(value)) {
        continue;
      }
      found.push({ id: value, kind: kind ?? ARG_ID_KINDS[key] ?? "task" });
    }
  }
  return found;
}

/**
 * The identifiers to write down: the narrowest tier the call named, and only
 * that tier. Argument ids come first because they are the ones the caller
 * targeted, then the ids the payload named - a status call carries a `taskId`, a
 * sandbox call carries a `sandboxId`, and missing the payload's copy would leave
 * a task latched under an id nothing else uses.
 *
 * Ids are filtered through the same pattern the store enforces, so a payload
 * field that happens to be free text is dropped here rather than rejected there.
 */
function idsToLatch(args: Record<string, unknown>, payload: unknown): Array<{ id: string; kind: LatchKind }> {
  const all = [...argIds(args), ...payloadIds(payload)];
  if (all.length === 0) {
    return [];
  }
  const narrowest = Math.max(...all.map((entry) => LATCH_SPECIFICITY[entry.kind]));
  const seen = new Set<string>();
  const result: Array<{ id: string; kind: LatchKind }> = [];
  for (const entry of all) {
    if (LATCH_SPECIFICITY[entry.kind] !== narrowest || seen.has(entry.id)) {
      continue;
    }
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

/**
 * The short code explaining why an id latched. The API's own failure code is
 * preferred because it is the most specific - `payment_expired_unsettled` tells
 * a human far more than `manual_review` - but it has to survive the store's
 * pattern, so anything that is not a plain enum word falls back to the status.
 */
function latchCode(payload: unknown, status: string): string {
  const record = asRecord(payload);
  const failure = asRecord(record?.["failure"]);
  const code = str(failure?.["code"]) ?? str(record?.["code"]);
  if (code !== null && isSafeLatchCode(code)) {
    return code;
  }
  return status.toLowerCase();
}

/**
 * Writes down a `manual_review` observation. Runs for every tool, read-only
 * ones included, because the cheapest way to widen the net is to latch on
 * whatever the server happens to see rather than only on the tools that could
 * mutate.
 *
 * Returns a warning when the latch could not be written. It is not swallowed:
 * a memory of a terminal state that silently fails to persist is worse than
 * one that never existed, because the caller believes it is protected.
 */
function latchObservation(
  deps: ServerDeps,
  args: Record<string, unknown>,
  result: WmResult,
): string | null {
  if (result.status !== "MANUAL_REVIEW") {
    return null;
  }
  const code = latchCode(result.data, result.status);
  const targets = idsToLatch(args, result.data);
  if (targets.length === 0) {
    return null;
  }
  let failure: string | null = null;
  for (const target of targets) {
    const outcome = deps.latch.record(target.id, target.kind, code);
    if (!outcome.ok && outcome.error !== undefined) {
      failure = outcome.error;
    }
  }
  return failure;
}

/** Runs a probe command for a preflight, converting a thrown executor error into data. */
function makeProbe(runner: Runner) {
  return async (cli: CliCommandKey, flags: CliFlags = {}): Promise<ProbeResult> => {
    try {
      const outcome = await runner.run(cli, flags);
      return {
        exitCode: outcome.exitCode,
        payload: outcome.jsonFound ? outcome.json : null,
        jsonFound: outcome.jsonFound,
        error: null,
      };
    } catch (error) {
      return { exitCode: -1, payload: null, jsonFound: false, error: describeError(error) };
    }
  };
}

interface HandleOutcome {
  result: WmResult;
  subcommand: string;
  approvalState: AuditApprovalState;
  /** Defaults to `none` when a path does not set it. */
  consequence?: AuditConsequenceState;
  /** Defaults to `not_checked` when a path does not set it. */
  latch?: AuditLatchState;
}

/** Turns an internal defect into a typed envelope instead of an opaque protocol error. */
function internalFailure(spec: WmToolSpec, error: unknown): HandleOutcome {
  return {
    result: makeResult({
      status: "FAILED",
      exitCode: SPAWN_FAILED_EXIT_CODE,
      summary: `${spec.name} failed inside the server before it could complete`,
      errors: [describeError(error)],
      warnings: [
        "server_bug: this is a defect in warpmetal-mcp, not a WarpMetal state. Do not retry blindly; report the tool name and this message.",
      ],
    }),
    subcommand: spec.name,
    approvalState: "not_required",
  };
}

/**
 * stderr is the conventional MCP log channel and is not part of the protocol
 * stream. Only the tool name and the error are written: never the arguments,
 * because an argument can be a filesystem path or an identity name.
 */
function reportInternalError(spec: WmToolSpec, error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`[warpmetal-mcp] internal error in ${spec.name}: ${detail}\n`);
}

async function handle(
  spec: WmToolSpec,
  deps: ServerDeps,
  args: Record<string, unknown>,
  extra: { _meta?: { progressToken?: string | number } | undefined; sendNotification?: (n: unknown) => Promise<void> },
): Promise<CallToolResult> {
  const startedAt = Date.now();
  // A defect in this server must degrade into a typed envelope, not escape as
  // an opaque JSON-RPC error that the caller cannot reason about. The
  // distinction matters: an escaped error is indistinguishable from a transport
  // failure, and the caller would retry something that was never the problem.
  let outcome: HandleOutcome;
  try {
    outcome = await runSpec(spec, deps, args, extra);
  } catch (error) {
    reportInternalError(spec, error);
    outcome = internalFailure(spec, error);
  }

  if (deps.auditEnabled) {
    const audit = appendAudit(
      {
        ts: new Date().toISOString(),
        tool: spec.name,
        // A constant from the closed registry, or a spec name. Never a flag
        // value, so no path, token or identity name can reach the log.
        subcommand: outcome.subcommand,
        exit_code: outcome.result.exit_code,
        status: outcome.result.status,
        duration_ms: Date.now() - startedAt,
        redacted: outcome.result.redacted,
        approval: outcome.approvalState,
        consequence: outcome.consequence ?? "none",
        latch: outcome.latch ?? "not_checked",
      },
      deps.auditDir,
    );
    if (!audit.ok) {
      outcome.result.warnings.push(
        `audit_log_unavailable: ${audit.error ?? "unknown error"}`,
      );
    }
  }

  // The return path must not be able to throw either: a serialisation failure
  // would escape as the same opaque error this function exists to prevent.
  try {
    return {
      content: [{ type: "text", text: JSON.stringify(outcome.result, null, 2) }],
      structuredContent: outcome.result as unknown as Record<string, unknown>,
      isError: isErrorStatus(outcome.result.status),
    };
  } catch (error) {
    reportInternalError(spec, error);
    const fallback = internalFailure(spec, error);
    return {
      content: [{ type: "text", text: JSON.stringify(fallback.result, null, 2) }],
      structuredContent: fallback.result as unknown as Record<string, unknown>,
      isError: true,
    };
  }
}

async function runSpec(
  spec: WmToolSpec,
  deps: ServerDeps,
  args: Record<string, unknown>,
  extra: { _meta?: { progressToken?: string | number } | undefined; sendNotification?: (n: unknown) => Promise<void> },
): Promise<HandleOutcome> {
  const kind = spec.kind ?? "read";
  if (kind === "task") {
    return runTaskSpec(spec, deps, args, extra);
  }

  // A plan tool declares no `flags` of its own: the flags belong to the effect
  // declaration, which is the apply's own declaration. Resolving them from
  // `mintsFor` is what keeps the effect text and the argv the apply will run in
  // agreement. Reading them off the plan spec instead would hand the effect an
  // empty flag set, so any effect that mentions a derived value - a `--confirm`
  // literal, a lifetime, an expiry - would describe an effect other than the one
  // being authorised. The hash was always computed from the declaration, so the
  // token was never wrong; the sentence a human reads was.
  const effectDecl = spec.mintsFor;
  const flags =
    kind === "plan" && effectDecl !== undefined
      ? resolveFlags(effectDecl, args)
      : resolveFlags(spec, args);
  const hasCli = spec.cli !== undefined;
  // A plan has no argv of its own; the effect declaration does. The idempotency
  // key is appended by the approval store, inside the digest, so it is never a
  // flag a client could set.
  const idempotent =
    hasCli && acceptsIdempotencyKey(spec.cli as CliCommandKey);
  const argv = hasCli ? buildArgv(spec.cli as CliCommandKey, flags as CliFlags) : [];
  const subcommand = hasCli ? (CLI_COMMANDS[spec.cli as CliCommandKey].argv.join(" ")) : spec.name;

  // --- The latch. A terminal state outlives the turn it was observed on. ---
  // First, before the token: a latched id must never be told to go and get an
  // approval it will be refused for. The latch is a memory of an outcome the
  // caller cannot see, so it answers with more authority than the gate can, and
  // the gate's answer would be the misleading one.
  //
  // It guards `plan` and `apply`, never `read` or `task`. That line is
  // deliberate: the WarpMetal rules explicitly allow a later read-only status
  // check to observe the backend reconciling itself, so blocking reads would
  // make the latch prevent the only thing that can clear it. Refusing the plan
  // half as well is the friendly version - no point minting a token that will
  // be refused when it is spent.
  //
  // Every id in the call is checked, not only the narrowest one. That asymmetry
  // with the write side is what makes a server-scoped latch bind: a sandbox
  // mutation carries its server's id, so a latched server stops it, while a
  // latched sandbox leaves the server alone.
  if (kind === "plan" || kind === "apply") {
    for (const target of argIds(args)) {
      const entry = deps.latch.get(target.id);
      if (entry !== null) {
        return {
          result: latchRefusalResult(spec, target.id, entry.code),
          subcommand,
          // The token was never examined, so the record must not claim it was
          // missing. A plan never needed one at all.
          approvalState: kind === "apply" ? "not_attempted" : "not_required",
          consequence: "none",
          latch: "refused",
        };
      }
    }
  }

  // --- The CLI version floor. ---
  // Checked before the token, for the same reason the latch is: asking a human
  // to approve something that is about to be refused spends exactly the
  // attention the gate exists to protect. The version comes from the public
  // manifest the executor already read, so this costs no extra process, and an
  // unknown version refuses nothing.
  if (kind === "apply") {
    const tooOld = await cliVersionRefusal(spec, deps);
    if (tooOld !== null) {
      return {
        result: tooOld,
        subcommand,
        // The token was never examined, so the record must not claim it was
        // missing. The latch was consulted and had nothing to say.
        approvalState: "not_attempted",
        consequence: "none",
        latch: "clear",
      };
    }
  }

  // --- The approval gate. Nothing is spawned before this passes. ---
  let grantedNonce: string | null = null;
  if (kind === "apply") {
    const rawToken = args["approvalToken"];
    const token = typeof rawToken === "string" ? rawToken : undefined;
    const verdict = deps.approvals.verify(token, {
      tool: spec.name,
      subcommand,
      argv,
      idempotent,
    });
    if (!verdict.ok) {
      return {
        result: approvalRefusalResult(spec, verdict.reason),
        subcommand,
        approvalState: `refused_${verdict.reason}`,
        latch: "clear",
      };
    }
    grantedNonce = verdict.nonce;
    // The key the token authorised, and therefore the key this call must use.
    // A retry with the same token recomputes the same key from the same nonce,
    // which is what would make the two invocations one logical request instead
    // of two. No command is marked `idempotent` yet, so in practice this is
    // skipped and the timeout warning says so; see `CLI_COMMANDS` in exec.ts.
    if (idempotent) {
      flags["idempotency-key"] = idempotencyKeyFor(verdict.nonce);
    }
  }

  // --- The consequence the caller has to name. ---
  // A token proves the effect was approved; it says nothing about whether the
  // damage was understood. This is the one field a model cannot arrive at by
  // copying its own arguments, which is precisely what makes it worth demanding.
  if (kind === "apply") {
    const required = spec.consequence?.(args) ?? null;
    if (required !== null && args["acknowledgedConsequence"] !== required) {
      return {
        result: consequenceRefusalResult(spec, required),
        subcommand,
        approvalState: approvalStateFor(spec, grantedNonce),
        consequence: required,
        latch: "clear",
      };
    }
  }

  // --- Preflight, for tools that must verify against live data first. ---
  const preflightWarnings: string[] = [];
  let preflightData: unknown;
  if (spec.preflight !== undefined) {
    let pre: PreflightOutcome;
    try {
      pre = await spec.preflight({ args, flags, probe: makeProbe(deps.runner) });
    } catch (error) {
      pre = {
        refuse: {
          status: "FAILED",
          summary: `${spec.name} could not verify its preconditions`,
          errors: [describeError(error)],
        },
      };
    }
    if (pre.refuse !== undefined) {
      // Nothing was spawned: the server declined to mint a token. That is the
      // same class of decision as a failed approval gate, so it carries the
      // negative sentinel rather than a 0 that would imply the CLI answered.
      const refused = makeResult({
        status: pre.refuse.status,
        exitCode: DENIED_EXIT_CODE,
        summary: pre.refuse.summary,
        warnings: [...(pre.warnings ?? [])],
        errors: [...(pre.refuse.errors ?? [])],
      });
      return {
        result: refused,
        subcommand,
        // A plan never needed a token; an apply that got this far already had
        // one verified, and refusing here does not consume it.
        approvalState: approvalStateFor(spec, grantedNonce),
        // The latch ran and had nothing to say: it is only silent here because
        // it was consulted. Reading it off the control flow is what keeps
        // "checked and clear" from looking like "never checked".
        latch: kind === "plan" || kind === "apply" ? "clear" : "not_checked",
      };
    }
    for (const warning of pre.warnings ?? []) {
      preflightWarnings.push(warning);
    }
    preflightData = pre.data;
  }

  // --- The call itself. ---
  let outcome: RunOutcome | null = null;
  if (hasCli) {
    try {
      outcome = await deps.runner.run(spec.cli as CliCommandKey, flags as CliFlags);
    } catch (error) {
      const failure = buildFailureResult(spec, error);
      for (const warning of preflightWarnings) {
        failure.warnings.push(scrubText(warning).text);
      }
      return { result: failure, subcommand, approvalState: approvalStateFor(spec, grantedNonce) };
    }
  }

  let result: WmResult;
  if (outcome !== null) {
    result = buildResult(spec, outcome, args);
  } else {
    const { value: data, redacted } = redact(preflightData ?? null);
    const ctx: ToolContext = { data, args, status: "PLANNED", exitCode: 0 };
    result = makeResult({
      status: spec.successStatus ?? "PLANNED",
      exitCode: 0,
      summary: safeCall(() => spec.summary(ctx), `${spec.name}: PLANNED`),
      data,
      warnings: safeCall(() => spec.extraWarnings?.(ctx) ?? [], []),
      nextActions: safeCall(() => spec.nextActions?.(ctx) ?? [], []),
      redacted,
    });
  }

  for (const warning of preflightWarnings) {
    result.warnings.push(scrubText(warning).text);
  }

  // --- Mint the token. This is the whole reason a plan tool exists. ---
  if (kind === "plan") {
    if (effectDecl === undefined) {
      throw new Error(`plan tool ${spec.name} has no effect declaration to authorise`);
    }
    const effectText = safeCall(() => spec.effect?.(args, flags) ?? "", "");
    if (effectText.length === 0) {
      throw new Error(`plan tool ${spec.name} produced an empty effect statement`);
    }
    // Computed from the apply's own declaration, so the hash the apply checks
    // is the hash of the argv the apply will actually run, idempotency key
    // included.
    const minted = deps.approvals.mint({
      tool: effectDecl.tool,
      subcommand: CLI_COMMANDS[effectDecl.cli].argv.join(" "),
      argv: resolveEffectArgv(effectDecl, args),
      idempotent: acceptsIdempotencyKey(effectDecl.cli),
      effect: effectText,
    });
    result.approval = {
      state: "required",
      token: minted.token,
      expires_at: minted.expiresAt,
      effect: minted.effect,
    };
    result.warnings.push(
      "approval_required: nothing has changed yet. Show approval.effect to the human and obtain their approval before calling the apply tool; the token is single-use and expires.",
    );
    // The apply will demand this exact word. Naming it here means the model
    // never has to guess it at apply time, which is the difference between a
    // gate that teaches and a gate that blocks.
    const requiredConsequence = spec.mintsFor?.consequence?.(args) ?? null;
    if (requiredConsequence !== null) {
      result.warnings.push(
        `consequence_required: the apply call must pass acknowledgedConsequence="${requiredConsequence}" to confirm the damage was stated to the human.`,
      );
    }
  }

  // --- Close the loop on the token. ---
  if (kind === "apply") {
    if (grantedNonce === null) {
      throw new Error("apply spec reached the token step without an approval");
    }
    result.approval = { state: "granted" };
    if (outcome !== null && isKnownOutcome(outcome.exitCode)) {
      // The CLI answered, so this token has done its job.
      deps.approvals.consume(grantedNonce);
    } else {
      // Timeout or failed spawn: the real-world effect is unknown. Keeping the
      // token alive lets the operator settle the question and retry the same
      // effect, instead of forcing a fresh approval for something that may
      // never have happened. The warning is the price of that choice.
      result.warnings.push(
        idempotent
          ? "approval_not_consumed: the outcome is unknown, so the approval is still valid. A retry with this token carries the same idempotency key, so WarpMetal sees one request rather than two; observe the real state anyway before deciding."
          : "approval_not_consumed: the outcome is unknown, so the approval is still valid. This command takes no idempotency key, so a retry is a genuinely new request; observe the real state before deciding whether to retry.",
      );
      result.next_actions.unshift({
        action: "observe the real state before deciding whether to retry",
        tool: spec.approvalSource ?? "wm_task_list",
        args: {},
      });
    }
  }

  // --- Task registration, so the id can be observed later. ---
  if (spec.registers !== undefined) {
    const ctx: ToolContext = {
      data: result.data,
      args,
      status: result.status,
      exitCode: result.exit_code,
    };
    const record = safeCall(() => spec.registers?.(ctx) ?? null, null);
    if (record !== null) {
      deps.tasks.register(record);
      result.task_id = record.taskId;
    }
  }

  // --- Write down a terminal state, before it is forgotten. ---
  // Runs for every kind, reads included: a status check is often the only place
  // a `manual_review` is ever seen, and a latch that only watched mutations
  // would miss exactly the observation that matters most.
  const latchWarning = latchObservation(deps, args, result);
  if (latchWarning !== null) {
    result.warnings.push(`manual_review_not_recorded: ${latchWarning}`);
  } else if (result.status === "MANUAL_REVIEW") {
    result.warnings.push(
      "manual_review_latched: this id is now recorded as terminal for mutations for the rest of this state directory's window. Do not retry the consequential action.",
    );
  }

  return {
    result,
    subcommand,
    approvalState: approvalStateFor(spec, grantedNonce),
    consequence: consequenceOf(spec, kind, args),
    latch:
      kind === "plan" || kind === "apply"
        ? result.status === "MANUAL_REVIEW"
          ? "recorded"
          : "clear"
        : "not_checked",
  };
}

/**
 * The consequence this call demanded, for the audit record. Read from the same
 * declaration the gate reads, so the log cannot claim a different acceptance
 * than the one that was enforced.
 */
function consequenceOf(
  spec: WmToolSpec,
  kind: ToolKind,
  args: Record<string, unknown>,
): AuditConsequenceState {
  if (kind !== "apply") {
    return "none";
  }
  return spec.consequence?.(args) ?? "none";
}

function approvalStateFor(spec: WmToolSpec, nonce: string | null): AuditApprovalState {
  if ((spec.kind ?? "read") !== "apply") {
    return "not_required";
  }
  return nonce === null ? "refused_missing" : "granted";
}

async function runTaskSpec(
  spec: WmToolSpec,
  deps: ServerDeps,
  args: Record<string, unknown>,
  extra: { _meta?: { progressToken?: string | number } | undefined; sendNotification?: (n: unknown) => Promise<void> },
): Promise<HandleOutcome> {
  if (spec.run === undefined) {
    throw new Error(`task tool ${spec.name} has no run function`);
  }
  const token = extra._meta?.progressToken;
  const send = extra.sendNotification;
  const progress = async (done: number, message: string, total?: number): Promise<void> => {
    if (token === undefined || send === undefined) {
      return;
    }
    try {
      await send({
        method: "notifications/progress",
        params: {
          progressToken: token,
          progress: done,
          message,
          ...(total !== undefined ? { total } : {}),
        },
      });
    } catch {
      // A client that asked for progress but then dropped the stream must not
      // break the poll.
    }
  };

  const outcome = await spec.run({ args, deps, progress });
  return {
    result: outcome.result,
    subcommand: outcome.subcommand,
    approvalState: "not_required",
  };
}

/**
 * Registers one tool. The casts are confined to this boundary: the handler
 * treats arguments as an untyped record because every field has already been
 * validated by the Zod schema, and `extra` is narrowed to the two fields this
 * server actually uses.
 */
export function registerToolSpec(server: McpServer, spec: WmToolSpec, deps: ServerDeps): void {
  server.registerTool(
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.input,
      outputSchema: wmResultSchema,
      annotations: spec.annotations,
    },
    async (args: unknown, extra: unknown) =>
      handle(
        spec,
        deps,
        args as Record<string, unknown>,
        extra as { _meta?: { progressToken?: string | number } | undefined; sendNotification?: (n: unknown) => Promise<void> },
      ),
  );
}

export function registerToolSpecs(
  server: McpServer,
  specs: readonly WmToolSpec[],
  deps: ServerDeps,
): void {
  for (const spec of specs) {
    registerToolSpec(server, spec, deps);
  }
}
