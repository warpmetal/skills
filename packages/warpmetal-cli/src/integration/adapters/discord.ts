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

const WEBHOOK_SECRET = "discord.webhook";
const TOKEN_SECRET = "discord.token";
const API = "https://discord.com/api/v10";

/**
 * Discord notifications.
 *
 * The same honesty split as Slack: a bot token is verifiable with a read
 * (`GET /users/@me`), an incoming webhook is not verifiable without posting, so
 * a webhook-only configuration reports DEGRADED rather than a false OK.
 */
export const discordAdapter: Adapter = {
  spec: findProvider("discord")!,

  gates: {
    notify: "CONFIRM NOTIFY",
  },

  async status(context: AdapterContext): Promise<AdapterResult> {
    const token = await context.store.read(TOKEN_SECRET);
    if (token !== null) {
      context.redactor.add(token);
      const response = await context.http({
        method: "GET",
        url: `${API}/users/@me`,
        headers: { authorization: `Bot ${token}` },
      });
      if (response.status === 0) {
        return { provider: "discord", verb: "status", status: "DEGRADED", warnings: ["Discord unreachable; token validity is unknown."] };
      }
      if (response.status === 401 || response.status === 403) {
        return { provider: "discord", verb: "status", status: "NEEDS_AUTH", warnings: ["Discord rejected the stored bot token."] };
      }
      if (!response.ok) {
        return failure("discord", "status", `Discord responded with HTTP ${response.status}.`);
      }
      const body = response.json as { username?: string; id?: string } | null;
      return {
        provider: "discord",
        verb: "status",
        status: "OK",
        mode: "bot_token",
        data: {
          username: body?.username ?? null,
          id: body?.id ?? null,
          note: "The bot can post only to channels it was granted access to; that is managed in Discord.",
        },
      };
    }

    const webhook = await context.store.read(WEBHOOK_SECRET);
    if (webhook !== null) {
      context.redactor.add(webhook);
      let host = "unknown";
      try {
        host = new URL(webhook).host;
      } catch {
        return failure("discord", "status", "The stored discord.webhook is not a valid URL.");
      }
      return {
        provider: "discord",
        verb: "status",
        status: "DEGRADED",
        mode: "incoming_webhook",
        data: { host, note: "An incoming webhook can only be verified by posting to it; no message was sent." },
        warnings: ["Webhook presence confirmed; delivery not verified."],
      };
    }

    return needsAuth("discord", "status", `No ${TOKEN_SECRET} or ${WEBHOOK_SECRET} in the store.`);
  },

  async run(verb: string, args: ParsedArgs, context: AdapterContext): Promise<AdapterResult> {
    if (verb !== "notify") {
      throw new CliError("usage_error", `Unknown discord verb: ${verb}. Try: status, notify.`);
    }
    knownFlags(args, ["channel", "text", "confirm", "json"]);
    requireConfirm(args, this.gates["notify"]!);
    const text = requireFlag(args, "text");

    const webhook = await context.store.read(WEBHOOK_SECRET);
    if (webhook !== null) {
      context.redactor.add(webhook);
      const response = await context.http({ method: "POST", url: webhook, body: { content: text } });
      if (response.status === 0) return failure("discord", verb, "Discord unreachable; nothing was delivered.");
      if (!response.ok) return failure("discord", verb, `Discord rejected the webhook post (HTTP ${response.status}).`);
      return ok("discord", verb, { mode: "incoming_webhook", delivered: true });
    }

    const token = await context.store.read(TOKEN_SECRET);
    if (token === null) return needsAuth("discord", verb, `No ${TOKEN_SECRET} or ${WEBHOOK_SECRET} in the store.`);
    context.redactor.add(token);
    const channel = requireFlag(args, "channel");

    const response = await context.http({
      method: "POST",
      url: `${API}/channels/${encodeURIComponent(channel)}/messages`,
      headers: { authorization: `Bot ${token}` },
      body: { content: text },
    });
    if (response.status === 0) return failure("discord", verb, "Discord unreachable; nothing was delivered.");
    if (response.ok) {
      const body = response.json as { id?: string } | null;
      return ok("discord", verb, { mode: "bot_token", delivered: true, channel, messageId: body?.id ?? null });
    }
    if (response.status === 401 || response.status === 403) {
      return needsAuth("discord", verb, "Discord rejected the stored bot token, or the bot cannot post in that channel.");
    }
    return failure("discord", verb, `Discord rejected the message (HTTP ${response.status}).`);
  },
};
