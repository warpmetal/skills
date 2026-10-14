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

## Batch 13 — Grafana stack reads

Fifteen read-only tools over the Grafana HTTP API of a stack, written from
`api-merged.json` (207 paths, 314 operations) as the source of truth. This is a **new
provider**, `grafana-stack`, not an extension of `grafana-cloud`: the Cloud API answers on
`grafana.com` with a Cloud Access Policy token, while a stack answers on
`<stack>.grafana.net` with a stack service-account token. Same vendor, different host,
different credential, different contract entry.

- **The label is validated before it reaches the host.** `grafana.stack` is the label in
  `<stack>.grafana.net`, and `buildContext` accepts it only as a DNS label, strips a pasted
  scheme or `.grafana.net` suffix, and otherwise fails closed with `NEEDS_AUTH` and no
  request. A value carrying `/`, `:` or `@` would otherwise move the request, and the
  Bearer token with it, off `*.grafana.net`.
- **Two collections, two encodings.** `tag` (`search`) and `tags` (`annotations`) are
  `collectionFormat: multi`, so the key repeats (`?tag=a&tag=b`); `dashboardUIDs` and
  `folderUIDs` declare no collectionFormat, so they stay comma-separated. The generated
  `qs` helper joins every array with commas, which is right for the second kind and silently
  wrong for the first, so it was left untouched and a `repeat` helper was added next to it.
  A test pins both shapes.
- **The classic dashboard surface, by decision.** `api-merged.json` documents
  `GET /api/dashboards/uid/{uid}`; Grafana 12+ also publishes a Kubernetes-style
  `/apis/dashboard.grafana.app/…` surface. The catalog follows the source of truth and the
  contract note records the difference, so moving later is a deliberate choice rather than a
  silent drift.
- **What was deliberately left out.** The 171 mutations (they would need `methods` beyond
  `GET`, `CONFIRM` gates and a destructive classification); the data source proxy
  (`/datasources/proxy/uid/{uid}/…`), whose free-form path suffix no MCP schema can bound -
  it belongs in a typed `query_prometheus` tool, not a generic proxy; the active-alerts
  endpoint, which is not in `api-merged.json` (it lives in the Alertmanager API); every token
  endpoint and `/admin/settings`, which returns the stack's whole configuration; the snapshot
  routes, because `GET /snapshots-delete/{deleteKey}` is a GET that deletes; and
  `/reports/render/*`, which renders rather than reads.
- **Status is honest, not optimistic.** The generated adapter has no probe entry: a
  per-customer host cannot be probed from a fixed URL, so `integration status grafana-stack`
  reports `DEGRADED` ("present but unverified") rather than a false `OK`.
- **Verification.** One request-shape test per tool, plus the multi-versus-csv encodings, the
  fail-closed matrix for the stack label and the "no parameter the caller did not ask for"
  cases. The live tier is gated behind `GRAFANA_STACK_LIVE=1` with `GRAFANA_STACK` and
  `GRAFANA_STACK_TOKEN`; it is the only tier that can prove Grafana accepts these calls,
  because `npm run probe` classifies `acme.grafana.net` as account-scoped instead of probing
  it.
- **Three credential-free verification layers, because no single one is enough.**
  `test/grafana-stack-params.test.ts` (offline, part of `npm test`) asserts every builder
  against the operation it claims to call, using `test/fixtures/grafana-stack-params.json` -
  a distilled copy of the spec, since `api-merged.json` is scratch and not committed. It is
  the only layer that can catch an invented query parameter: Grafana ignores an unknown one,
  so a live 200 proves nothing about the name. `npm run probe:grafana-stack` (with
  `GRAFANA_STACK_PROBE_HOST`) sends each request to a real Grafana with the sentinel token
  and fails on any 404, which needed two probe changes: `hostRewrite`, because an
  account-scoped host is skipped by default, and an API-scoped `controlPath`, because Grafana
  answers 200 to any unknown path at the root and that made every 404 inconclusive.
  `npm run e2e:grafana-stack` (with `GRAFANA_STACK_E2E_HOST`) chains real ids taken from the
  target and pins the response shapes the spec does not type - `search` returns an array,
  `library-elements` returns an object with `result`, `get_dashboard` returns
  `{ meta, dashboard }` - and proves the two path-id tools the route probe cannot judge. Two
  findings came out of running them: a bogus `parentUid` makes `/api/folders` answer 404 on a
  route that exists, so the route probe now sends the argument-free shape; and the classic
  `/api/dashboards/uid/{uid}` surface is still served by a current Grafana.

## Batch 14 - Cloudflare zone and DNS surface

The `cloudflare` provider went from two tools to forty-six, generated from
Cloudflare's published OpenAPI document rather than hand-written. The two it had
did not follow the naming rule, and both had to change:

| Before | After |
| --- | --- |
| `cloudflare_zones_get` (listed zones) | `cloudflare_zones_list` (lists zones) and `cloudflare_zones_get` (reads one zone by id) |
| `cloudflare_accounts_list_accounts` | `cloudflare_accounts_list` |

`cloudflare_zones_get` is the breaking one: the slug survives, but it used to
list zones and now requires a `zone_id`. A caller that sent it `{}` gets a loud
invalid-arguments error rather than a wrong answer, and `cloudflare_zones_list`
is the old behaviour.

What ships: the zone lifecycle (`list`, `create`, `get`, `update`, `delete`,
`activation_check`), the migration hold (`list`, `create`, `patch`, `delete`),
DNS records (`list`, `create`, `get`, `update`, `replace`, `delete`, `batch`,
`import`), DNS settings, DNSSEC, the zone settings (`list`, `get`, `update`), the
cache purge, the three edge rule families (access rules, lockdowns, user-agent
blocks) and the read half of the token model (`/accounts`, `/user/tokens` list,
get, verify and `permission_groups`).

### How it is built

`openapi.json` is 27 MB of scratch and is not committed, so three generators read
it and their output is what gets reviewed:

- `packages/warpmetal-cli/scripts/cloudflare/spec.mjs` is the one reading of the
  document: it resolves `$ref`s, flattens `allOf`, folds an object union into one
  field list (Cloudflare's DNS-record body is an `anyOf` over `with-data` /
  `without-data`, each of them a `oneOf` over the record types), and names each
  operation `cloudflare_<module>_<verb>` from its path. `operationId` is not a
  naming source a reviewer can defend (`zones-get`,
  `dns-records-for-a-zone-list-dns-records`).
- `scripts/cloudflare/allowlist.json` is the reviewed decision file, one line per
  tool with the wave it ships in and why. `scripts/cloudflare/allowlist.mjs`
  refuses a name that disagrees with its path, an operation that is not in the
  spec, a missing reason, an unreviewed free-form body, or a hidden operation
  included without saying so.
- `gen-cloudflare-routes.mjs` writes the route table, `gen-cloudflare-catalog.mjs`
  writes the catalog, and `gen-cloudflare-inventory.mjs` writes
  `docs/cloudflare-api-inventory.md` (every operation, grouped, with the filter
  that dropped it or the tool that shipped for it) and
  `docs/cloudflare-token-scopes.md` (the token permission each tool needs, read
  from `x-api-token-group`). Both docs are checked with `--check`.

### What the spec forced

- **A filter over the document.** 3,743 operations: 1,093 carry `x-forge-hidden`
  and 489 `x-fern-ignore`, leaving 2,227 reviewable, and the wave is chosen from
  those. Five operations ship *despite* being hidden, each saying why: the two
  that keep a shipped tool working and the read-only token tools, which are
  public API the spec hides from its own docs.
- **Numbers are not requirements.** The DNS-record body is a union, so no field
  is required by every branch; `jsonSchemaToZodObject` therefore marks none of
  them required and the "provide type, name and either content or data" check
  lives where it can name both alternatives - a CLI validator, like the Zendesk
  requester pair.
- **Path parameters are percent-encoded.** A record name or an R2 key can carry
  a `/`, which would build a different route instead of a bad argument.
- **`/zones/{zone_id}/settings` is deprecated and its bulk PATCH body is not
  published**, so the wave ships the bulk read and the per-setting
  `get`/`update`, and says so in the allowlist.

### What proves it

- `test/cloudflare-params.test.ts` asserts every builder against the operation it
  claims to call, from a distillation of the spec
  (`test/fixtures/cloudflare-params.json`): host, method, path template, that
  every query key is declared by that operation, that no argument is dead and
  that the body carries exactly the declared fields.
- `test/cloudflare.test.ts` covers what no fixture can: the three validators, the
  encoding, and a PATCH that sends only what it was given.
- `test/cloudflare-catalog.test.ts` checks the catalog's promises - the endpoint
  and the permission in every description, annotations that follow the method,
  a gate on every write, and the reviewed destructive set.
- `cloudflare_zones_delete`, `cloudflare_dns_records_delete`,
  `cloudflare_dns_records_batch`, `cloudflare_dnssec_delete` and
  `cloudflare_purge_cache` are
  `destructiveHint: true`. The zone's firewall deletes are not: they take
  protection away rather than break what is running, and every write already
  travels behind `CONFIRM CLOUDFLARE ...`.

### Withdrawn: `cloudflare_dns_records_import`

`POST /zones/{zone_id}/dns_records/import` declares a `multipart/form-data` body -
a BIND zone file upload - and every generated builder speaks JSON, so the tool
sent `{"file": …, "proxied": …}` under `application/json` to an endpoint that
reads a form. It could never have worked.

The allowlist now refuses a declared body whose content type the JSON builder
cannot send, which is what found it, and the slug is retired rather than left in
`tools/list` as something that always fails. A multipart or binary upload is not
reachable through a JSON-argument surface, so an operation like this one stays
out until the pipeline learns to carry it deliberately; nothing else changes.

Four more waves are planned in the allowlist (`w2` storage and compute, `w3` Zero
Trust, `w4` observability, `w5` Radar). Each is an additive change to the same
three generators.

## Batch 15 - Cloudflare storage and compute

278 tools across nine families, reviewed as wave `w2` of the allowlist: R2, Workers
(scripts, versions, deployments, routes, schedules and secrets, dispatch
namespaces, observability), Queues, Pages, Workers KV, Vectorize v2, D1, Workflows
and Hyperdrive. The Cloudflare surface goes from 46 tools to 323.

### How the wave decided

- **`destructive` is a policy, not a verb.** A DELETE that removes the resource
  itself - a bucket, an object, a script, a queue, a database, a KV namespace, a
  Vectorize index, a Pages project, a Hyperdrive pool - is destructive, and so are
  the writes that purge or overwrite in bulk: both queue purges, the two KV bulk
  endpoints, deleting a KV pair, Vectorize's delete-by-ids and metadata index, the
  Pages build cache, D1's point-in-time restore. The two D1 SQL tools are
  destructive for the same reason a database console is: the statement is the
  caller's, so a DROP is as easy to send as a SELECT. A DELETE that only removes a
  policy, binding, session or secret is **not** destructive - the w1 firewall
  precedent - and those entries carry `confirmGate` instead, so a write Cloudflare
  flags as confirmation-worthy still asks. 31 of the 278 tools carry the hint.
- **`rawBody` for the bodies the spec does not describe.** Eight operations publish
  no field list at all: the R2 bulk object delete, the two KV bulk endpoints and
  the Workflows instance batch take a JSON array, Vectorize's insert and upsert
  take newline-delimited vectors, and two Worker endpoints take a JSON array too.
  Each one now exposes a single `body` string argument that is sent verbatim, with
  the content type the spec declares, and the description says so.
- **`freeFormBody` for the one body the spec leaves open.** Sending an event to a
  workflow instance: the declared arguments are removed from the payload and the
  rest travels as the body.
- **`dropBodyFields` is new, and the queue PATCH is why.** `PATCH
  /queues/{queue_id}` reuses the queue object as its request body, so its field list
  repeats `queue_id` - the identifier the path already carries. The schema would
  have refused the tool outright (two arguments collapsing to one name), so the
  allowlist can now drop a declared field with a reviewed note, and the drop is
  asserted from both sides: absent from the schema, absent from the request.
- **Five renames.** Four operations derived the same name as their collection
  sibling (`DELETE /objects` next to `DELETE /objects/{object_key}`, and three
  others), so the collection form takes an alias and the item form keeps the derived
  name. The fifth is the Hyperdrive PlanetScale signature endpoint, whose path
  carries camelCase segments the naming rule rejects.
- **Seventeen review notes** are recorded in the inventory: the whole R2 catalog
  family (16 operations) and one zone-settings read are marked deprecated by
  Cloudflare. They ship, because the API still serves them, and every description
  carries the marker so a caller knows before calling.

### What the spec forced out

Ten operations cannot travel through a JSON argument surface, so they are absent
rather than shipped as calls that could never succeed:

- the two Worker script uploads (`PUT /workers/scripts/{script_name}` and its
  dispatch twin) publish **no request body at all** in the spec, so the tool would
  have sent an empty module;
- Worker script content, versions and settings (four operations, `multipart/form-data`);
- the Pages deployment create (`multipart/form-data`, 13 declared fields);
- the R2 object upload (`application/octet-stream`);
- the Workers asset upload (`multipart/form-data`).

Getting these in means teaching the pipeline to carry multipart and binary bodies
deliberately - a boundary, a content type per part, an encoding for bytes - which is
a capability, not a wave. Until then the wave ships what manages what is already
uploaded.

### What proves it

- `test/cloudflare-params.test.ts` now asserts the new body kinds from both sides:
  a raw body travels as a string under the declared content type, a free-form body
  forwards the caller's fields without leaking a declared argument into the payload,
  and a dropped field never reaches the request. 2149 tests in the CLI suite, from
  754, because every generated builder is asserted against the distilled spec.
- `test/cloudflare-catalog.test.ts` holds the 36-tool destructive set, the endpoint
  and permission in every description, and the one case where an undeclared argument
  is legitimate: a body the spec does not publish.
- The wave also fixed a latent generator bug the new tools exposed: the free-form
  builder emitted `{ ...args.args }` - a spread over a member that does not exist -
  which only a free-form tool could have found, and this wave is the first to have
  one.

## Catalog layout - one file per provider

The catalog used to be thirteen `batch-NN.json` files, each holding whatever
providers shipped in that wave, so a provider could be split across two of them
(Zendesk was half of `batch-11.json` and half of `batch-12.json`). It is now
one file per provider - `src/providers/catalog/<toolkitId>.json`, 42 files for
the 131 tools - so growing a provider is a single-file edit.

Nothing changes for callers: the 131 toolSlugs, their input schemas and the
`warpmetal integration <provider> <verb>` mapping are identical. What changed is
the layout, the registration order (`tools/list` is now alphabetical by provider)
and the file header field `batch`, replaced by `provider`.

`src/providers/catalog/index.ts` is generated from the directory: re-run
`node packages/skills-mcp/scripts/gen-catalog-barrel.mjs` after adding or
removing a provider file. `test/catalog-layout.test.ts` fails when the barrel
and the directory drift apart. The entries above keep the names they shipped
under.
