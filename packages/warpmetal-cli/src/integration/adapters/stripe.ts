import { knownFlags, type ParsedArgs } from "../../args.js";
import { CliError } from "../../errors.js";
import { findProvider } from "../registry.js";
import {
  failure,
  needsAuth,
  ok,
  type Adapter,
  type AdapterContext,
  type AdapterResult,
} from "./types.js";

const TOKEN_SECRET = "stripe.token";
const API = "https://api.stripe.com/v1";

/**
 * Stripe balance, read-only.
 *
 * This adapter deliberately owns no money movement: no charge, no refund, no
 * customer. It exists so a skill can check that a key is live and what the
 * balance is, and nothing more.
 */
export const stripeAdapter: Adapter = {
  spec: findProvider("stripe")!,

  gates: {},

  async status(context: AdapterContext): Promise<AdapterResult> {
    return balanceGet(context, "status");
  },

  async run(verb: string, args: ParsedArgs, context: AdapterContext): Promise<AdapterResult> {
    if (verb !== "balance-get") {
      throw new CliError("usage_error", `Unknown stripe verb: ${verb}. Try: status, balance-get.`);
    }
    knownFlags(args, ["json"]);
    return balanceGet(context, verb);
  },
};

async function balanceGet(context: AdapterContext, verb: string): Promise<AdapterResult> {
  const key = await context.store.read(TOKEN_SECRET);
  if (key === null) {
    return needsAuth("stripe", verb, `No ${TOKEN_SECRET} in the store. Run \`warpmetal env store set ${TOKEN_SECRET}\`.`);
  }
  context.redactor.add(key);

  const response = await context.http({
    method: "GET",
    url: `${API}/balance`,
    headers: { authorization: `Bearer ${key}` },
  });

  if (response.status === 0) {
    return { provider: "stripe", verb, status: "DEGRADED", warnings: ["Stripe unreachable; key validity is unknown."] };
  }
  if (response.status === 401 || response.status === 403) {
    return { provider: "stripe", verb, status: "NEEDS_AUTH", warnings: ["Stripe rejected the stored API key."] };
  }
  if (!response.ok) {
    return failure("stripe", verb, `Stripe responded with HTTP ${response.status}.`);
  }

  const body = response.json as { livemode?: boolean; available?: Array<{ currency?: string; amount?: number }> } | null;
  return {
    provider: "stripe",
    verb,
    status: "OK",
    mode: "api_token",
    data: {
      livemode: body?.livemode ?? null,
      availableCurrencies: (body?.available ?? []).map((entry) => entry.currency ?? null).filter((currency) => currency !== null),
      note: "Read-only: this CLI never moves money.",
    },
  };
}
