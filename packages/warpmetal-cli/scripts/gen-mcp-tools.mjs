/**
 * Generates mcp-tools/catalog.ts from skills-mcp provider catalog + HTTP route table.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const catalogDir = join(root, "packages/skills-mcp/src/providers/catalog");

const files = readdirSync(catalogDir)
  .filter((f) => f.endsWith(".json"))
  .sort();
const tools = files.flatMap(
  (f) => JSON.parse(readFileSync(join(catalogDir, f), "utf8")).tools,
);

function providerFromToolkit(t) {
  if (t === "resend") return "email";
  return t;
}

/** secret name per provider */
const SECRETS = {
  github: "github.token",
  gitlab: "gitlab.token",
  notion: "notion.token",
  stripe: "stripe.token",
  jira: "jira.token",
  confluence: "confluence.token",
  linear: "linear.token",
  supabase: "supabase.token",
  cloudflare: "cloudflare.token",
  vercel: "vercel.token",
  figma: "figma.token",
  shopify: "shopify.token",
  hubspot: "hubspot.token",
  asana: "asana.token",
  dropbox: "dropbox.token",
  discord: "discord.token",
  airtable: "airtable.token",
  intercom: "intercom.token",
  snowflake: "snowflake.token",
  sentry: "sentry.token",
  datadog: "datadog.token",
  pagerduty: "pagerduty.token",
  exa: "exa.token",
  perplexity: "perplexity.token",
  email: "email.api_key",
  calendly: "calendly.token",
  clickup: "clickup.token",
  posthog: "posthog.token",
  mixpanel: "mixpanel.token",
  circleci: "circleci.token",
  mailchimp: "mailchimp.token",
  x: "x.token",
  square: "square.token",
  openai: "openai.token",
  gemini: "gemini.token",
  "anthropic-admin": "anthropic-admin.token",
  "grafana-cloud": "grafana-cloud.token",
  monday: "monday.token",
  onesignal: "onesignal.token",
  amplitude: "amplitude.token",
  zendesk: "zendesk.token",
};

/**
 * Route builders keyed by toolSlug. Returns { method, url, headers?, body?, form? }.
 * `args` is the MCP args object; `ctx` has { site, shop, accountId, ... } from extra secrets/env.
 */
const ROUTES = {
  github_create_issue: `({args}) => ({ method: "POST", url: \`https://api.github.com/repos/\${args.owner}/\${args.repo}/issues\`, body: { title: args.title, body: args.body ?? undefined }, headers: githubHeaders() })`,
  github_list_issues: `({args}) => ({ method: "GET", url: \`https://api.github.com/repos/\${args.owner}/\${args.repo}/issues?\${qs({ state: args.state, per_page: args.max_results })}\`, headers: githubHeaders() })`,
  github_get_issue: `({args}) => ({ method: "GET", url: \`https://api.github.com/repos/\${args.owner}/\${args.repo}/issues/\${args.issue_number}\`, headers: githubHeaders() })`,
  github_create_pull_request: `({args}) => ({ method: "POST", url: \`https://api.github.com/repos/\${args.owner}/\${args.repo}/pulls\`, body: { title: args.title, head: args.head, base: args.base, body: args.body ?? undefined, draft: args.draft ?? undefined }, headers: githubHeaders() })`,
  github_get_pull_request: `({args}) => ({ method: "GET", url: \`https://api.github.com/repos/\${args.owner}/\${args.repo}/pulls/\${args.pull_number}\`, headers: githubHeaders() })`,
  github_search_repositories: `({args}) => ({ method: "GET", url: \`https://api.github.com/search/repositories?\${qs({ q: args.q, sort: args.sort, order: args.order, per_page: args.max_results })}\`, headers: githubHeaders() })`,

  // GitLab's list filters are exactly this tool's schema params, so forward them
  // all. Hardcoding only `membership` silently dropped search/per_page/order_by.
  gitlab_list_projects: `({args}) => {
    const { custom_attributes, ...rest } = args;
    let url = \`https://gitlab.com/api/v4/projects?\${qs({ membership: true, ...rest })}\`;
    if (custom_attributes && typeof custom_attributes === "object") {
      for (const [key, value] of Object.entries(custom_attributes)) {
        url += \`&\${encodeURIComponent(\`custom_attributes[\${key}]\`)}=\${encodeURIComponent(String(value))}\`;
      }
    }
    return { method: "GET", url, headers: { "PRIVATE-TOKEN": "__TOKEN__" } };
  }`,
  // project_id is the URL path; every other declared field is a valid issue body
  // param, so forward the rest instead of only title/description.
  gitlab_create_project_issue: `({args}) => {
    const { project_id, ...fields } = args;
    return { method: "POST", url: \`https://gitlab.com/api/v4/projects/\${encodeURIComponent(String(project_id))}/issues\`, body: fields, headers: { "PRIVATE-TOKEN": "__TOKEN__", "Content-Type": "application/json" } };
  }`,
  gitlab_create_merge_request: `({args}) => {
    const { project_id, ...fields } = args;
    return { method: "POST", url: \`https://gitlab.com/api/v4/projects/\${encodeURIComponent(String(project_id))}/merge_requests\`, body: fields, headers: { "PRIVATE-TOKEN": "__TOKEN__", "Content-Type": "application/json" } };
  }`,

  // Notion's search params are exactly this schema, so forward them all
  // (start_cursor drives pagination and was previously dropped).
  notion_search: `({args}) => ({ method: "POST", url: "https://api.notion.com/v1/search", body: { query: args.query ?? "", page_size: args.page_size, start_cursor: args.start_cursor }, headers: notionHeaders() })`,
  // `body: {}` used to hardcode an empty query, silently dropping filter/sorts/
  // page_size/start_cursor. Forward the declared fields.
  notion_query_database: `({args}) => ({ method: "POST", url: \`https://api.notion.com/v1/databases/\${args.database_id}/query\`, body: { filter: args.filter, sorts: args.sorts, page_size: args.page_size, start_cursor: args.start_cursor }, headers: notionHeaders() })`,
  notion_get_page: `({args}) => ({ method: "GET", url: \`https://api.notion.com/v1/pages/\${args.page_id}\`, headers: notionHeaders() })`,
  // Notion requires a typed `parent` and `properties` document; a flat
  // {parent_page_id,title,content} body fails validation with HTTP 400.
  notion_create_page: `({args}) => ({ method: "POST", url: "https://api.notion.com/v1/pages", body: { parent: { page_id: args.parent_page_id }, properties: { title: { title: [{ type: "text", text: { content: String(args.title ?? "") } }] } }, ...(args.content ? { children: [paragraphBlock(args.content)] } : {}) }, headers: notionHeaders() })`,
  notion_append_block_children: `({args}) => ({ method: "PATCH", url: \`https://api.notion.com/v1/blocks/\${args.block_id}/children\`, body: { children: args.children ?? [paragraphBlock(args.content)] }, headers: notionHeaders() })`,

  stripe_post_customers: `({args}) => ({ method: "POST", url: "https://api.stripe.com/v1/customers", form: args, headers: { Authorization: "Bearer __TOKEN__" } })`,
  // Stripe's `created` filter is a nested object (created[gte]=...), so expand it.
  stripe_get_customers: `({args}) => {
    const created = args.created && typeof args.created === "object" && !Array.isArray(args.created) ? Object.fromEntries(Object.entries(args.created).map(([k, v]) => ["created[" + k + "]", v])) : {};
    return { method: "GET", url: "https://api.stripe.com/v1/customers?" + qs({ limit: args.limit, email: args.email, ending_before: args.ending_before, starting_after: args.starting_after, test_clock: args.test_clock, ...created }), headers: { Authorization: "Bearer __TOKEN__" } };
  }`,
  stripe_post_payment_intents: `({args}) => ({ method: "POST", url: "https://api.stripe.com/v1/payment_intents", form: args, headers: { Authorization: "Bearer __TOKEN__" } })`,
  stripe_get_payment_intents: `({args}) => {
    const created = args.created && typeof args.created === "object" && !Array.isArray(args.created) ? Object.fromEntries(Object.entries(args.created).map(([k, v]) => ["created[" + k + "]", v])) : {};
    return { method: "GET", url: "https://api.stripe.com/v1/payment_intents?" + qs({ limit: args.limit, customer: args.customer, customer_account: args.customer_account, ending_before: args.ending_before, starting_after: args.starting_after, ...created }), headers: { Authorization: "Bearer __TOKEN__" } };
  }`,
  stripe_get_balance: `() => ({ method: "GET", url: "https://api.stripe.com/v1/balance", headers: { Authorization: "Bearer __TOKEN__" } })`,
  stripe_post_invoices: `({args}) => ({ method: "POST", url: "https://api.stripe.com/v1/invoices", form: args, headers: { Authorization: "Bearer __TOKEN__" } })`,

  jira_create_issue: `({args, ctx}) => ({ method: "POST", url: \`\${ctx.jiraBase}/rest/api/3/issue\`, body: { fields: { project: { key: args.project_key }, summary: args.summary, issuetype: { name: args.issue_type }, description: adf(args.description) } }, headers: jiraHeaders() })`,
  jira_get_issue: `({args, ctx}) => ({ method: "GET", url: \`\${ctx.jiraBase}/rest/api/3/issue/\${args.issueIdOrKey ?? args.issue_key ?? args.id}\`, headers: jiraHeaders() })`,
  jira_add_comment: `({args, ctx}) => ({ method: "POST", url: \`\${ctx.jiraBase}/rest/api/3/issue/\${args.issueIdOrKey ?? args.issue_key}/comment\`, body: { body: adf(args.comment) }, headers: jiraHeaders() })`,
  jira_transition_issue: `({args, ctx}) => ({ method: "POST", url: \`\${ctx.jiraBase}/rest/api/3/issue/\${args.issueIdOrKey ?? args.issue_key}/transitions\`, body: { transition: { id: args.transition_id }, ...(args.comment ? { update: { comment: [{ add: { body: adf(args.comment) } }] } } : {}) }, headers: jiraHeaders() })`,
  // `expand` and `properties` are declared by the schema; forwarding them keeps
  // the response shape controllable instead of silently ignoring the request.
  jira_get_project: `({args, ctx}) => ({ method: "GET", url: \`\${ctx.jiraBase}/rest/api/3/project/\${args.projectIdOrKey ?? args.project_key}?\${qs({ expand: args.expand, properties: args.properties })}\`, headers: jiraHeaders() })`,

  // Confluence v2 query params are kebab-case (space-id, body-format, get-draft).
  confluence_get_page_by_id: `({args, ctx}) => ({ method: "GET", url: \`\${ctx.confluenceBase}/wiki/api/v2/pages/\${args.id ?? args.page_id}?\${qs({ "body-format": args.body_format, version: args.version, "get-draft": args.draft })}\`, headers: jiraHeaders() })`,
  confluence_get_pages: `({args, ctx}) => ({ method: "GET", url: \`\${ctx.confluenceBase}/wiki/api/v2/pages?\${qs({ limit: args.limit, cursor: args.cursor, sort: args.sort, status: args.status, subtype: args.subtype, title: args.title, "space-id": args.space_id, "body-format": args.body_format })}\`, headers: jiraHeaders() })`,

  // Linear's GraphQL input is camelCase; the MCP schema is snake_case, so map it.
  linear_create_issue: `({args}) => ({ method: "POST", url: "https://api.linear.app/graphql", body: { query: "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }", variables: { input: { teamId: args.linear_team_id, title: args.title } } }, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } })`,
  // The schema calls the argument `first`; it was hardcoded to 25 so every call
  // returned the same page regardless of the request.
  linear_list_issues: `({args}) => ({ method: "POST", url: "https://api.linear.app/graphql", body: { query: "query($first: Int) { issues(first: $first) { nodes { id identifier title state { name } } } }", variables: { first: args.first } }, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } })`,
  // The schema calls the argument `issue_id`; reading only `id`/`issueId` left
  // the required `$id: String!` variable unbound (Linear answers HTTP 400).
  linear_get_issue: `({args}) => ({ method: "POST", url: "https://api.linear.app/graphql", body: { query: "query($id: String!) { issue(id: $id) { id identifier title description url } }", variables: { id: args.issue_id ?? args.id ?? args.issueId } }, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } })`,
  // Linear's CommentCreateInput is camelCase; forward every declared field.
  linear_create_comment: `({args}) => {
    const input: Record<string, unknown> = { issueId: args.issue_id, body: args.body };
    if (args.body_data !== undefined) input.bodyData = args.body_data;
    if (args.create_as_user !== undefined) input.createAsUser = args.create_as_user;
    if (args.create_on_synced_slack_thread !== undefined) input.createOnSyncedSlackThread = args.create_on_synced_slack_thread;
    if (args.created_at !== undefined) input.createdAt = args.created_at;
    if (args.display_icon_url !== undefined) input.displayIconUrl = args.display_icon_url;
    if (args.do_not_subscribe_to_issue !== undefined) input.doNotSubscribeToIssue = args.do_not_subscribe_to_issue;
    if (args.document_content_id !== undefined) input.documentContentId = args.document_content_id;
    if (args.id !== undefined) input.id = args.id;
    if (args.initiative_id !== undefined) input.initiativeId = args.initiative_id;
    if (args.initiative_update_id !== undefined) input.initiativeUpdateId = args.initiative_update_id;
    if (args.parent_id !== undefined) input.parentId = args.parent_id;
    if (args.post_id !== undefined) input.postId = args.post_id;
    if (args.project_id !== undefined) input.projectId = args.project_id;
    if (args.project_update_id !== undefined) input.projectUpdateId = args.project_update_id;
    if (args.quoted_text !== undefined) input.quotedText = args.quoted_text;
    if (args.subscriber_ids !== undefined) input.subscriberIds = args.subscriber_ids;
    return { method: "POST", url: "https://api.linear.app/graphql", body: { query: "mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id } } }", variables: { input } }, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } };
  }`,

  supabase_list_projects: `({args}) => ({ method: "GET", url: \`https://api.supabase.com/v1/projects?\${qs({ limit: args.limit, offset: args.offset, search: args.search, sort: args.sort, statuses: args.statuses, organization_slug: args.organization_slug })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  // The management API only accepts the documented project fields; `ref` and
  // `organization_id` are not part of the create body.
  supabase_create_a_project: `({args}) => ({ method: "POST", url: "https://api.supabase.com/v1/projects", body: { name: args.name, organization_slug: args.organization_slug, db_pass: args.db_pass, region: args.region ?? undefined, plan: args.plan ?? undefined, desired_instance_size: args.desired_instance_size ?? undefined, high_availability: args.high_availability ?? undefined, kps_enabled: args.kps_enabled ?? undefined, postgres_engine: args.postgres_engine ?? undefined, release_channel: args.release_channel ?? undefined, region_selection: args.region_selection ?? undefined, template_url: args.template_url ?? undefined }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,
  // `ref` identifies the project in the path; the migration body carries only
  // the SQL and its optional metadata.
  supabase_apply_a_migration: `({args}) => ({ method: "POST", url: \`https://api.supabase.com/v1/projects/\${args.ref}/database/migrations\`, body: { query: args.query, name: args.name ?? undefined, rollback: args.rollback ?? undefined }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,

  cloudflare_zones_get: `({args}) => ({ method: "GET", url: \`https://api.cloudflare.com/client/v4/zones?\${qs({ name: args.name, status: args.status, "account.id": args.account_id, "account.name": args.account_name, page: args.page, per_page: args.per_page, order: args.order, direction: args.direction, match: args.match, type: args.type })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  cloudflare_accounts_list_accounts: `({args}) => ({ method: "GET", url: \`https://api.cloudflare.com/client/v4/accounts?\${qs({ name: args.name, page: args.page, per_page: args.per_page, direction: args.direction })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,

  // Vercel's list endpoint is /v10/projects (v9 is for per-project ops) and its
  // query params are camelCase while the MCP schema is snake_case.
  vercel_get_projects: `({args}) => ({ method: "GET", url: \`https://api.vercel.com/v10/projects?\${qs({ limit: args.limit, from: args.from, repo: args.repo, repoId: args.repo_id, repoUrl: args.repo_url, search: args.search, slug: args.slug, teamId: args.team_id, deprecated: args.deprecated, edgeConfigId: args.edge_config_id, edgeConfigTokenId: args.edge_config_token_id, excludeRepos: args.exclude_repos, gitForkProtection: args.git_fork_protection, buildMachineTypes: args.build_machine_types, buildQueueConfiguration: args.build_queue_configuration, elasticConcurrencyEnabled: args.elastic_concurrency_enabled, staticIpsEnabled: args.static_ips_enabled })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  // Creating a project is POST /v11/projects (v10 is the list endpoint).
  vercel_create_project: `({args}) => ({ method: "POST", url: "https://api.vercel.com/v11/projects", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,
  vercel_get_deployments: `({args}) => ({ method: "GET", url: \`https://api.vercel.com/v6/deployments?\${qs({ app: args.app, branch: args.branch, from: args.from, limit: args.limit, projectId: args.project_id, projectIds: args.project_ids, rollbackCandidate: args.rollback_candidate, sha: args.sha, since: args.since, slug: args.slug, state: args.state, target: args.target, teamId: args.team_id, to: args.to, until: args.until, users: args.users })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,

  figma_get_file: `({args}) => ({ method: "GET", url: \`https://api.figma.com/v1/files/\${args.file_key ?? args.key}?\${qs({ branch_data: args.branch_data, depth: args.depth, geometry: args.geometry, ids: args.ids, version: args.version })}\`, headers: { "X-Figma-Token": "__TOKEN__" } })`,
  figma_get_file_nodes: `({args}) => ({ method: "GET", url: \`https://api.figma.com/v1/files/\${args.file_key ?? args.key}/nodes?\${qs({ ids: args.ids, depth: args.depth, geometry: args.geometry, version: args.version })}\`, headers: { "X-Figma-Token": "__TOKEN__" } })`,

  // Shopify's REST list endpoints page with `limit`; the schema names the field
  // `first` (from the GraphQL dialect), so the builder maps it over. The dated
  // API version must be a currently supported stable release: 2024-10 was retired
  // on 2025-10-01 and Shopify silently fell forward to the oldest version still
  // served, so the URL did not describe the API actually answering.
  shopify_list_products: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.shop}/admin/api/2026-10/products.json?\${qs({ limit: args.first })}\`, headers: { "X-Shopify-Access-Token": "__TOKEN__" } })`,
  shopify_get_product: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.shop}/admin/api/2026-10/products/\${args.product_id ?? args.id}.json\`, headers: { "X-Shopify-Access-Token": "__TOKEN__" } })`,
  shopify_list_orders: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.shop}/admin/api/2026-10/orders.json?\${qs({ limit: args.first })}\`, headers: { "X-Shopify-Access-Token": "__TOKEN__" } })`,

  hubspot_crm_contacts_list: `({args}) => ({ method: "GET", url: \`https://api.hubapi.com/crm/v3/objects/contacts?\${qs({ limit: args.limit, after: args.after, archived: args.archived, properties: args.properties, properties_with_history: args.properties_with_history, associations: args.associations })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  hubspot_crm_contacts_create: `({args}) => ({ method: "POST", url: "https://api.hubapi.com/crm/v3/objects/contacts", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,
  // Same list params as contacts; the URL previously dropped all of them.
  hubspot_crm_deals_list: `({args}) => ({ method: "GET", url: \`https://api.hubapi.com/crm/v3/objects/deals?\${qs({ limit: args.limit, after: args.after, archived: args.archived, properties: args.properties, properties_with_history: args.properties_with_history, associations: args.associations })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,

  asana_get_a_task: `({args}) => ({ method: "GET", url: \`https://app.asana.com/api/1.0/tasks/\${args.task_gid ?? args.task_id}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  asana_create_a_project: `({args}) => ({ method: "POST", url: "https://app.asana.com/api/1.0/projects", body: { data: args }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,

  dropbox_list_folder: `({args}) => ({ method: "POST", url: "https://api.dropboxapi.com/2/files/list_folder", body: { path: args.path ?? "", recursive: args.recursive, limit: args.limit }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,
  dropbox_search_files: `({args}) => ({ method: "POST", url: "https://api.dropboxapi.com/2/files/search_v2", body: { query: args.query, options: { ...(args.path !== undefined ? { path: args.path } : {}), ...(args.max_results !== undefined ? { max_results: args.max_results } : {}) } }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,

  discord_get_my_user: `() => ({ method: "GET", url: "https://discord.com/api/v10/users/@me", headers: { Authorization: "Bot __TOKEN__" } })`,
  discord_list_my_guilds: `({args}) => ({ method: "GET", url: \`https://discord.com/api/v10/users/@me/guilds?\${qs({ before: args.before, after: args.after, limit: args.limit, with_counts: args.with_counts })}\`, headers: { Authorization: "Bot __TOKEN__" } })`,

  airtable_list_bases: `({args}) => ({ method: "GET", url: \`https://api.airtable.com/v0/meta/bases?\${qs({ offset: args.offset })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,

  intercom_list_all_contacts: `({args}) => ({ method: "GET", url: \`https://api.intercom.io/contacts?\${qs({ include_merge_history: args.include_merge_history })}\`, headers: { Authorization: "Bearer __TOKEN__", Accept: "application/json" } })`,
  intercom_create_contact: `({args}) => ({ method: "POST", url: "https://api.intercom.io/contacts", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json", Accept: "application/json" } })`,

  // The SQL API authenticates with a PAT (Bearer) or a key-pair JWT; the stored
  // token is sent as a Bearer credential. Optional SHOW filters are appended.
  // Snowflake SHOW TABLES/DATABASES clauses (docs): HISTORY, LIKE, STARTS WITH,
  // LIMIT n [FROM 'x']. Note: there is no SQL `DEEP` clause; that is a driver-only
  // (Python) option, so the schema should not declare it.
  snowflake_list_databases: `({args, ctx}) => ({ method: "POST", url: \`\${ctx.snowflakeBase}/api/v2/statements\`, body: { statement: \`SHOW DATABASES\${args.history ? " HISTORY" : ""}\${args.like !== undefined ? \` LIKE '\${args.like}'\` : ""}\${args.starts_with !== undefined ? \` STARTS WITH '\${args.starts_with}'\` : ""}\${args.show_limit !== undefined ? \` LIMIT \${args.show_limit}\${args.from_name !== undefined ? \` FROM '\${args.from_name}'\` : ""}\` : ""}\`, warehouse: args.warehouse ?? ctx.warehouse }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json", Accept: "application/json" } })`,
  snowflake_list_tables: `({args, ctx}) => ({ method: "POST", url: \`\${ctx.snowflakeBase}/api/v2/statements\`, body: { statement: \`SHOW TABLES\${args.history ? " HISTORY" : ""}\${args.like !== undefined ? \` LIKE '\${args.like}'\` : ""} IN SCHEMA \${args.database}.\${args.schema}\${args.starts_with !== undefined ? \` STARTS WITH '\${args.starts_with}'\` : ""}\${args.show_limit !== undefined ? \` LIMIT \${args.show_limit}\${args.from_name !== undefined ? \` FROM '\${args.from_name}'\` : ""}\` : ""}\`, warehouse: args.warehouse ?? ctx.warehouse }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json", Accept: "application/json" } })`,

  sentry_list_organization_projects: `({args}) => ({ method: "GET", url: \`https://sentry.io/api/0/organizations/\${args.organization_id_or_slug ?? args.organization_slug ?? args.organization}/projects/?\${qs({ cursor: args.cursor, per_page: args.per_page, query: args.query })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  sentry_list_a_project_s_issues: `({args}) => ({ method: "GET", url: \`https://sentry.io/api/0/projects/\${args.organization_id_or_slug ?? args.organization_slug ?? args.organization}/\${args.project_id_or_slug ?? args.project_slug ?? args.project}/issues/?\${qs({ cursor: args.cursor, query: args.query, sort: args.sort, statsPeriod: args.stats_period, shortIdLookup: args.short_id_lookup, hashes: args.hashes, limit: args.limit })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,

  // The IP ranges live on their own host; `/api/v1/ip-ranges` on the API host
  // returns 404. Verified live: https://ip-ranges.datadoghq.com/ -> 200.
  datadog_v1_get_ip_ranges: `() => ({ method: "GET", url: "https://ip-ranges.datadoghq.com/", headers: {} })`,

  pagerduty_list_incidents: `({args}) => ({ method: "GET", url: \`https://api.pagerduty.com/incidents?\${qs({ date_range: args.date_range, incident_key: args.incident_key, include: args.include, limit: args.limit, offset: args.offset, service_ids: args.service_ids, since: args.since, sort_by: args.sort_by, statuses: args.statuses, team_ids: args.team_ids, time_zone: args.time_zone, total: args.total, until: args.until, urgencies: args.urgencies, user_ids: args.user_ids })}\`, headers: { Authorization: "Token token=__TOKEN__", Accept: "application/vnd.pagerduty+json;version=2" } })`,
  pagerduty_create_incident: `({args, ctx}) => ({ method: "POST", url: "https://api.pagerduty.com/incidents", body: args.body, headers: { Authorization: "Token token=__TOKEN__", Accept: "application/vnd.pagerduty+json;version=2", "Content-Type": "application/json", From: String(ctx.pagerdutyEmail ?? "") } })`,
  pagerduty_list_services: `({args}) => ({ method: "GET", url: \`https://api.pagerduty.com/services?\${qs({ include: args.include, limit: args.limit, name: args.name, offset: args.offset, query: args.query, sort_by: args.sort_by, team_ids: args.team_ids, time_zone: args.time_zone, total: args.total })}\`, headers: { Authorization: "Token token=__TOKEN__", Accept: "application/vnd.pagerduty+json;version=2" } })`,

  // Exa's /search does not read `max_results`; the count field is `numResults`.
  exa_web_search: `({args}) => ({ method: "POST", url: "https://api.exa.ai/search", body: { query: args.query, numResults: args.max_results }, headers: { "x-api-key": "__TOKEN__", "Content-Type": "application/json" } })`,
  // Exa's /contents expects { urls: [...] } (not a single `url`) and truncates
  // via the nested `text.maxCharacters`, not a top-level `max_characters`.
  exa_web_fetch: `({args}) => ({ method: "POST", url: "https://api.exa.ai/contents", body: { urls: [args.url], ...(args.max_characters ? { text: { maxCharacters: args.max_characters } } : {}) }, headers: { "x-api-key": "__TOKEN__", "Content-Type": "application/json" } })`,

  perplexity_chat_completion: `({args}) => ({ method: "POST", url: "https://api.perplexity.ai/chat/completions", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,
  perplexity_search: `({args}) => ({ method: "POST", url: "https://api.perplexity.ai/search", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,

  resend_list_emails: `({args}) => ({ method: "GET", url: \`https://api.resend.com/emails?\${qs({ after: args.after, before: args.before, limit: args.limit })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  resend_create_contact: `({args}) => ({ method: "POST", url: "https://api.resend.com/contacts", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,

  calendly_list_event_types: `({args}) => ({ method: "GET", url: \`https://api.calendly.com/event_types?\${qs({ active: args.active, admin_managed: args.admin_managed, count: args.count, organization: args.organization, page_token: args.page_token, sort: args.sort, user: args.user, user_availability_schedule: args.user_availability_schedule })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  calendly_get_current_user: `() => ({ method: "GET", url: "https://api.calendly.com/users/me", headers: { Authorization: "Bearer __TOKEN__" } })`,

  clickup_create_task: `({args}) => ({ method: "POST", url: \`https://api.clickup.com/api/v2/list/\${args.list_id}/task\`, body: args, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } })`,
  clickup_get_task: `({args}) => ({ method: "GET", url: \`https://api.clickup.com/api/v2/task/\${args.task_id}\`, headers: { Authorization: "__TOKEN__" } })`,
  clickup_create_task_comment: `({args}) => ({ method: "POST", url: \`https://api.clickup.com/api/v2/task/\${args.task_id}/comment\`, body: args, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } })`,

  posthog_list_project_dashboards: `({args, ctx}) => ({ method: "GET", url: \`\${ctx.posthogBase}/api/projects/\${args.project_id}/dashboards/?\${qs({ limit: args.limit, offset: args.offset })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  // The matching-ids operation is its own path; the list endpoint was returning
  // full flag objects instead of the IDs this tool promises.
  posthog_get_feature_flags_matching_ids: `({args, ctx}) => ({ method: "GET", url: \`\${ctx.posthogBase}/api/projects/\${args.project_id}/feature_flags/matching_ids/\`, headers: { Authorization: "Bearer __TOKEN__" } })`,

  // Mixpanel's ingestion API takes the events as a base64-JSON `data` field, not
  // as a JSON body: a JSON body answers HTTP 200 with status 0 ("data, missing
  // or empty"), so the events were silently dropped. The endpoint is public
  // (`security: []`); the project token travels inside each event's
  // properties.token. verbose=1 makes the acceptance/failure visible in the
  // payload instead of a bare 0/1.
  mixpanel_track_event: `({args}) => ({ method: "POST", url: "https://api.mixpanel.com/track", form: { data: b64(args.events ?? []), verbose: 1 }, headers: { "Content-Type": "application/x-www-form-urlencoded" } })`,
  mixpanel_raw_event_export: `({args}) => ({ method: "GET", url: \`https://data.mixpanel.com/api/2.0/export/?\${qs({ from_date: args.from_date, to_date: args.to_date, limit: args.limit, project_id: args.project_id })}\`, headers: { Authorization: "Basic __TOKEN__" } })`,

  // Org-level endpoint; the schema exposes org_slug (not project_slug), and the
  // v2 API names these params in kebab-case (org-slug, page-token).
  circleci_list_pipelines: `({args}) => ({ method: "GET", url: \`https://circleci.com/api/v2/pipeline?\${qs({ "org-slug": args.org_slug, mine: args.mine, "page-token": args.page_token })}\`, headers: { "Circle-Token": "__TOKEN__" } })`,
  circleci_get_pipeline_by_id: `({args}) => ({ method: "GET", url: \`https://circleci.com/api/v2/pipeline/\${args.pipeline_id}\`, headers: { "Circle-Token": "__TOKEN__" } })`,

  mailchimp_list_campaigns: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.mailchimpDc}.api.mailchimp.com/3.0/campaigns?\${qs({ before_create_time: args.before_create_time, before_send_time: args.before_send_time, count: args.count, exclude_fields: args.exclude_fields, fields: args.fields, folder_id: args.folder_id, include_resend_shortcut_eligibility: args.include_resend_shortcut_eligibility, include_resend_shortcut_usage: args.include_resend_shortcut_usage, list_id: args.list_id, member_id: args.member_id, offset: args.offset, since_create_time: args.since_create_time, since_send_time: args.since_send_time, sort_dir: args.sort_dir, sort_field: args.sort_field, status: args.status, type: args.type })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  // list_id is the path parameter and skip_merge_validation is a query
  // parameter; forwarding them inside the body silently dropped the flag.
  mailchimp_add_member_to_list: `({args, ctx}) => {
    const { list_id, skip_merge_validation, ...fields } = args;
    return { method: "POST", url: \`https://\${ctx.mailchimpDc}.api.mailchimp.com/3.0/lists/\${list_id}/members?\${qs({ skip_merge_validation })}\`, body: fields, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } };
  }`,

  x_create_posts: `({args}) => ({ method: "POST", url: "https://api.x.com/2/tweets", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } })`,
  x_get_users_me: `({args}) => ({ method: "GET", url: \`https://api.x.com/2/users/me?\${qs({ expansions: args.expansions, "tweet.fields": args.post_fields, "user.fields": args.user_fields })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  // X's field params are dotted (tweet.fields, user.fields, ...); the schema
  // flattens them with underscores, so map them back.
  x_search_posts_recent: `({args}) => ({ method: "GET", url: \`https://api.x.com/2/tweets/search/recent?\${qs({ query: args.query, max_results: args.max_results, start_time: args.start_time, end_time: args.end_time, since_id: args.since_id, until_id: args.until_id, next_token: args.next_token, pagination_token: args.pagination_token, sort_order: args.sort_order, expansions: args.expansions, "tweet.fields": args.post_fields, "media.fields": args.media_fields, "poll.fields": args.poll_fields, "place.fields": args.place_fields, "user.fields": args.user_fields })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,

  square_list_payments: `({args}) => ({ method: "GET", url: \`https://connect.squareup.com/v2/payments?\${qs({ begin_time: args.begin_time, card_brand: args.card_brand, cursor: args.cursor, end_time: args.end_time, is_offline_payment: args.is_offline_payment, last_4: args.last_4, limit: args.limit, location_id: args.location_id, offline_begin_time: args.offline_begin_time, offline_end_time: args.offline_end_time, sort_field: args.sort_field, sort_order: args.sort_order, total: args.total, updated_at_begin_time: args.updated_at_begin_time, updated_at_end_time: args.updated_at_end_time })}\`, headers: { Authorization: "Bearer __TOKEN__", "Square-Version": "2024-01-18" } })`,
  square_create_payment: `({args}) => ({ method: "POST", url: "https://connect.squareup.com/v2/payments", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json", "Square-Version": "2024-01-18" } })`,
  square_list_customers: `({args}) => ({ method: "GET", url: \`https://connect.squareup.com/v2/customers?\${qs({ count: args.count, cursor: args.cursor, limit: args.limit, sort_field: args.sort_field, sort_order: args.sort_order })}\`, headers: { Authorization: "Bearer __TOKEN__", "Square-Version": "2024-01-18" } })`,

  openai_list_models: `() => ({ method: "GET", url: "https://api.openai.com/v1/models", headers: { Authorization: "Bearer __TOKEN__" } })`,

  gemini_generate_content: `({args}) => ({ method: "POST", url: \`https://generativelanguage.googleapis.com/v1beta/models/\${args.model ?? "gemini-2.0-flash"}:generateContent?key=__TOKEN__\`, body: args, headers: { "Content-Type": "application/json" } })`,
  gemini_list_models: `({args}) => ({ method: "GET", url: \`https://generativelanguage.googleapis.com/v1beta/models?\${qs({ key: "__TOKEN__", pageSize: args.page_size, pageToken: args.page_token })}\`, headers: {} })`,

  "anthropic-admin_list_workspaces": `({args}) => ({ method: "GET", url: \`https://api.anthropic.com/v1/organizations/workspaces?\${qs({ after_id: args.after_id, before_id: args.before_id, include_archived: args.include_archived, limit: args.limit })}\`, headers: { "x-api-key": "__TOKEN__", "anthropic-version": "2023-06-01" } })`,
  "anthropic-admin_list_api_keys": `({args}) => ({ method: "GET", url: \`https://api.anthropic.com/v1/organizations/api_keys?\${qs({ after_id: args.after_id, before_id: args.before_id, created_by_user_id: args.created_by_user_id, limit: args.limit, status: args.status, workspace_id: args.workspace_id })}\`, headers: { "x-api-key": "__TOKEN__", "anthropic-version": "2023-06-01" } })`,

  "grafana-cloud_list_stacks": `({args}) => ({ method: "GET", url: \`https://grafana.com/api/instances?\${qs({ orgSlug: args.org_slug })}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,
  // A single organization is addressed by path (GET /api/orgs/{slugOrId});
  // /api/orgs?orgSlug= is the legacy Grafana-server search endpoint.
  "grafana-cloud_get_org": `({args}) => ({ method: "GET", url: \`https://grafana.com/api/orgs/\${args.org_slug}\`, headers: { Authorization: "Bearer __TOKEN__" } })`,

  // Monday's GraphQL args are snake_case; build them from the declared fields.
  monday_boards: `({args}) => {
    const parts = ["limit: " + Number(args.limit ?? 25), "page: " + Number(args.page ?? 1)];
    if (args.ids && (!Array.isArray(args.ids) || args.ids.length)) parts.push("ids: " + JSON.stringify(Array.isArray(args.ids) ? args.ids : [args.ids]));
    if (args.board_kind) parts.push("board_kind: " + args.board_kind);
    if (args.state) parts.push("state: " + args.state);
    if (args.order_by) parts.push("order_by: " + args.order_by);
    if (args.workspace_ids && (!Array.isArray(args.workspace_ids) || args.workspace_ids.length)) parts.push("workspace_ids: " + JSON.stringify(Array.isArray(args.workspace_ids) ? args.workspace_ids : [args.workspace_ids]));
    return { method: "POST", url: "https://api.monday.com/v2", body: { query: "{ boards(" + parts.join(", ") + ") { id name } }" }, headers: { Authorization: "__TOKEN__", "API-Version": "2024-10", "Content-Type": "application/json" } };
  }`,
  monday_get_workspaces: `({args}) => {
    const parts = ["limit: " + Number(args.limit ?? 25), "page: " + Number(args.page ?? 1)];
    if (args.ids && (!Array.isArray(args.ids) || args.ids.length)) parts.push("ids: " + JSON.stringify(Array.isArray(args.ids) ? args.ids : [args.ids]));
    if (args.kind) parts.push("kind: " + args.kind);
    if (args.state) parts.push("state: " + args.state);
    if (args.order_by) parts.push("order_by: " + args.order_by);
    return { method: "POST", url: "https://api.monday.com/v2", body: { query: "{ workspaces(" + parts.join(", ") + ") { id name } }" }, headers: { Authorization: "__TOKEN__", "API-Version": "2024-10", "Content-Type": "application/json" } };
  }`,

  onesignal_view_an_app: `({args}) => ({ method: "GET", url: \`https://api.onesignal.com/apps/\${args.app_id}?\${qs({ view: args.view })}\`, headers: { Authorization: "Basic __TOKEN__" } })`,

  // Amplitude Experiment "local evaluation" flags API: the lab host, authenticated
  // with `Api-Key <server deployment key>`. The previous host (`experiment.amplitude.com`)
  // is the Management API and 404s on this path.
  amplitude_get_flags: `({args}) => ({ method: "GET", url: \`https://api.lab.amplitude.com/v1/flags?\${qs({ flag_keys: args.flag_keys })}\`, headers: { Authorization: "Api-Key __TOKEN__" } })`,

  // Zendesk is per-tenant: every path lives under
  // https://<subdomain>.zendesk.com, and the subdomain is not a constant.
  // API-token auth is `Basic base64(<email>/token:<api_token>)`; a bare
  // `<email>:<api_token>` is rejected with HTTP 401, so the `/token` literal is
  // part of the credential (the engine builds it for `__BASIC__`).
  zendesk_list_tickets: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets.json?\${qs({ external_id: args.external_id, page: args.page, per_page: args.per_page, sort_by: args.sort_by, sort_order: args.sort_order })}\`, headers: zendeskHeaders() })`,
  zendesk_get_ticket: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets/\${args.ticket_id}.json\`, headers: zendeskHeaders() })`,
  zendesk_list_ticket_comments: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets/\${args.ticket_id}/comments.json?\${qs({ "page[size]": args.page_size, "page[after]": args.page_after, sort_order: args.sort_order })}\`, headers: zendeskHeaders() })`,
  // Zendesk's unified search takes the whole filter in `query` (for example
  // `type:ticket status:open`); there is no per-field parameter to forward.
  zendesk_search: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/search.json?\${qs({ query: args.query, sort_by: args.sort_by, sort_order: args.sort_order, per_page: args.per_page })}\`, headers: zendeskHeaders() })`,
  zendesk_get_current_user: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/users/me.json\`, headers: zendeskHeaders() })`,
  // The users endpoint takes `role`/`roles`/`permission_set`/`external_id` and
  // pagination, and nothing else: it has no `sort_by`, so the tool must not
  // expose one. A value Zendesk does not know is ignored, not rejected, which
  // would let an unsorted page read as if it were sorted.
  zendesk_list_users: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/users.json?\${qs({ role: args.role, external_id: args.external_id, "page[size]": args.page_size, "page[after]": args.page_after })}\`, headers: zendeskHeaders() })`,
  // Cursor pagination is the style Zendesk recommends for this endpoint, and it
  // is the only one exposed: mixing offset `page` with `page[size]` in one
  // request is a documented error. `qs` encodes the bracketed keys.
  zendesk_list_organizations: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/organizations.json?\${qs({ "page[size]": args.page_size, "page[after]": args.page_after })}\`, headers: zendeskHeaders() })`,
  zendesk_list_views: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/views.json?\${qs({ "page[size]": args.page_size, "page[after]": args.page_after })}\`, headers: zendeskHeaders() })`,
  zendesk_list_view_tickets: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/views/\${args.view_id}/tickets.json?\${qs({ "page[size]": args.page_size, "page[after]": args.page_after })}\`, headers: zendeskHeaders() })`,
  // Zendesk wraps every write in a `ticket` envelope and models the requester
  // two ways: `requester_id` at the top level of the ticket, or a `requester`
  // object carrying `email`/`name` (its documented fields do not include `id`).
  // Exactly one form is sent, id first, so the two cannot disagree. `comment` is
  // omitted when there is none: forwarding the raw args would post
  // `comment_body` as an unknown field and open the ticket with no comment.
  zendesk_create_ticket: `({args, ctx}) => {
    const ticket: Record<string, unknown> = {};
    if (args.requester_id !== undefined) {
      ticket.requester_id = args.requester_id;
    } else {
      const requester: Record<string, unknown> = {};
      if (args.requester_email !== undefined) requester.email = args.requester_email;
      if (args.requester_name !== undefined) requester.name = args.requester_name;
      if (Object.keys(requester).length > 0) ticket.requester = requester;
    }
    if (args.subject !== undefined) ticket.subject = args.subject;
    if (args.comment_body !== undefined) {
      ticket.comment = { body: args.comment_body, public: args.public ?? true };
    }
    if (args.priority !== undefined) ticket.priority = args.priority;
    if (args.type !== undefined) ticket.type = args.type;
    if (args.tags !== undefined) ticket.tags = args.tags;
    return { method: "POST", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets.json\`, body: { ticket }, headers: zendeskHeaders() };
  }`,
  // A comment is added by updating the ticket, not by posting a comment
  // resource; `public: true` (the default) emails the requester.
  zendesk_add_ticket_comment: `({args, ctx}) => ({ method: "PUT", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets/\${args.ticket_id}.json\`, body: { ticket: { comment: { body: args.comment_body, public: args.public ?? true } } }, headers: zendeskHeaders() })`,
  // Triaging a ticket: the same PUT as add_ticket_comment, but the ticket
  // resource carries the settable fields, not a comment. Only the fields the
  // caller actually asked to change travel, so an update never resets a field
  // it was not told about; `assignee_id: null` is a real value (unassign), so it
  // is forwarded rather than dropped. `tags` replaces the whole set, per the API.
  zendesk_update_ticket: `({args, ctx}) => {
    const ticket: Record<string, unknown> = {};
    if (args.status !== undefined) ticket.status = args.status;
    if (args.priority !== undefined) ticket.priority = args.priority;
    if (args.assignee_id !== undefined) ticket.assignee_id = args.assignee_id;
    if (args.group_id !== undefined) ticket.group_id = args.group_id;
    if (args.subject !== undefined) ticket.subject = args.subject;
    if (args.type !== undefined) ticket.type = args.type;
    if (args.tags !== undefined) ticket.tags = args.tags;
    return { method: "PUT", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets/\${args.ticket_id}.json\`, body: { ticket }, headers: zendeskHeaders() };
  }`,
  zendesk_get_user: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/users/\${args.user_id}.json\`, headers: zendeskHeaders() })`,
  zendesk_get_organization: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/organizations/\${args.organization_id}.json\`, headers: zendeskHeaders() })`,
  // Sizing a view without fetching its tickets. The response is
  // `{ view_count: { value, fresh } }`, not an array.
  zendesk_count_view_tickets: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/views/\${args.view_id}/count.json\`, headers: zendeskHeaders() })`,
  // A ticket's metrics are a singular `ticket_metric` resource, not a listing.
  zendesk_get_ticket_metrics: `({args, ctx}) => ({ method: "GET", url: \`https://\${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets/\${args.ticket_id}/metrics.json\`, headers: zendeskHeaders() })`,
};

/**
 * Per-tool argument checks the JSON Schema cannot express.
 *
 * A call that would send a request the provider is certain to reject gets a
 * named refusal instead: the message reaches the caller verbatim and no HTTP
 * request is made. `null` means the arguments are acceptable; a string is the
 * reason they are not.
 */
const VALIDATORS = {
  // Zendesk needs a requester, and the tool models it two ways: a top-level
  // `requester_id`, or a `requester` object built from `requester_email`. The
  // schema cannot say "one of the two", so the pair is checked here rather than
  // letting Zendesk answer 422 for a request that never had a chance.
  zendesk_create_ticket: `(args) => (args.requester_id === undefined && args.requester_email === undefined ? "Provide requester_id or requester_email: Zendesk cannot create a ticket without a requester." : null)`,
};

const missing = tools.filter((t) => !ROUTES[t.toolSlug]).map((t) => t.toolSlug);
if (missing.length) {
  console.error("Missing routes:", missing);
  process.exit(1);
}

const entries = tools.map((t) => {
  const mutating = t.annotations?.readOnlyHint === false;
  const provider = providerFromToolkit(t.toolkitId);
  let verb;
  if (t.toolSlug.startsWith(`${t.toolkitId}_`)) {
    verb = t.toolSlug.slice(t.toolkitId.length + 1).replace(/_/g, "-");
  } else {
    verb = t.name.replace(/_/g, "-");
  }
  const gate = mutating
    ? `CONFIRM ${provider.toUpperCase().replace(/-/g, " ")} ${verb.toUpperCase().replace(/-/g, " ")}`
    : undefined;
  return {
    toolSlug: t.toolSlug,
    provider,
    verb,
    mutating,
    gate,
    validate: VALIDATORS[t.toolSlug],
    secretName: SECRETS[provider],
    build: ROUTES[t.toolSlug],
  };
});

const outDir = join(here, "..", "src/integration/mcp-tools");
mkdirSync(outDir, { recursive: true });

const helpers = `function qs(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.map(String).join(","));
      continue;
    }
    search.set(key, String(value));
  }
  return search.toString();
}

/** base64 of a JSON payload, for APIs that take their body in a \`data\` field. */
function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function githubHeaders(): Record<string, string> {
  return {
    Authorization: "Bearer __TOKEN__",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "warpmetal-cli",
    "Content-Type": "application/json",
  };
}

function notionHeaders(): Record<string, string> {
  return {
    Authorization: "Bearer __TOKEN__",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

/** Zendesk API-token auth: Basic base64(email/token:api_token). */
function zendeskHeaders(): Record<string, string> {
  return {
    Authorization: "Basic __BASIC__",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

/** Notion's paragraph block. Shared by append-block-children and create-page. */
function paragraphBlock(text: unknown): Record<string, unknown> {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: String(text ?? "") } }] },
  };
}

function jiraHeaders(): Record<string, string> {
  return {
    Authorization: "Basic __BASIC__",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

/** Minimal Atlassian Document Format paragraph, as the Jira v3 API requires. */
function adf(text: unknown): Record<string, unknown> {
  return {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "text", text: String(text ?? "") }] },
    ],
  };
}
`;

const catalogBody = `/**
 * Auto-generated MCP provider tool routes. Do not edit by hand; run
 * \`node packages/warpmetal-cli/scripts/gen-mcp-tools.mjs\`.
 */
import type { McpToolDef, McpToolRequest } from "./types.js";

${helpers}

type BuildFn = (input: { args: Record<string, unknown>; ctx: Record<string, string> }) => McpToolRequest;

const BUILDS: Record<string, BuildFn> = {
${entries.map((e) => `  ${JSON.stringify(e.toolSlug)}: ${e.build},`).join("\n")}
};

export const MCP_TOOL_DEFS: readonly McpToolDef[] = [
${entries
  .map(
    (e) => `  {
    toolSlug: ${JSON.stringify(e.toolSlug)},
    provider: ${JSON.stringify(e.provider)},
    verb: ${JSON.stringify(e.verb)},
    mutating: ${e.mutating},
    ${[e.gate ? `gate: ${JSON.stringify(e.gate)},` : "", e.validate ? `validate: ${e.validate},` : ""].filter(Boolean).join("\n    ")}
    secretName: ${JSON.stringify(e.secretName)},
    build: BUILDS[${JSON.stringify(e.toolSlug)}]!,
  }`,
  )
  .join(",\n")}
];

const BY_PROVIDER_VERB = new Map(
  MCP_TOOL_DEFS.map((def) => [\`\${def.provider}:\${def.verb}\`, def] as const),
);

export function findMcpTool(provider: string, verb: string): McpToolDef | undefined {
  return BY_PROVIDER_VERB.get(\`\${provider}:\${verb}\`);
}

export function mcpToolsForProvider(provider: string): readonly McpToolDef[] {
  return MCP_TOOL_DEFS.filter((def) => def.provider === provider);
}

export function mcpProviderNames(): readonly string[] {
  return [...new Set(MCP_TOOL_DEFS.map((def) => def.provider))].sort();
}
`;

writeFileSync(join(outDir, "catalog.ts"), catalogBody);
console.log("wrote", entries.length, "mcp tool defs");
