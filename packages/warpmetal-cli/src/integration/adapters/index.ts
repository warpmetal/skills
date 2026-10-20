import { findProvider, PROVIDERS } from "../registry.js";
import { cloudflareAdapter } from "./cloudflare.js";
import { githubAdapter } from "./github.js";
import { slackAdapter } from "./slack.js";
import { emailAdapter } from "./email.js";
import { discordAdapter } from "./discord.js";
import { vercelAdapter } from "./vercel.js";
import { sentryAdapter } from "./sentry.js";
import { stripeAdapter } from "./stripe.js";
import { createTokenStatusAdapter } from "./token-status.js";
import type { Adapter } from "./types.js";

const LEGACY: readonly Adapter[] = [
  cloudflareAdapter,
  githubAdapter,
  slackAdapter,
  emailAdapter,
  discordAdapter,
  vercelAdapter,
  sentryAdapter,
  stripeAdapter,
];

const LEGACY_NAMES = new Set(LEGACY.map((adapter) => adapter.spec.name));

/**
 * Cheap, read-only "who am I" probes, so `integration status` can actually
 * verify a credential instead of only noticing that one is present. Providers
 * without an entry here report DEGRADED ("present but unverified") rather than
 * a false OK.
 */
interface Probe {
  readonly probeUrl: string;
  readonly authHeader?: (token: string) => Record<string, string>;
}

const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

const PROBES: Readonly<Record<string, Probe>> = {
  gitlab: { probeUrl: "https://gitlab.com/api/v4/user", authHeader: (t) => ({ "PRIVATE-TOKEN": t }) },
  notion: {
    probeUrl: "https://api.notion.com/v1/users/me",
    authHeader: (t) => ({ authorization: `Bearer ${t}`, "Notion-Version": "2022-06-28" }),
  },
  supabase: { probeUrl: "https://api.supabase.com/v1/projects", authHeader: bearer },
  figma: { probeUrl: "https://api.figma.com/v1/me", authHeader: (t) => ({ "X-Figma-Token": t }) },
  hubspot: { probeUrl: "https://api.hubapi.com/crm/v3/objects/contacts?limit=1", authHeader: bearer },
  asana: { probeUrl: "https://app.asana.com/api/1.0/users/me", authHeader: bearer },
  airtable: { probeUrl: "https://api.airtable.com/v0/meta/whoami", authHeader: bearer },
  intercom: { probeUrl: "https://api.intercom.io/me", authHeader: bearer },
  datadog: { probeUrl: "https://api.datadoghq.com/api/v1/validate", authHeader: (t) => ({ "DD-API-KEY": t }) },
  pagerduty: {
    probeUrl: "https://api.pagerduty.com/users/me",
    authHeader: (t) => ({ authorization: `Token token=${t}`, accept: "application/vnd.pagerduty+json;version=2" }),
  },
  calendly: { probeUrl: "https://api.calendly.com/users/me", authHeader: bearer },
  clickup: { probeUrl: "https://api.clickup.com/api/v2/user", authHeader: (t) => ({ authorization: t }) },
  circleci: { probeUrl: "https://circleci.com/api/v2/me", authHeader: (t) => ({ "Circle-Token": t }) },
  // X has no read-only endpoint that an app-only bearer can call: `/2/users/me`
  // demands user context and returns 403 for a valid app token, which would be a
  // false NEEDS_AUTH. Left unprobed on purpose (status reports DEGRADED).
  square: {
    probeUrl: "https://connect.squareup.com/v2/locations",
    authHeader: (t) => ({ authorization: `Bearer ${t}`, "Square-Version": "2024-01-18" }),
  },
  openai: { probeUrl: "https://api.openai.com/v1/models", authHeader: bearer },
  "grafana-cloud": { probeUrl: "https://grafana.com/api/instances", authHeader: bearer },
  "anthropic-admin": {
    probeUrl: "https://api.anthropic.com/v1/organizations/workspaces",
    authHeader: (t) => ({ "x-api-key": t, "anthropic-version": "2023-06-01" }),
  },
  // Plane's own validation endpoint, the one its MCP server's header auth provider
  // checks a key against: `GET /api/v1/users/me/` with the key in `x-api-key`.
  plane: { probeUrl: "https://api.plane.so/api/v1/users/me/", authHeader: (t) => ({ "x-api-key": t }) },
};

const GENERATED: readonly Adapter[] = PROVIDERS.filter(
  (spec) => !LEGACY_NAMES.has(spec.name),
).map((spec) => createTokenStatusAdapter(spec, PROBES[spec.name] ?? {}));

/**
 * The adapter table. One adapter per catalog entry, in catalog order, so
 * `providerNames()` and `adapters()` can never disagree about what exists.
 */
const ADAPTERS: readonly Adapter[] = [...LEGACY, ...GENERATED];

export function adapters(): readonly Adapter[] {
  return ADAPTERS;
}

export function findAdapter(name: string): Adapter | undefined {
  return ADAPTERS.find((adapter) => adapter.spec.name === name);
}

export function capabilitiesOf(name: string): readonly string[] {
  return findProvider(name)?.capabilities ?? [];
}

export type { Adapter, AdapterContext, AdapterResult, AdapterStatus } from "./types.js";

// A catalog entry without an adapter would be a lie in `integration list`, so
// this fails fast at import time rather than at first use.
for (const spec of PROVIDERS) {
  if (findAdapter(spec.name) === undefined) {
    throw new Error(`No adapter implements the "${spec.name}" provider declared in the catalog.`);
  }
}
