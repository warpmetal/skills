# @warpmetal/skills-mcp

Unified MCP (Model Context Protocol) server for WarpMetal. One package, one host entry, three surfaces:

- **Content** — discovers and reads WarpMetal Agent Skills from the registry manifest
  (`registry.json`) with checksum verification and the `skill://` URI semantics the hosts already use.
- **CLI** — exposes the `warpmetal` command-line tool as 43 typed tools: 16 read-only, 3 task tools,
  and 12 plan/apply pairs, six of which guard the verbs that cannot be taken back.
- **Action Gateway (batches 01-10)** — 100 DigitalOcean Action Gateway tools (GitHub / GitLab / Notion / Stripe / Jira / Confluence / Linear / Supabase / Cloudflare / Vercel / Figma / Shopify / HubSpot / Asana / Dropbox / Discord / Airtable / Intercom / Snowflake / Sentry / Datadog / PagerDuty / Exa / Perplexity / Resend / Calendly / ClickUp / PostHog / Mixpanel / CircleCI / Mailchimp / X / Square / OpenAI / Gemini / Anthropic Admin / Grafana Cloud / Monday.com / OneSignal / Amplitude)
  registered only on the `full` (stdio) profile; calls create an AG session and run `action_invoke`.

## Two profiles, split by transport

Which tools a client can reach is decided by the transport, not by the caller. This is a security
boundary, not a configuration preference.

| Profile | Transport | Tools | Why |
| --- | --- | --- | --- |
| `full` | stdio (default) | **146** — 3 `skill_*` + 43 `wm_*` + 100 AG | stdio is a local, operator-controlled channel |
| `content` | Streamable HTTP (`--http`) | **3** — only `skill_*` | HTTP has no authentication; `wm_*` and AG tools must not be reachable |

On the `content` profile the `wm_*` and Action Gateway tools are *not registered at all*, not
registered-and-refused: an absent tool cannot be argued with. The `skill://` resources are available
on both profiles, because reading a skill is a local, read-only operation that exposes no execution.

## Requirements

- Node.js **>= 22**.
- The `warpmetal` CLI, version **>= 0.8.1** — only for the `wm_*` tools. Versions below 0.8.10 work,
  but `wm_version` will warn that `sandbox access install-ssh` is missing. The exact version this
  server was built and tested against is declared as an exact devDependency (`0.8.12`), and
  resolution looks in the project's own `node_modules` before anywhere else, so a local install wins.
  `npm install -g warpmetal` remains the fallback.
- **Optional, for Action Gateway tools:** `DIGITALOCEAN_TOKEN` (PAT with Action Gateway access) and
  `DIGITALOCEAN_AG_ACTOR_ID` (stable actor that owns provider Connections). Without them the 100 AG
  tools still appear in `tools/list`, but each `tools/call` returns `ag_unconfigured`.

Without the CLI the server still starts and the `skill_*` tools keep working from the registry
snapshot; every `wm_*` call then returns `FAILED` with an actionable `cli_unavailable` message rather
than failing to boot.

A CLI below the version floor is refused rather than warned about: reads still work, so the version
can be diagnosed, but every `*_apply` is answered `DENIED` before any process exists. An *unreadable*
version refuses nothing, because an override or a bare PATH executable is *unknown* rather than old.

## Action Gateway (batches 01-10)

Batch-01 tools (stdio / `full` only):

1. `github_create_issue` · 2. `github_list_issues` · 3. `github_get_issue`
4. `github_create_pull_request` · 5. `github_get_pull_request` · 6. `github_search_repositories`
7. `gitlab_list_projects` · 8. `gitlab_create_project_issue` · 9. `gitlab_create_merge_request`
10. `notion_search`

Batch-02 tools (stdio / `full` only):

11. `notion_query_database` · 12. `notion_get_page` · 13. `notion_create_page`
14. `notion_append_block_children` · 15. `stripe_post_customers` · 16. `stripe_get_customers`
17. `stripe_post_payment_intents` · 18. `stripe_get_payment_intents` · 19. `stripe_get_balance`
20. `stripe_post_invoices`

Batch-03 tools (stdio / `full` only):

21. `jira_create_issue` · 22. `jira_get_issue` · 23. `jira_add_comment`
24. `jira_transition_issue` · 25. `jira_get_project` · 26. `confluence_get_page_by_id`
27. `confluence_get_pages` · 28. `linear_create_issue` · 29. `linear_list_issues`
30. `linear_get_issue`

Batch-04 tools (stdio / `full` only):

31. `linear_create_comment` · 32. `supabase_list_projects` · 33. `supabase_create_a_project`
34. `supabase_apply_a_migration` · 35. `cloudflare_zones_get` · 36. `cloudflare_accounts_list_accounts`
37. `vercel_get_projects` · 38. `vercel_create_project` · 39. `vercel_get_deployments`
40. `figma_get_file`

Batch-05 tools (stdio / `full` only):

41. `figma_get_file_nodes` · 42. `shopify_list_products` · 43. `shopify_get_product`
44. `shopify_list_orders` · 45. `hubspot_crm_contacts_list` · 46. `hubspot_crm_contacts_create`
47. `hubspot_crm_deals_list` · 48. `asana_get_a_task` · 49. `asana_create_a_project`
50. `dropbox_list_folder`

Batch-06 tools (stdio / `full` only):

51. `dropbox_search_files` · 52. `discord_get_my_user` · 53. `discord_list_my_guilds`
54. `airtable_list_bases` · 55. `intercom_list_all_contacts` · 56. `intercom_create_contact`
57. `snowflake_list_databases` · 58. `snowflake_list_tables` · 59. `sentry_list_organization_projects`
60. `sentry_list_a_project_s_issues`

Batch-07 tools (stdio / `full` only):

61. `datadog_v1_get_ip_ranges` · 62. `pagerduty_list_incidents` · 63. `pagerduty_create_incident`
64. `pagerduty_list_services` · 65. `exa_web_search` · 66. `exa_web_fetch`
67. `perplexity_chat_completion` · 68. `perplexity_search` · 69. `resend_list_emails`
70. `resend_create_contact`

Batch-08 tools (stdio / `full` only):

71. `calendly_list_event_types` · 72. `calendly_get_current_user` · 73. `clickup_create_task`
74. `clickup_get_task` · 75. `clickup_create_task_comment` · 76. `posthog_list_project_dashboards`
77. `posthog_get_feature_flags_matching_ids` · 78. `mixpanel_track_event` · 79. `mixpanel_raw_event_export`
80. `circleci_list_pipelines`

Batch-09 tools (stdio / `full` only):

81. `circleci_get_pipeline_by_id` · 82. `mailchimp_list_campaigns` · 83. `mailchimp_add_member_to_list`
84. `x_create_posts` · 85. `x_get_users_me` · 86. `x_search_posts_recent`
87. `square_list_payments` · 88. `square_create_payment` · 89. `square_list_customers`
90. `openai_list_models`

Batch-10 tools (stdio / `full` only):

91. `gemini_generate_content` · 92. `gemini_list_models` · 93. `anthropic-admin_list_workspaces`
94. `anthropic-admin_list_api_keys` · 95. `grafana-cloud_list_stacks` · 96. `grafana-cloud_get_org`
97. `monday_boards` · 98. `monday_get_workspaces` · 99. `onesignal_view_an_app`
100. `amplitude_get_flags`

Setup:

1. Create a DigitalOcean personal access token authorized for Action Gateway → `DIGITALOCEAN_TOKEN`.
2. Create or pick a stable **Actor** in Action Gateway → `DIGITALOCEAN_AG_ACTOR_ID`.
3. In the console, open **Connections** and authorize **GitHub**, **GitLab**, **Notion**, **Stripe**,
   **Jira**, **Confluence**, **Linear**, **Supabase**, **Cloudflare**, **Vercel**, **Figma**,
   **Shopify**, **HubSpot**, **Asana**, **Dropbox**, **Discord**, **Airtable**, **Intercom**,
   **Snowflake**, **Sentry**, **Datadog**, **PagerDuty**, **Exa**, **Perplexity**, **Resend**,
   **Calendly**, **ClickUp**, **PostHog**, **Mixpanel**, **CircleCI**, **Mailchimp**, **X**,
   **Square**, **OpenAI**, **Gemini**, **Anthropic Admin**, **Grafana Cloud**, **Monday.com**,
   **OneSignal**, and **Amplitude** for
   that actor. The MCP never stores provider secrets; DO uses the actor’s Connections at invoke time.
4. Ensure Inference & Agents billing/balance is healthy if DO requires it for your team.
5. Start stdio with both env vars set:

```sh
DIGITALOCEAN_TOKEN=... DIGITALOCEAN_AG_ACTOR_ID=... npx -y @warpmetal/skills-mcp
```

On the first AG `tools/call`, the server creates a policy-bound Action Gateway session that selects
all catalog tools and forwards the call via `action_invoke`. Catalog contracts live in
`src/action-gateway/catalog/` (`batch-01.json` through `batch-10.json`); the aggregated surface is
built by `src/action-gateway/catalog.ts`.

## Run

```sh
# stdio, full profile (146 tools: 3 skill_* + 43 wm_* + 100 AG)
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

| Tool | Purpose |
|---|---|
| `skill_list` | List skills with version, description, roles, hosts, and files; optional `role`/`host` filters |
| `skill_search` | Rank skills by name, tag, description, role, and host matches; bounded `limit` |
| `skill_read` | Read `SKILL.md` or a listed supporting file; checksum verified before returning |

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

| Non-destructive | Irreversible, behind the hardened gate |
|---|---|
| `wm_runtime_enable_*` | `wm_server_power_*` |
| `wm_runtime_install_*` | `wm_server_reload_*` |
| `wm_sandbox_create_*` | `wm_sandbox_delete_*` |
| `wm_sandbox_action_*` | `wm_sandbox_lifecycle_*` |
| `wm_sandbox_access_keygen_*` | `wm_sandbox_access_revoke_*` |
| `wm_sandbox_access_grant_*` | `wm_sandbox_access_refresh_*` |

Purchase and renewal tools, `sandbox connect`, the credential-writing commands (`access install-ssh`,
`access remove-ssh`, key rotation) and `agent install` have no entry in the command registry, so this
server cannot reach them even by mistake.

## Why a CLI surface instead of "let the agent shell out"

A CLI is text in and text out. That is a poor interface for an agent: exit codes get lost, secrets end
up in transcripts, and every caller re-invents quoting. This server puts six things between the model
and the CLI:

| Concern | How it is handled |
| --- | --- |
| Command injection | Closed command registry, `spawn` with `shell: false`, never `exec()` with a string |
| Secrets in transcripts | Deny-list redaction by key and by value shape; every redaction is reported |
| Lost exit codes | One envelope, one exit-code table, complete from day one |
| Unapproved mutations | A two-phase gate: a plan mints a single-use token bound to the exact resolved argv |
| Unnamed destruction | A consequence class the apply must echo, a re-verification after approval, and a disk-backed refusal to retry a `manual_review` |
| Resource exhaustion | A FIFO concurrency ceiling on CLI processes, and a server-side bounded poll loop instead of a blocking CLI call |
| Silent protocol drift | Static tests that fail if an HTTP client, a blocking flag or an unreviewed destructive verb appears |

None of these enable an unapproved action: the `_plan` tool names the effect, and the `_apply` tool
accepts only the token that effect produced, once. See [SECURITY.md](SECURITY.md) for what the gate
does *not* prove.

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
      "args": ["/path/to/skills/packages/skills-mcp/dist/index.js", "--registry", "/path/to/skills"]
    }
  }
}
```

DeepSeek Harness (`dsh-mcp-client` entry):

```yaml
- id: mcp-warpmetal-mcp
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: warpmetal-mcp
    transport: stdio
    command: npx
    args: ['-y', '@warpmetal/skills-mcp']
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
    "warpmetal-mcp": { "type": "http", "url": "https://skills.warpmetal.com/mcp" }
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

| Flag | Meaning |
|---|---|
| `--registry <url\|path>` | Load `registry.json` from a URL or local directory |
| `--tag <version>` | Pin a registry tag from the catalog host (default: `latest`) |
| `--offline` | Never fetch; use cache or the bundled snapshot |
| `--cache-dir <path>` | Override the registry cache directory |
| `--registry-token-file <path>` | Read a bearer token from a file; sent to an authenticated registry |
| `--http`, `--host`, `--port` | HTTP transport settings (selects the `content` profile) |
| `--version`, `--help` | Print version or help |

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
