/**
 * Environment for the Action Gateway bridge.
 *
 * Secrets stay in process env; Connections (GitHub/GitLab/Notion/Stripe/Jira/
 * Confluence/Linear/Supabase/Cloudflare/Vercel/Figma/Shopify/HubSpot/Asana/
 * Dropbox/Discord/Airtable/Intercom/Snowflake/Sentry/Datadog/PagerDuty/Exa/
 * Perplexity/Resend/Calendly/ClickUp/PostHog/Mixpanel/CircleCI/Mailchimp/X/
 * Square/OpenAI/Gemini/Anthropic Admin/Grafana Cloud/Monday.com/OneSignal/
 * Amplitude) live on the DigitalOcean actor, not in this package.
 */

export interface ActionGatewayEnv {
  token: string | null;
  actorId: string | null;
  /** Optional pre-created session MCP URL; skips session.create when set with token+actor. */
  sessionUrl: string | null;
}

export function readActionGatewayEnv(
  env: NodeJS.ProcessEnv = process.env,
): ActionGatewayEnv {
  const token = trimOrNull(env["DIGITALOCEAN_TOKEN"]);
  const actorId = trimOrNull(env["DIGITALOCEAN_AG_ACTOR_ID"]);
  const sessionUrl = trimOrNull(env["DIGITALOCEAN_AG_SESSION_URL"]);
  return { token, actorId, sessionUrl };
}

export function isActionGatewayConfigured(config: ActionGatewayEnv): boolean {
  if (!config.token) return false;
  // Session URL alone is not enough: transport still needs the actor header + token.
  return Boolean(config.actorId);
}

function trimOrNull(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
