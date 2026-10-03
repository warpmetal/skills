/**
 * mutate.ts - the six non-destructive mutations, each as a plan/apply pair.
 *
 * The pairs are generated from a single declaration so that the argv the plan
 * hashes is *by construction* the argv the apply runs. If those two could drift,
 * the approval token would be checking the wrong thing while looking correct.
 *
 * What is deliberately absent here, and why it matters more than what is
 * present: `server power`, `server reload`, `sandbox delete`, `sandbox access
 * revoke`, and the `make_persistent` / `refresh_image` sandbox actions. They are
 * declared by `destructive.ts` instead, behind the hardened broker, and never
 * appear among these pairs.
 */
import { z } from "zod";

import type { CliFlagValue } from "../exec.js";
import type { RegisterInput } from "../tasks.js";
import {
  approvalTokenSchema,
  consequenceSchema,
  dnsLabelSchema,
  expiresInSecondsSchema,
  pathOnlySchema,
  sandboxActionSchema,
  sandboxSizeSchema,
  serverIdSchema,
  sandboxIdSchema,
  type ConsequenceClass,
} from "../schemas.js";
import {
  checkCapacity,
  grantIdOf,
  grantList,
  grantRecord,
  osSupportsRuntime,
  runtimeState,
  sandboxIdOf,
  sandboxList,
  sandboxRecord,
  stateOf,
  taskRecord,
} from "../shapes.js";
import {
  asRecord,
  bool,
  str,
  type EffectDeclaration,
  type PreflightContext,
  type PreflightOutcome,
  type ProbeResult,
  type ToolContext,
  type WmToolSpec,
} from "./spec.js";
import type { WmNextAction } from "../result.js";

/** A plan reads live service data, so it is read-only but does touch the network. */
export const PLAN_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/**
 * An apply is the only thing here that is not read-only. It is still not
 * destructive: nothing in this file erases a server or a workspace.
 * `idempotentHint` is false because replaying an apply is refused by the token
 * gate, not because the operation is unsafe to repeat.
 */
export const APPLY_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/**
 * The same shape, for an apply that genuinely destroys something. Only the
 * `destructiveHint` changes, and it changes because the MCP contract asks for
 * the truth: a client that reads it can warn its own user before the call.
 * Marking these as non-destructive for the sake of a tidier table would be
 * trading a real signal for a cosmetic one.
 */
export const DESTRUCTIVE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/** Shared sentence every plan tool ends with, so the limit is never implied. */
export const PLAN_CONTRACT =
  "Return the effect text verbatim to the human and obtain their approval before calling the matching _apply tool; the token is single-use and bound to exactly this effect.";

export interface PairConfig {
  /** Without the `_plan` / `_apply` suffix, e.g. `wm_runtime_enable`. */
  base: string;
  title: string;
  /** What the action does, in one clause, used in both descriptions. */
  what: string;
  cli: WmToolSpec["cli"];
  flags: Readonly<Record<string, string>>;
  constants?: (flags: Record<string, CliFlagValue>) => Record<string, CliFlagValue>;
  inputShape: Record<string, z.ZodType>;
  /** Extra checks the plan runs against live data. */
  preflight?: (ctx: PreflightContext) => Promise<PreflightOutcome>;
  effect: (args: Record<string, unknown>, flags: Record<string, CliFlagValue>) => string;
  /**
   * Set only for an irreversible action. It does three things at once, which is
   * why it is one field and not three: the plan names the class in its warnings,
   * the apply demands it back in `acknowledgedConsequence`, and the apply
   * re-runs `preflight` so a world that changed since the plan is caught before
   * anything spawns.
   */
  consequence?: (args: Record<string, unknown>) => ConsequenceClass | null;
  /** One sentence, appended to the apply's description, naming what cannot be undone. */
  warning?: string;
  /** True when the apply erases something, so it advertises `destructiveHint`. */
  destructive?: boolean;
  planSummary: (ctx: ToolContext) => string;
  applySummary: (ctx: ToolContext) => string;
  planWarnings?: (ctx: ToolContext) => string[];
  applyWarnings?: (ctx: ToolContext) => string[];
  registers?: (ctx: ToolContext) => RegisterInput | null;
  /** The read tool that confirms the effect, used in next_actions. */
  verifyWith?: string;
  verifyArgs?: (args: Record<string, unknown>) => Record<string, unknown>;
}

export function pickId(payload: unknown, keys: readonly string[]): string | null {
  const record = asRecord(payload);
  if (record === null) {
    return null;
  }
  for (const key of keys) {
    const value = str(record[key]);
    if (value !== null) {
      return value;
    }
  }
  // One level down, for payloads shaped as `{ sandbox: { id } }`.
  for (const value of Object.values(record)) {
    const nested = asRecord(value);
    if (nested !== null) {
      for (const key of keys) {
        const found = str(nested[key]);
        if (found !== null) {
          return found;
        }
      }
    }
  }
  return null;
}

/**
 * A task key for a command that returns no server-assigned identifier. The
 * prefix keeps it from ever being mistaken for an id the API issued, and its
 * stability means re-applying refreshes one entry instead of accumulating them.
 */
export function localTaskId(kind: string, key: string): string {
  return `${kind}:${key}`;
}

export function verificationWarnings(prefix: string, probe: ProbeResult): string[] {
  if (probe.error !== null) {
    return [`plan_probe_failed: ${prefix} could not be checked (${probe.error})`];
  }
  if (probe.exitCode !== 0) {
    return [`plan_probe_failed: ${prefix} could not be checked (exit ${String(probe.exitCode)})`];
  }
  return [];
}

/** Confirms a sandbox exists and reports the state the plan is changing. */
export async function checkSandbox(
  ctx: PreflightContext,
  serverId: string,
  sandboxId: string,
): Promise<PreflightOutcome> {
  const probe = await ctx.probe("sandboxGet", { server: serverId, sandbox: sandboxId });
  const warnings = verificationWarnings("the sandbox", probe);
  if (probe.error !== null || probe.exitCode !== 0) {
    return {
      refuse: {
        status: "DENIED",
        summary: `the sandbox ${sandboxId} could not be read, so its state is unknown`,
        errors: warnings,
      },
    };
  }
  const record = sandboxRecord(probe.payload);
  const observed = stateOf(record);
  return {
    data: { sandboxId, serverId, observedState: observed },
    warnings,
  };
}

export function mutationPair(cfg: PairConfig): WmToolSpec[] {  const planName = `${cfg.base}_plan`;
  const applyName = `${cfg.base}_apply`;
  const irreversible = cfg.consequence !== undefined;
  const declaration: EffectDeclaration = {
    tool: applyName,
    cli: cfg.cli as EffectDeclaration["cli"],
    flags: cfg.flags,
  };
  if (cfg.constants !== undefined) {
    declaration.constants = cfg.constants;
  }
  if (cfg.consequence !== undefined) {
    declaration.consequence = cfg.consequence;
  }

  const verify = cfg.verifyWith;
  const verifyArgs = cfg.verifyArgs;
  // The token is optional in the schema on purpose. A required field would make
  // the SDK reject the call with a JSON-RPC validation error, which teaches a
  // caller nothing; optional lets the handler answer with a typed
  // APPROVAL_REQUIRED envelope whose next_actions name the plan tool. The same
  // reasoning applies to `acknowledgedConsequence`, which is why it is optional
  // here and enforced in the handler instead.
  const applyInput = z.strictObject({
    ...cfg.inputShape,
    approvalToken: approvalTokenSchema.optional(),
    ...(irreversible ? { acknowledgedConsequence: consequenceSchema.optional() } : {}),
  });
  const planInput = z.strictObject(cfg.inputShape);

  const applyNextActions = (ctx: ToolContext): WmNextAction[] => {
    if (verify === undefined) {
      return [];
    }
    return [
      {
        action: "confirm the effect before reporting it as done; the CLI reported acceptance, not verified state",
        tool: verify,
        args: verifyArgs !== undefined ? verifyArgs(ctx.args) : {},
      },
    ];
  };

  const plan: WmToolSpec = {
    name: planName,
    title: `Plan: ${cfg.title}`,
    description: `Validates and describes the effect of ${cfg.what} against live data, then issues a single-use approval token. Nothing is changed by this tool. ${PLAN_CONTRACT}`,
    input: planInput,
    annotations: PLAN_ANNOTATIONS,
    kind: "plan",
    mintsFor: declaration,
    effect: cfg.effect,
    successStatus: "PLANNED",
    summary: cfg.planSummary,
    nextActions: (ctx) => {
      const required = cfg.consequence?.(ctx.args) ?? null;
      return [
        {
          action: `apply the approved effect`,
          tool: applyName,
          args: {
            ...ctx.args,
            approvalToken: "<approval.token from this result>",
            ...(required !== null ? { acknowledgedConsequence: required } : {}),
          },
        },
      ];
    },
    ...(cfg.preflight !== undefined ? { preflight: cfg.preflight } : {}),
    ...(cfg.planWarnings !== undefined ? { extraWarnings: cfg.planWarnings } : {}),
  };

  const apply: WmToolSpec = {
    name: applyName,
    title: `Apply: ${cfg.title}`,
    description: [
      `Executes ${cfg.what}. Requires the approvalToken issued by ${planName} for exactly this effect; the token is single-use and is refused if any argument differs.`,
      irreversible
        ? `The effect text names what cannot be undone, and this call must repeat that class in acknowledgedConsequence. ${cfg.warning ?? ""}`.trim()
        : "",
      "Safe stopping point only: the CLI is invoked without --wait, so acceptance is not proof of completion.",
    ]
      .filter((part) => part.length > 0)
      .join(" "),
    input: applyInput,
    annotations: cfg.destructive === true ? DESTRUCTIVE_ANNOTATIONS : APPLY_ANNOTATIONS,
    kind: "apply",
    cli: cfg.cli,
    flags: cfg.flags,
    approvalSource: planName,
    // Acceptance, not verified state. The next_action carries the proof step.
    successStatus: "OBSERVED",
    summary: cfg.applySummary,
    nextActions: applyNextActions,
    ...(cfg.constants !== undefined ? { constants: cfg.constants } : {}),
    ...(cfg.applyWarnings !== undefined ? { extraWarnings: cfg.applyWarnings } : {}),
    ...(cfg.registers !== undefined ? { registers: cfg.registers } : {}),
    // The TOCTOU guard. A token lives ten minutes, and a sandbox can be deleted
    // inside that window by someone else. Re-running the plan's own checks here
    // closes the gap, and a refusal at this point leaves the token unspent so
    // the caller can re-plan against the world it actually has.
    ...(irreversible && cfg.preflight !== undefined ? { preflight: cfg.preflight } : {}),
    ...(cfg.consequence !== undefined ? { consequence: cfg.consequence } : {}),
  };

  return [plan, apply];
}

const runtimeEnablePair = mutationPair({
  base: "wm_runtime_enable",
  title: "Enable Agent Runtime",
  what: "enabling Agent Runtime on one server",
  cli: "runtimeEnable",
  flags: { server: "serverId" },
  inputShape: { serverId: serverIdSchema },
  effect: (args) =>
    `Enable Agent Runtime on server ${String(args["serverId"])}. Changes server configuration only; no sandbox is created and supervisor installation is a separate action.`,
  preflight: async (ctx) => {
    const serverId = String(ctx.args["serverId"]);
    const server = await ctx.probe("serverGet", { server: serverId });
    const warnings = verificationWarnings("the server", server);
    if (server.error !== null || server.exitCode !== 0) {
      return {
        refuse: {
          status: "DENIED",
          summary: `server ${serverId} could not be read, so it cannot be enabled`,
          errors: warnings,
        },
      };
    }
    const runtime = await ctx.probe("runtimeGet", { server: serverId });
    const runtimeWarnings = verificationWarnings("the runtime", runtime);
    const current = runtimeState(runtime.payload);
    if (current === "ready") {
      warnings.push(
        "already_enabled: Agent Runtime already reports ready; enabling again is accepted but changes nothing",
      );
    }
    return {
      data: {
        serverId,
        serverStatus: stateOf(taskRecord(server.payload)),
        runtimeStatus: current,
      },
      warnings: [...warnings, ...runtimeWarnings],
    };
  },
  planSummary: ({ data }) => {
    const current = str(asRecord(data)?.["runtimeStatus"]);
    return current === null
      ? "plan: enable Agent Runtime"
      : `plan: enable Agent Runtime (currently ${current})`;
  },
  applySummary: () => "Agent Runtime enable submitted; acceptance does not prove the runtime is ready",
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    if (serverId === null) {
      return null;
    }
    // `runtime enable` returns the runtime record itself and no server-assigned
    // operation id, so the key is derived from the server. It is a real task in
    // every sense that matters - the runtime is not ready yet - and the registry
    // would be lying by omission if it dropped it for lack of an id.
    const observed = runtimeState(ctx.data);
    const id = pickId(ctx.data, ["operationId", "taskId"]) ?? localTaskId("runtime", serverId);
    return {
      taskId: id,
      kind: "runtime",
      label: `runtime enable on ${serverId}`,
      observeWith: "wm_runtime_get",
      serverId,
      ...(observed !== null ? { lastStatus: observed } : {}),
    };
  },
  verifyWith: "wm_runtime_get",
  verifyArgs: (args) => ({ serverId: args["serverId"] }),
});

const runtimeInstallPair = mutationPair({
  base: "wm_runtime_install",
  title: "Install the Agent Runtime supervisor",
  what: "installing the Agent Runtime supervisor on one server",
  cli: "runtimeInstall",
  flags: { server: "serverId", identity: "identity" },
  constants: () => ({ confirm: "INSTALL", "ssh-user": "root" }),
  inputShape: { serverId: serverIdSchema, identity: pathOnlySchema.optional() },
  effect: (args) =>
    `Install the Agent Runtime supervisor on server ${String(args["serverId"])}, authenticating as the owner account root. The CLI may perform one owner-key-authenticated SSH connection to pin the host key on first use; that trust-on-first-use step cannot detect an active attacker. Supervisor bootstrap content is never printed or stored.`,
  preflight: async (ctx) => {
    const serverId = String(ctx.args["serverId"]);
    const runtime = await ctx.probe("runtimeGet", { server: serverId });
    const warnings = verificationWarnings("the runtime", runtime);
    const current = runtimeState(runtime.payload);
    if (current !== null && ["degraded", "offline", "needs_reinstall"].includes(current)) {
      warnings.push(
        `runtime_unhealthy: Agent Runtime reports '${current}'. Installation may be refused by a documented safety gate; treat a refusal as a gate, not as something to force.`,
      );
    }
    if (current === "ready") {
      warnings.push("already_installed: the supervisor already reports ready");
    }
    if (ctx.args["identity"] !== undefined) {
      warnings.push(
        "identity_path_not_inspected: the path is passed through to the CLI and never opened by this server, so it was not verified to exist",
      );
    }
    return {
      data: {
        serverId,
        runtimeStatus: current,
        hostKeyTrust:
          "first use pins the observed Ed25519 host key; provider-console pre-enrollment is the stronger option",
      },
      warnings,
    };
  },
  planSummary: ({ data }) => {
    const current = str(asRecord(data)?.["runtimeStatus"]);
    return current === null
      ? "plan: install the Agent Runtime supervisor"
      : `plan: install the Agent Runtime supervisor (currently ${current})`;
  },
  applySummary: () =>
    "supervisor install submitted; the CLI reported acceptance, which is not proof the runtime is ready",
  planWarnings: () => [
    "install_may_wait: the CLI is invoked without --wait, so an accepted install is observed later with wm_runtime_get rather than awaited here",
  ],
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    if (serverId === null) {
      return null;
    }
    // Without `--wait` the CLI omits `runtime` from this payload entirely, so
    // there is usually no state to record here; the observation comes later from
    // wm_runtime_get. Reading it from the right place matters for the case where
    // a runtime record is present.
    const observed = runtimeState(ctx.data);
    const record: RegisterInput = {
      taskId: pickId(ctx.data, ["operationId"]) ?? localTaskId("runtime", serverId),
      kind: "runtime",
      label: `runtime install on ${serverId}`,
      observeWith: "wm_runtime_get",
      serverId,
    };
    if (observed !== null) {
      record.lastStatus = observed;
    }
    return record;
  },
  verifyWith: "wm_runtime_get",
  verifyArgs: (args) => ({ serverId: args["serverId"] }),
});

const sandboxCreatePair = mutationPair({
  base: "wm_sandbox_create",
  title: "Create a sandbox",
  what: "creating one Agent Runtime sandbox",
  cli: "sandboxCreate",
  flags: {
    server: "serverId",
    name: "name",
    size: "size",
    lifetime: "lifetime",
    "expires-in-seconds": "expiresInSeconds",
  },
  constants: (flags): Record<string, string> =>
    flags["lifetime"] === "temporary" ? { confirm: "TEMPORARY" } : {},
  inputShape: {
    serverId: serverIdSchema,
    name: dnsLabelSchema,
    size: sandboxSizeSchema,
    lifetime: z.literal("temporary").optional(),
    expiresInSeconds: expiresInSecondsSchema.optional(),
  },
  effect: (args, flags) => {
    const temporary = flags["lifetime"] === "temporary";
    const base = `Create a ${String(args["size"])} sandbox named ${String(args["name"])} on server ${String(args["serverId"])}.`;
    if (!temporary) {
      return `${base} Lifetime is persistent, so there is no automatic expiry and no automatic deletion.`;
    }
    const seconds = flags["expires-in-seconds"] ?? "86400";
    return `${base} Lifetime is temporary with a ${seconds}s budget starting when it first reaches running. At expiry the workspace is permanently deleted, active sessions are terminated and access is revoked. A temporary duration cannot be extended; only make_persistent before expiring removes the deadline, and that action is not available.`;
  },
  preflight: async (ctx) => {
    const serverId = String(ctx.args["serverId"]);
    const size = String(ctx.args["size"]);
    const lifetime = ctx.args["lifetime"];
    const expires = ctx.args["expiresInSeconds"];
    const warnings: string[] = [];

    // Rules between fields cannot live in the Zod schema: `.refine()` is not
    // representable in JSON Schema and would break the declared output schema.
    if (expires !== undefined && lifetime !== "temporary") {
      return {
        refuse: {
          status: "DENIED",
          summary: "expiresInSeconds is only meaningful with lifetime: temporary",
          errors: ["pass lifetime: temporary, or omit expiresInSeconds"],
        },
      };
    }

    // The CLI resolves the product from the server's own planId, so the plan
    // must do the same. Scanning every product would report a size as published
    // even when the server's plan is not the one publishing it.
    const server = await ctx.probe("serverGet", { server: serverId });
    warnings.push(...verificationWarnings("the server", server));
    if (server.error !== null || server.exitCode !== 0) {
      return {
        refuse: {
          status: "DENIED",
          summary: `server ${serverId} could not be read, so its plan and OS are unknown`,
          errors: [
            ...verificationWarnings("the server", server),
            "check the server with wm_server_get before planning again",
          ],
        },
      };
    }
    const serverRecord_ = taskRecord(server.payload);
    const planId = str(serverRecord_?.["planId"]);
    const osName = str(serverRecord_?.["osName"]);

    const catalog = await ctx.probe("catalog");
    warnings.push(...verificationWarnings("the catalog", catalog));
    const catalogRecord = asRecord(catalog.payload);
    const products = Array.isArray(catalogRecord?.["products"])
      ? (catalogRecord["products"] as unknown[])
      : [];
    const product =
      planId === null
        ? null
        : (products.map((entry) => asRecord(entry)).find((entry) => str(entry?.["id"]) === planId) ??
          null);

    if (planId === null) {
      return {
        refuse: {
          status: "DENIED",
          summary: `server ${serverId} did not report its plan, so the catalog could not be matched to it`,
          errors: [
            "the plan cannot verify that this server's plan publishes the requested size without the server's planId",
            "re-read the server with wm_server_get and try again",
          ],
        },
      };
    }
    if (product === null) {
      return {
        refuse: {
          status: "DENIED",
          summary: `the live catalog does not publish plan '${planId}', which is the plan this server is on`,
          errors: ["re-run wm_catalog and compare it with wm_server_get before planning again"],
        },
      };
    }

    const productRuntime = asRecord(product?.["agentRuntime"]);
    const runtimeSupported =
      productRuntime !== null && bool(productRuntime["supported"]) === true;
    if (!runtimeSupported) {
      return {
        refuse: {
          status: "DENIED",
          summary: `the plan ${planId} does not support Agent Runtime, so no sandbox can be created on this server`,
          errors: ["the live catalog reports agentRuntime.supported false for this server's plan"],
        },
      };
    }

    // The CLI requires both the product-level flag and the per-OS flag, so a
    // plan that checked only the first would authorise a command the CLI then
    // refuses with exit 2.
    const osSupported = osSupportsRuntime(product, osName);
    if (osSupported !== true) {
      return {
        refuse: {
          status: "DENIED",
          summary:
            osSupported === false
              ? `operating system '${String(osName)}' does not support Agent Runtime on this plan`
              : `the catalog does not report Agent Runtime support for operating system '${osName ?? "unknown"}' on this plan`,
          errors: [
            "the live catalog must report operatingSystems[].agentRuntimeSupported true for this server's OS",
          ],
        },
      };
    }

    const sizes = Array.isArray(productRuntime["sizes"]) ? (productRuntime["sizes"] as unknown[]) : [];
    const sizeRecord = sizes.map((entry) => asRecord(entry)).find((entry) => str(entry?.["id"]) === size) ?? null;
    if (sizeRecord === null) {
      return {
        refuse: {
          status: "DENIED",
          summary: `size '${size}' is not published by the live catalog for this server's plan`,
          errors: [
            `the live catalog does not publish '${size}' in agentRuntime.sizes for plan '${String(planId)}'; re-run wm_catalog and pick a published size`,
          ],
        },
      };
    }

    // Capacity is checkable, and the CLI checks it exactly this way, so
    // declining to check it would be less honest than checking it and saying
    // what the check cannot see.
    const capacity = checkCapacity(productRuntime, [sizeRecord]);
    if (capacity.checked && capacity.exceeds !== null) {
      return {
        refuse: {
          status: "DENIED",
          summary: `the requested sandbox exceeds the published Agent Runtime capacity for '${capacity.exceeds}'`,
          errors: [
            `requested ${String(capacity.requested[capacity.exceeds] ?? 0)} of '${capacity.exceeds}' against a published capacity of ${String(capacity.capacity[capacity.exceeds] ?? 0)}; the API would refuse this with a conflict`,
          ],
        },
      };
    }
    if (capacity.checked) {
      warnings.push(`capacity_within_plan: ${capacity.note}`);
    } else {
      warnings.push(
        "capacity_not_checked: the catalog did not publish the fields needed to compare this size against agentRuntime.capacity, so capacity was not verified",
      );
    }

    const runtime = await ctx.probe("runtimeGet", { server: serverId });
    if (runtime.error !== null || runtime.exitCode !== 0) {
      // A plan must not mint a token for a server whose runtime it could not
      // read. "Discover before acting" is code here, not advice.
      return {
        refuse: {
          status: "DENIED",
          summary: `Agent Runtime on server ${serverId} could not be read, so a sandbox cannot be created on it`,
          errors: [
            ...verificationWarnings("the runtime", runtime),
            "check the server with wm_server_get and the runtime with wm_runtime_get before planning again",
          ],
        },
      };
    }
    const runtimeStatus = runtimeState(runtime.payload);
    if (runtimeStatus !== "ready") {
      return {
        refuse: {
          status: "DENIED",
          summary: `Agent Runtime on server ${serverId} reports '${runtimeStatus ?? "an unrecognised state"}', so it cannot accept a sandbox`,
          errors: [
            `the live runtime must report ready before a sandbox can be created; the catalog check passed, but admission is re-checked by the API`,
            "enable or install Agent Runtime first, then plan again",
          ],
        },
      };
    }

    const list = await ctx.probe("sandboxList", { server: serverId });
    warnings.push(...verificationWarnings("the sandbox list", list));
    const existing = sandboxList(list.payload);
    const name = String(ctx.args["name"]);
    if (existing.some((entry) => str(asRecord(entry)?.["name"]) === name)) {
      warnings.push(
        `sandbox_name_in_use: a sandbox named '${name}' already exists on this server; the server will reject the create unless that one is removed`,
      );
    }

    return {
      data: {
        serverId,
        name,
        size,
        lifetime: lifetime === "temporary" ? "temporary" : "persistent",
        planId,
        osName,
        runtimeStatus,
        sizePublished: true,
        verification: {
          planCheckedAgainst: "live server planId",
          sizeCheckedAgainst: "live catalog agentRuntime.sizes",
          osCheckedAgainst: "live catalog operatingSystems[].agentRuntimeSupported",
          nameCheckedAgainst: "live sandbox list",
          capacityChecked: capacity.checked,
          capacityNote: capacity.note,
        },
      },
      warnings,
    };
  },
  planSummary: ({ data }) => {
    const record = asRecord(data);
    const size = str(record?.["size"]) ?? "?";
    const name = str(record?.["name"]) ?? "?";
    const lifetime = str(record?.["lifetime"]) ?? "?";
    return `plan: create ${size} ${lifetime} sandbox '${name}' (size and name verified against live data)`;
  },
  applySummary: () =>
    "sandbox create submitted; the sandbox is not usable until a grant is applied and the sandbox reports running",
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    const name = str(ctx.args["name"]);
    // `sandbox create` emits `{ runtime, sandboxes: [ { id, name, observedState } ] }`.
    // The id is the one thing the registry cannot derive later by name, so it is
    // read from the item the CLI returned rather than guessed from the plan.
    const created = asRecord(sandboxList(ctx.data)[0]);
    const sandboxId = sandboxIdOf(created);
    if (sandboxId === null) {
      // The response omitted the id. Do not invent one: the caller is told to
      // list, and the registry stays honest.
      return null;
    }
    return {
      taskId: sandboxId,
      kind: "sandbox",
      label: `sandbox ${name ?? sandboxId}`,
      observeWith: "wm_sandbox_get",
      serverId: serverId ?? "",
      sandboxId,
      ...(name !== null ? { sandboxName: name } : {}),
      ...(stateOf(created) !== null ? { lastStatus: stateOf(created) as string } : {}),
    };
  },
  verifyWith: "wm_sandbox_list",
  verifyArgs: (args) => ({ serverId: args["serverId"] }),
});

const sandboxActionPair = mutationPair({
  base: "wm_sandbox_action",
  title: "Change sandbox power state",
  what: "starting, stopping or restarting one sandbox",
  cli: "sandboxAction",
  flags: { server: "serverId", sandbox: "sandboxId", action: "action" },
  // The CLI requires the confirmation to echo the action exactly. Deriving it
  // from the same resolved flag is what keeps a `restart` token from being
  // usable as a `stop`.
  constants: (flags) => ({ confirm: flags["action"] ?? "" }),
  inputShape: {
    serverId: serverIdSchema,
    sandboxId: sandboxIdSchema,
    action: sandboxActionSchema,
  },
  effect: (args, flags) => {
    const action = String(flags["action"]);
    const consequence: Record<string, string> = {
      start: "The sandbox resumes consuming its published size; the lifetime clock keeps running.",
      stop: "The sandbox stops. It is not deleted and its workspace is preserved.",
      restart: "The sandbox restarts. Active sessions are terminated; the workspace and lifetime are preserved.",
    };
    return `${action[0]?.toUpperCase() ?? ""}${action.slice(1)} sandbox ${String(args["sandboxId"])} on server ${String(args["serverId"])}. ${consequence[action] ?? ""}`;
  },
  preflight: async (ctx) => {
    const serverId = String(ctx.args["serverId"]);
    const sandboxId = String(ctx.args["sandboxId"]);
    const check = await checkSandbox(ctx, serverId, sandboxId);
    if (check.refuse !== undefined) {
      return check;
    }
    const action = String(ctx.args["action"]);
    const warnings = [...(check.warnings ?? [])];
    const seen = asRecord(check.data);
    const observed = str(seen?.["observedState"]);
    if (action === "start" && observed === "running") {
      warnings.push("no_op_likely: the sandbox already reports running");
    }
    if (action === "stop" && observed === "stopped") {
      warnings.push("no_op_likely: the sandbox already reports stopped");
    }
    return { data: { ...(seen ?? {}), action }, warnings };
  },
  planSummary: ({ data }) => {
    const record = asRecord(data);
    return `plan: ${String(record?.["action"] ?? "?")} sandbox ${String(record?.["sandboxId"] ?? "?")} (currently ${String(record?.["observedState"] ?? "unknown")})`;
  },
  applySummary: () =>
    "sandbox action submitted; acceptance means the action was accepted, not that the sandbox reached the requested state",
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    const sandboxId = str(ctx.args["sandboxId"]);
    if (serverId === null || sandboxId === null) {
      return null;
    }
    // `sandbox action` returns the sandbox record, not an operation id.
    const observed = stateOf(sandboxRecord(ctx.data));
    return {
      taskId: pickId(ctx.data, ["operationId"]) ?? localTaskId("sandbox", sandboxId),
      kind: "sandbox",
      label: `sandbox ${sandboxId} ${str(ctx.args["action"]) ?? "action"}`,
      observeWith: "wm_sandbox_get",
      serverId,
      sandboxId,
      ...(observed !== null ? { lastStatus: observed } : {}),
    };
  },
  verifyWith: "wm_sandbox_get",
  verifyArgs: (args) => ({ serverId: args["serverId"], sandboxId: args["sandboxId"] }),
});

const accessKeygenPair = mutationPair({
  base: "wm_sandbox_access_keygen",
  title: "Generate an agent sandbox keypair",
  what: "generating a dedicated Ed25519 keypair for one agent sandbox",
  cli: "sandboxAccessKeygen",
  flags: { output: "output" },
  constants: () => ({ confirm: "GENERATE" }),
  inputShape: { output: pathOnlySchema },
  effect: (args) =>
    `Generate an Ed25519 keypair at ${String(args["output"])}. The private half is written by the CLI and is never read, printed or returned by this server; only its path is passed to later commands. Existing files are never overwritten, so a collision adds a suffix. Best practice is one keypair per sandbox, never reused and never the owner management key.`,
  preflight: async () => ({
    warnings: [
      "output_path_not_inspected: this server never touches the filesystem, so the path was validated for shape only and not for existence or permissions",
    ],
    data: { outputShapeValidated: true, filesystemChecked: false },
  }),
  planSummary: () => "plan: generate a dedicated sandbox keypair (path validated for shape only)",
  applySummary: () =>
    "keypair generation submitted; the private key path was never read by this server",
});

const accessGrantPair = mutationPair({
  base: "wm_sandbox_access_grant",
  title: "Grant sandbox access",
  what: "granting one agent SSH access to one sandbox",
  cli: "sandboxAccessGrant",
  flags: {
    server: "serverId",
    sandbox: "sandboxId",
    name: "name",
    "ssh-public-key-file": "sshPublicKeyFile",
  },
  inputShape: {
    serverId: serverIdSchema,
    sandboxId: sandboxIdSchema,
    name: dnsLabelSchema,
    sshPublicKeyFile: pathOnlySchema,
  },
  effect: (args) =>
    `Grant SSH access named ${String(args["name"])} to sandbox ${String(args["sandboxId"])} on server ${String(args["serverId"])}, using the public key at ${String(args["sshPublicKeyFile"])}. Only the public key is sent to WarpMetal. The grant starts as pending and must reach applied before it is usable; this server does not materialise a connection profile.`,
  preflight: async (ctx) => {
    const serverId = String(ctx.args["serverId"]);
    const sandboxId = String(ctx.args["sandboxId"]);
    const check = await checkSandbox(ctx, serverId, sandboxId);
    if (check.refuse !== undefined) {
      return check;
    }
    const warnings = [...(check.warnings ?? [])];
    const name = String(ctx.args["name"]);
    const list = await ctx.probe("sandboxAccessList", { server: serverId, sandbox: sandboxId });
    warnings.push(...verificationWarnings("the grant list", list));
    const grants = grantList(list.payload);
    if (grants.some((entry) => str(asRecord(entry)?.["name"]) === name)) {
      warnings.push(`grant_name_in_use: a grant named '${name}' already exists on this sandbox`);
    }
    warnings.push(
      "connection_profile_not_created: the CLI requires --wait when a connection file is requested, and this server never passes --wait. The grant is created and observed, but the connection profile must be materialised by a separate step.",
    );
    return {
      data: { ...asRecord(check.data), name, grantsSeen: grants.length },
      warnings,
    };
  },
  planSummary: ({ data }) => {
    const record = asRecord(data);
    return `plan: grant '${String(record?.["name"] ?? "?")}' access to sandbox ${String(record?.["sandboxId"] ?? "?")}`;
  },
  applySummary: () =>
    "access grant submitted; the grant is not usable until it reports applied, which this server observes rather than waits for",
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    const sandboxId = str(ctx.args["sandboxId"]);
    // `access grant` wraps the record in `accessGrant`, and the id key is `id`.
    const record = grantRecord(ctx.data);
    const grantId = grantIdOf(record);
    if (serverId === null || sandboxId === null || grantId === null) {
      return null;
    }
    const observed = stateOf(record);
    return {
      taskId: grantId,
      kind: "grant",
      label: `grant ${str(ctx.args["name"]) ?? grantId}`,
      observeWith: "wm_sandbox_access_get",
      serverId,
      sandboxId,
      ...(observed !== null ? { lastStatus: observed } : {}),
    };
  },
  verifyWith: "wm_sandbox_access_get",
  verifyArgs: (args) => ({
    serverId: args["serverId"],
    sandboxId: args["sandboxId"],
    grantId: "<grantId from the apply result>",
  }),
});

/**
 * The six non-destructive mutations. Kept in one array so the test that proves
 * no destructive verb is reachable from this group has a single thing to walk.
 */
export const mutationTools: readonly WmToolSpec[] = [
  ...runtimeEnablePair,
  ...runtimeInstallPair,
  ...sandboxCreatePair,
  ...sandboxActionPair,
  ...accessKeygenPair,
  ...accessGrantPair,
];
