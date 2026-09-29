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

const TOKEN_SECRET = "slack.token";
const WEBHOOK_SECRET = "slack.webhook";
const API = "https://slack.com/api";

/**
 * Slack notifications.
 *
 * The honesty case for this adapter: an incoming webhook cannot be verified
 * without sending a message, so `status` reports DEGRADED for a webhook-only
 * configuration instead of a false OK. A bot token can be verified with
 * `auth.test`, and that is the only case where OK is printed.
 */
export const slackAdapter: Adapter = {
  spec: findProvider("slack")!,

  gates: {
    notify: "CONFIRM NOTIFY",
  },

  async status(context: AdapterContext): Promise<AdapterResult> {
    const token = await context.store.read(TOKEN_SECRET);
    if (token !== null) {
      context.redactor.add(token);
      const response = await context.http({
        method: "POST",
        url: `${API}/auth.test`,
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.status === 0) {
        return { provider: "slack", verb: "status", status: "DEGRADED", warnings: ["Slack unreachable; token validity is unknown."] };
      }
      const body = response.json as { ok?: boolean; team?: string; user?: string; error?: string } | null;
      if (body?.ok === true) {
        return {
          provider: "slack",
          verb: "status",
          status: "OK",
          mode: "bot_token",
          data: { team: body.team ?? null, user: body.user ?? null, note: "Bot scopes are whatever the app was granted; chat:write is all this adapter needs." },
        };
      }
      return {
        provider: "slack",
        verb: "status",
        status: "NEEDS_AUTH",
        warnings: [`Slack rejected the stored token (${body?.error ?? `HTTP ${response.status}`}).`],
      };
    }

    const webhook = await context.store.read(WEBHOOK_SECRET);
    if (webhook !== null) {
      context.redactor.add(webhook);
      let host = "unknown";
      try {
        host = new URL(webhook).host;
      } catch {
        return failure("slack", "status", "The stored slack.webhook is not a valid URL.");
      }
      return {
        provider: "slack",
        verb: "status",
        status: "DEGRADED",
        mode: "incoming_webhook",
        data: { host, note: "An incoming webhook can only be verified by posting to it; no message was sent." },
        warnings: ["Webhook presence confirmed; delivery not verified."],
      };
    }

    return needsAuth("slack", "status", `No ${TOKEN_SECRET} or ${WEBHOOK_SECRET} in the store.`);
  },

  async run(verb: string, args: ParsedArgs, context: AdapterContext): Promise<AdapterResult> {
    // Verb validation before any credential read, so a typo is a usage error
    // (exit 2) and never a misleading NEEDS_AUTH (exit 4).
    if (verb !== "notify") {
      throw new CliError("usage_error", `Unknown slack verb: ${verb}. Try: status, notify.`);
    }
    knownFlags(args, ["channel", "text", "confirm", "json"]);
    requireConfirm(args, this.gates["notify"]!);
    const text = requireFlag(args, "text");

    const webhook = await context.store.read(WEBHOOK_SECRET);
    if (webhook !== null) {
      context.redactor.add(webhook);
      const response = await context.http({ method: "POST", url: webhook, body: { text } });
      if (response.status === 0) return failure("slack", verb, "Slack unreachable; nothing was delivered.");
      if (!response.ok) return failure("slack", verb, `Slack rejected the webhook post (HTTP ${response.status}).`);
      return ok("slack", verb, { mode: "incoming_webhook", delivered: true });
    }

    const token = await context.store.read(TOKEN_SECRET);
    if (token === null) return needsAuth("slack", verb, `No ${TOKEN_SECRET} or ${WEBHOOK_SECRET} in the store.`);
    context.redactor.add(token);
    const channel = requireFlag(args, "channel");

    const response = await context.http({
      method: "POST",
      url: `${API}/chat.postMessage`,
      headers: { authorization: `Bearer ${token}` },
      body: { channel, text },
    });
    if (response.status === 0) return failure("slack", verb, "Slack unreachable; nothing was delivered.");
    const body = response.json as { ok?: boolean; error?: string; ts?: string } | null;
    if (body?.ok === true) return ok("slack", verb, { mode: "bot_token", delivered: true, channel, ts: body.ts ?? null });
    return failure("slack", verb, `Slack rejected the message (${body?.error ?? `HTTP ${response.status}`}).`);
  },
};
