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
  | "notify.send";

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
    notes: "Channel prefixes follow the monitoring convention: slack:, telegram:, pagerduty:, email:.",
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
