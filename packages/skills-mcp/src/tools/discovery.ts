/**
 * discovery.ts - the four tools that describe the environment and the product
 * catalog. Every later decision is anchored on these values, so they are the
 * ones that must never invent or cache a number.
 */
import { z } from "zod";

import {
  INSTALL_SSH_CLI_VERSION,
  MIN_CLI_VERSION,
  isBelow,
  joinVersion,
  parseSemver,
} from "../cli-version.js";
import { planIdSchema } from "../schemas.js";
import { asRecord, bool, str, type WmToolSpec } from "./spec.js";

export const discoveryTools: readonly WmToolSpec[] = [
  {
    name: "wm_version",
    title: "WarpMetal CLI version",
    description:
      "Reports the installed warpmetal CLI version. Read-only, local only. WarpMetal needs 0.8.1 or newer, and 0.8.10 or newer for sandbox access install-ssh; the result warns when either floor is unmet.",
    input: z.strictObject({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    cli: "version",
    parseText: (stdout) => {
      const parsed = parseSemver(stdout);
      return {
        version: parsed === null ? null : joinVersion(parsed),
        raw: stdout.trim().slice(0, 200),
      };
    },
    summary: ({ data }) => {
      const version = str(asRecord(data)?.["version"]);
      return version === null
        ? "warpmetal CLI version could not be parsed"
        : `warpmetal CLI ${version}`;
    },
    extraWarnings: ({ data }) => {
      const version = str(asRecord(data)?.["version"]);
      if (version === null) {
        return [
          "version_unparsed: the CLI version could not be read, so compatibility with 0.8.1 and 0.8.10 could not be verified",
        ];
      }
      const parsed = parseSemver(version);
      if (parsed === null) {
        return [`version_unparsed: '${version}' is not a semantic version`];
      }
      const warnings: string[] = [];
      if (isBelow(parsed, MIN_CLI_VERSION)) {
        warnings.push(
          `cli_too_old: ${version} is below the required ${joinVersion(MIN_CLI_VERSION)}`,
        );
      }
      if (isBelow(parsed, INSTALL_SSH_CLI_VERSION)) {
        warnings.push(
          `cli_below_install_ssh: ${version} is below ${joinVersion(INSTALL_SSH_CLI_VERSION)}, so sandbox access install-ssh is unavailable`,
        );
      }
      return warnings;
    },
    nextActions: () => [
      { action: "confirm the service is reachable and purchasing is open", tool: "wm_health", args: {} },
    ],
  },
  {
    name: "wm_health",
    title: "WarpMetal service health",
    description:
      "Reports service status, dependency readiness and whether purchasing is open. Read-only. Exit 3 is reported as UNAVAILABLE with the payload preserved, because the service answered but is not accepting purchases.",
    input: z.strictObject({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    cli: "health",
    summary: ({ data, status }) => {
      const record = asRecord(data);
      const service = str(record?.["status"]) ?? "unknown";
      const ready = bool(record?.["purchasingReady"]);
      const readyLabel = ready === null ? "unknown" : String(ready);
      return `WarpMetal health: ${service}, purchasingReady=${readyLabel} (${status})`;
    },
    extraWarnings: ({ data }) => {
      const record = asRecord(data);
      if (record === null) {
        return ["health_payload_missing: the health response could not be read"];
      }
      const warnings: string[] = [];
      if (bool(record["purchasingReady"]) === false) {
        warnings.push(
          "purchasing_unavailable: purchasingReady is false, so no order can be prepared. Read-only discovery is still valid.",
        );
      }
      const dependencies = asRecord(record["dependencies"]);
      if (dependencies !== null) {
        for (const [name, value] of Object.entries(dependencies)) {
          if (value === false) {
            warnings.push(`dependency_unavailable: dependency '${name}' reports false`);
          }
        }
      }
      return warnings;
    },
    nextActions: ({ data }) => {
      const record = asRecord(data);
      const actions = [
        {
          action: "read the live catalog before choosing a plan, OS or size",
          tool: "wm_catalog",
          args: {},
        },
      ];
      if (bool(record?.["purchasingReady"]) === false) {
        actions.unshift({
          action: "re-check health later; purchasing is paused and this is not a client-side failure",
          tool: "wm_health",
          args: {},
        });
      }
      return actions;
    },
  },
  {
    name: "wm_catalog",
    title: "WarpMetal live catalog",
    description:
      "Returns the live catalog: products, agentRuntime capacity and sizes, payment methods and the pricing revision. Read-only. Plan ids, OS names and size ids must always come from this response for the current session; never reuse a value from documentation or an earlier session. The full payload is roughly 10 KB and is returned untruncated.",
    input: z.strictObject({ plan: planIdSchema.optional() }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    cli: "catalog",
    flags: { plan: "plan" },
    summary: ({ data }) => {
      const record = asRecord(data);
      if (record === null) {
        return "WarpMetal catalog unavailable";
      }
      const products = Array.isArray(record["products"]) ? record["products"].length : 0;
      const revision = str(record["pricingRevision"]) ?? "unknown";
      return `WarpMetal catalog: ${String(products)} product(s), pricingRevision ${revision}`;
    },
    nextActions: ({ args }) =>
      args["plan"] === undefined
        ? [
            {
              action: "re-run with plan to reduce the payload to one product",
              tool: "wm_catalog",
              args: {},
            },
          ]
        : [],
  },
  {
    name: "wm_state_list",
    title: "List local WarpMetal state",
    description:
      "Lists identifiers, public runtime metadata and credential-presence booleans for the servers this host knows about. Read-only. This is the safe view of local state: the underlying state file is never opened by this server.",
    input: z.strictObject({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    cli: "stateList",
    summary: ({ data }) => {
      const record = asRecord(data);
      if (record === null) {
        return "no local WarpMetal state could be read";
      }
      const servers = Array.isArray(record["servers"]) ? record["servers"].length : null;
      const identities = Array.isArray(record["identities"])
        ? record["identities"].length
        : null;
      const parts: string[] = [];
      if (servers !== null) {
        parts.push(`${String(servers)} server(s)`);
      }
      if (identities !== null) {
        parts.push(`${String(identities)} identity(ies)`);
      }
      return parts.length === 0
        ? "local WarpMetal state read; no server or identity count found in the payload"
        : `local WarpMetal state: ${parts.join(", ")}`;
    },
    nextActions: () => [
      { action: "list the local SSH identities", tool: "wm_identity_list", args: {} },
    ],
  },
];
