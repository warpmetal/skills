/**
 * destructive.ts - the irreversible verbs, and the read tool that remembers them.
 *
 * These commands have no structural protection: they are in the registry, so a
 * tool can name them. What stands in for that missing guarantee is three things:
 *
 *   1. A consequence the caller has to name. The token proves the effect was
 *      approved; `acknowledgedConsequence` proves the damage was stated. A model
 *      cannot arrive at that word by copying its own arguments, which is what
 *      makes the gate more than ceremony.
 *   2. A re-check against live data in the apply, not only in the plan. A token
 *      lives ten minutes, and a sandbox can be deleted by someone else inside
 *      that window.
 *   3. The latch. An id this server has seen reach `manual_review` is refused
 *      for any mutation, forever within the state window, across restarts.
 *
 * What every pair here shares, and why it is declared rather than written twice:
 * the argv the plan hashes is built from the same declaration the apply uses, so
 * the two cannot drift.
 *
 * Two mechanisms are deliberately NOT used here, because argv must stay a pure
 * function of the arguments. A token binds a digest of the argv, so a flag whose
 * presence depends on live service state would make the plan and the apply hash
 * different command lines the moment that state changed - the hash would be
 * correct and the approval would be unusable. Live state therefore shows up in
 * two places only: as a refusal, or as a warning. `--acknowledge-agent-runtime-reset`
 * is sent unconditionally for that reason, and the plan says so in its effect.
 */
import { z } from "zod";

import { DENIED_EXIT_CODE, makeResult } from "../result.js";
import {
  grantIdSchema,
  lifecycleActionSchema,
  pathOnlySchema,
  powerActionSchema,
  sandboxIdSchema,
  serverIdSchema,
} from "../schemas.js";
import {
  grantIdOf,
  grantRecord,
  operationRecord,
  runtimeRecord,
  runtimeState,
  sandboxRecord,
  stateOf,
  taskRecord,
} from "../shapes.js";
import type { RegisterInput } from "../tasks.js";
import { mutationPair, pickId, verificationWarnings } from "./mutate.js";
import { asRecord, str, type PreflightContext, type PreflightOutcome, type WmToolSpec } from "./spec.js";

const READ_ONLY_LOCAL: WmToolSpec["annotations"] = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/**
 * Attaches the freshly observed state to a task record, so `wm_task_list` shows
 * where the task stood the moment this server last saw it. Absent state stays
 * absent rather than becoming an empty string.
 */
function withStatus(base: RegisterInput, status: string | null): RegisterInput {
  return status === null ? base : { ...base, lastStatus: status };
}

/**
 * Refuses a plan whose target cannot be read, and returns the observed state.
 *
 * The asymmetry here is intentional and worth stating once: a check that finds a
 * problem with certainty refuses, but a check that cannot determine something
 * warns instead. A false refusal blocks a human's already-approved action, while
 * a missed refusal costs one redundant call that the API re-checks anyway. This
 * module prefers the recoverable mistake.
 */
async function readSandboxState(
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
        summary: `sandbox ${sandboxId} could not be read, so its state is unknown and it cannot be changed`,
        errors: warnings,
      },
    };
  }
  return { data: { serverId, sandboxId, ...sandboxFacts(probe.payload) }, warnings };
}

/** The state, lifetime and name of a sandbox, read from wherever the CLI put them. */
function sandboxFacts(payload: unknown): Record<string, unknown> {
  const record = sandboxRecord(payload);
  return {
    observedState: stateOf(record),
    name: str(record?.["name"]),
    lifetime: str(record?.["lifetime"]),
    expiresAt: str(record?.["expiresAt"]),
  };
}

// --- server power ---------------------------------------------------------

const serverPowerPair = mutationPair({
  base: "wm_server_power",
  title: "Power a server on, off or round",
  what: "booting, rebooting or shutting down one server",
  cli: "serverPower",
  flags: { server: "serverId", action: "action" },
  // The CLI requires the confirmation to echo the action exactly. Deriving it
  // from the resolved flag is what keeps a `shutdown` token from being usable
  // as a `boot` - and the reverse, which is the one that costs data.
  constants: (flags) => ({ confirm: flags["action"] ?? "" }),
  inputShape: { serverId: serverIdSchema, action: powerActionSchema },
  consequence: (args) => {
    // `boot` is the one action here that cannot destroy anything: there is no
    // running state to lose, and the disk is untouched. Demanding an
    // acknowledgement for it would train the caller to ignore the field.
    const action = str(args["action"]);
    return action === "boot" ? null : "availability";
  },
  warning: "A reboot or shutdown interrupts every process on the server, including the Agent Runtime supervisor.",
  effect: (args, flags) => {
    const serverId = String(args["serverId"]);
    const action = String(flags["action"]);
    if (action === "boot") {
      return `Boot server ${serverId}. Nothing is destroyed: booting applies to a server that is not running, and its disk contents are preserved. It becomes reachable again once it finishes starting.`;
    }
    if (action === "reboot") {
      return `Reboot server ${serverId}. Every process stops immediately, open sessions are terminated, and anything not already written to disk is lost. The server is unreachable until it finishes booting. Agent Runtime restarts, and sandbox processes are restarted by the supervisor.`;
    }
    if (action === "shutdown") {
      return `Shut down server ${serverId}. Every process stops immediately, open sessions are terminated, and anything not already written to disk is lost. The server stays powered off until something boots it; nothing here will.`;
    }
    return `Run server power action '${action}' on server ${serverId}.`;
  },
  preflight: async (ctx) => {
    const serverId = String(ctx.args["serverId"]);
    const probe = await ctx.probe("serverGet", { server: serverId });
    const warnings = verificationWarnings("the server", probe);
    if (probe.error !== null || probe.exitCode !== 0) {
      return {
        refuse: {
          status: "DENIED",
          summary: `server ${serverId} could not be read, so its current power state is unknown`,
          errors: warnings,
        },
      };
    }
    const state = stateOf(taskRecord(probe.payload));
    const action = String(ctx.args["action"]);
    // Refused only on an exact match. Guessing at a synonym for "running" would
    // let a wrong vocabulary block a legitimate boot, which is the worse error.
    const noOp: Record<string, string> = { boot: "running", shutdown: "stopped" };
    if (noOp[action] !== undefined && state === noOp[action]) {
      return {
        refuse: {
          status: "DENIED",
          summary: `server ${serverId} already reports '${state}', so '${action}' would change nothing`,
          errors: [
            `the observed state already matches the requested action; a token for a no-op spends an approval on nothing`,
            "if the state is stale, read the server again before planning",
          ],
        },
      };
    }
    return { data: { serverId, action, observedState: state }, warnings };
  },
  planSummary: ({ data }) => {
    const record = asRecord(data);
    return `plan: ${String(record?.["action"] ?? "?")} server ${String(record?.["serverId"] ?? "?")} (currently ${String(record?.["observedState"] ?? "unknown")})`;
  },
  applySummary: ({ args }) =>
    `server ${String(args["serverId"])} power action accepted; the server has not necessarily reached the requested state yet`,
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    const operationId = pickId(ctx.data, ["operationId", "id"]);
    if (serverId === null || operationId === null) {
      // No operation id came back. The caller is told to verify, and the
      // registry stays honest instead of carrying a key it invented.
      return null;
    }
    return withStatus(
      {
        taskId: operationId,
        kind: "operation",
        label: `server power ${String(ctx.args["action"])} on ${serverId}`,
        observeWith: "wm_operation_get",
        serverId,
      },
      stateOf(operationRecord(ctx.data)),
    );
  },
  verifyWith: "wm_server_get",
  verifyArgs: (args) => ({ serverId: args["serverId"] }),
});

// --- server reload --------------------------------------------------------

const serverReloadPair = mutationPair({
  base: "wm_server_reload",
  title: "Erase and reinstall a server",
  what: "erasing a server's operating system and reinstalling it",
  cli: "serverReload",
  flags: { server: "serverId" },
  // `--acknowledge-agent-runtime-reset` is a constant rather than a live-state
  // derivation on purpose; see the module header. It is safe to send when Agent
  // Runtime is absent, because an acknowledgement of a reset that will not
  // happen is vacuous rather than contradictory.
  constants: () => ({
    confirm: "ERASE",
    "power-off-first": true,
    "acknowledge-agent-runtime-reset": true,
  }),
  inputShape: { serverId: serverIdSchema },
  consequence: () => "server_erasure",
  destructive: true,
  warning: "This destroys the server's disk. There is no snapshot and no undo.",
  effect: (args) => {
    const serverId = String(args["serverId"]);
    return `Reload server ${serverId}, erasing and reinstalling its operating system. This permanently destroys the entire server disk: every file outside WarpMetal's sandbox workspaces, every installed package, and every local configuration. Agent Runtime's supervisor identity is revoked, so every sandbox workspace is recreated empty and every previously issued connection profile stops working until it is refreshed. The server's host key changes. Nothing about the previous installation is recoverable, and no snapshot is taken.`;
  },
  preflight: async (ctx) => {
    const serverId = String(ctx.args["serverId"]);
    const server = await ctx.probe("serverGet", { server: serverId });
    const warnings = verificationWarnings("the server", server);
    if (server.error !== null || server.exitCode !== 0) {
      return {
        refuse: {
          status: "DENIED",
          summary: `server ${serverId} could not be read, so it cannot be reloaded`,
          errors: warnings,
        },
      };
    }

    // Determined, not assumed. A reload erases sandbox workspaces and revokes
    // supervisor identity, and a human cannot consent to that without knowing
    // whether there were any. An unreadable runtime is the one thing this plan
    // refuses, because it is the difference between "you will lose the
    // workspaces listed here" and "you may lose workspaces I could not see".
    const runtime = await ctx.probe("runtimeGet", { server: serverId });
    const runtimeWarnings = verificationWarnings("the runtime", runtime);
    if (runtime.error !== null || runtime.exitCode !== 0) {
      return {
        refuse: {
          status: "DENIED",
          summary: `Agent Runtime on server ${serverId} could not be read, so the workspaces this reload would erase are unknown`,
          errors: [
            ...runtimeWarnings,
            "the reload refuses rather than erasing workspaces it could not enumerate; read the runtime and plan again",
          ],
        },
      };
    }

    const runtimePresent = runtimeRecord(runtime.payload) !== null;
    const runtimeObserved = runtimeState(runtime.payload);
    if (runtimePresent) {
      warnings.push(
        `runtime_reset_confirmed: Agent Runtime is present (${runtimeObserved ?? "unknown state"}). Its supervisor identity is revoked by this reload, so every sandbox workspace is recreated empty and every connection profile becomes stale.`,
      );
    } else {
      warnings.push(
        "runtime_absent: no Agent Runtime record was returned, so no sandbox workspaces are expected to be lost; the erase flag is still sent, which is vacuous in that case",
      );
    }

    return {
      data: {
        serverId,
        observedState: stateOf(taskRecord(server.payload)),
        runtimePresent,
        runtimeState: runtimeObserved,
        eraseAcknowledged: true,
      },
      warnings,
    };
  },
  planSummary: ({ data }) => {
    const record = asRecord(data);
    const runtime = record?.["runtimePresent"] === true ? "runtime present" : "no runtime";
    return `plan: ERASE server ${String(record?.["serverId"] ?? "?")} (${runtime}, currently ${String(record?.["observedState"] ?? "unknown")})`;
  },
  applySummary: () =>
    "reload accepted; the server is re-provisioning, and the runtime is not ready again until it reports so",
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    const operationId = pickId(ctx.data, ["operationId", "id"]);
    if (serverId === null || operationId === null) {
      return null;
    }
    return withStatus(
      {
        taskId: operationId,
        kind: "operation",
        label: `server reload on ${serverId}`,
        observeWith: "wm_operation_get",
        serverId,
      },
      stateOf(operationRecord(ctx.data)),
    );
  },
  verifyWith: "wm_runtime_get",
  verifyArgs: (args) => ({ serverId: args["serverId"] }),
});

// --- sandbox delete -------------------------------------------------------

const sandboxDeletePair = mutationPair({
  base: "wm_sandbox_delete",
  title: "Delete a sandbox",
  what: "deleting one sandbox and its workspace",
  cli: "sandboxDelete",
  flags: { server: "serverId", sandbox: "sandboxId" },
  constants: () => ({ confirm: "DELETE" }),
  inputShape: { serverId: serverIdSchema, sandboxId: sandboxIdSchema },
  consequence: () => "workspace_deletion",
  destructive: true,
  warning: "The workspace is not recoverable and WarpMetal takes no snapshot of it.",
  effect: (args) => {
    const sandboxId = String(args["sandboxId"]);
    const serverId = String(args["serverId"]);
    return `Delete sandbox ${sandboxId} on server ${serverId}. The container is removed and its entire workspace is permanently destroyed: every file, dependency and uncommitted change in it is gone, with no snapshot and no restore path. Active sessions into it are terminated and any pinned connection profile for it stops working. Files that were copied out beforehand are unaffected.`;
  },
  preflight: async (ctx) => {
    const check = await readSandboxState(
      ctx,
      String(ctx.args["serverId"]),
      String(ctx.args["sandboxId"]),
    );
    if (check.refuse !== undefined) {
      return check;
    }
    const facts = asRecord(check.data);
    const warnings = [...(check.warnings ?? [])];
    if (facts?.["observedState"] === "deleted") {
      return {
        refuse: {
          status: "DENIED",
          summary: `sandbox ${String(ctx.args["sandboxId"])} already reports deleted, so there is nothing to delete`,
          errors: ["a token spent on an already-deleted sandbox authorises no change"],
        },
      };
    }
    if (facts?.["lifetime"] === "temporary" && facts?.["expiresAt"] === null) {
      warnings.push(
        "temporary_before_clock: the sandbox is temporary but has no expiry yet, so a delete changes when its workspace disappears but not whether it does",
      );
    }
    return { data: facts, warnings };
  },
  planSummary: ({ data }) => {
    const record = asRecord(data);
    const name = str(record?.["name"]);
    return `plan: delete sandbox ${name ?? String(record?.["sandboxId"] ?? "?")} (currently ${String(record?.["observedState"] ?? "unknown")})`;
  },
  applySummary: ({ args }) =>
    `sandbox ${String(args["sandboxId"])} delete accepted; deletion is irreversible and is not undone by re-creating a sandbox with the same name`,
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    const sandboxId = str(ctx.args["sandboxId"]);
    if (serverId === null || sandboxId === null) {
      return null;
    }
    return withStatus(
      {
        taskId: sandboxId,
        kind: "sandbox",
        label: `sandbox delete ${sandboxId}`,
        observeWith: "wm_sandbox_get",
        serverId,
        sandboxId,
      },
      stateOf(sandboxRecord(ctx.data)),
    );
  },
  verifyWith: "wm_sandbox_get",
  verifyArgs: (args) => ({ serverId: args["serverId"], sandboxId: args["sandboxId"] }),
});

// --- sandbox lifecycle (make_persistent / refresh_image) ------------------

const sandboxLifecyclePair = mutationPair({
  base: "wm_sandbox_lifecycle",
  title: "Make a sandbox permanent or replace its image",
  what: "making a sandbox permanent or replacing its container image",
  cli: "sandboxAction",
  flags: { server: "serverId", sandbox: "sandboxId", action: "action" },
  constants: (flags) => ({ confirm: flags["action"] ?? "" }),
  inputShape: {
    serverId: serverIdSchema,
    sandboxId: sandboxIdSchema,
    action: lifecycleActionSchema,
  },
  // The two actions are opposite mistakes - one removes a guarantee against
  // loss, the other removes content - so they get different classes rather than
  // a shared "sandbox change".
  consequence: (args) => {
    const action = str(args["action"]);
    if (action === "make_persistent") {
      return "expiry_protection_removed";
    }
    if (action === "refresh_image") {
      return "container_filesystem";
    }
    return null;
  },
  destructive: true,
  warning: "refresh_image replaces the container filesystem; make_persistent removes the expiry that would have cleaned it up.",
  effect: (args, flags) => {
    const sandboxId = String(args["sandboxId"]);
    const serverId = String(args["serverId"]);
    const action = String(flags["action"]);
    if (action === "make_persistent") {
      return `Make sandbox ${sandboxId} on server ${serverId} permanent. Its automatic expiry is removed, so it will never be cleaned up on its own and will keep consuming capacity on that server until it is deleted explicitly. This is the only thing standing between an abandoned sandbox and its automatic deletion: from now on a sandbox left behind is a sandbox nobody removes. No data is deleted by this action.`;
    }
    if (action === "refresh_image") {
      return `Replace the container filesystem of sandbox ${sandboxId} on server ${serverId} with the current production image. The external workspace survives, so files written there are preserved, but everything inside the container - installed packages, tools, and their configuration - is replaced by the image contents and any change made only there is lost. The sandbox restarts, so active sessions are terminated and it is briefly unavailable. Only the container filesystem is replaced; the workspace is not.`;
    }
    return `Run sandbox lifecycle action '${action}' on sandbox ${sandboxId} of server ${serverId}.`;
  },
  preflight: async (ctx) => {
    const serverId = String(ctx.args["serverId"]);
    const sandboxId = String(ctx.args["sandboxId"]);
    const check = await readSandboxState(ctx, serverId, sandboxId);
    if (check.refuse !== undefined) {
      return check;
    }
    const facts = asRecord(check.data) ?? {};
    const warnings = [...(check.warnings ?? [])];
    const action = String(ctx.args["action"]);
    const lifetime = str(facts["lifetime"]);

    if (action === "make_persistent" && lifetime === "persistent") {
      return {
        refuse: {
          status: "DENIED",
          summary: `sandbox ${sandboxId} already reports persistent, so it has no expiry to remove`,
          errors: [
            "the listed action would change nothing; only a temporary sandbox has expiry protection to remove",
          ],
        },
      };
    }
    if (action === "make_persistent" && lifetime === null) {
      warnings.push(
        "lifetime_unknown: the sandbox did not report a lifetime, so whether it was temporary is unconfirmed. The action is still available; if it was already persistent, nothing changes.",
      );
    }
    if (action === "refresh_image" && facts["observedState"] !== "running") {
      warnings.push(
        `refresh_when_not_running: the sandbox reports '${String(facts["observedState"] ?? "unknown")}', and an image replacement normally applies to a running sandbox; the server may refuse`,
      );
    }
    return { data: { ...facts, action }, warnings };
  },
  planSummary: ({ data }) => {
    const record = asRecord(data);
    return `plan: ${String(record?.["action"] ?? "?")} sandbox ${String(record?.["sandboxId"] ?? "?")} (currently ${String(record?.["observedState"] ?? "unknown")})`;
  },
  applySummary: ({ args }) =>
    `${String(args["action"])} accepted for sandbox ${String(args["sandboxId"])}; confirm the sandbox's observed state before reporting it as done`,
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    const sandboxId = str(ctx.args["sandboxId"]);
    if (serverId === null || sandboxId === null) {
      return null;
    }
    return withStatus(
      {
        taskId: sandboxId,
        kind: "sandbox",
        label: `sandbox ${String(ctx.args["action"])} on ${sandboxId}`,
        observeWith: "wm_sandbox_get",
        serverId,
        sandboxId,
      },
      stateOf(sandboxRecord(ctx.data)),
    );
  },
  verifyWith: "wm_sandbox_get",
  verifyArgs: (args) => ({ serverId: args["serverId"], sandboxId: args["sandboxId"] }),
});

// --- sandbox access revoke ------------------------------------------------

const accessRevokePair = mutationPair({
  base: "wm_sandbox_access_revoke",
  title: "Revoke a sandbox access grant",
  what: "revoking one access grant on a sandbox",
  cli: "sandboxAccessRevoke",
  flags: { server: "serverId", sandbox: "sandboxId", grant: "grantId" },
  constants: () => ({ confirm: "REVOKE" }),
  inputShape: {
    serverId: serverIdSchema,
    sandboxId: sandboxIdSchema,
    grantId: grantIdSchema,
  },
  consequence: () => "access_revocation",
  destructive: true,
  warning: "The grant cannot be un-revoked; access is restored by issuing a new grant, which means a new key.",
  effect: (args) => {
    const grantId = String(args["grantId"]);
    const sandboxId = String(args["sandboxId"]);
    return `Revoke access grant ${grantId} on sandbox ${sandboxId}. The grant becomes unusable: new connections with its key are refused, and sessions the API can still track are terminated. The sandbox itself, its workspace and its running processes are untouched. The private key on the agent's side is not deleted - it simply stops working, and restoring access requires a new grant and therefore a new key.`;
  },
  preflight: async (ctx) => {
    const serverId = String(ctx.args["serverId"]);
    const sandboxId = String(ctx.args["sandboxId"]);
    const grantId = String(ctx.args["grantId"]);
    const probe = await ctx.probe("sandboxAccessGet", {
      server: serverId,
      sandbox: sandboxId,
      grant: grantId,
    });
    const warnings = verificationWarnings("the access grant", probe);
    if (probe.error !== null || probe.exitCode !== 0) {
      return {
        refuse: {
          status: "DENIED",
          summary: `access grant ${grantId} could not be read, so it cannot be revoked`,
          errors: warnings,
        },
      };
    }
    const record = grantRecord(probe.payload);
    const state = stateOf(record);
    if (state === "revoked") {
      return {
        refuse: {
          status: "DENIED",
          summary: `access grant ${grantId} is already revoked`,
          errors: ["a token spent on an already-revoked grant authorises no change"],
        },
      };
    }
    return {
      data: { serverId, sandboxId, grantId, grantIdObserved: grantIdOf(record), observedState: state },
      warnings,
    };
  },
  planSummary: ({ data }) => {
    const record = asRecord(data);
    return `plan: revoke access grant ${String(record?.["grantId"] ?? "?")} (currently ${String(record?.["observedState"] ?? "unknown")})`;
  },
  applySummary: ({ args }) =>
    `access grant ${String(args["grantId"])} revocation accepted; a grant that is not observed as revoked is not yet unusable`,
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    const sandboxId = str(ctx.args["sandboxId"]);
    const grantId = str(ctx.args["grantId"]);
    if (serverId === null || sandboxId === null || grantId === null) {
      return null;
    }
    return withStatus(
      {
        taskId: grantId,
        kind: "grant",
        label: `revoke grant ${grantId}`,
        observeWith: "wm_sandbox_access_get",
        serverId,
        sandboxId,
      },
      stateOf(grantRecord(ctx.data)),
    );
  },
  verifyWith: "wm_sandbox_access_get",
  verifyArgs: (args) => ({
    serverId: args["serverId"],
    sandboxId: args["sandboxId"],
    grantId: args["grantId"],
  }),
});

// --- sandbox access refresh (the one --wait exception) --------------------

const accessRefreshPair = mutationPair({
  base: "wm_sandbox_access_refresh",
  title: "Refresh a sandbox connection profile",
  what: "writing a fresh connection profile for an applied grant",
  cli: "sandboxAccessRefresh",
  flags: {
    server: "serverId",
    sandbox: "sandboxId",
    grant: "grantId",
    "connection-file": "connectionFile",
  },
  constants: () => ({ confirm: "REFRESH" }),
  inputShape: {
    serverId: serverIdSchema,
    sandboxId: sandboxIdSchema,
    grantId: grantIdSchema,
    connectionFile: pathOnlySchema,
  },
  consequence: () => "profile_replacement",
  destructive: true,
  warning: "The existing file at that path is overwritten; the previous pin and identity are not kept.",
  effect: (args) => {
    const sandboxId = String(args["sandboxId"]);
    const file = String(args["connectionFile"]);
    return `Write a fresh connection profile for sandbox ${sandboxId} to ${file}. Any file already at that path is replaced: the previous endpoint, host key pin and identity are overwritten and cannot be recovered from the old file. This is the recovery step for a sandbox whose endpoint has changed - after a reload or an image refresh, the profile written earlier is stale and an SSH alias built from it stops working. No WarpMetal state changes.`;
  },
  preflight: async (ctx) => {
    const serverId = String(ctx.args["serverId"]);
    const sandboxId = String(ctx.args["sandboxId"]);
    const grantId = String(ctx.args["grantId"]);
    const probe = await ctx.probe("sandboxAccessGet", {
      server: serverId,
      sandbox: sandboxId,
      grant: grantId,
    });
    const warnings = verificationWarnings("the access grant", probe);
    if (probe.error !== null || probe.exitCode !== 0) {
      return {
        refuse: {
          status: "DENIED",
          summary: `access grant ${grantId} could not be read, so a profile cannot be refreshed from it`,
          errors: warnings,
        },
      };
    }
    const record = grantRecord(probe.payload);
    const state = stateOf(record);
    // A profile is materialised from an applied grant; refreshing from anything
    // else would write a file that never worked. This is a hard precondition,
    // not a preference, so it refuses rather than warns.
    if (state !== "applied") {
      return {
        refuse: {
          status: "DENIED",
          summary: `access grant ${grantId} reports '${state ?? "an unrecognised state"}', so it has no applied profile to refresh`,
          errors: [
            "only an applied grant has a connection profile; revoking, re-granting or waiting for the grant to apply comes first",
          ],
        },
      };
    }
    return {
      data: {
        serverId,
        sandboxId,
        grantId,
        observedState: state,
        connectionFile: String(ctx.args["connectionFile"]),
      },
      warnings,
    };
  },
  planSummary: ({ data }) => {
    const record = asRecord(data);
    return `plan: refresh the connection profile for grant ${String(record?.["grantId"] ?? "?")} (grant ${String(record?.["observedState"] ?? "unknown")})`;
  },
  applySummary: () =>
    "connection profile written; the file is only usable if the endpoint and pin it carries are current",
  registers: (ctx) => {
    const serverId = str(ctx.args["serverId"]);
    const sandboxId = str(ctx.args["sandboxId"]);
    const grantId = str(ctx.args["grantId"]);
    if (serverId === null || sandboxId === null || grantId === null) {
      return null;
    }
    // The grant is the thing to re-observe: a refresh that timed out inside its
    // wait budget may still be applying, and `access get` is what settles it.
    return withStatus(
      {
        taskId: grantId,
        kind: "grant",
        label: `refresh profile for grant ${grantId}`,
        observeWith: "wm_sandbox_access_get",
        serverId,
        sandboxId,
      },
      stateOf(grantRecord(ctx.data)),
    );
  },
  verifyWith: "wm_sandbox_access_get",
  verifyArgs: (args) => ({
    serverId: args["serverId"],
    sandboxId: args["sandboxId"],
    grantId: args["grantId"],
  }),
});

/**
 * The five irreversible pairs and the one profile pair. Kept in one array so a
 * test can assert the whole destructive surface in a single place, which is the
 * only way "no destructive verb is reachable" stays checkable as the surface
 * grows.
 */
export const destructiveTools: readonly WmToolSpec[] = [
  ...serverPowerPair,
  ...serverReloadPair,
  ...sandboxDeletePair,
  ...sandboxLifecyclePair,
  ...accessRevokePair,
  ...accessRefreshPair,
];

/**
 * The read half of the latch. It exists because a memory nobody can inspect is
 * indistinguishable from a bug: a refusal says "this id is latched", and this
 * tool is how a human or a model finds out which ids, why, and when.
 *
 * It is local and never contacts WarpMetal - `openWorldHint: false` - and it is
 * deliberately not a way to clear anything. There is no un-latch tool, because
 * the state it records is a fact about the backend, not a preference.
 */
export const latchTools: readonly WmToolSpec[] = [
  {
    name: "wm_manual_review_list",
    title: "List latched manual_review ids",
    description:
      "Lists the identifiers this server has recorded as having reached manual_review, most recent first, with the reason and the time. Read-only, local, and persisted: it survives a restart, unlike the task registry. An id here is refused for every mutation and every plan; only read-only status checks may observe the backend reconciling it.",
    input: z.strictObject({}),
    annotations: READ_ONLY_LOCAL,
    kind: "task",
    successStatus: "OBSERVED",
    summary: () => "",
    run: async ({ deps }) => {
      const entries = deps.latch.list();
      const warnings: string[] = [];
      if (entries.length === 0) {
        warnings.push(
          "latch_empty: no manual_review has been observed in this state directory. This only means nothing was seen here, not that nothing reached manual_review: the record is written only by this server, and an id reviewed through another tool is invisible.",
        );
      }
      const latchError = deps.latch.lastError;
      if (latchError !== null) {
        warnings.push(
          `latch_unreliable: the manual_review record could not be read or written (${latchError}), so a refusal for a latched id is not guaranteed until this is resolved`,
        );
      }
      return {
        subcommand: "manual-review list",
        result: makeResult({
          status: "OBSERVED",
          exitCode: latchError === null ? 0 : DENIED_EXIT_CODE,
          summary: `${String(entries.length)} latched manual_review id(s)`,
          data: { entries, count: entries.length, store: deps.latch.location },
          warnings,
        }),
      };
    },
  },
];

/** Exported for the conformance suite, which asserts the class of each action. */

