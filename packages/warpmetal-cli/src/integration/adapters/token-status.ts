import { CliError } from "../../errors.js";
import type { ParsedArgs } from "../../args.js";
import type { ProviderSpec } from "../registry.js";
import {
  failure,
  needsAuth,
  type Adapter,
  type AdapterContext,
  type AdapterResult,
} from "./types.js";

/**
 * Minimal adapter for providers whose mutating/read verbs are handled by the
 * MCP tool catalog. Only `status` is implemented here (token present + optional probe).
 */
export function createTokenStatusAdapter(
  spec: ProviderSpec,
  options: {
    probeUrl?: string;
    authHeader?: (token: string) => Record<string, string>;
  } = {},
): Adapter {
  const secret = spec.secretNames[0];
  if (secret === undefined) {
    throw new Error(`Provider ${spec.name} has no secretNames`);
  }

  return {
    spec,
    gates: {},

    async status(context: AdapterContext): Promise<AdapterResult> {
      // Contextual secrets (`*.site`, `*.email`, `*.warehouse`, …) are needed to
      // build URLs, not to authenticate. A missing one degrades the tools that
      // use it, so it is a warning - never a NEEDS_AUTH on the primary token.
      const missingContextual: string[] = [];
      for (const name of spec.secretNames.slice(1)) {
        if ((await context.store.read(name)) === null) missingContextual.push(name);
      }
      const contextualWarnings = missingContextual.map(
        (name) => `No ${name} in the store; tools that need it will fail until it is set.`,
      );

      const token = await context.store.read(secret);
      if (token === null) {
        return needsAuth(
          spec.name,
          "status",
          `No ${secret} in the store. Run \`warpmetal env store set ${secret}\`.`,
        );
      }
      context.redactor.add(token);

      if (!options.probeUrl) {
        // No live probe exists, so the credential's validity is genuinely
        // unknown. DEGRADED says exactly that; OK would be a false claim.
        return {
          provider: spec.name,
          verb: "status",
          status: "DEGRADED",
          mode: spec.authModes[0],
          warnings: [
            `${secret} is present but this provider has no live probe; validity is unknown.`,
            ...contextualWarnings,
          ],
        };
      }

      const response = await context.http({
        method: "GET",
        url: options.probeUrl,
        headers: options.authHeader?.(token) ?? { authorization: `Bearer ${token}` },
      });

      if (response.status === 0) {
        return {
          provider: spec.name,
          verb: "status",
          status: "DEGRADED",
          warnings: [`${spec.title} unreachable; token validity is unknown.`, ...contextualWarnings],
        };
      }
      if (response.status === 401 || response.status === 403) {
        return needsAuth(spec.name, "status", `${spec.title} rejected the stored credential.`);
      }
      if (!response.ok) {
        return failure(spec.name, "status", `${spec.title} responded with HTTP ${String(response.status)}.`);
      }
      return {
        provider: spec.name,
        verb: "status",
        status: "OK",
        mode: spec.authModes[0],
        data: { ok: true },
        ...(contextualWarnings.length > 0 ? { warnings: contextualWarnings } : {}),
      };
    },

    async run(verb: string, _args: ParsedArgs, _context: AdapterContext): Promise<AdapterResult> {
      throw new CliError(
        "usage_error",
        `Unknown ${spec.name} verb: ${verb}. MCP tools use --args-stdin; run \`warpmetal integration list --json\`.`,
      );
    },
  };
}
