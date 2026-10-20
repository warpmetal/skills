# @warpmetal/skills-mcp

Unified MCP (Model Context Protocol) server for WarpMetal. One package, one host entry, three surfaces:

- **Content** — discovers and reads WarpMetal Agent Skills from the registry manifest
  (`registry.json`) with checksum verification and the `skill://` URI semantics the hosts already use.
- **CLI** — exposes the `warpmetal` command-line tool as 43 typed tools: 15 read-only, 4 task tools,
  and 12 plan/apply pairs, five of which guard the verbs that cannot be taken back.
- **Providers (43 providers, one catalog file each)** — 1331 WarpMetal-backed provider tools (GitHub / GitLab / Notion / Stripe / Jira / Confluence / Linear / Supabase / Cloudflare / Vercel / Figma / Shopify / HubSpot / Asana / Dropbox / Discord / Airtable / Intercom / Snowflake / Sentry / Datadog / PagerDuty / Exa / Perplexity / Resend / Calendly / ClickUp / PostHog / Mixpanel / CircleCI / Mailchimp / X / Square / OpenAI / Gemini / Anthropic Admin / Grafana Cloud / Grafana Stack / Monday.com / OneSignal / Amplitude / Zendesk / Plane)
  registered only on the `full` (stdio) profile; calls run `warpmetal integration <provider> <verb>` with secrets from the WarpMetal vault. No DigitalOcean dependency.

## Two profiles, split by transport

Which tools a client can reach is decided by the transport, not by the caller. This is a security
boundary, not a configuration preference.

| Profile   | Transport                  | Tools                                             | Why                                                                         |
| --------- | -------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| `full`    | stdio (default)            | **1377** — 3 `skill_*` + 43 `wm_*` + 1331 providers | stdio is a local, operator-controlled channel                               |
| `content` | Streamable HTTP (`--http`) | **3** — only `skill_*`                            | HTTP has no authentication; `wm_*` and provider tools must not be reachable |

On the `content` profile the `wm_*` and provider tools are _not registered at all_, not
registered-and-refused: an absent tool cannot be argued with. The `skill://` resources are available
on both profiles, because reading a skill is a local, read-only operation that exposes no execution.

The `full` surface is deliberately one surface: after the Cloudflare waves and Plane's first
wave it is 1377 tools, and
there is no per-provider or per-wave selector on purpose. A third axis would turn a security
boundary into a configuration surface with its own failure modes, and two clients could then
disagree about what exists. The names are stable and grouped by provider, so a client that finds
1377 tools in `tools/list` is expected to filter them itself.

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

<!-- provider-index:begin -->

## Providers (43 providers, 1331 tools)

Every tool below is registered on the `full` (stdio) profile and calls `warpmetal integration
<provider> <verb>` with secrets from the WarpMetal vault; the arguments, the endpoint and the
token permission are declared in the provider's own catalog file under `src/providers/catalog/`.
A provider with more tools than fit on one line points at its file instead of listing them.

| Provider | Tools | Registered |
| -------- | ----- | ---------- |
| `airtable` | 1 | `list_bases` |
| `amplitude` | 1 | `get_flags` |
| `anthropic-admin` | 2 | `list_workspaces`, `list_api_keys` |
| `asana` | 2 | `get_a_task`, `create_a_project` |
| `calendly` | 2 | `list_event_types`, `get_current_user` |
| `circleci` | 2 | `list_pipelines`, `get_pipeline_by_id` |
| `clickup` | 3 | `create_task`, `get_task`, `create_task_comment` |
| `cloudflare` | 1142 | `catalog/cloudflare.json` |
| `confluence` | 2 | `get_page_by_id`, `get_pages` |
| `datadog` | 1 | `v1_get_ip_ranges` |
| `discord` | 2 | `get_my_user`, `list_my_guilds` |
| `dropbox` | 2 | `list_folder`, `search_files` |
| `exa` | 2 | `web_search`, `web_fetch` |
| `figma` | 2 | `get_file`, `get_file_nodes` |
| `gemini` | 2 | `generate_content`, `list_models` |
| `github` | 6 | `create_issue`, `list_issues`, `get_issue`, `create_pull_request`, `get_pull_request`, `search_repositories` |
| `gitlab` | 3 | `list_projects`, `create_project_issue`, `create_merge_request` |
| `grafana-cloud` | 2 | `list_stacks`, `get_org` |
| `grafana-stack` | 15 | `catalog/grafana-stack.json` |
| `hubspot` | 3 | `crm_contacts_list`, `crm_contacts_create`, `crm_deals_list` |
| `intercom` | 2 | `list_all_contacts`, `create_contact` |
| `jira` | 5 | `create_issue`, `get_issue`, `add_comment`, `transition_issue`, `get_project` |
| `linear` | 4 | `create_issue`, `list_issues`, `get_issue`, `create_comment` |
| `mailchimp` | 2 | `list_campaigns`, `add_member_to_list` |
| `mixpanel` | 2 | `track_event`, `raw_event_export` |
| `monday` | 2 | `boards`, `get_workspaces` |
| `notion` | 5 | `search`, `query_database`, `get_page`, `create_page`, `append_block_children` |
| `onesignal` | 1 | `view_an_app` |
| `openai` | 1 | `list_models` |
| `pagerduty` | 3 | `list_incidents`, `create_incident`, `list_services` |
| `perplexity` | 2 | `chat_completion`, `search` |
| `plane` | 60 | `catalog/plane.json` |
| `posthog` | 2 | `list_project_dashboards`, `get_feature_flags_matching_ids` |
| `resend` | 2 | `list_emails`, `create_contact` |
| `sentry` | 2 | `list_organization_projects`, `list_a_project_s_issues` |
| `shopify` | 3 | `list_products`, `get_product`, `list_orders` |
| `snowflake` | 2 | `list_databases`, `list_tables` |
| `square` | 3 | `list_payments`, `create_payment`, `list_customers` |
| `stripe` | 6 | `post_customers`, `get_customers`, `post_payment_intents`, `get_payment_intents`, `get_balance`, `post_invoices` |
| `supabase` | 3 | `list_projects`, `create_a_project`, `apply_a_migration` |
| `vercel` | 3 | `get_projects`, `create_project`, `get_deployments` |
| `x` | 3 | `create_posts`, `get_users_me`, `search_posts_recent` |
| `zendesk` | 16 | `catalog/zendesk.json` |
| **43 providers** | **1331** | `src/providers/catalog/` |

Cloudflare's record is the reviewed one:
[`docs/cloudflare-api-inventory.md`](../../docs/cloudflare-api-inventory.md) accounts for every
operation of the API - the filter that dropped it or the tool that shipped for it - grouped by
the wave it was reviewed in.

| Wave | Tools | Status | Scope |
| ---- | ----- | ------ | ----- |
| `w1` | 45 | reviewed | Zonas, DNS, ajustes de zona, cache y tokens de identidad |
| `w2` | 278 | reviewed | Almacenamiento y computo: R2, KV, D1, Workers, Queues, Pages |
| `w3` | 330 | reviewed | Zero Trust y Access: apps, politicas, identity providers, gateway |
| `w4` | 173 | reviewed | Observabilidad y analitica: logs, analytics, alertas, WAF |
| `w5` | 316 | reviewed | Radar y el resto de colecciones de cuenta con valor operativo |

<!-- provider-index:end -->

Plane publishes no OpenAPI document, so its two records are the pin and the map:
[`docs/plane-mcp-inventory.md`](../../docs/plane-mcp-inventory.md) says what the pinned release of
Plane's own MCP server declares and why each action we left out was left out, and
[`docs/plane-endpoint-map.md`](../../docs/plane-endpoint-map.md) gives every shipped tool its
request and the vendor call site that request was read from.

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
provider (43 files, 1331 tools), aggregated by `src/providers/catalog.ts`. `catalog/index.ts` is
generated by `node packages/skills-mcp/scripts/gen-catalog-barrel.mjs`. The MCP never holds
provider OAuth tokens in process env; they stay in the WarpMetal vault.

### Regenerating the Cloudflare surface

Cloudflare's catalog is generated from the reviewed allowlist
(`packages/warpmetal-cli/scripts/cloudflare/allowlist.json`), and the artifacts depend on each
other, so the order matters:

1. `node packages/warpmetal-cli/scripts/gen-cloudflare-routes.mjs` — the CLI's route builders
2. `node packages/skills-mcp/scripts/gen-cloudflare-catalog.mjs` — this package's tool schemas
3. `node packages/skills-mcp/scripts/gen-mapping.mjs` — the provider/verb mapping
4. `npm --prefix packages/warpmetal-cli run gen:mcp-tools` — the CLI's `mcp-tools/catalog.ts`
5. `node packages/warpmetal-cli/scripts/gen-cloudflare-params.mjs` — the distilled-spec fixture
6. `npm --prefix packages/warpmetal-cli run gen:mcp-fixtures` — the request-contract fixtures
7. `node packages/warpmetal-cli/scripts/gen-cloudflare-inventory.mjs` — the coverage documents
8. `node packages/skills-mcp/scripts/gen-readme-index.mjs` — the provider index in this file

Steps 2, 7 and 8 and the CLI's fixture generator take a `--check` that fails when the committed
file is stale, which is how a wave is reviewed without the 26 MB spec being in the repository.

`verify.yml` cannot see any of this: `npm run build` does not regenerate these files, so its
`git diff --exit-code` step says nothing about them. `.github/workflows/spec-drift.yml` covers the
gap - scheduled only, never a merge gate - by fetching the public spec, comparing its digest with
the one the artifacts record (`spec.sha256` in the allowlist, cross-checked against `source.sha256`
in the parameter fixture) and running the generators above in that order, plus the catalog barrel,
which is generated from the provider files. A diff with a matching digest is stale committed output
and fails the job; a moved digest makes the allowlist refuse the document by design, so the job
reports the move and stays green, because adopting new surface is a wave rather than a CI fix.

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

1. `provider-contract.test.ts` builds all 1331 requests from the reviewed sample args and asserts the
   URL host, method and auth header against the hand-authored manifest.
2. `npm run probe` (in `packages/warpmetal-cli`, opt-in, needs network) sends every request with a
   sentinel token. A route the provider does not serve answers 404/405, while a real route answers
   401/403 (auth required), 400/422 (reachable) or 2xx (public). It also sends a control request to a
   bogus path on each host, so auth-first hosts and website/SPA hosts that resolve a slug before
   authenticating are marked `weakSignal` rather than reported as a missing route. The same logic
   runs as `MCP_PROBE=1 npm test`, and `npm run probe:record` writes the per-tool verdicts to the
   committed `probe-verdicts.json` fixture that the scheduled `probe-drift.yml` workflow refreshes.

### Response shape

A tool's `data` is the provider body. When the provider's root is a JSON **array**, it is returned
under `items`; an object root is returned as-is; a non-JSON body is returned under `raw`. Every
result also carries `toolSlug` so a client can route the response back to the tool that produced it.
This is why `github_list_issues` (array root) answers `{ items: [...], toolSlug: "github_list_issues" }`
and never `{ "0": ..., "1": ... }`.

### Experimental tools

Tools whose request shape could not be confirmed against the live API are registered with an
`[experimental: request shape not verified against the live API]` prefix on their description.

The set is derived, not hand-edited: `scripts/gen-experimental.mjs` marks as experimental every tool
the credential-free route probe proved does not exist (`invalid-route` and not `weakSignal`), plus a
small reasoned override list for routes that exist but whose credential mode this server does not
support (`scripts/experimental-overrides.json`). The probe verdicts are recorded into
`packages/warpmetal-cli/test/fixtures/probe-verdicts.json` by the scheduled `probe-drift.yml`
workflow, and `check:experimental` (part of `check:providers-offline`) fails a pull request that
edits the derived list by hand.

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
# stdio, full profile (1377 tools: 3 skill_* + 43 wm_* + 1331 providers)
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
