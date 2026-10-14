# @warpmetal/skills-mcp

Unified MCP (Model Context Protocol) server for WarpMetal. One package, one host entry, three surfaces:

- **Content** — discovers and reads WarpMetal Agent Skills from the registry manifest
  (`registry.json`) with checksum verification and the `skill://` URI semantics the hosts already use.
- **CLI** — exposes the `warpmetal` command-line tool as 43 typed tools: 16 read-only, 3 task tools,
  and 12 plan/apply pairs, six of which guard the verbs that cannot be taken back.
- **Providers (42 providers, one catalog file each)** — 131 WarpMetal-backed provider tools (GitHub / GitLab / Notion / Stripe / Jira / Confluence / Linear / Supabase / Cloudflare / Vercel / Figma / Shopify / HubSpot / Asana / Dropbox / Discord / Airtable / Intercom / Snowflake / Sentry / Datadog / PagerDuty / Exa / Perplexity / Resend / Calendly / ClickUp / PostHog / Mixpanel / CircleCI / Mailchimp / X / Square / OpenAI / Gemini / Anthropic Admin / Grafana Cloud / Grafana Stack / Monday.com / OneSignal / Amplitude / Zendesk)
  registered only on the `full` (stdio) profile; calls run `warpmetal integration <provider> <verb>` with secrets from the WarpMetal vault. No DigitalOcean dependency.

## Two profiles, split by transport

Which tools a client can reach is decided by the transport, not by the caller. This is a security
boundary, not a configuration preference.

| Profile   | Transport                  | Tools                                             | Why                                                                         |
| --------- | -------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| `full`    | stdio (default)            | **177** — 3 `skill_*` + 43 `wm_*` + 131 providers | stdio is a local, operator-controlled channel                               |
| `content` | Streamable HTTP (`--http`) | **3** — only `skill_*`                            | HTTP has no authentication; `wm_*` and provider tools must not be reachable |

On the `content` profile the `wm_*` and provider tools are _not registered at all_, not
registered-and-refused: an absent tool cannot be argued with. The `skill://` resources are available
on both profiles, because reading a skill is a local, read-only operation that exposes no execution.

## Requirements

- Node.js **>= 22**.
- The `warpmetal` CLI, version **>= 0.8.1** — for the `wm_*` tools. Versions below 0.8.10 work,
  but `wm_version` will warn that `sandbox access install-ssh` is missing. The exact version this
  server was built and tested against is declared as an exact devDependency (`0.8.12`), and
  resolution looks in the project's own `node_modules` before anywhere else, so a local install wins.
  `npm install -g warpmetal` remains the fallback.
- **For provider tools:** `@warpmetal/cli` (env vault + `integration`), declared as an optional
  peer dependency, so install it explicitly: `npm install @warpmetal/cli`. The peer floor is
  `>=0.1.0`, the first line with `--args-stdin` and array-safe responses. Neither `@warpmetal/cli`
  nor this package is on npm yet; when releasing, publish `@warpmetal/cli` **first** so the peer
  resolves, then `@warpmetal/skills-mcp`. Store provider secrets with
  `warpmetal env store set <provider.secret>`. Without a resolvable CLI, the server logs a
  `provider_unconfigured` warning at startup and each provider `tools/call` returns
  `provider_unconfigured`; set `WARPMETAL_INTEGRATION_CLI_JS` to the CLI entry to point at a
  non-standard install.

Without the CLI the server still starts and the `skill_*` tools keep working from the registry
snapshot; every `wm_*` call then returns `FAILED` with an actionable `cli_unavailable` message rather
than failing to boot.

A CLI below the version floor is refused rather than warned about: reads still work, so the version
can be diagnosed, but every `*_apply` is answered `DENIED` before any process exists. An _unreadable_
version refuses nothing, because an override or a bare PATH executable is _unknown_ rather than old.

## Providers (42 providers, 131 tools)

Airtable tools (stdio / `full` only):

- **1.** `airtable_list_bases`

Amplitude tools (stdio / `full` only):

- **2.** `amplitude_get_flags`

Anthropic Admin tools (stdio / `full` only):

- **3.** `anthropic-admin_list_workspaces` · **4.** `anthropic-admin_list_api_keys`

Asana tools (stdio / `full` only):

- **5.** `asana_get_a_task` · **6.** `asana_create_a_project`

Calendly tools (stdio / `full` only):

- **7.** `calendly_list_event_types` · **8.** `calendly_get_current_user`

CircleCI tools (stdio / `full` only):

- **9.** `circleci_list_pipelines` · **10.** `circleci_get_pipeline_by_id`

ClickUp tools (stdio / `full` only):

- **11.** `clickup_create_task` · **12.** `clickup_get_task` · **13.** `clickup_create_task_comment`

Cloudflare tools (stdio / `full` only):

- **14.** `cloudflare_zones_get` · **15.** `cloudflare_accounts_list_accounts`

Confluence tools (stdio / `full` only):

- **16.** `confluence_get_page_by_id` · **17.** `confluence_get_pages`

Datadog tools (stdio / `full` only):

- **18.** `datadog_v1_get_ip_ranges`

Discord tools (stdio / `full` only):

- **19.** `discord_get_my_user` · **20.** `discord_list_my_guilds`

Dropbox tools (stdio / `full` only):

- **21.** `dropbox_list_folder` · **22.** `dropbox_search_files`

Exa tools (stdio / `full` only):

- **23.** `exa_web_search` · **24.** `exa_web_fetch`

Figma tools (stdio / `full` only):

- **25.** `figma_get_file` · **26.** `figma_get_file_nodes`

Gemini tools (stdio / `full` only):

- **27.** `gemini_generate_content` · **28.** `gemini_list_models`

GitHub tools (stdio / `full` only):

- **29.** `github_create_issue` · **30.** `github_list_issues` · **31.** `github_get_issue`
- **32.** `github_create_pull_request` · **33.** `github_get_pull_request` · **34.** `github_search_repositories`

GitLab tools (stdio / `full` only):

- **35.** `gitlab_list_projects` · **36.** `gitlab_create_project_issue` · **37.** `gitlab_create_merge_request`

Grafana Cloud tools (stdio / `full` only):

- **38.** `grafana-cloud_list_stacks` · **39.** `grafana-cloud_get_org`

Grafana Stack tools (stdio / `full` only):

- **40.** `grafana-stack_health` · **41.** `grafana-stack_get_current_user` · **42.** `grafana-stack_search`
- **43.** `grafana-stack_get_dashboard` · **44.** `grafana-stack_list_datasources` · **45.** `grafana-stack_check_datasource_health`
- **46.** `grafana-stack_list_folders` · **47.** `grafana-stack_list_alert_rules` · **48.** `grafana-stack_list_annotations`
- **49.** `grafana-stack_list_contact_points` · **50.** `grafana-stack_list_mute_timings` · **51.** `grafana-stack_list_dashboard_tags`
- **52.** `grafana-stack_search_teams` · **53.** `grafana-stack_list_org_users` · **54.** `grafana-stack_list_library_elements`

HubSpot tools (stdio / `full` only):

- **55.** `hubspot_crm_contacts_list` · **56.** `hubspot_crm_contacts_create` · **57.** `hubspot_crm_deals_list`

Intercom tools (stdio / `full` only):

- **58.** `intercom_list_all_contacts` · **59.** `intercom_create_contact`

Jira tools (stdio / `full` only):

- **60.** `jira_create_issue` · **61.** `jira_get_issue` · **62.** `jira_add_comment`
- **63.** `jira_transition_issue` · **64.** `jira_get_project`

Linear tools (stdio / `full` only):

- **65.** `linear_create_issue` · **66.** `linear_list_issues` · **67.** `linear_get_issue`
- **68.** `linear_create_comment`

Mailchimp tools (stdio / `full` only):

- **69.** `mailchimp_list_campaigns` · **70.** `mailchimp_add_member_to_list`

Mixpanel tools (stdio / `full` only):

- **71.** `mixpanel_track_event` · **72.** `mixpanel_raw_event_export`

Monday.com tools (stdio / `full` only):

- **73.** `monday_boards` · **74.** `monday_get_workspaces`

Notion tools (stdio / `full` only):

- **75.** `notion_search` · **76.** `notion_query_database` · **77.** `notion_get_page`
- **78.** `notion_create_page` · **79.** `notion_append_block_children`

OneSignal tools (stdio / `full` only):

- **80.** `onesignal_view_an_app`

OpenAI tools (stdio / `full` only):

- **81.** `openai_list_models`

PagerDuty tools (stdio / `full` only):

- **82.** `pagerduty_list_incidents` · **83.** `pagerduty_create_incident` · **84.** `pagerduty_list_services`

Perplexity tools (stdio / `full` only):

- **85.** `perplexity_chat_completion` · **86.** `perplexity_search`

PostHog tools (stdio / `full` only):

- **87.** `posthog_list_project_dashboards` · **88.** `posthog_get_feature_flags_matching_ids`

Resend tools (stdio / `full` only):

- **89.** `resend_list_emails` · **90.** `resend_create_contact`

Sentry tools (stdio / `full` only):

- **91.** `sentry_list_organization_projects` · **92.** `sentry_list_a_project_s_issues`

Shopify tools (stdio / `full` only):

- **93.** `shopify_list_products` · **94.** `shopify_get_product` · **95.** `shopify_list_orders`

Snowflake tools (stdio / `full` only):

- **96.** `snowflake_list_databases` · **97.** `snowflake_list_tables`

Square tools (stdio / `full` only):

- **98.** `square_list_payments` · **99.** `square_create_payment` · **100.** `square_list_customers`

Stripe tools (stdio / `full` only):

- **101.** `stripe_post_customers` · **102.** `stripe_get_customers` · **103.** `stripe_post_payment_intents`
- **104.** `stripe_get_payment_intents` · **105.** `stripe_get_balance` · **106.** `stripe_post_invoices`

Supabase tools (stdio / `full` only):

- **107.** `supabase_list_projects` · **108.** `supabase_create_a_project` · **109.** `supabase_apply_a_migration`

Vercel tools (stdio / `full` only):

- **110.** `vercel_get_projects` · **111.** `vercel_create_project` · **112.** `vercel_get_deployments`

X tools (stdio / `full` only):

- **113.** `x_create_posts` · **114.** `x_get_users_me` · **115.** `x_search_posts_recent`

Zendesk tools (stdio / `full` only):

- **116.** `zendesk_list_tickets` · **117.** `zendesk_get_ticket` · **118.** `zendesk_list_ticket_comments`
- **119.** `zendesk_search` · **120.** `zendesk_get_current_user` · **121.** `zendesk_list_users`
- **122.** `zendesk_list_organizations` · **123.** `zendesk_list_views` · **124.** `zendesk_list_view_tickets`
- **125.** `zendesk_create_ticket` · **126.** `zendesk_add_ticket_comment` · **127.** `zendesk_update_ticket`
- **128.** `zendesk_get_user` · **129.** `zendesk_get_organization` · **130.** `zendesk_count_view_tickets`
- **131.** `zendesk_get_ticket_metrics`

Setup:

1. Install `@warpmetal/cli` (provides `warpmetal env` and `warpmetal integration`).
2. Store provider secrets in the vault, for example:
   `warpmetal env store set github.token --stdin`
3. For site-scoped providers, also store `jira.site`, `confluence.site`, `shopify.shop`,
   `zendesk.subdomain`, etc., plus the account email where the provider needs one to build the
   credential (`jira.email` and `confluence.email` for `Basic base64(email:token)`,
   `zendesk.email` for `Basic base64(email/token:api_token)`)
   (`warpmetal env plan` shows what each provider expects.)
4. Start stdio:

```sh
npx -y @warpmetal/skills-mcp
```

Each provider `tools/call` maps to `warpmetal integration <provider> <verb> --args-stdin --json`
(and `--confirm <gate>` for mutations). The arguments are written to the CLI's stdin rather than the
command line, so payloads never appear in `ps` or shell history; `--args-json` remains available for
manual use. Catalog contracts live in `src/providers/catalog/` - one `<toolkitId>.json` per
provider (42 files, 131 tools), aggregated by `src/providers/catalog.ts`. `catalog/index.ts` is
generated by `node packages/skills-mcp/scripts/gen-catalog-barrel.mjs`. The MCP never holds
provider OAuth tokens in process env; they stay in the WarpMetal vault.

### Provider secrets

Store the primary secret for each provider you use. Providers marked _contextual_ also need extra
secrets to build the request URL or an auth header; without them, `integration status` reports
`DEGRADED` with a warning and the affected tools fail rather than sending a malformed request.

| Provider        | Primary secret                                                                              | Contextual secrets                                    |
| --------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| GitHub          | `github.token`                                                                              | —                                                     |
| GitLab          | `gitlab.token`                                                                              | —                                                     |
| Notion          | `notion.token`                                                                              | —                                                     |
| Jira            | `jira.token`                                                                                | `jira.site`, `jira.email`                             |
| Confluence      | `confluence.token`                                                                          | `confluence.site`, `confluence.email`                 |
| Linear          | `linear.token`                                                                              | —                                                     |
| Supabase        | `supabase.token`                                                                            | —                                                     |
| Cloudflare      | `cloudflare.token`                                                                          | —                                                     |
| Vercel          | `vercel.token`                                                                              | —                                                     |
| Figma           | `figma.token`                                                                               | —                                                     |
| Shopify         | `shopify.token`                                                                             | `shopify.shop`                                        |
| HubSpot         | `hubspot.token`                                                                             | —                                                     |
| Asana           | `asana.token`                                                                               | —                                                     |
| Dropbox         | `dropbox.token`                                                                             | —                                                     |
| Discord         | `discord.token`                                                                             | —                                                     |
| Airtable        | `airtable.token`                                                                            | —                                                     |
| Intercom        | `intercom.token`                                                                            | —                                                     |
| Snowflake       | `snowflake.token`                                                                           | `snowflake.account_url`, `snowflake.warehouse`        |
| Sentry          | `sentry.token`                                                                              | —                                                     |
| Datadog         | `datadog.token`                                                                             | —                                                     |
| PagerDuty       | `pagerduty.token`                                                                           | `pagerduty.email` (the API `From` header)             |
| Exa             | `exa.token`                                                                                 | —                                                     |
| Perplexity      | `perplexity.token`                                                                          | —                                                     |
| Resend (email)  | `email.api_key`                                                                             | —                                                     |
| Calendly        | `calendly.token`                                                                            | —                                                     |
| ClickUp         | `clickup.token`                                                                             | —                                                     |
| PostHog         | `posthog.token`                                                                             | `posthog.host` (defaults to `https://us.posthog.com`) |
| Mixpanel        | `mixpanel.token` (Export API only: base64 of `service_account_user:service_account_secret`) | —                                                     |
| CircleCI        | `circleci.token`                                                                            | —                                                     |
| Mailchimp       | `mailchimp.token`                                                                           | `mailchimp.dc` (defaults to `us1`)                    |
| X               | `x.token`                                                                                   | —                                                     |
| Square          | `square.token`                                                                              | —                                                     |
| OpenAI          | `openai.token`                                                                              | —                                                     |
| Google Gemini   | `gemini.token`                                                                              | —                                                     |
| Anthropic Admin | `anthropic-admin.token`                                                                     | —                                                     |
| Grafana Cloud   | `grafana-cloud.token`                                                                       | —                                                     |
| Grafana Stack   | `grafana-stack.token`                                                                       | `grafana.stack` (the label in `<stack>.grafana.net`)  |
| Monday.com      | `monday.token`                                                                              | —                                                     |
| OneSignal       | `onesignal.token`                                                                           | —                                                     |
| Amplitude       | `amplitude.token`                                                                           | —                                                     |
| Zendesk         | `zendesk.token`                                                                             | `zendesk.subdomain`, `zendesk.email`                  |

### How the provider requests are verified

Each tool is verified at one of three tiers, and the tier is visible in the repo:

- **live-verified** — the request was exercised against the real API with a credential.
- **docs-confirmed** — the request shape was checked against the provider's published API
  reference, pinned in `packages/warpmetal-cli/test/fixtures/provider-contracts.json` (host, HTTP
  method and auth header) and enforced by `provider-contract.test.ts`.
- **experimental** — the shape could not be confirmed; see below.

Two credential-free checks back the docs-confirmed tier, so a builder that drifts is caught even
without a token:

1. `provider-contract.test.ts` builds all 131 requests from the reviewed sample args and asserts the
   URL host, method and auth header against the hand-authored manifest.
2. `npm run probe` (in `packages/warpmetal-cli`, opt-in, needs network) sends every request with a
   sentinel token. A route the provider does not serve answers 404/405, while a real route answers
   401/403 (auth required), 400/422 (reachable) or 2xx (public). It also sends a control request to a
   bogus path on each host, so auth-first hosts and website/SPA hosts that resolve a slug before
   authenticating are marked `weakSignal` rather than reported as a missing route. The same logic
   runs as `MCP_PROBE=1 npm test`.

### Response shape

A tool's `data` is the provider body. When the provider's root is a JSON **array**, it is returned
under `items`; an object root is returned as-is; a non-JSON body is returned under `raw`. Every
result also carries `toolSlug` so a client can route the response back to the tool that produced it.
This is why `github_list_issues` (array root) answers `{ items: [...], toolSlug: "github_list_issues" }`
and never `{ "0": ..., "1": ... }`.

### Experimental tools

Tools whose request shape could not be confirmed against the live API are registered with an
`[experimental: request shape not verified against the live API]` prefix on their description:

- `x_create_posts` — X rejects app-only bearer tokens on the write endpoint; publishing needs an
  OAuth 2.0 token with user context, which this server does not collect yet.

The marker is informational: the tool still registers and can be called.

### Destructive tools

Mutating tools carry `destructiveHint: true` only when the action is irreversible or carries direct
cost (payments, external publishing, billed infrastructure, permanent migrations). A client should
treat those as requiring confirmation.

The `--confirm <gate>` flag that the CLI requires is injected by **this server**, not by the caller:
it proves the server routed a mutating verb, not that a human approved it. Consent is the client's
responsibility, and `destructiveHint` is the signal to build it on. See [SECURITY.md](SECURITY.md)
for what the gate does and does not prove.

## Run

```sh
# stdio, full profile (177 tools: 3 skill_* + 43 wm_* + 131 providers)
npx -y @warpmetal/skills-mcp

# Pin a registry tag
npx -y @warpmetal/skills-mcp --tag v1.2.3

# Local registry directory (development)
node dist/index.js --registry /path/to/skills

# Never fetch; use the cached or bundled registry
node dist/index.js --offline

# Streamable HTTP, content profile (3 tools)
npx -y @warpmetal/skills-mcp --http --host 0.0.0.0 --port 8080
```

Docker:

```sh
docker run --rm -it ghcr.io/warpmetal/skills-mcp:latest
docker run --rm -p 8080:8080 ghcr.io/warpmetal/skills-mcp:latest --http
curl -fsS http://127.0.0.1:8080/readyz
```

## Registry resolution

1. `--registry <url|path>` or `WARPMETAL_SKILLS_REGISTRY`
2. `<catalog>/<tag>/registry.json`, where the tag defaults to `latest` and the catalog base defaults
   to `https://skills.warpmetal.com` (`WARPMETAL_SKILLS_REGISTRY_URL`)
3. Cached copy from a previous load, revalidated with an `ETag` and reported as `stale: true` when the
   catalog is unreachable
4. Bundled snapshot shipped with the package, also reported as `stale: true`

New skills and updates appear by publishing a registry release; no server or CLI republish is needed.
Manifest reads are cached and revalidated; file bodies are fetched from the catalog and verified
against the manifest checksum on every read. In cached or offline mode, listings work but file reads
require the network (v1).

## Private registries

The server has no per-skill visibility flag. A process serves exactly the registry it loaded, so
isolating internal skills means running a second instance against a second registry, not asking one
instance to hide part of its own.

```sh
# Public instance: the hosted catalog, unauthenticated.
npx -y @warpmetal/skills-mcp

# Internal instance: the private bundle mounted read-only, reached only over a
# private network. A missing or unreadable path fails with `registry_unavailable`,
# so nothing is silently answered from the public catalog.
node dist/index.js --http --registry /registry

# Internal instance over an authenticated catalog: the token is sent as a header.
node dist/index.js --http \
  --registry https://<internal-catalog>/registry.internal.json \
  --registry-token-file /run/secrets/registry.token
```

Three properties make this a boundary rather than a filter:

- `--registry <path>` loads a local registry and reads files from that directory. A name the registry
  does not declare is `not_found`: an absent skill cannot be read, the same way an absent tool cannot
  be called.
- A missing or unreadable `--registry <path>` fails with `registry_unavailable`. A local path has no
  fallback, so an unreachable bundle is never answered from the public catalog.
- `--registry <url>` is different: a `401`/`403` fails closed with `registry_unauthorized`, but a plain
  network failure still falls back to the cached copy and then the bundled **public** snapshot, marked
  `stale: true`. If an internal instance must never serve public content, mount the bundle on a local
  path instead of pointing at a URL.

Because the process carries exactly one registry, keep the private manifest and its files off the
public catalog host: the manifest lists every skill name, description and per-file checksum.
Authenticate the internal endpoint at the edge, since the HTTP transport itself has no
authentication. See [SECURITY.md](SECURITY.md) and
[`internal-skills/README.md`](../../internal-skills/README.md).

## Tools

### Content (`skill_*`) — both profiles

| Tool           | Purpose                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `skill_list`   | List skills with version, description, roles, hosts, and files; optional `role`/`host` filters |
| `skill_search` | Rank skills by name, tag, description, role, and host matches; bounded `limit`                 |
| `skill_read`   | Read `SKILL.md` or a listed supporting file; checksum verified before returning                |

Resources: `skill://<name>` and `skill://<name>/<relative-path>`. Absolute paths, `..` traversal,
escaped paths, and unlisted files are rejected.

All three take a strict input schema, so an undeclared argument is an error rather than something
silently ignored. `skill_list` and `skill_search` also return their JSON payload as
`structuredContent`, validated against a declared output schema.

### CLI (`wm_*`) — `full` profile only

Read-only (16): `wm_version`, `wm_health`, `wm_catalog`, `wm_state_list`, `wm_identity_list`,
`wm_server_get`, `wm_server_identity`, `wm_server_login`, `wm_operation_get`, `wm_runtime_get`,
`wm_sandbox_list`, `wm_sandbox_get`, `wm_order_status`, `wm_sandbox_access_list`,
`wm_sandbox_access_get`, `wm_manual_review_list`.

Tasks (3): `wm_task_list`, `wm_task_get`, `wm_task_wait`.

Plan/apply pairs (12):

| Non-destructive              | Irreversible, behind the hardened gate |
| ---------------------------- | -------------------------------------- |
| `wm_runtime_enable_*`        | `wm_server_power_*`                    |
| `wm_runtime_install_*`       | `wm_server_reload_*`                   |
| `wm_sandbox_create_*`        | `wm_sandbox_delete_*`                  |
| `wm_sandbox_action_*`        | `wm_sandbox_lifecycle_*`               |
| `wm_sandbox_access_keygen_*` | `wm_sandbox_access_revoke_*`           |
| `wm_sandbox_access_grant_*`  | `wm_sandbox_access_refresh_*`          |

Purchase and renewal tools, `sandbox connect`, the credential-writing commands (`access install-ssh`,
`access remove-ssh`, key rotation) and `agent install` have no entry in the command registry, so this
server cannot reach them even by mistake.

## Why a CLI surface instead of "let the agent shell out"

A CLI is text in and text out. That is a poor interface for an agent: exit codes get lost, secrets end
up in transcripts, and every caller re-invents quoting. This server puts six things between the model
and the CLI:

| Concern                | How it is handled                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Command injection      | Closed command registry, `spawn` with `shell: false`, never `exec()` with a string                                              |
| Secrets in transcripts | Deny-list redaction by key and by value shape; every redaction is reported                                                      |
| Lost exit codes        | One envelope, one exit-code table, complete from day one                                                                        |
| Unapproved mutations   | A two-phase gate: a plan mints a single-use token bound to the exact resolved argv                                              |
| Unnamed destruction    | A consequence class the apply must echo, a re-verification after approval, and a disk-backed refusal to retry a `manual_review` |
| Resource exhaustion    | A FIFO concurrency ceiling on CLI processes, and a server-side bounded poll loop instead of a blocking CLI call                 |
| Silent protocol drift  | Static tests that fail if an HTTP client, a blocking flag or an unreviewed destructive verb appears                             |

None of these enable an unapproved action: the `_plan` tool names the effect, and the `_apply` tool
accepts only the token that effect produced, once. See [SECURITY.md](SECURITY.md) for what the gate
does _not_ prove.

## Host configuration

Give the server a name and let the transport pick the profile. Everything below points at stdio, which
is `full`.

omp (`~/.omp/agent/mcp.json`):

```json
{
  "mcpServers": {
    "warpmetal-mcp": {
      "command": "npx",
      "args": ["-y", "@warpmetal/skills-mcp"]
    }
  }
}
```

OpenCode:

```sh
opencode mcp add warpmetal-mcp -- npx -y @warpmetal/skills-mcp
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.warpmetal-mcp]
command = "npx"
args = ["-y", "@warpmetal/skills-mcp"]
```

Claude Code / Cursor (`.mcp.json`, `.cursor/mcp.json`): the same `mcpServers` shape as omp.
A checkout works the same way, with an absolute path:

```json
{
  "mcpServers": {
    "warpmetal-mcp": {
      "command": "node",
      "args": [
        "/path/to/skills/packages/skills-mcp/dist/index.js",
        "--registry",
        "/path/to/skills"
      ]
    }
  }
}
```

DeepSeek Harness (`dsh-mcp-client` entry):

```yaml
- id: mcp-warpmetal-mcp
  name: "@deepseek-ai/dsh-mcp-client"
  config:
    serverName: warpmetal-mcp
    transport: stdio
    command: npx
    args: ["-y", "@warpmetal/skills-mcp"]
```

dsh scrubs ambient variables matching `KEY|PASSWORD|SECRET|TOKEN` before launching stdio servers. That
scrubbing is exactly why the CLI tools take no credential through the environment: the server relies on
the CLI's own on-disk identity. Switch to `transport: streamable-http` with `url` to use a self-hosted
container instead, and note that HTTP then serves the `content` profile only. The same scrubbing drops
`WARPMETAL_SKILLS_REGISTRY_TOKEN` when you point the server at an authenticated registry, so use
`--registry-token-file /run/secrets/registry.token` there: the credential stays out of both the
environment and the process list.

Remote HTTP (any host that supports Streamable HTTP):

```json
{
  "mcpServers": {
    "warpmetal-mcp": {
      "type": "http",
      "url": "https://skills.warpmetal.com/mcp"
    }
  }
}
```

The hosted HTTP endpoint is not deployed yet; run the container yourself until it is.

### Authenticated (private) registries

Internal skills live in a second registry under `internal-skills/` in the same repository, built with
`npm run build:internal` into `registry.internal.json` and `snapshot.internal/`. The public catalog
never serves them. Run a dedicated instance against the internal registry:

```sh
# Local bundle (no endpoint, no token)
node dist/index.js --http --registry /path/to/snapshot.internal

# Authenticated remote catalog
node dist/index.js --http \
  --registry https://<internal-catalog>/registry.internal.json \
  --registry-token-file /run/secrets/registry.token
```

With a token configured, every manifest and file request carries `Authorization: Bearer <token>`; see
[Private registries](#private-registries) for the failure semantics and [SECURITY.md](SECURITY.md) for
what the token does and does not guarantee. The token must exist only on the internal instance: if the
public instance received it, that instance would serve these skills too.

## Options

| Flag                           | Meaning                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `--registry <url\|path>`       | Load `registry.json` from a URL or local directory                 |
| `--tag <version>`              | Pin a registry tag from the catalog host (default: `latest`)       |
| `--offline`                    | Never fetch; use cache or the bundled snapshot                     |
| `--cache-dir <path>`           | Override the registry cache directory                              |
| `--registry-token-file <path>` | Read a bearer token from a file; sent to an authenticated registry |
| `--http`, `--host`, `--port`   | HTTP transport settings (selects the `content` profile)            |
| `--version`, `--help`          | Print version or help                                              |

## Environment

Registry (content surface): `WARPMETAL_SKILLS_REGISTRY`, `WARPMETAL_SKILLS_REGISTRY_URL`,
`WARPMETAL_SKILLS_REGISTRY_TOKEN` (bearer token for an authenticated registry),
`WARPMETAL_SKILLS_HOST`, `PORT`, `XDG_CACHE_HOME`.

CLI surface: `WARPMETAL_MCP_AUDIT` (set to `0` to disable the audit log), `WARPMETAL_MCP_AUDIT_DIR`
(audit log and latch directory), `WM_MAX_CONCURRENT_CLI` (concurrency ceiling, default 4, capped at
64), `WARPMETAL_CLI_JS` (explicit CLI entry override) and `WARPMETAL_MCP_CLI_ROOT` (project root whose
`node_modules` should win).

## Development

```sh
npm ci
npm run build
npm run typecheck
npm test               # content + conformance (109 cases) + HTTP profile tests
npm run test:contract  # the installed CLI honours the surface this server builds on
npm run test:live      # needs WARPMETAL_MCP_LIVE=1 and the WarpMetal service
```

Snapshot generation lives in the repository root: `npm run build` (root) writes
`packages/skills-mcp/snapshot/` before packing or publishing.

## Security

See [SECURITY.md](SECURITY.md).
