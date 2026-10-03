/**
 * inspect.ts - read-only inventory of identities, servers, runtime and
 * sandboxes. Every tool here is a single poll: waiting is deliberately absent,
 * so no tool can block a client.
 */
import { z } from "zod";

import { operationIdSchema, pathOnlySchema, sandboxIdSchema, serverIdSchema } from "../schemas.js";
import {
  operationRecord,
  runtimeState,
  sandboxList,
  sandboxRecord,
  stateOf,
  taskRecord,
} from "../shapes.js";
import { asRecord, str, type WmToolSpec } from "./spec.js";

const READ_ONLY_LOCAL: WmToolSpec["annotations"] = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const READ_ONLY_REMOTE: WmToolSpec["annotations"] = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

function countOf(value: unknown): number | null {
  return Array.isArray(value) ? value.length : null;
}

export const inspectTools: readonly WmToolSpec[] = [
  {
    name: "wm_identity_list",
    title: "List WarpMetal SSH identities",
    description:
      "Lists the SSH identities the CLI manages on this host, with their names and public metadata. Read-only and local. Private key material is never read or returned.",
    input: z.strictObject({}),
    annotations: READ_ONLY_LOCAL,
    cli: "identityList",
    summary: ({ data }) => {
      const record = asRecord(data);
      const identities = countOf(record?.["identities"]);
      return identities === null
        ? "WarpMetal SSH identities listed"
        : `${String(identities)} WarpMetal SSH identity(ies)`;
    },
    nextActions: () => [
      { action: "read local state to relate identities to servers", tool: "wm_state_list", args: {} },
    ],
  },
  {
    name: "wm_server_get",
    title: "Get server state",
    description:
      "Returns the current state of one server: status, power state and public runtime metadata. Read-only, single poll. The serverId comes from wm_state_list or a previous order.",
    input: z.strictObject({ serverId: serverIdSchema }),
    annotations: READ_ONLY_REMOTE,
    cli: "serverGet",
    flags: { server: "serverId" },
    summary: ({ data }) => {
      // `server get` wraps the record in `task`.
      const record = taskRecord(data);
      const status = stateOf(record);
      const osName = str(record?.["osName"]);
      if (status === null) {
        return "server state read";
      }
      return osName === null ? `server ${status}` : `server ${status} on ${osName}`;
    },
    nextActions: ({ args }) => [
      {
        action: "check whether Agent Runtime is enabled and healthy on this server",
        tool: "wm_runtime_get",
        args: { serverId: args["serverId"] },
      },
      {
        action: "list the sandboxes on this server",
        tool: "wm_sandbox_list",
        args: { serverId: args["serverId"] },
      },
    ],
  },
  {
    name: "wm_server_identity",
    title: "Get server identity mapping",
    description:
      "Returns the safe identity mapping for one server: serverId to key name to fingerprint to local paths. Read-only, local. Use this instead of opening the WarpMetal state file.",
    input: z.strictObject({ serverId: serverIdSchema }),
    annotations: READ_ONLY_LOCAL,
    cli: "serverIdentity",
    flags: { server: "serverId" },
    summary: ({ data }) => {
      // `server identity` wraps the mapping in `identity`.
      const record = asRecord(asRecord(data)?.["identity"]) ?? asRecord(data);
      const name = str(record?.["keyName"]) ?? str(record?.["name"]);
      return name === null
        ? "server identity mapping read"
        : `server identity mapping: key '${name}'`;
    },
    nextActions: ({ args }) => [
      {
        action: "read the server state",
        tool: "wm_server_get",
        args: { serverId: args["serverId"] },
      },
    ],
  },
  {
    name: "wm_server_login",
    title: "Prove SSH key possession",
    description:
      "Proves possession of the installed SSH key for one server without reading it. Read-only with respect to server state, but it does contact the host. Pass identity only as a filesystem path; this server never opens it.",
    input: z.strictObject({
      serverId: serverIdSchema,
      identity: pathOnlySchema.optional(),
    }),
    annotations: READ_ONLY_REMOTE,
    cli: "serverLogin",
    flags: { server: "serverId", identity: "identity" },
    summary: ({ data, status }) => {
      // `server login` emits the proof it obtained, not a boolean `ok`.
      const record = asRecord(data);
      const fingerprint = str(record?.["sshFingerprint"]);
      return fingerprint === null
        ? `SSH key possession check: ${status}`
        : `SSH key possession check passed for ${fingerprint}`;
    },
    nextActions: ({ args }) => [
      {
        action: "read the server state to confirm the server is still ready",
        tool: "wm_server_get",
        args: { serverId: args["serverId"] },
      },
    ],
  },
  {
    name: "wm_operation_get",
    title: "Get operation state",
    description:
      "Returns the state of a long-running operation. Read-only, single poll. Accepted or pending is reported as PENDING with exit code 8, never as applied.",
    input: z.strictObject({
      operationId: operationIdSchema,
      serverId: serverIdSchema.optional(),
    }),
    annotations: READ_ONLY_REMOTE,
    cli: "operationGet",
    flags: { operation: "operationId", server: "serverId" },
    summary: ({ data, status }) => {
      // `operation get` wraps the record in `operation`.
      const record = operationRecord(data);
      const state = stateOf(record);
      const percent = record?.["progressPercent"];
      const suffix = typeof percent === "number" ? `, ${String(percent)}%` : "";
      return state === null
        ? `operation reported as ${status}`
        : `operation ${state}${suffix}`;
    },
    nextActions: ({ args, data }) => {
      const record = operationRecord(data);
      const pending =
        stateOf(record) !== null && record?.["completedAt"] === undefined;
      if (!pending) {
        return [];
      }
      return [
        {
          action: "poll the operation again; a pending operation is not an applied one",
          tool: "wm_operation_get",
          args: { operationId: args["operationId"] },
        },
      ];
    },
  },
  {
    name: "wm_runtime_get",
    title: "Get Agent Runtime state",
    description:
      "Returns Agent Runtime state for one server, including whether it is supported, enabled and healthy. Read-only, single poll. There is no wait flag: a deferred operation reports PENDING.",
    input: z.strictObject({ serverId: serverIdSchema }),
    annotations: READ_ONLY_REMOTE,
    cli: "runtimeGet",
    flags: { server: "serverId" },
    summary: ({ data, status }) => {
      // `runtime get` nests the record under `runtime`, with the state in `state`.
      const state = runtimeState(data);
      if (state === null) {
        return `Agent Runtime reported as ${status}`;
      }
      return `Agent Runtime: ${state}`;
    },
    extraWarnings: ({ data }) => {
      const state = runtimeState(data);
      if (state !== null && ["degraded", "offline", "needs_reinstall"].includes(state)) {
        return [
          `runtime_unhealthy: Agent Runtime is '${state}'. Stop and ask before installing or reloading.`,
        ];
      }
      return [];
    },
    nextActions: ({ args }) => [
      {
        action: "list the sandboxes on this server",
        tool: "wm_sandbox_list",
        args: { serverId: args["serverId"] },
      },
    ],
  },
  {
    name: "wm_sandbox_list",
    title: "List sandboxes",
    description:
      "Lists the sandboxes on one server with their state and size. Read-only. Use the returned sandboxId with wm_sandbox_get; it cannot be inferred from the serverId.",
    input: z.strictObject({ serverId: serverIdSchema }),
    annotations: READ_ONLY_REMOTE,
    cli: "sandboxList",
    flags: { server: "serverId" },
    summary: ({ data }) => {
      const sandboxes = sandboxList(data);
      const record = asRecord(data);
      const listPresent = Array.isArray(record?.["sandboxes"]);
      return listPresent
        ? `${String(sandboxes.length)} sandbox(es) on this server`
        : "sandboxes listed";
    },
    nextActions: ({ args, data }) => {
      const list = sandboxList(data);
      if (list.length === 0) {
        return [];
      }
      const first = asRecord(list[0]);
      const sandboxId = str(first?.["id"]) ?? str(first?.["sandboxId"]);
      if (sandboxId === null) {
        return [];
      }
      return [
        {
          action: "read the full state of one sandbox",
          tool: "wm_sandbox_get",
          args: { serverId: args["serverId"], sandboxId },
        },
      ];
    },
  },
  {
    name: "wm_sandbox_get",
    title: "Get sandbox state",
    description:
      "Returns one sandbox in full: state, size, lifetime and expiry. Read-only, single poll. Both identifiers are required, because a sandboxId cannot be derived from a serverId.",
    input: z.strictObject({
      serverId: serverIdSchema,
      sandboxId: sandboxIdSchema,
    }),
    annotations: READ_ONLY_REMOTE,
    cli: "sandboxGet",
    flags: { server: "serverId", sandbox: "sandboxId" },
    summary: ({ data, status }) => {
      // `sandbox get` wraps the record in `sandbox`, state in `observedState`.
      const record = sandboxRecord(data);
      const state = stateOf(record);
      const lifetime = str(record?.["lifetime"]);
      if (state === null) {
        return `sandbox reported as ${status}`;
      }
      return lifetime === null
        ? `sandbox ${state}`
        : `sandbox ${state} (${lifetime})`;
    },
    extraWarnings: ({ data }) => {
      const record = sandboxRecord(data);
      const expiresAt = str(record?.["expiresAt"]);
      if (expiresAt === null) {
        return [];
      }
      const expiry = Date.parse(expiresAt);
      if (Number.isNaN(expiry)) {
        return [`sandbox_expiry_unparsed: expiresAt '${expiresAt}' is not a parseable timestamp`];
      }
      const remainingMs = expiry - Date.now();
      if (remainingMs <= 0) {
        return [`sandbox_expired: the workspace is deleted at expiry (${expiresAt})`];
      }
      if (remainingMs < 15 * 60 * 1000) {
        return [
          `sandbox_expiring_soon: expires at ${expiresAt}, under 15 minutes away; a temporary sandbox cannot be extended`,
        ];
      }
      return [];
    },
    nextActions: ({ args }) => [
      {
        action: "list the other sandboxes on this server",
        tool: "wm_sandbox_list",
        args: { serverId: args["serverId"] },
      },
    ],
  },
];
