# Breaking: provider tools no longer use DigitalOcean

Provider tools (the former Action Gateway surface) now call WarpMetal
`integration` via `@warpmetal/cli`. DigitalOcean Action Gateway credentials
(`DIGITALOCEAN_TOKEN`, `DIGITALOCEAN_AG_ACTOR_ID`) are ignored and unused.

## Operator migration

1. Install `@warpmetal/cli` alongside the skills MCP.
2. Move each provider Connection secret into the WarpMetal vault:
   `warpmetal env store set <name> --stdin`
3. Restart the MCP stdio server.
4. Mutating tools still appear as a single MCP `tools/call`; the server injects
   the `--confirm` gate expected by the CLI.

## Error codes

| Old                | New                        |
| ------------------ | -------------------------- |
| `ag_unconfigured`  | `provider_unconfigured`    |
| `ag_invoke_failed` | `provider_invoke_failed`   |
| `ag_invalid_args`  | `provider_invalid_args`    |
| _(n/a)_            | `provider_not_implemented` |

## Follow-up corrections

- **Jira / Confluence auth and bodies.** Atlassian Cloud requires
  `Authorization: Basic base64(email:api_token)`, not a raw token. The MVP sent
  `Basic __TOKEN__` and forwarded the MCP arguments as the request body. Both are
  fixed: the email is read from the `jira.email` / `confluence.email` vault
  entries, and the write bodies now match the v3 API (`{ fields: … }` for issue
  creation, an ADF document for comments, `{ transition: { id } }` for
  transitions). Store the new secrets with
  `warpmetal env store set jira.email --stdin`.
- **`jira_get_issue` is read-only.** The extracted catalog marked it as a
  mutation; it no longer requires a `--confirm` gate and is annotated
  `readOnlyHint`.
- **`@warpmetal/cli` is an optional peer dependency.** A consumer must install it
  explicitly (`npm install @warpmetal/cli`); the server logs a
  `provider_unconfigured` warning at startup when it cannot resolve one.
- **`integration status` is honest for the generated providers.** Providers with
  a cheap "who am I" probe (GitLab, Notion, OpenAI, …) are verified live;
  providers without one report `DEGRADED` instead of a false `OK`.
- **Arguments travel over stdin.** The MCP invoker now sends `--args-stdin`
  instead of `--args-json`, keeping payloads out of the process list.
- **Zendesk's list tools sent parameters the API does not have, and could not
  page.** `list_users` exposed `sort_by`/`sort_order`; the endpoint accepts only
  `role`/`roles`/`permission_set`/`external_id` plus pagination, and Zendesk
  ignores an unknown parameter instead of rejecting it, so an unsorted page read
  as if it were sorted. Both parameters are gone, and `list_users`,
  `list_ticket_comments` and `list_view_tickets` now expose the cursor
  `page_size`/`page_after` their endpoints support; `list_tickets` gains the
  offset `page` beside the `per_page` it already had. No tool offers both shapes,
  because Zendesk rejects a request that mixes them.
- **A ticket can be created from `requester_id` alone.** `requester_email` was
  `required` in the catalog, so the Zod schema refused the documented
  "`requester_id` takes precedence" form before the handler ran, even though the
  CLI's builder supported it. The requirement is gone and the pair is checked
  instead: `zendesk_create_ticket` carries a validator, so a call naming neither
  fails with `Provide requester_id or requester_email` (exit 5) without sending a
  request, rather than letting Zendesk answer 422.
- **A nullable field is validated, not waved through.** `"type": ["integer",
  "null"]` (Zendesk `assignee_id`, Vercel `framework`, Intercom `phone` - 24
  input fields across three tools) fell through to `z.unknown()`: a wrong type was
  accepted locally and only refused by the provider, and `null` was
  indistinguishable from an omitted field. `jsonSchemaToZodObject` now builds the
  union and makes it nullable, so `assignee_id: null` still means "unassign" and
  `assignee_id: "7"` is refused. The 23 Vercel/Intercom fields are consequently
  stricter than before: a caller passing the wrong type now gets a validation
  error instead of a provider 400.

## Provider readiness for external consumers

- **Array responses are wrapped, not mangled.** A provider whose root is a JSON
  array used to be spread into `{ "0": …, "1": … }`. It is now returned as
  `{ items: [...], toolSlug }`, so `github_list_issues`, `gitlab_list_projects`,
  `discord_list_my_guilds`, `sentry_list_organization_projects` and
  `sentry_list_a_project_s_issues` keep a real array. The rule: array -> `items`,
  object -> spread, non-JSON -> `raw`; `toolSlug` is always present.
- **Request contracts are fixture-verified.** All 116 builders are checked against
  a reviewed fixture (`{ method, url, headers, body?, form? }`) in
  `packages/warpmetal-cli/test/fixtures/mcp-requests/`. Corrections that the
  review produced: Supabase create/migration bodies now send only the documented
  fields; Snowflake statements use the requested schema and filters; Linear maps
  its snake_case inputs to the API's camelCase GraphQL input; Monday sends an
  `API-Version` header; PagerDuty takes its `From` header from `pagerduty.email`;
  HubSpot list pagination is forwarded.
- **A second, doc-level review corrected six more requests.** PostHog's
  `get_feature_flags_matching_ids` now hits
  `/api/projects/{project_id}/feature_flags/matching_ids/`; Grafana Cloud's
  `get_org` addresses the organization by path (`/api/orgs/{slug}`), not the
  legacy `?orgSlug=` search; Shopify pins a currently supported Admin API
  version; Mailchimp's `add_member_to_list` sends `skip_merge_validation` as a
  query parameter and keeps `list_id` in the path, not the body; Confluence's
  page fetch uses the `get-draft` selector; Snowflake's `SHOW DATABASES` follows
  the documented clause order (`[HISTORY] [LIKE] [STARTS WITH] [LIMIT [FROM]]`).
- **Mixpanel's track endpoint was silently dropping every event.** `POST
  https://api.mixpanel.com/track` takes its payload as a base64-JSON `data` form
  field, not a JSON body, and it is public (`security: []`). The builder sent a
  JSON body (`{ events, project_id }`); Mixpanel answers that with HTTP 200 and
  `status: 0` ("data, missing or empty"), so the tool reported success while
  ingesting nothing. It now sends `data=<base64(events)>&verbose=1` and carries
  no `Authorization` header. Because the endpoint has no `project_id` field, that
  argument was removed from the tool's schema (a **breaking** change for callers
  that passed it); the project token travels inside each event's
  `properties.token`. The Export API still authenticates with `mixpanel.token`
  (Basic, service account); without a credential the probe only confirms that the
  route exists and enforces auth (401).
- **Every provider is pinned to its published API, on and offline.**
  `packages/warpmetal-cli/test/fixtures/provider-contracts.json` records each
  provider's `docUrl`, allowed host (or account-scoped host suffix), HTTP methods
  and auth header; `provider-contract.test.ts` builds all 116 requests from the
  reviewed sample args and fails when a builder's host, method or auth header
  drifts from that file. `npm run probe` (in `packages/warpmetal-cli`, opt-in,
  needs network) then sends every request with a sentinel token: a route the
  provider does not serve answers 404/405, while a real route answers 401/403,
  400/422 or 2xx. A typical run is 75 auth-required, 9 reachable, 12
  account-scoped and 2 public, with **no missing route**; the only 404s are
  Sentry's, which are marked `weakSignal` because `sentry.io` answers 2xx to any
  path and resolves the organization slug before authenticating. Exa answers 502
  on some runs (an upstream outage) and the probe reports that as `server-error`,
  not as a routing failure. Only the account-scoped tools still need a
  credential to confirm end to end, because the host itself is per-customer:
  Shopify (`ctx.shop`), Snowflake (`ctx.snowflakeBase`) and Jira/Confluence
  (`*.atlassian.net`).
- **Irreversible mutations declare `destructiveHint: true`.** Payments, external
  publishing, billed infrastructure and permanent migrations are marked, so a
  client can distinguish them from an ordinary write. `readOnlyHint` still marks
  the read surface.
- **Unverified shapes are marked experimental.** `x_create_posts` (needs user
  OAuth) carries an `[experimental: …]` description prefix via
  `src/providers/experimental.ts`. The mark is informational; it does not block.
- **Contextual secrets surface in `status`.** A missing `*.site`, `*.email` or
  `*.warehouse` entry degrades the tools that need it and adds a warning to
  `integration status`, without turning the primary token into `NEEDS_AUTH`. The
  X probe was removed (an app-only bearer cannot call `/2/users/me`), so X reports
  `DEGRADED` instead of a false `NEEDS_AUTH`.

## Batch 11 — Zendesk

Added Zendesk Support as an MCP-backed provider: eleven tools over
`https://<subdomain>.zendesk.com/api/v2`, registered only on the `full` (stdio) profile
and dispatched through `warpmetal integration zendesk <verb> --args-stdin`.

- **Auth is an API token, not a bearer.** Zendesk takes
  `Authorization: Basic base64(<email>/token:<api_token>)`; a bare
  `base64(<email>:<api_token>)` is answered with HTTP 401, so the `/token` literal is part
  of the credential. Secrets: `zendesk.token`, `zendesk.subdomain`, `zendesk.email`.
- **The subdomain is validated, not just trimmed.** It is interpolated into the host, so a
  value carrying `/`, `:`, `@` or a dot would have sent the request — and the credential
  with it — to a host that is not `*.zendesk.com`. Anything that is not a DNS label now
  fails closed with `NEEDS_AUTH` and no request at all.
- **`create_ticket` follows the API's own model of the requester.** `ticket.requester_id`
  is a top-level field; the nested `requester` object carries only `email`/`name`. The two
  are never sent together, and the `comment` key is omitted when there is no comment.
  Required fields are the ones Zendesk requires — `requester_email`; `subject` and the
  comment are optional, and `public` mirrors `add_ticket_comment` so a ticket can be opened
  as an internal note.
- **`sort_by` values are the documented ones.** `list_tickets` and `search` declare them as
  enums, so an invalid value fails locally instead of at the provider. `list_users` keeps
  `sort_by` as free text, because the published parameter table does not enumerate its
  values and inventing a set there would have blocked valid calls.
- **Every listing tool can page.** `list_tickets` and `search` take `per_page`;
  `list_organizations` and `list_views` take `page_size`/`page_after`. Zendesk rejects
  mixing offset `page` with cursor `page[size]` in one request, so each tool exposes exactly
  one style.
- **Both writes are `destructiveHint: true`.** A public comment emails the customer and
  fires the account's triggers, which is the case that set names; the comment tools of Jira,
  Linear and ClickUp stay in the ordinary write surface because their notifications do not
  leave the organisation.
- **One request-shape test per tool.** `packages/warpmetal-cli/test/zendesk.test.ts` states
  each request in full from the published reference, so it catches a wrong query name or a
  misplaced body field that a fixture generated from the same builder cannot. A live
  companion suite is gated behind `ZENDESK_LIVE=1` (reads) and `ZENDESK_LIVE_WRITE=1`
  (writes); it is skipped until a tenant exists, so the live contract is still unproven.
- **The route probe skips the tenant host.** `acme.zendesk.com` joins the account-scoped
  hosts in `packages/warpmetal-cli/scripts/probe-mcp-routes.mjs`, so `npm run probe` reports
  those eleven tools as `account-scoped` rather than eleven `unreachable` rows against a
  tenant that does not resolve.

## Batch 12 — Zendesk ticket lifecycle

Closed the ticket lifecycle that Batch 11 left open: a ticket could be opened (`create_ticket`)
and replied to (`add_ticket_comment`) but never triaged. Five tools were added, taking Zendesk
from eleven to sixteen:

- **`update_ticket` is the missing write.** `PUT /api/v2/tickets/{id}.json` with the ticket's
  settable fields (`status`, `priority`, `assignee_id`, `group_id`, `subject`, `type`, `tags`).
  `set status "solved"` resolves a ticket and `"closed"` closes it permanently; `tags` replaces
  the whole tag set, which the description states rather than leaving the caller to discover it.
- **Only the fields the caller named travel.** The builder copies each declared argument
  individually, so an update never resets a field it was not told about, and `assignee_id: null`
  (a real value: unassign) is forwarded rather than dropped as absent. An update with only
  `ticket_id` is a documented no-op (`{ ticket: {} }`), matching the API.
- **`update_ticket` is `destructiveHint: true`.** A status or assignee change fires the same
  account triggers and webhooks as a create, and closing a ticket is not silently reversible —
  the same class that already names `create_ticket` and `add_ticket_comment`.
- **Four read tools give the write its context.** `get_user` and `get_organization` read the
  requester and client records one id at a time; `count_view_tickets` sizes a queue
  (`{ view_count: { value, fresh } }`) without fetching it; `get_ticket_metrics` returns the
  singular `ticket_metric` resource for SLA reporting. All four are `readOnlyHint`.
- **One request-shape test per tool, plus the negative cases.** `update_ticket` is pinned for
  the full body, for the subset-only body, for an explicit `null` assignee and for the no-op,
  and the update gate is proven to send nothing without it. The four reads each assert their
  path, and the live tier reads the credential's own user and organization, a real view count
  and a real ticket's metrics.
- **`zendesk.methods` already allowed `PUT`.** The hand-authored `provider-contracts.json`
  listed `["GET", "POST", "PUT"]` for Zendesk in Batch 11 (the comment update is a PUT), so no
  contract change was needed for `update_ticket`.
