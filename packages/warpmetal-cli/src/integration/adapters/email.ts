import { knownFlags, requireConfirm, requireFlag, type ParsedArgs } from "../../args.js";
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

const API_KEY_SECRET = "email.api_key";
const API = "https://api.resend.com";

/**
 * Outbound email notifications through Resend.
 *
 * The key can be verified by listing sending domains (`GET /domains`), which
 * mutates nothing, so a valid key earns a real OK. Sending is a separate,
 * gated verb.
 */
export const emailAdapter: Adapter = {
  spec: findProvider("email")!,

  gates: {
    notify: "CONFIRM NOTIFY",
  },

  async status(context: AdapterContext): Promise<AdapterResult> {
    const key = await context.store.read(API_KEY_SECRET);
    if (key === null) {
      return needsAuth("email", "status", `No ${API_KEY_SECRET} in the store. Run \`warpmetal env store set ${API_KEY_SECRET}\`.`);
    }
    context.redactor.add(key);

    const response = await context.http({
      method: "GET",
      url: `${API}/domains`,
      headers: { authorization: `Bearer ${key}` },
    });

    if (response.status === 0) {
      return { provider: "email", verb: "status", status: "DEGRADED", warnings: ["Resend unreachable; key validity is unknown."] };
    }
    if (response.status === 401 || response.status === 403) {
      return { provider: "email", verb: "status", status: "NEEDS_AUTH", warnings: ["Resend rejected the stored API key."] };
    }
    if (!response.ok) {
      return failure("email", "status", `Resend responded with HTTP ${response.status}.`);
    }

    const body = response.json as { data?: Array<{ name?: string; status?: string }> } | null;
    const domains = body?.data ?? [];
    return {
      provider: "email",
      verb: "status",
      status: "OK",
      mode: "api_token",
      data: {
        domainCount: domains.length,
        verifiedDomains: domains.filter((domain) => domain.status === "verified").length,
        note: "Sending is allowed only from the domains the account has verified.",
      },
    };
  },

  async run(verb: string, args: ParsedArgs, context: AdapterContext): Promise<AdapterResult> {
    if (verb !== "notify") {
      throw new CliError("usage_error", `Unknown email verb: ${verb}. Try: status, notify.`);
    }
    knownFlags(args, ["to", "from", "subject", "text", "confirm", "json"]);
    requireConfirm(args, this.gates["notify"]!);
    const to = requireFlag(args, "to");
    const from = requireFlag(args, "from");
    const text = requireFlag(args, "text");
    const subjectFlag = args.flags.get("subject");
    const subject = typeof subjectFlag === "string" ? subjectFlag : "WarpMetal notification";

    const key = await context.store.read(API_KEY_SECRET);
    if (key === null) return needsAuth("email", verb, `No ${API_KEY_SECRET} in the store.`);
    context.redactor.add(key);

    const response = await context.http({
      method: "POST",
      url: `${API}/emails`,
      headers: { authorization: `Bearer ${key}` },
      body: { from, to: [to], subject, text },
    });
    if (response.status === 0) return failure("email", verb, "Resend unreachable; nothing was sent.");

    if (response.ok) {
      const body = response.json as { id?: string } | null;
      return ok("email", verb, { mode: "api_token", delivered: true, to, messageId: body?.id ?? null });
    }
    if (response.status === 401 || response.status === 403) {
      return needsAuth("email", verb, "Resend rejected the stored API key, or it may not send from that domain.");
    }
    return failure("email", verb, `Resend rejected the message (HTTP ${response.status}).`);
  },
};
