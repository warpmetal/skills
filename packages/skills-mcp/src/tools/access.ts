/**
 * access.ts - read-only view of sandbox access grants.
 *
 * A granted access is not a usable access: the CLI reports the grant as pending
 * and it must be observed until it is applied. Grant creation reports the grant
 * but does not materialise a connection profile, because requesting a connection
 * file on grant creation requires `--wait` and this server never passes `--wait`.
 * A profile is materialised by a different route, `sandbox access refresh`,
 * which is where the single documented `--wait` budget lives.
 */
import { z } from "zod";

import { grantIdSchema, sandboxIdSchema, serverIdSchema } from "../schemas.js";
import { GRANT_TERMINAL_STATES, grantIdOf, grantList, grantRecord, stateOf } from "../shapes.js";
import { asRecord, type WmToolSpec } from "./spec.js";

const READ_ONLY_REMOTE: WmToolSpec["annotations"] = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const accessTools: readonly WmToolSpec[] = [
  {
    name: "wm_sandbox_access_list",
    title: "List sandbox access grants",
    description:
      "Lists the access grants on one sandbox: name, key fingerprint and observed state. Read-only, single poll. A grant that is not applied is not usable.",
    input: z.strictObject({
      serverId: serverIdSchema,
      sandboxId: sandboxIdSchema,
    }),
    annotations: READ_ONLY_REMOTE,
    cli: "sandboxAccessList",
    flags: { server: "serverId", sandbox: "sandboxId" },
    summary: ({ data }) => {
      // `access list` emits `accessGrants`, each an envelope around one grant.
      const grants = grantList(data);
      return Array.isArray(asRecord(data)?.["accessGrants"])
        ? `${String(grants.length)} access grant(s) on this sandbox`
        : "access grants listed";
    },
    extraWarnings: ({ data }) => {
      const pending = grantList(data).filter((entry) => {
        const state = stateOf(asRecord(entry));
        return state !== null && !GRANT_TERMINAL_STATES.includes(state);
      }).length;
      if (pending === 0) {
        return [];
      }
      return [
        `grants_not_applied: ${String(pending)} grant(s) have not reached a terminal state, so they are not usable yet`,
      ];
    },
    nextActions: ({ args, data }) => {
      const grants = grantList(data);
      if (grants.length === 0) {
        return [];
      }
      const grantId = grantIdOf(asRecord(grants[0]));
      if (grantId === null) {
        return [];
      }
      return [
        {
          action: "read one grant in full",
          tool: "wm_sandbox_access_get",
          args: { serverId: args["serverId"], sandboxId: args["sandboxId"], grantId },
        },
      ];
    },
  },
  {
    name: "wm_sandbox_access_get",
    title: "Get sandbox access grant",
    description:
      "Returns one access grant in full, including its observed state and key fingerprint. Read-only, single poll. The private key is never returned; only public metadata is readable here.",
    input: z.strictObject({
      serverId: serverIdSchema,
      sandboxId: sandboxIdSchema,
      grantId: grantIdSchema,
    }),
    annotations: READ_ONLY_REMOTE,
    cli: "sandboxAccessGet",
    flags: { server: "serverId", sandbox: "sandboxId", grant: "grantId" },
    summary: ({ data, status }) => {
      // `access get` wraps the record in `accessGrant`.
      const state = stateOf(grantRecord(data));
      return state === null ? `grant reported as ${status}` : `access grant: ${state}`;
    },
    extraWarnings: ({ data }) => {
      const state = stateOf(grantRecord(data));
      if (state === null || GRANT_TERMINAL_STATES.includes(state)) {
        return [];
      }
      return [
        `grant_not_applied: the grant is '${state}', so it is not usable yet. Poll again rather than assuming it works.`,
      ];
    },
    nextActions: ({ args, data }) => {
      const state = stateOf(grantRecord(data));
      if (state === null || GRANT_TERMINAL_STATES.includes(state)) {
        return [];
      }
      return [
        {
          action: "poll the grant until it is applied; a pending grant is not a usable one",
          tool: "wm_sandbox_access_get",
          args: { serverId: args["serverId"], sandboxId: args["sandboxId"], grantId: args["grantId"] },
        },
      ];
    },
  },
];
