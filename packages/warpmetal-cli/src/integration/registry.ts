/**
 * The provider catalog.
 *
 * This is the contract: a closed list of providers, the capabilities each one
 * exposes, and - most importantly - an honest statement of what the adapter can
 * and cannot verify. An adapter implements this; it never widens it on its own.
 * `verify.mjs` and the skill metadata both read from here so a skill can never
 * declare an integration the engine does not actually have.
 */
export type Capability =
  | "dns.record.list"
  | "dns.record.upsert"
  | "repo.view"
  | "notify.send"
  | "deployment.read"
  | "issue.read"
  | "billing.read";

/** How sure the engine can be that a revocation actually happened upstream. */
export type RevokeConfidence = "confirmed" | "unsupported" | "uncertain";

export interface ProviderSpec {
  readonly name: string;
  readonly title: string;
  /** Auth modes the adapter accepts, in preference order. */
  readonly authModes: readonly string[];
  /** Secret names this provider reads from the store. */
  readonly secretNames: readonly string[];
  readonly capabilities: readonly Capability[];
  /** External binaries the adapter prefers. Missing ones degrade, never fail. */
  readonly requiresTools: readonly string[];
  /** What the provider's own scoping model can and cannot enforce. */
  readonly scoping: string;
  /**
   * Files this provider touches beyond the store. Declared even when empty:
   * "writes nothing" is a claim worth making explicitly, and the bash layer
   * reads this list to keep a credential out of any other file.
   */
  readonly filesWritten: readonly string[];
  /** The exact command an operator runs to check this integration. */
  readonly verifyCommand: string;
  /** Provider error code -> a redacted explanation. Never echoes the input. */
  readonly errorMap: Readonly<Record<string, string>>;
  readonly revoke: RevokeConfidence;
  readonly notes?: string;
}

export const PROVIDERS: readonly ProviderSpec[] = [
  {
    name: "cloudflare",
    title: "Cloudflare DNS",
    authModes: ["api_token"],
    secretNames: ["cloudflare.token"],
    capabilities: ["dns.record.list", "dns.record.upsert"],
    requiresTools: [],
    scoping:
      "Cloudflare can scope a token to a single zone with Zone:DNS:Edit. The token's real scope is set in the dashboard and cannot be tightened by this CLI; `integration status` reports only whether the token is valid, never which zones it can reach.",
    filesWritten: [],
    verifyCommand: "warpmetal integration status cloudflare --json",
    errorMap: {
      "6003": "Invalid request headers: the token may be malformed.",
      "9109": "Invalid access token: the credential was rejected.",
      "10000": "Authentication error: Cloudflare refused the request.",
    },
    revoke:
      "unsupported",
    notes: "DNS only in this release. WAF and firewall rules are a later phase.",
  },
  {
    name: "github",
    title: "GitHub",
    authModes: ["gh_session", "personal_access_token"],
    secretNames: ["github.token"],
    capabilities: ["repo.view"],
    requiresTools: ["gh"],
    scoping:
      "A fine-grained PAT can be limited to selected repositories with read-only contents. Classic PAT scopes are broader than this CLI needs and cannot be narrowed here.",
    filesWritten: ["~/.config/gh/hosts.yml (written by `gh auth login`, never by this CLI)"],
    verifyCommand: "warpmetal integration status github --json",
    errorMap: {
      "401": "The token was rejected.",
      "403": "The token is valid but the account lacks permission for this resource.",
      "404": "Not found, or the credential cannot see the resource.",
    },
    revoke:
      "uncertain",
    notes: "GitHub Actions is a trigger for the same deploy.sh, never a second deploy engine.",
  },
  {
    name: "slack",
    title: "Slack",
    authModes: ["bot_token", "incoming_webhook"],
    secretNames: ["slack.token", "slack.webhook"],
    capabilities: ["notify.send"],
    requiresTools: [],
    scoping:
      "A bot token carries whatever scopes the app was granted (`chat:write` is all this adapter needs). An incoming webhook is bound to one channel and cannot be re-targeted.",
    filesWritten: [],
    verifyCommand: "warpmetal integration status slack --json",
    errorMap: {
      invalid_auth: "The token is not valid.",
      not_in_channel: "The bot is not a member of the target channel.",
      channel_not_found: "The channel does not exist, or the bot cannot see it.",
    },
    revoke:
      "unsupported",
    notes: "Channel prefixes follow the monitoring convention: slack:, email:.",
  },
  {
    name: "email",
    title: "Email (Resend)",
    authModes: ["api_token"],
    secretNames: ["email.api_key"],
    capabilities: ["notify.send"],
    requiresTools: [],
    scoping:
      "An API key can send only from the domains verified in the account, and only to recipients the provider accepts. It cannot read an inbox or manage the account.",
    filesWritten: [],
    verifyCommand: "warpmetal integration status email --json",
    errorMap: {
      "401": "Resend rejected the API key.",
      "403": "The key is valid but may not send from that domain.",
      "422": "Resend rejected the message: the from or to address is not accepted.",
      "429": "Resend rate limited the send; nothing was delivered.",
    },
    revoke:
      "unsupported",
    notes: "Outbound notification only. The from address is a manifest reference; the reply-to is never asserted.",
  },
  {
    name: "discord",
    title: "Discord",
    authModes: ["incoming_webhook", "bot_token"],
    secretNames: ["discord.webhook", "discord.token"],
    capabilities: ["notify.send"],
    requiresTools: [],
    scoping:
      "An incoming webhook is bound to one channel forever and cannot be re-targeted. A bot token can post to any channel the bot was granted access to, which is managed in Discord, not here.",
    filesWritten: [],
    verifyCommand: "warpmetal integration status discord --json",
    errorMap: {
      "400": "Discord rejected the request: the payload is malformed.",
      "401": "Unauthorized: the bot token was rejected.",
      "403": "Forbidden: the bot cannot post in that channel.",
      "404": "The webhook or channel does not exist, or the bot cannot see it.",
    },
    revoke:
      "unsupported",
    notes: "The mirror of Slack: an incoming webhook can only be proven by posting, so a webhook-only `status` is DEGRADED.",
  },
  {
    name: "vercel",
    title: "Vercel",
    authModes: ["api_token"],
    secretNames: ["vercel.token"],
    capabilities: ["deployment.read"],
    requiresTools: [],
    scoping:
      "A token is bound to one user or team and exposes the projects that scope can see. This release only lists projects and deployments; it never promotes, rolls back or redeploys.",
    filesWritten: [],
    verifyCommand: "warpmetal integration status vercel --json",
    errorMap: {
      "400": "Vercel rejected the request: the query is malformed.",
      "401": "Vercel rejected the token.",
      "403": "The token lacks scope for this team or project.",
      "404": "The project does not exist, or the token cannot see it.",
    },
    revoke:
      "uncertain",
    notes: "Read-only in this release. Deploys stay a human action; see the deploy skill for the gated path.",
  },
  {
    name: "sentry",
    title: "Sentry",
    authModes: ["api_token"],
    secretNames: ["sentry.token"],
    capabilities: ["issue.read"],
    requiresTools: [],
    scoping:
      "An auth token carries the scopes chosen at creation and can only see the organizations and projects it was granted. This release only lists projects; it never resolves, assigns or deletes an issue.",
    filesWritten: [],
    verifyCommand: "warpmetal integration status sentry --json",
    errorMap: {
      "400": "Sentry rejected the request: the query is malformed.",
      "401": "Sentry rejected the auth token.",
      "403": "The token lacks the scope required for this read.",
      "404": "The organization or project does not exist, or the token cannot see it.",
    },
    revoke:
      "uncertain",
    notes: "Read-only in this release. Triage actions remain manual.",
  },
  {
    name: "stripe",
    title: "Stripe",
    authModes: ["api_token"],
    secretNames: ["stripe.token"],
    capabilities: ["billing.read"],
    requiresTools: [],
    scoping:
      "A restricted key can be limited to specific resources and to read-only access. This release only reads the balance; it never creates a charge, a refund or a customer.",
    filesWritten: [],
    verifyCommand: "warpmetal integration status stripe --json",
    errorMap: {
      "401": "Stripe rejected the API key.",
      "403": "The key is valid but is not permitted for this resource.",
      "429": "Stripe rate limited the request.",
    },
    revoke:
      "uncertain",
    notes: "Read-only in this release. Money movements stay outside this CLI by design.",
  },
];

const BY_NAME = new Map(PROVIDERS.map((provider) => [provider.name, provider]));

export function providerNames(): readonly string[] {
  return PROVIDERS.map((provider) => provider.name);
}

export function findProvider(name: string): ProviderSpec | undefined {
  return BY_NAME.get(name);
}

export function allCapabilities(): readonly Capability[] {
  return [...new Set(PROVIDERS.flatMap((provider) => provider.capabilities))].sort((left, right) =>
    left.localeCompare(right),
  );
}
