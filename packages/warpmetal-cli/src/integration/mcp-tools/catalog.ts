/**
 * Auto-generated MCP provider tool routes. Do not edit by hand; run
 * `node packages/warpmetal-cli/scripts/gen-mcp-tools.mjs`.
 */
import type { McpToolDef, McpToolRequest } from "./types.js";

function qs(params: Record<string, unknown>): string {
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

/**
 * The shape Grafana wants for a "multi" collection: tag=a&tag=b. qs joins an
 * array with commas, which is right for a "csv" collection (PagerDuty's
 * statuses, Grafana's dashboardUIDs) and silently wrong for a multi one.
 */
function repeat(key: string, values: unknown): string {
  if (!Array.isArray(values) || values.length === 0) return "";
  return values
    .map((value) => key + "=" + encodeURIComponent(String(value)))
    .join("&");
}

/** base64 of a JSON payload, for APIs that take their body in a `data` field. */
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


type BuildFn = (input: { args: Record<string, unknown>; ctx: Record<string, string> }) => McpToolRequest;

const BUILDS: Record<string, BuildFn> = {
  "github_create_issue": ({args}) => ({ method: "POST", url: `https://api.github.com/repos/${args.owner}/${args.repo}/issues`, body: { title: args.title, body: args.body ?? undefined }, headers: githubHeaders() }),
  "github_list_issues": ({args}) => ({ method: "GET", url: `https://api.github.com/repos/${args.owner}/${args.repo}/issues?${qs({ state: args.state, per_page: args.max_results })}`, headers: githubHeaders() }),
  "github_get_issue": ({args}) => ({ method: "GET", url: `https://api.github.com/repos/${args.owner}/${args.repo}/issues/${args.issue_number}`, headers: githubHeaders() }),
  "github_create_pull_request": ({args}) => ({ method: "POST", url: `https://api.github.com/repos/${args.owner}/${args.repo}/pulls`, body: { title: args.title, head: args.head, base: args.base, body: args.body ?? undefined, draft: args.draft ?? undefined }, headers: githubHeaders() }),
  "github_get_pull_request": ({args}) => ({ method: "GET", url: `https://api.github.com/repos/${args.owner}/${args.repo}/pulls/${args.pull_number}`, headers: githubHeaders() }),
  "github_search_repositories": ({args}) => ({ method: "GET", url: `https://api.github.com/search/repositories?${qs({ q: args.q, sort: args.sort, order: args.order, per_page: args.max_results })}`, headers: githubHeaders() }),
  "gitlab_list_projects": ({args}) => {
    const { custom_attributes, ...rest } = args;
    let url = `https://gitlab.com/api/v4/projects?${qs({ membership: true, ...rest })}`;
    if (custom_attributes && typeof custom_attributes === "object") {
      for (const [key, value] of Object.entries(custom_attributes)) {
        url += `&${encodeURIComponent(`custom_attributes[${key}]`)}=${encodeURIComponent(String(value))}`;
      }
    }
    return { method: "GET", url, headers: { "PRIVATE-TOKEN": "__TOKEN__" } };
  },
  "gitlab_create_project_issue": ({args}) => {
    const { project_id, ...fields } = args;
    return { method: "POST", url: `https://gitlab.com/api/v4/projects/${encodeURIComponent(String(project_id))}/issues`, body: fields, headers: { "PRIVATE-TOKEN": "__TOKEN__", "Content-Type": "application/json" } };
  },
  "gitlab_create_merge_request": ({args}) => {
    const { project_id, ...fields } = args;
    return { method: "POST", url: `https://gitlab.com/api/v4/projects/${encodeURIComponent(String(project_id))}/merge_requests`, body: fields, headers: { "PRIVATE-TOKEN": "__TOKEN__", "Content-Type": "application/json" } };
  },
  "notion_search": ({args}) => ({ method: "POST", url: "https://api.notion.com/v1/search", body: { query: args.query ?? "", page_size: args.page_size, start_cursor: args.start_cursor }, headers: notionHeaders() }),
  "notion_query_database": ({args}) => ({ method: "POST", url: `https://api.notion.com/v1/databases/${args.database_id}/query`, body: { filter: args.filter, sorts: args.sorts, page_size: args.page_size, start_cursor: args.start_cursor }, headers: notionHeaders() }),
  "notion_get_page": ({args}) => ({ method: "GET", url: `https://api.notion.com/v1/pages/${args.page_id}`, headers: notionHeaders() }),
  "notion_create_page": ({args}) => ({ method: "POST", url: "https://api.notion.com/v1/pages", body: { parent: { page_id: args.parent_page_id }, properties: { title: { title: [{ type: "text", text: { content: String(args.title ?? "") } }] } }, ...(args.content ? { children: [paragraphBlock(args.content)] } : {}) }, headers: notionHeaders() }),
  "notion_append_block_children": ({args}) => ({ method: "PATCH", url: `https://api.notion.com/v1/blocks/${args.block_id}/children`, body: { children: args.children ?? [paragraphBlock(args.content)] }, headers: notionHeaders() }),
  "stripe_post_customers": ({args}) => ({ method: "POST", url: "https://api.stripe.com/v1/customers", form: args, headers: { Authorization: "Bearer __TOKEN__" } }),
  "stripe_get_customers": ({args}) => {
    const created = args.created && typeof args.created === "object" && !Array.isArray(args.created) ? Object.fromEntries(Object.entries(args.created).map(([k, v]) => ["created[" + k + "]", v])) : {};
    return { method: "GET", url: "https://api.stripe.com/v1/customers?" + qs({ limit: args.limit, email: args.email, ending_before: args.ending_before, starting_after: args.starting_after, test_clock: args.test_clock, ...created }), headers: { Authorization: "Bearer __TOKEN__" } };
  },
  "stripe_post_payment_intents": ({args}) => ({ method: "POST", url: "https://api.stripe.com/v1/payment_intents", form: args, headers: { Authorization: "Bearer __TOKEN__" } }),
  "stripe_get_payment_intents": ({args}) => {
    const created = args.created && typeof args.created === "object" && !Array.isArray(args.created) ? Object.fromEntries(Object.entries(args.created).map(([k, v]) => ["created[" + k + "]", v])) : {};
    return { method: "GET", url: "https://api.stripe.com/v1/payment_intents?" + qs({ limit: args.limit, customer: args.customer, customer_account: args.customer_account, ending_before: args.ending_before, starting_after: args.starting_after, ...created }), headers: { Authorization: "Bearer __TOKEN__" } };
  },
  "stripe_get_balance": () => ({ method: "GET", url: "https://api.stripe.com/v1/balance", headers: { Authorization: "Bearer __TOKEN__" } }),
  "stripe_post_invoices": ({args}) => ({ method: "POST", url: "https://api.stripe.com/v1/invoices", form: args, headers: { Authorization: "Bearer __TOKEN__" } }),
  "jira_create_issue": ({args, ctx}) => ({ method: "POST", url: `${ctx.jiraBase}/rest/api/3/issue`, body: { fields: { project: { key: args.project_key }, summary: args.summary, issuetype: { name: args.issue_type }, description: adf(args.description) } }, headers: jiraHeaders() }),
  "jira_get_issue": ({args, ctx}) => ({ method: "GET", url: `${ctx.jiraBase}/rest/api/3/issue/${args.issueIdOrKey ?? args.issue_key ?? args.id}`, headers: jiraHeaders() }),
  "jira_add_comment": ({args, ctx}) => ({ method: "POST", url: `${ctx.jiraBase}/rest/api/3/issue/${args.issueIdOrKey ?? args.issue_key}/comment`, body: { body: adf(args.comment) }, headers: jiraHeaders() }),
  "jira_transition_issue": ({args, ctx}) => ({ method: "POST", url: `${ctx.jiraBase}/rest/api/3/issue/${args.issueIdOrKey ?? args.issue_key}/transitions`, body: { transition: { id: args.transition_id }, ...(args.comment ? { update: { comment: [{ add: { body: adf(args.comment) } }] } } : {}) }, headers: jiraHeaders() }),
  "jira_get_project": ({args, ctx}) => ({ method: "GET", url: `${ctx.jiraBase}/rest/api/3/project/${args.projectIdOrKey ?? args.project_key}?${qs({ expand: args.expand, properties: args.properties })}`, headers: jiraHeaders() }),
  "confluence_get_page_by_id": ({args, ctx}) => ({ method: "GET", url: `${ctx.confluenceBase}/wiki/api/v2/pages/${args.id ?? args.page_id}?${qs({ "body-format": args.body_format, version: args.version, "get-draft": args.draft })}`, headers: jiraHeaders() }),
  "confluence_get_pages": ({args, ctx}) => ({ method: "GET", url: `${ctx.confluenceBase}/wiki/api/v2/pages?${qs({ limit: args.limit, cursor: args.cursor, sort: args.sort, status: args.status, subtype: args.subtype, title: args.title, "space-id": args.space_id, "body-format": args.body_format })}`, headers: jiraHeaders() }),
  "linear_create_issue": ({args}) => ({ method: "POST", url: "https://api.linear.app/graphql", body: { query: "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }", variables: { input: { teamId: args.linear_team_id, title: args.title } } }, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } }),
  "linear_list_issues": ({args}) => ({ method: "POST", url: "https://api.linear.app/graphql", body: { query: "query($first: Int) { issues(first: $first) { nodes { id identifier title state { name } } } }", variables: { first: args.first } }, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } }),
  "linear_get_issue": ({args}) => ({ method: "POST", url: "https://api.linear.app/graphql", body: { query: "query($id: String!) { issue(id: $id) { id identifier title description url } }", variables: { id: args.issue_id ?? args.id ?? args.issueId } }, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } }),
  "linear_create_comment": ({args}) => {
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
  },
  "supabase_list_projects": ({args}) => ({ method: "GET", url: `https://api.supabase.com/v1/projects?${qs({ limit: args.limit, offset: args.offset, search: args.search, sort: args.sort, statuses: args.statuses, organization_slug: args.organization_slug })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "supabase_create_a_project": ({args}) => ({ method: "POST", url: "https://api.supabase.com/v1/projects", body: { name: args.name, organization_slug: args.organization_slug, db_pass: args.db_pass, region: args.region ?? undefined, plan: args.plan ?? undefined, desired_instance_size: args.desired_instance_size ?? undefined, high_availability: args.high_availability ?? undefined, kps_enabled: args.kps_enabled ?? undefined, postgres_engine: args.postgres_engine ?? undefined, release_channel: args.release_channel ?? undefined, region_selection: args.region_selection ?? undefined, template_url: args.template_url ?? undefined }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "supabase_apply_a_migration": ({args}) => ({ method: "POST", url: `https://api.supabase.com/v1/projects/${args.ref}/database/migrations`, body: { query: args.query, name: args.name ?? undefined, rollback: args.rollback ?? undefined }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "cloudflare_zones_get": ({args}) => ({ method: "GET", url: `https://api.cloudflare.com/client/v4/zones?${qs({ name: args.name, status: args.status, "account.id": args.account_id, "account.name": args.account_name, page: args.page, per_page: args.per_page, order: args.order, direction: args.direction, match: args.match, type: args.type })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "cloudflare_accounts_list_accounts": ({args}) => ({ method: "GET", url: `https://api.cloudflare.com/client/v4/accounts?${qs({ name: args.name, page: args.page, per_page: args.per_page, direction: args.direction })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "vercel_get_projects": ({args}) => ({ method: "GET", url: `https://api.vercel.com/v10/projects?${qs({ limit: args.limit, from: args.from, repo: args.repo, repoId: args.repo_id, repoUrl: args.repo_url, search: args.search, slug: args.slug, teamId: args.team_id, deprecated: args.deprecated, edgeConfigId: args.edge_config_id, edgeConfigTokenId: args.edge_config_token_id, excludeRepos: args.exclude_repos, gitForkProtection: args.git_fork_protection, buildMachineTypes: args.build_machine_types, buildQueueConfiguration: args.build_queue_configuration, elasticConcurrencyEnabled: args.elastic_concurrency_enabled, staticIpsEnabled: args.static_ips_enabled })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "vercel_create_project": ({args}) => ({ method: "POST", url: "https://api.vercel.com/v11/projects", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "vercel_get_deployments": ({args}) => ({ method: "GET", url: `https://api.vercel.com/v6/deployments?${qs({ app: args.app, branch: args.branch, from: args.from, limit: args.limit, projectId: args.project_id, projectIds: args.project_ids, rollbackCandidate: args.rollback_candidate, sha: args.sha, since: args.since, slug: args.slug, state: args.state, target: args.target, teamId: args.team_id, to: args.to, until: args.until, users: args.users })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "figma_get_file": ({args}) => ({ method: "GET", url: `https://api.figma.com/v1/files/${args.file_key ?? args.key}?${qs({ branch_data: args.branch_data, depth: args.depth, geometry: args.geometry, ids: args.ids, version: args.version })}`, headers: { "X-Figma-Token": "__TOKEN__" } }),
  "figma_get_file_nodes": ({args}) => ({ method: "GET", url: `https://api.figma.com/v1/files/${args.file_key ?? args.key}/nodes?${qs({ ids: args.ids, depth: args.depth, geometry: args.geometry, version: args.version })}`, headers: { "X-Figma-Token": "__TOKEN__" } }),
  "shopify_list_products": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.shop}/admin/api/2026-10/products.json?${qs({ limit: args.first })}`, headers: { "X-Shopify-Access-Token": "__TOKEN__" } }),
  "shopify_get_product": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.shop}/admin/api/2026-10/products/${args.product_id ?? args.id}.json`, headers: { "X-Shopify-Access-Token": "__TOKEN__" } }),
  "shopify_list_orders": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.shop}/admin/api/2026-10/orders.json?${qs({ limit: args.first })}`, headers: { "X-Shopify-Access-Token": "__TOKEN__" } }),
  "hubspot_crm_contacts_list": ({args}) => ({ method: "GET", url: `https://api.hubapi.com/crm/v3/objects/contacts?${qs({ limit: args.limit, after: args.after, archived: args.archived, properties: args.properties, properties_with_history: args.properties_with_history, associations: args.associations })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "hubspot_crm_contacts_create": ({args}) => ({ method: "POST", url: "https://api.hubapi.com/crm/v3/objects/contacts", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "hubspot_crm_deals_list": ({args}) => ({ method: "GET", url: `https://api.hubapi.com/crm/v3/objects/deals?${qs({ limit: args.limit, after: args.after, archived: args.archived, properties: args.properties, properties_with_history: args.properties_with_history, associations: args.associations })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "asana_get_a_task": ({args}) => ({ method: "GET", url: `https://app.asana.com/api/1.0/tasks/${args.task_gid ?? args.task_id}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "asana_create_a_project": ({args}) => ({ method: "POST", url: "https://app.asana.com/api/1.0/projects", body: { data: args }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "dropbox_list_folder": ({args}) => ({ method: "POST", url: "https://api.dropboxapi.com/2/files/list_folder", body: { path: args.path ?? "", recursive: args.recursive, limit: args.limit }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "dropbox_search_files": ({args}) => ({ method: "POST", url: "https://api.dropboxapi.com/2/files/search_v2", body: { query: args.query, options: { ...(args.path !== undefined ? { path: args.path } : {}), ...(args.max_results !== undefined ? { max_results: args.max_results } : {}) } }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "discord_get_my_user": () => ({ method: "GET", url: "https://discord.com/api/v10/users/@me", headers: { Authorization: "Bot __TOKEN__" } }),
  "discord_list_my_guilds": ({args}) => ({ method: "GET", url: `https://discord.com/api/v10/users/@me/guilds?${qs({ before: args.before, after: args.after, limit: args.limit, with_counts: args.with_counts })}`, headers: { Authorization: "Bot __TOKEN__" } }),
  "airtable_list_bases": ({args}) => ({ method: "GET", url: `https://api.airtable.com/v0/meta/bases?${qs({ offset: args.offset })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "intercom_list_all_contacts": ({args}) => ({ method: "GET", url: `https://api.intercom.io/contacts?${qs({ include_merge_history: args.include_merge_history })}`, headers: { Authorization: "Bearer __TOKEN__", Accept: "application/json" } }),
  "intercom_create_contact": ({args}) => ({ method: "POST", url: "https://api.intercom.io/contacts", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json", Accept: "application/json" } }),
  "snowflake_list_databases": ({args, ctx}) => ({ method: "POST", url: `${ctx.snowflakeBase}/api/v2/statements`, body: { statement: `SHOW DATABASES${args.history ? " HISTORY" : ""}${args.like !== undefined ? ` LIKE '${args.like}'` : ""}${args.starts_with !== undefined ? ` STARTS WITH '${args.starts_with}'` : ""}${args.show_limit !== undefined ? ` LIMIT ${args.show_limit}${args.from_name !== undefined ? ` FROM '${args.from_name}'` : ""}` : ""}`, warehouse: args.warehouse ?? ctx.warehouse }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json", Accept: "application/json" } }),
  "snowflake_list_tables": ({args, ctx}) => ({ method: "POST", url: `${ctx.snowflakeBase}/api/v2/statements`, body: { statement: `SHOW TABLES${args.history ? " HISTORY" : ""}${args.like !== undefined ? ` LIKE '${args.like}'` : ""} IN SCHEMA ${args.database}.${args.schema}${args.starts_with !== undefined ? ` STARTS WITH '${args.starts_with}'` : ""}${args.show_limit !== undefined ? ` LIMIT ${args.show_limit}${args.from_name !== undefined ? ` FROM '${args.from_name}'` : ""}` : ""}`, warehouse: args.warehouse ?? ctx.warehouse }, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json", Accept: "application/json" } }),
  "sentry_list_organization_projects": ({args}) => ({ method: "GET", url: `https://sentry.io/api/0/organizations/${args.organization_id_or_slug ?? args.organization_slug ?? args.organization}/projects/?${qs({ cursor: args.cursor, per_page: args.per_page, query: args.query })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "sentry_list_a_project_s_issues": ({args}) => ({ method: "GET", url: `https://sentry.io/api/0/projects/${args.organization_id_or_slug ?? args.organization_slug ?? args.organization}/${args.project_id_or_slug ?? args.project_slug ?? args.project}/issues/?${qs({ cursor: args.cursor, query: args.query, sort: args.sort, statsPeriod: args.stats_period, shortIdLookup: args.short_id_lookup, hashes: args.hashes, limit: args.limit })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "datadog_v1_get_ip_ranges": () => ({ method: "GET", url: "https://ip-ranges.datadoghq.com/", headers: {} }),
  "pagerduty_list_incidents": ({args}) => ({ method: "GET", url: `https://api.pagerduty.com/incidents?${qs({ date_range: args.date_range, incident_key: args.incident_key, include: args.include, limit: args.limit, offset: args.offset, service_ids: args.service_ids, since: args.since, sort_by: args.sort_by, statuses: args.statuses, team_ids: args.team_ids, time_zone: args.time_zone, total: args.total, until: args.until, urgencies: args.urgencies, user_ids: args.user_ids })}`, headers: { Authorization: "Token token=__TOKEN__", Accept: "application/vnd.pagerduty+json;version=2" } }),
  "pagerduty_create_incident": ({args, ctx}) => ({ method: "POST", url: "https://api.pagerduty.com/incidents", body: args.body, headers: { Authorization: "Token token=__TOKEN__", Accept: "application/vnd.pagerduty+json;version=2", "Content-Type": "application/json", From: String(ctx.pagerdutyEmail ?? "") } }),
  "pagerduty_list_services": ({args}) => ({ method: "GET", url: `https://api.pagerduty.com/services?${qs({ include: args.include, limit: args.limit, name: args.name, offset: args.offset, query: args.query, sort_by: args.sort_by, team_ids: args.team_ids, time_zone: args.time_zone, total: args.total })}`, headers: { Authorization: "Token token=__TOKEN__", Accept: "application/vnd.pagerduty+json;version=2" } }),
  "exa_web_search": ({args}) => ({ method: "POST", url: "https://api.exa.ai/search", body: { query: args.query, numResults: args.max_results }, headers: { "x-api-key": "__TOKEN__", "Content-Type": "application/json" } }),
  "exa_web_fetch": ({args}) => ({ method: "POST", url: "https://api.exa.ai/contents", body: { urls: [args.url], ...(args.max_characters ? { text: { maxCharacters: args.max_characters } } : {}) }, headers: { "x-api-key": "__TOKEN__", "Content-Type": "application/json" } }),
  "perplexity_chat_completion": ({args}) => ({ method: "POST", url: "https://api.perplexity.ai/chat/completions", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "perplexity_search": ({args}) => ({ method: "POST", url: "https://api.perplexity.ai/search", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "resend_list_emails": ({args}) => ({ method: "GET", url: `https://api.resend.com/emails?${qs({ after: args.after, before: args.before, limit: args.limit })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "resend_create_contact": ({args}) => ({ method: "POST", url: "https://api.resend.com/contacts", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "calendly_list_event_types": ({args}) => ({ method: "GET", url: `https://api.calendly.com/event_types?${qs({ active: args.active, admin_managed: args.admin_managed, count: args.count, organization: args.organization, page_token: args.page_token, sort: args.sort, user: args.user, user_availability_schedule: args.user_availability_schedule })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "calendly_get_current_user": () => ({ method: "GET", url: "https://api.calendly.com/users/me", headers: { Authorization: "Bearer __TOKEN__" } }),
  "clickup_create_task": ({args}) => ({ method: "POST", url: `https://api.clickup.com/api/v2/list/${args.list_id}/task`, body: args, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } }),
  "clickup_get_task": ({args}) => ({ method: "GET", url: `https://api.clickup.com/api/v2/task/${args.task_id}`, headers: { Authorization: "__TOKEN__" } }),
  "clickup_create_task_comment": ({args}) => ({ method: "POST", url: `https://api.clickup.com/api/v2/task/${args.task_id}/comment`, body: args, headers: { Authorization: "__TOKEN__", "Content-Type": "application/json" } }),
  "posthog_list_project_dashboards": ({args, ctx}) => ({ method: "GET", url: `${ctx.posthogBase}/api/projects/${args.project_id}/dashboards/?${qs({ limit: args.limit, offset: args.offset })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "posthog_get_feature_flags_matching_ids": ({args, ctx}) => ({ method: "GET", url: `${ctx.posthogBase}/api/projects/${args.project_id}/feature_flags/matching_ids/`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "mixpanel_track_event": ({args}) => ({ method: "POST", url: "https://api.mixpanel.com/track", form: { data: b64(args.events ?? []), verbose: 1 }, headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
  "mixpanel_raw_event_export": ({args}) => ({ method: "GET", url: `https://data.mixpanel.com/api/2.0/export/?${qs({ from_date: args.from_date, to_date: args.to_date, limit: args.limit, project_id: args.project_id })}`, headers: { Authorization: "Basic __TOKEN__" } }),
  "circleci_list_pipelines": ({args}) => ({ method: "GET", url: `https://circleci.com/api/v2/pipeline?${qs({ "org-slug": args.org_slug, mine: args.mine, "page-token": args.page_token })}`, headers: { "Circle-Token": "__TOKEN__" } }),
  "circleci_get_pipeline_by_id": ({args}) => ({ method: "GET", url: `https://circleci.com/api/v2/pipeline/${args.pipeline_id}`, headers: { "Circle-Token": "__TOKEN__" } }),
  "mailchimp_list_campaigns": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.mailchimpDc}.api.mailchimp.com/3.0/campaigns?${qs({ before_create_time: args.before_create_time, before_send_time: args.before_send_time, count: args.count, exclude_fields: args.exclude_fields, fields: args.fields, folder_id: args.folder_id, include_resend_shortcut_eligibility: args.include_resend_shortcut_eligibility, include_resend_shortcut_usage: args.include_resend_shortcut_usage, list_id: args.list_id, member_id: args.member_id, offset: args.offset, since_create_time: args.since_create_time, since_send_time: args.since_send_time, sort_dir: args.sort_dir, sort_field: args.sort_field, status: args.status, type: args.type })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "mailchimp_add_member_to_list": ({args, ctx}) => {
    const { list_id, skip_merge_validation, ...fields } = args;
    return { method: "POST", url: `https://${ctx.mailchimpDc}.api.mailchimp.com/3.0/lists/${list_id}/members?${qs({ skip_merge_validation })}`, body: fields, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } };
  },
  "x_create_posts": ({args}) => ({ method: "POST", url: "https://api.x.com/2/tweets", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json" } }),
  "x_get_users_me": ({args}) => ({ method: "GET", url: `https://api.x.com/2/users/me?${qs({ expansions: args.expansions, "tweet.fields": args.post_fields, "user.fields": args.user_fields })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "x_search_posts_recent": ({args}) => ({ method: "GET", url: `https://api.x.com/2/tweets/search/recent?${qs({ query: args.query, max_results: args.max_results, start_time: args.start_time, end_time: args.end_time, since_id: args.since_id, until_id: args.until_id, next_token: args.next_token, pagination_token: args.pagination_token, sort_order: args.sort_order, expansions: args.expansions, "tweet.fields": args.post_fields, "media.fields": args.media_fields, "poll.fields": args.poll_fields, "place.fields": args.place_fields, "user.fields": args.user_fields })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "square_list_payments": ({args}) => ({ method: "GET", url: `https://connect.squareup.com/v2/payments?${qs({ begin_time: args.begin_time, card_brand: args.card_brand, cursor: args.cursor, end_time: args.end_time, is_offline_payment: args.is_offline_payment, last_4: args.last_4, limit: args.limit, location_id: args.location_id, offline_begin_time: args.offline_begin_time, offline_end_time: args.offline_end_time, sort_field: args.sort_field, sort_order: args.sort_order, total: args.total, updated_at_begin_time: args.updated_at_begin_time, updated_at_end_time: args.updated_at_end_time })}`, headers: { Authorization: "Bearer __TOKEN__", "Square-Version": "2024-01-18" } }),
  "square_create_payment": ({args}) => ({ method: "POST", url: "https://connect.squareup.com/v2/payments", body: args, headers: { Authorization: "Bearer __TOKEN__", "Content-Type": "application/json", "Square-Version": "2024-01-18" } }),
  "square_list_customers": ({args}) => ({ method: "GET", url: `https://connect.squareup.com/v2/customers?${qs({ count: args.count, cursor: args.cursor, limit: args.limit, sort_field: args.sort_field, sort_order: args.sort_order })}`, headers: { Authorization: "Bearer __TOKEN__", "Square-Version": "2024-01-18" } }),
  "openai_list_models": () => ({ method: "GET", url: "https://api.openai.com/v1/models", headers: { Authorization: "Bearer __TOKEN__" } }),
  "gemini_generate_content": ({args}) => ({ method: "POST", url: `https://generativelanguage.googleapis.com/v1beta/models/${args.model ?? "gemini-2.0-flash"}:generateContent?key=__TOKEN__`, body: args, headers: { "Content-Type": "application/json" } }),
  "gemini_list_models": ({args}) => ({ method: "GET", url: `https://generativelanguage.googleapis.com/v1beta/models?${qs({ key: "__TOKEN__", pageSize: args.page_size, pageToken: args.page_token })}`, headers: {} }),
  "anthropic-admin_list_workspaces": ({args}) => ({ method: "GET", url: `https://api.anthropic.com/v1/organizations/workspaces?${qs({ after_id: args.after_id, before_id: args.before_id, include_archived: args.include_archived, limit: args.limit })}`, headers: { "x-api-key": "__TOKEN__", "anthropic-version": "2023-06-01" } }),
  "anthropic-admin_list_api_keys": ({args}) => ({ method: "GET", url: `https://api.anthropic.com/v1/organizations/api_keys?${qs({ after_id: args.after_id, before_id: args.before_id, created_by_user_id: args.created_by_user_id, limit: args.limit, status: args.status, workspace_id: args.workspace_id })}`, headers: { "x-api-key": "__TOKEN__", "anthropic-version": "2023-06-01" } }),
  "grafana-cloud_list_stacks": ({args}) => ({ method: "GET", url: `https://grafana.com/api/instances?${qs({ orgSlug: args.org_slug })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-cloud_get_org": ({args}) => ({ method: "GET", url: `https://grafana.com/api/orgs/${args.org_slug}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "monday_boards": ({args}) => {
    const parts = ["limit: " + Number(args.limit ?? 25), "page: " + Number(args.page ?? 1)];
    if (args.ids && (!Array.isArray(args.ids) || args.ids.length)) parts.push("ids: " + JSON.stringify(Array.isArray(args.ids) ? args.ids : [args.ids]));
    if (args.board_kind) parts.push("board_kind: " + args.board_kind);
    if (args.state) parts.push("state: " + args.state);
    if (args.order_by) parts.push("order_by: " + args.order_by);
    if (args.workspace_ids && (!Array.isArray(args.workspace_ids) || args.workspace_ids.length)) parts.push("workspace_ids: " + JSON.stringify(Array.isArray(args.workspace_ids) ? args.workspace_ids : [args.workspace_ids]));
    return { method: "POST", url: "https://api.monday.com/v2", body: { query: "{ boards(" + parts.join(", ") + ") { id name } }" }, headers: { Authorization: "__TOKEN__", "API-Version": "2024-10", "Content-Type": "application/json" } };
  },
  "monday_get_workspaces": ({args}) => {
    const parts = ["limit: " + Number(args.limit ?? 25), "page: " + Number(args.page ?? 1)];
    if (args.ids && (!Array.isArray(args.ids) || args.ids.length)) parts.push("ids: " + JSON.stringify(Array.isArray(args.ids) ? args.ids : [args.ids]));
    if (args.kind) parts.push("kind: " + args.kind);
    if (args.state) parts.push("state: " + args.state);
    if (args.order_by) parts.push("order_by: " + args.order_by);
    return { method: "POST", url: "https://api.monday.com/v2", body: { query: "{ workspaces(" + parts.join(", ") + ") { id name } }" }, headers: { Authorization: "__TOKEN__", "API-Version": "2024-10", "Content-Type": "application/json" } };
  },
  "onesignal_view_an_app": ({args}) => ({ method: "GET", url: `https://api.onesignal.com/apps/${args.app_id}?${qs({ view: args.view })}`, headers: { Authorization: "Basic __TOKEN__" } }),
  "amplitude_get_flags": ({args}) => ({ method: "GET", url: `https://api.lab.amplitude.com/v1/flags?${qs({ flag_keys: args.flag_keys })}`, headers: { Authorization: "Api-Key __TOKEN__" } }),
  "zendesk_list_tickets": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets.json?${qs({ external_id: args.external_id, page: args.page, per_page: args.per_page, sort_by: args.sort_by, sort_order: args.sort_order })}`, headers: zendeskHeaders() }),
  "zendesk_get_ticket": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets/${args.ticket_id}.json`, headers: zendeskHeaders() }),
  "zendesk_list_ticket_comments": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets/${args.ticket_id}/comments.json?${qs({ "page[size]": args.page_size, "page[after]": args.page_after, sort_order: args.sort_order })}`, headers: zendeskHeaders() }),
  "zendesk_search": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/search.json?${qs({ query: args.query, sort_by: args.sort_by, sort_order: args.sort_order, per_page: args.per_page })}`, headers: zendeskHeaders() }),
  "zendesk_get_current_user": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/users/me.json`, headers: zendeskHeaders() }),
  "zendesk_list_users": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/users.json?${qs({ role: args.role, external_id: args.external_id, "page[size]": args.page_size, "page[after]": args.page_after })}`, headers: zendeskHeaders() }),
  "zendesk_list_organizations": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/organizations.json?${qs({ "page[size]": args.page_size, "page[after]": args.page_after })}`, headers: zendeskHeaders() }),
  "zendesk_list_views": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/views.json?${qs({ "page[size]": args.page_size, "page[after]": args.page_after })}`, headers: zendeskHeaders() }),
  "zendesk_list_view_tickets": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/views/${args.view_id}/tickets.json?${qs({ "page[size]": args.page_size, "page[after]": args.page_after })}`, headers: zendeskHeaders() }),
  "zendesk_create_ticket": ({args, ctx}) => {
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
    return { method: "POST", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets.json`, body: { ticket }, headers: zendeskHeaders() };
  },
  "zendesk_add_ticket_comment": ({args, ctx}) => ({ method: "PUT", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets/${args.ticket_id}.json`, body: { ticket: { comment: { body: args.comment_body, public: args.public ?? true } } }, headers: zendeskHeaders() }),
  "zendesk_update_ticket": ({args, ctx}) => {
    const ticket: Record<string, unknown> = {};
    if (args.status !== undefined) ticket.status = args.status;
    if (args.priority !== undefined) ticket.priority = args.priority;
    if (args.assignee_id !== undefined) ticket.assignee_id = args.assignee_id;
    if (args.group_id !== undefined) ticket.group_id = args.group_id;
    if (args.subject !== undefined) ticket.subject = args.subject;
    if (args.type !== undefined) ticket.type = args.type;
    if (args.tags !== undefined) ticket.tags = args.tags;
    return { method: "PUT", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets/${args.ticket_id}.json`, body: { ticket }, headers: zendeskHeaders() };
  },
  "zendesk_get_user": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/users/${args.user_id}.json`, headers: zendeskHeaders() }),
  "zendesk_get_organization": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/organizations/${args.organization_id}.json`, headers: zendeskHeaders() }),
  "zendesk_count_view_tickets": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/views/${args.view_id}/count.json`, headers: zendeskHeaders() }),
  "zendesk_get_ticket_metrics": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.zendeskSubdomain}.zendesk.com/api/v2/tickets/${args.ticket_id}/metrics.json`, headers: zendeskHeaders() }),
  "grafana-stack_health": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/health`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_get_current_user": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/user`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_search": ({args, ctx}) => {
    const query = [qs({ query: args.query, type: args.type, dashboardUIDs: args.dashboard_uids, folderUIDs: args.folder_uids, starred: args.starred, limit: args.limit, page: args.page, permission: args.permission, sort: args.sort, deleted: args.deleted }), repeat("tag", args.tag)].filter(Boolean).join("&");
    return { method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/search?${query}`, headers: { Authorization: "Bearer __TOKEN__" } };
  },
  "grafana-stack_get_dashboard": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/dashboards/uid/${args.uid}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_list_datasources": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/datasources`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_check_datasource_health": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/datasources/uid/${args.uid}/health`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_list_folders": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/folders?${qs({ limit: args.limit, page: args.page, parentUid: args.parent_uid, permission: args.permission })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_list_alert_rules": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/v1/provisioning/alert-rules`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_list_annotations": ({args, ctx}) => {
    const query = [qs({ from: args.from, to: args.to, dashboardUID: args.dashboard_uid, limit: args.limit, type: args.type, matchAny: args.match_any }), repeat("tags", args.tags)].filter(Boolean).join("&");
    return { method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/annotations?${query}`, headers: { Authorization: "Bearer __TOKEN__" } };
  },
  "grafana-stack_list_contact_points": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/v1/provisioning/contact-points?${qs({ name: args.name })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_list_mute_timings": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/v1/provisioning/mute-timings`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_list_dashboard_tags": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/dashboards/tags`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_search_teams": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/teams/search?${qs({ page: args.page, perpage: args.per_page, name: args.name, query: args.query })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_list_org_users": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/org/users?${qs({ query: args.query, limit: args.limit })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
  "grafana-stack_list_library_elements": ({args, ctx}) => ({ method: "GET", url: `https://${ctx.grafanaStack}.grafana.net/api/library-elements?${qs({ searchString: args.search_string, sortDirection: args.sort_direction, folderFilter: args.folder_filter, perPage: args.per_page, page: args.page })}`, headers: { Authorization: "Bearer __TOKEN__" } }),
};

export const MCP_TOOL_DEFS: readonly McpToolDef[] = [
  {
    toolSlug: "github_create_issue",
    provider: "github",
    verb: "create-issue",
    mutating: true,
    gate: "CONFIRM GITHUB CREATE ISSUE",
    secretName: "github.token",
    build: BUILDS["github_create_issue"]!,
  },
  {
    toolSlug: "github_list_issues",
    provider: "github",
    verb: "list-issues",
    mutating: false,
    
    secretName: "github.token",
    build: BUILDS["github_list_issues"]!,
  },
  {
    toolSlug: "github_get_issue",
    provider: "github",
    verb: "get-issue",
    mutating: false,
    
    secretName: "github.token",
    build: BUILDS["github_get_issue"]!,
  },
  {
    toolSlug: "github_create_pull_request",
    provider: "github",
    verb: "create-pull-request",
    mutating: true,
    gate: "CONFIRM GITHUB CREATE PULL REQUEST",
    secretName: "github.token",
    build: BUILDS["github_create_pull_request"]!,
  },
  {
    toolSlug: "github_get_pull_request",
    provider: "github",
    verb: "get-pull-request",
    mutating: false,
    
    secretName: "github.token",
    build: BUILDS["github_get_pull_request"]!,
  },
  {
    toolSlug: "github_search_repositories",
    provider: "github",
    verb: "search-repositories",
    mutating: false,
    
    secretName: "github.token",
    build: BUILDS["github_search_repositories"]!,
  },
  {
    toolSlug: "gitlab_list_projects",
    provider: "gitlab",
    verb: "list-projects",
    mutating: false,
    
    secretName: "gitlab.token",
    build: BUILDS["gitlab_list_projects"]!,
  },
  {
    toolSlug: "gitlab_create_project_issue",
    provider: "gitlab",
    verb: "create-project-issue",
    mutating: true,
    gate: "CONFIRM GITLAB CREATE PROJECT ISSUE",
    secretName: "gitlab.token",
    build: BUILDS["gitlab_create_project_issue"]!,
  },
  {
    toolSlug: "gitlab_create_merge_request",
    provider: "gitlab",
    verb: "create-merge-request",
    mutating: true,
    gate: "CONFIRM GITLAB CREATE MERGE REQUEST",
    secretName: "gitlab.token",
    build: BUILDS["gitlab_create_merge_request"]!,
  },
  {
    toolSlug: "notion_search",
    provider: "notion",
    verb: "search",
    mutating: false,
    
    secretName: "notion.token",
    build: BUILDS["notion_search"]!,
  },
  {
    toolSlug: "notion_query_database",
    provider: "notion",
    verb: "query-database",
    mutating: false,
    
    secretName: "notion.token",
    build: BUILDS["notion_query_database"]!,
  },
  {
    toolSlug: "notion_get_page",
    provider: "notion",
    verb: "get-page",
    mutating: false,
    
    secretName: "notion.token",
    build: BUILDS["notion_get_page"]!,
  },
  {
    toolSlug: "notion_create_page",
    provider: "notion",
    verb: "create-page",
    mutating: true,
    gate: "CONFIRM NOTION CREATE PAGE",
    secretName: "notion.token",
    build: BUILDS["notion_create_page"]!,
  },
  {
    toolSlug: "notion_append_block_children",
    provider: "notion",
    verb: "append-block-children",
    mutating: true,
    gate: "CONFIRM NOTION APPEND BLOCK CHILDREN",
    secretName: "notion.token",
    build: BUILDS["notion_append_block_children"]!,
  },
  {
    toolSlug: "stripe_post_customers",
    provider: "stripe",
    verb: "post-customers",
    mutating: true,
    gate: "CONFIRM STRIPE POST CUSTOMERS",
    secretName: "stripe.token",
    build: BUILDS["stripe_post_customers"]!,
  },
  {
    toolSlug: "stripe_get_customers",
    provider: "stripe",
    verb: "get-customers",
    mutating: false,
    
    secretName: "stripe.token",
    build: BUILDS["stripe_get_customers"]!,
  },
  {
    toolSlug: "stripe_post_payment_intents",
    provider: "stripe",
    verb: "post-payment-intents",
    mutating: true,
    gate: "CONFIRM STRIPE POST PAYMENT INTENTS",
    secretName: "stripe.token",
    build: BUILDS["stripe_post_payment_intents"]!,
  },
  {
    toolSlug: "stripe_get_payment_intents",
    provider: "stripe",
    verb: "get-payment-intents",
    mutating: false,
    
    secretName: "stripe.token",
    build: BUILDS["stripe_get_payment_intents"]!,
  },
  {
    toolSlug: "stripe_get_balance",
    provider: "stripe",
    verb: "get-balance",
    mutating: false,
    
    secretName: "stripe.token",
    build: BUILDS["stripe_get_balance"]!,
  },
  {
    toolSlug: "stripe_post_invoices",
    provider: "stripe",
    verb: "post-invoices",
    mutating: true,
    gate: "CONFIRM STRIPE POST INVOICES",
    secretName: "stripe.token",
    build: BUILDS["stripe_post_invoices"]!,
  },
  {
    toolSlug: "jira_create_issue",
    provider: "jira",
    verb: "create-issue",
    mutating: true,
    gate: "CONFIRM JIRA CREATE ISSUE",
    secretName: "jira.token",
    build: BUILDS["jira_create_issue"]!,
  },
  {
    toolSlug: "jira_get_issue",
    provider: "jira",
    verb: "get-issue",
    mutating: false,
    
    secretName: "jira.token",
    build: BUILDS["jira_get_issue"]!,
  },
  {
    toolSlug: "jira_add_comment",
    provider: "jira",
    verb: "add-comment",
    mutating: true,
    gate: "CONFIRM JIRA ADD COMMENT",
    secretName: "jira.token",
    build: BUILDS["jira_add_comment"]!,
  },
  {
    toolSlug: "jira_transition_issue",
    provider: "jira",
    verb: "transition-issue",
    mutating: true,
    gate: "CONFIRM JIRA TRANSITION ISSUE",
    secretName: "jira.token",
    build: BUILDS["jira_transition_issue"]!,
  },
  {
    toolSlug: "jira_get_project",
    provider: "jira",
    verb: "get-project",
    mutating: false,
    
    secretName: "jira.token",
    build: BUILDS["jira_get_project"]!,
  },
  {
    toolSlug: "confluence_get_page_by_id",
    provider: "confluence",
    verb: "get-page-by-id",
    mutating: false,
    
    secretName: "confluence.token",
    build: BUILDS["confluence_get_page_by_id"]!,
  },
  {
    toolSlug: "confluence_get_pages",
    provider: "confluence",
    verb: "get-pages",
    mutating: false,
    
    secretName: "confluence.token",
    build: BUILDS["confluence_get_pages"]!,
  },
  {
    toolSlug: "linear_create_issue",
    provider: "linear",
    verb: "create-issue",
    mutating: true,
    gate: "CONFIRM LINEAR CREATE ISSUE",
    secretName: "linear.token",
    build: BUILDS["linear_create_issue"]!,
  },
  {
    toolSlug: "linear_list_issues",
    provider: "linear",
    verb: "list-issues",
    mutating: false,
    
    secretName: "linear.token",
    build: BUILDS["linear_list_issues"]!,
  },
  {
    toolSlug: "linear_get_issue",
    provider: "linear",
    verb: "get-issue",
    mutating: false,
    
    secretName: "linear.token",
    build: BUILDS["linear_get_issue"]!,
  },
  {
    toolSlug: "linear_create_comment",
    provider: "linear",
    verb: "create-comment",
    mutating: true,
    gate: "CONFIRM LINEAR CREATE COMMENT",
    secretName: "linear.token",
    build: BUILDS["linear_create_comment"]!,
  },
  {
    toolSlug: "supabase_list_projects",
    provider: "supabase",
    verb: "list-projects",
    mutating: false,
    
    secretName: "supabase.token",
    build: BUILDS["supabase_list_projects"]!,
  },
  {
    toolSlug: "supabase_create_a_project",
    provider: "supabase",
    verb: "create-a-project",
    mutating: true,
    gate: "CONFIRM SUPABASE CREATE A PROJECT",
    secretName: "supabase.token",
    build: BUILDS["supabase_create_a_project"]!,
  },
  {
    toolSlug: "supabase_apply_a_migration",
    provider: "supabase",
    verb: "apply-a-migration",
    mutating: true,
    gate: "CONFIRM SUPABASE APPLY A MIGRATION",
    secretName: "supabase.token",
    build: BUILDS["supabase_apply_a_migration"]!,
  },
  {
    toolSlug: "cloudflare_zones_get",
    provider: "cloudflare",
    verb: "zones-get",
    mutating: false,
    
    secretName: "cloudflare.token",
    build: BUILDS["cloudflare_zones_get"]!,
  },
  {
    toolSlug: "cloudflare_accounts_list_accounts",
    provider: "cloudflare",
    verb: "accounts-list-accounts",
    mutating: false,
    
    secretName: "cloudflare.token",
    build: BUILDS["cloudflare_accounts_list_accounts"]!,
  },
  {
    toolSlug: "vercel_get_projects",
    provider: "vercel",
    verb: "get-projects",
    mutating: false,
    
    secretName: "vercel.token",
    build: BUILDS["vercel_get_projects"]!,
  },
  {
    toolSlug: "vercel_create_project",
    provider: "vercel",
    verb: "create-project",
    mutating: true,
    gate: "CONFIRM VERCEL CREATE PROJECT",
    secretName: "vercel.token",
    build: BUILDS["vercel_create_project"]!,
  },
  {
    toolSlug: "vercel_get_deployments",
    provider: "vercel",
    verb: "get-deployments",
    mutating: false,
    
    secretName: "vercel.token",
    build: BUILDS["vercel_get_deployments"]!,
  },
  {
    toolSlug: "figma_get_file",
    provider: "figma",
    verb: "get-file",
    mutating: false,
    
    secretName: "figma.token",
    build: BUILDS["figma_get_file"]!,
  },
  {
    toolSlug: "figma_get_file_nodes",
    provider: "figma",
    verb: "get-file-nodes",
    mutating: false,
    
    secretName: "figma.token",
    build: BUILDS["figma_get_file_nodes"]!,
  },
  {
    toolSlug: "shopify_list_products",
    provider: "shopify",
    verb: "list-products",
    mutating: false,
    
    secretName: "shopify.token",
    build: BUILDS["shopify_list_products"]!,
  },
  {
    toolSlug: "shopify_get_product",
    provider: "shopify",
    verb: "get-product",
    mutating: false,
    
    secretName: "shopify.token",
    build: BUILDS["shopify_get_product"]!,
  },
  {
    toolSlug: "shopify_list_orders",
    provider: "shopify",
    verb: "list-orders",
    mutating: false,
    
    secretName: "shopify.token",
    build: BUILDS["shopify_list_orders"]!,
  },
  {
    toolSlug: "hubspot_crm_contacts_list",
    provider: "hubspot",
    verb: "crm-contacts-list",
    mutating: false,
    
    secretName: "hubspot.token",
    build: BUILDS["hubspot_crm_contacts_list"]!,
  },
  {
    toolSlug: "hubspot_crm_contacts_create",
    provider: "hubspot",
    verb: "crm-contacts-create",
    mutating: true,
    gate: "CONFIRM HUBSPOT CRM CONTACTS CREATE",
    secretName: "hubspot.token",
    build: BUILDS["hubspot_crm_contacts_create"]!,
  },
  {
    toolSlug: "hubspot_crm_deals_list",
    provider: "hubspot",
    verb: "crm-deals-list",
    mutating: false,
    
    secretName: "hubspot.token",
    build: BUILDS["hubspot_crm_deals_list"]!,
  },
  {
    toolSlug: "asana_get_a_task",
    provider: "asana",
    verb: "get-a-task",
    mutating: false,
    
    secretName: "asana.token",
    build: BUILDS["asana_get_a_task"]!,
  },
  {
    toolSlug: "asana_create_a_project",
    provider: "asana",
    verb: "create-a-project",
    mutating: true,
    gate: "CONFIRM ASANA CREATE A PROJECT",
    secretName: "asana.token",
    build: BUILDS["asana_create_a_project"]!,
  },
  {
    toolSlug: "dropbox_list_folder",
    provider: "dropbox",
    verb: "list-folder",
    mutating: false,
    
    secretName: "dropbox.token",
    build: BUILDS["dropbox_list_folder"]!,
  },
  {
    toolSlug: "dropbox_search_files",
    provider: "dropbox",
    verb: "search-files",
    mutating: false,
    
    secretName: "dropbox.token",
    build: BUILDS["dropbox_search_files"]!,
  },
  {
    toolSlug: "discord_get_my_user",
    provider: "discord",
    verb: "get-my-user",
    mutating: false,
    
    secretName: "discord.token",
    build: BUILDS["discord_get_my_user"]!,
  },
  {
    toolSlug: "discord_list_my_guilds",
    provider: "discord",
    verb: "list-my-guilds",
    mutating: false,
    
    secretName: "discord.token",
    build: BUILDS["discord_list_my_guilds"]!,
  },
  {
    toolSlug: "airtable_list_bases",
    provider: "airtable",
    verb: "list-bases",
    mutating: false,
    
    secretName: "airtable.token",
    build: BUILDS["airtable_list_bases"]!,
  },
  {
    toolSlug: "intercom_list_all_contacts",
    provider: "intercom",
    verb: "list-all-contacts",
    mutating: false,
    
    secretName: "intercom.token",
    build: BUILDS["intercom_list_all_contacts"]!,
  },
  {
    toolSlug: "intercom_create_contact",
    provider: "intercom",
    verb: "create-contact",
    mutating: true,
    gate: "CONFIRM INTERCOM CREATE CONTACT",
    secretName: "intercom.token",
    build: BUILDS["intercom_create_contact"]!,
  },
  {
    toolSlug: "snowflake_list_databases",
    provider: "snowflake",
    verb: "list-databases",
    mutating: false,
    
    secretName: "snowflake.token",
    build: BUILDS["snowflake_list_databases"]!,
  },
  {
    toolSlug: "snowflake_list_tables",
    provider: "snowflake",
    verb: "list-tables",
    mutating: false,
    
    secretName: "snowflake.token",
    build: BUILDS["snowflake_list_tables"]!,
  },
  {
    toolSlug: "sentry_list_organization_projects",
    provider: "sentry",
    verb: "list-organization-projects",
    mutating: false,
    
    secretName: "sentry.token",
    build: BUILDS["sentry_list_organization_projects"]!,
  },
  {
    toolSlug: "sentry_list_a_project_s_issues",
    provider: "sentry",
    verb: "list-a-project-s-issues",
    mutating: false,
    
    secretName: "sentry.token",
    build: BUILDS["sentry_list_a_project_s_issues"]!,
  },
  {
    toolSlug: "datadog_v1_get_ip_ranges",
    provider: "datadog",
    verb: "v1-get-ip-ranges",
    mutating: false,
    
    secretName: "datadog.token",
    build: BUILDS["datadog_v1_get_ip_ranges"]!,
  },
  {
    toolSlug: "pagerduty_list_incidents",
    provider: "pagerduty",
    verb: "list-incidents",
    mutating: false,
    
    secretName: "pagerduty.token",
    build: BUILDS["pagerduty_list_incidents"]!,
  },
  {
    toolSlug: "pagerduty_create_incident",
    provider: "pagerduty",
    verb: "create-incident",
    mutating: true,
    gate: "CONFIRM PAGERDUTY CREATE INCIDENT",
    secretName: "pagerduty.token",
    build: BUILDS["pagerduty_create_incident"]!,
  },
  {
    toolSlug: "pagerduty_list_services",
    provider: "pagerduty",
    verb: "list-services",
    mutating: false,
    
    secretName: "pagerduty.token",
    build: BUILDS["pagerduty_list_services"]!,
  },
  {
    toolSlug: "exa_web_search",
    provider: "exa",
    verb: "web-search",
    mutating: false,
    
    secretName: "exa.token",
    build: BUILDS["exa_web_search"]!,
  },
  {
    toolSlug: "exa_web_fetch",
    provider: "exa",
    verb: "web-fetch",
    mutating: false,
    
    secretName: "exa.token",
    build: BUILDS["exa_web_fetch"]!,
  },
  {
    toolSlug: "perplexity_chat_completion",
    provider: "perplexity",
    verb: "chat-completion",
    mutating: false,
    
    secretName: "perplexity.token",
    build: BUILDS["perplexity_chat_completion"]!,
  },
  {
    toolSlug: "perplexity_search",
    provider: "perplexity",
    verb: "search",
    mutating: false,
    
    secretName: "perplexity.token",
    build: BUILDS["perplexity_search"]!,
  },
  {
    toolSlug: "resend_list_emails",
    provider: "email",
    verb: "list-emails",
    mutating: false,
    
    secretName: "email.api_key",
    build: BUILDS["resend_list_emails"]!,
  },
  {
    toolSlug: "resend_create_contact",
    provider: "email",
    verb: "create-contact",
    mutating: true,
    gate: "CONFIRM EMAIL CREATE CONTACT",
    secretName: "email.api_key",
    build: BUILDS["resend_create_contact"]!,
  },
  {
    toolSlug: "calendly_list_event_types",
    provider: "calendly",
    verb: "list-event-types",
    mutating: false,
    
    secretName: "calendly.token",
    build: BUILDS["calendly_list_event_types"]!,
  },
  {
    toolSlug: "calendly_get_current_user",
    provider: "calendly",
    verb: "get-current-user",
    mutating: false,
    
    secretName: "calendly.token",
    build: BUILDS["calendly_get_current_user"]!,
  },
  {
    toolSlug: "clickup_create_task",
    provider: "clickup",
    verb: "create-task",
    mutating: true,
    gate: "CONFIRM CLICKUP CREATE TASK",
    secretName: "clickup.token",
    build: BUILDS["clickup_create_task"]!,
  },
  {
    toolSlug: "clickup_get_task",
    provider: "clickup",
    verb: "get-task",
    mutating: false,
    
    secretName: "clickup.token",
    build: BUILDS["clickup_get_task"]!,
  },
  {
    toolSlug: "clickup_create_task_comment",
    provider: "clickup",
    verb: "create-task-comment",
    mutating: true,
    gate: "CONFIRM CLICKUP CREATE TASK COMMENT",
    secretName: "clickup.token",
    build: BUILDS["clickup_create_task_comment"]!,
  },
  {
    toolSlug: "posthog_list_project_dashboards",
    provider: "posthog",
    verb: "list-project-dashboards",
    mutating: false,
    
    secretName: "posthog.token",
    build: BUILDS["posthog_list_project_dashboards"]!,
  },
  {
    toolSlug: "posthog_get_feature_flags_matching_ids",
    provider: "posthog",
    verb: "get-feature-flags-matching-ids",
    mutating: false,
    
    secretName: "posthog.token",
    build: BUILDS["posthog_get_feature_flags_matching_ids"]!,
  },
  {
    toolSlug: "mixpanel_track_event",
    provider: "mixpanel",
    verb: "track-event",
    mutating: true,
    gate: "CONFIRM MIXPANEL TRACK EVENT",
    secretName: "mixpanel.token",
    build: BUILDS["mixpanel_track_event"]!,
  },
  {
    toolSlug: "mixpanel_raw_event_export",
    provider: "mixpanel",
    verb: "raw-event-export",
    mutating: false,
    
    secretName: "mixpanel.token",
    build: BUILDS["mixpanel_raw_event_export"]!,
  },
  {
    toolSlug: "circleci_list_pipelines",
    provider: "circleci",
    verb: "list-pipelines",
    mutating: false,
    
    secretName: "circleci.token",
    build: BUILDS["circleci_list_pipelines"]!,
  },
  {
    toolSlug: "circleci_get_pipeline_by_id",
    provider: "circleci",
    verb: "get-pipeline-by-id",
    mutating: false,
    
    secretName: "circleci.token",
    build: BUILDS["circleci_get_pipeline_by_id"]!,
  },
  {
    toolSlug: "mailchimp_list_campaigns",
    provider: "mailchimp",
    verb: "list-campaigns",
    mutating: false,
    
    secretName: "mailchimp.token",
    build: BUILDS["mailchimp_list_campaigns"]!,
  },
  {
    toolSlug: "mailchimp_add_member_to_list",
    provider: "mailchimp",
    verb: "add-member-to-list",
    mutating: true,
    gate: "CONFIRM MAILCHIMP ADD MEMBER TO LIST",
    secretName: "mailchimp.token",
    build: BUILDS["mailchimp_add_member_to_list"]!,
  },
  {
    toolSlug: "x_create_posts",
    provider: "x",
    verb: "create-posts",
    mutating: true,
    gate: "CONFIRM X CREATE POSTS",
    secretName: "x.token",
    build: BUILDS["x_create_posts"]!,
  },
  {
    toolSlug: "x_get_users_me",
    provider: "x",
    verb: "get-users-me",
    mutating: false,
    
    secretName: "x.token",
    build: BUILDS["x_get_users_me"]!,
  },
  {
    toolSlug: "x_search_posts_recent",
    provider: "x",
    verb: "search-posts-recent",
    mutating: false,
    
    secretName: "x.token",
    build: BUILDS["x_search_posts_recent"]!,
  },
  {
    toolSlug: "square_list_payments",
    provider: "square",
    verb: "list-payments",
    mutating: false,
    
    secretName: "square.token",
    build: BUILDS["square_list_payments"]!,
  },
  {
    toolSlug: "square_create_payment",
    provider: "square",
    verb: "create-payment",
    mutating: true,
    gate: "CONFIRM SQUARE CREATE PAYMENT",
    secretName: "square.token",
    build: BUILDS["square_create_payment"]!,
  },
  {
    toolSlug: "square_list_customers",
    provider: "square",
    verb: "list-customers",
    mutating: false,
    
    secretName: "square.token",
    build: BUILDS["square_list_customers"]!,
  },
  {
    toolSlug: "openai_list_models",
    provider: "openai",
    verb: "list-models",
    mutating: false,
    
    secretName: "openai.token",
    build: BUILDS["openai_list_models"]!,
  },
  {
    toolSlug: "gemini_generate_content",
    provider: "gemini",
    verb: "generate-content",
    mutating: true,
    gate: "CONFIRM GEMINI GENERATE CONTENT",
    secretName: "gemini.token",
    build: BUILDS["gemini_generate_content"]!,
  },
  {
    toolSlug: "gemini_list_models",
    provider: "gemini",
    verb: "list-models",
    mutating: false,
    
    secretName: "gemini.token",
    build: BUILDS["gemini_list_models"]!,
  },
  {
    toolSlug: "anthropic-admin_list_workspaces",
    provider: "anthropic-admin",
    verb: "list-workspaces",
    mutating: false,
    
    secretName: "anthropic-admin.token",
    build: BUILDS["anthropic-admin_list_workspaces"]!,
  },
  {
    toolSlug: "anthropic-admin_list_api_keys",
    provider: "anthropic-admin",
    verb: "list-api-keys",
    mutating: false,
    
    secretName: "anthropic-admin.token",
    build: BUILDS["anthropic-admin_list_api_keys"]!,
  },
  {
    toolSlug: "grafana-cloud_list_stacks",
    provider: "grafana-cloud",
    verb: "list-stacks",
    mutating: false,
    
    secretName: "grafana-cloud.token",
    build: BUILDS["grafana-cloud_list_stacks"]!,
  },
  {
    toolSlug: "grafana-cloud_get_org",
    provider: "grafana-cloud",
    verb: "get-org",
    mutating: false,
    
    secretName: "grafana-cloud.token",
    build: BUILDS["grafana-cloud_get_org"]!,
  },
  {
    toolSlug: "monday_boards",
    provider: "monday",
    verb: "boards",
    mutating: false,
    
    secretName: "monday.token",
    build: BUILDS["monday_boards"]!,
  },
  {
    toolSlug: "monday_get_workspaces",
    provider: "monday",
    verb: "get-workspaces",
    mutating: false,
    
    secretName: "monday.token",
    build: BUILDS["monday_get_workspaces"]!,
  },
  {
    toolSlug: "onesignal_view_an_app",
    provider: "onesignal",
    verb: "view-an-app",
    mutating: false,
    
    secretName: "onesignal.token",
    build: BUILDS["onesignal_view_an_app"]!,
  },
  {
    toolSlug: "amplitude_get_flags",
    provider: "amplitude",
    verb: "get-flags",
    mutating: false,
    
    secretName: "amplitude.token",
    build: BUILDS["amplitude_get_flags"]!,
  },
  {
    toolSlug: "zendesk_list_tickets",
    provider: "zendesk",
    verb: "list-tickets",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_list_tickets"]!,
  },
  {
    toolSlug: "zendesk_get_ticket",
    provider: "zendesk",
    verb: "get-ticket",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_get_ticket"]!,
  },
  {
    toolSlug: "zendesk_list_ticket_comments",
    provider: "zendesk",
    verb: "list-ticket-comments",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_list_ticket_comments"]!,
  },
  {
    toolSlug: "zendesk_search",
    provider: "zendesk",
    verb: "search",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_search"]!,
  },
  {
    toolSlug: "zendesk_get_current_user",
    provider: "zendesk",
    verb: "get-current-user",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_get_current_user"]!,
  },
  {
    toolSlug: "zendesk_list_users",
    provider: "zendesk",
    verb: "list-users",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_list_users"]!,
  },
  {
    toolSlug: "zendesk_list_organizations",
    provider: "zendesk",
    verb: "list-organizations",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_list_organizations"]!,
  },
  {
    toolSlug: "zendesk_list_views",
    provider: "zendesk",
    verb: "list-views",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_list_views"]!,
  },
  {
    toolSlug: "zendesk_list_view_tickets",
    provider: "zendesk",
    verb: "list-view-tickets",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_list_view_tickets"]!,
  },
  {
    toolSlug: "zendesk_create_ticket",
    provider: "zendesk",
    verb: "create-ticket",
    mutating: true,
    gate: "CONFIRM ZENDESK CREATE TICKET",
    validate: (args) => (args.requester_id === undefined && args.requester_email === undefined ? "Provide requester_id or requester_email: Zendesk cannot create a ticket without a requester." : null),
    secretName: "zendesk.token",
    build: BUILDS["zendesk_create_ticket"]!,
  },
  {
    toolSlug: "zendesk_add_ticket_comment",
    provider: "zendesk",
    verb: "add-ticket-comment",
    mutating: true,
    gate: "CONFIRM ZENDESK ADD TICKET COMMENT",
    secretName: "zendesk.token",
    build: BUILDS["zendesk_add_ticket_comment"]!,
  },
  {
    toolSlug: "zendesk_update_ticket",
    provider: "zendesk",
    verb: "update-ticket",
    mutating: true,
    gate: "CONFIRM ZENDESK UPDATE TICKET",
    secretName: "zendesk.token",
    build: BUILDS["zendesk_update_ticket"]!,
  },
  {
    toolSlug: "zendesk_get_user",
    provider: "zendesk",
    verb: "get-user",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_get_user"]!,
  },
  {
    toolSlug: "zendesk_get_organization",
    provider: "zendesk",
    verb: "get-organization",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_get_organization"]!,
  },
  {
    toolSlug: "zendesk_count_view_tickets",
    provider: "zendesk",
    verb: "count-view-tickets",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_count_view_tickets"]!,
  },
  {
    toolSlug: "zendesk_get_ticket_metrics",
    provider: "zendesk",
    verb: "get-ticket-metrics",
    mutating: false,
    
    secretName: "zendesk.token",
    build: BUILDS["zendesk_get_ticket_metrics"]!,
  },
  {
    toolSlug: "grafana-stack_health",
    provider: "grafana-stack",
    verb: "health",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_health"]!,
  },
  {
    toolSlug: "grafana-stack_get_current_user",
    provider: "grafana-stack",
    verb: "get-current-user",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_get_current_user"]!,
  },
  {
    toolSlug: "grafana-stack_search",
    provider: "grafana-stack",
    verb: "search",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_search"]!,
  },
  {
    toolSlug: "grafana-stack_get_dashboard",
    provider: "grafana-stack",
    verb: "get-dashboard",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_get_dashboard"]!,
  },
  {
    toolSlug: "grafana-stack_list_datasources",
    provider: "grafana-stack",
    verb: "list-datasources",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_list_datasources"]!,
  },
  {
    toolSlug: "grafana-stack_check_datasource_health",
    provider: "grafana-stack",
    verb: "check-datasource-health",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_check_datasource_health"]!,
  },
  {
    toolSlug: "grafana-stack_list_folders",
    provider: "grafana-stack",
    verb: "list-folders",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_list_folders"]!,
  },
  {
    toolSlug: "grafana-stack_list_alert_rules",
    provider: "grafana-stack",
    verb: "list-alert-rules",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_list_alert_rules"]!,
  },
  {
    toolSlug: "grafana-stack_list_annotations",
    provider: "grafana-stack",
    verb: "list-annotations",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_list_annotations"]!,
  },
  {
    toolSlug: "grafana-stack_list_contact_points",
    provider: "grafana-stack",
    verb: "list-contact-points",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_list_contact_points"]!,
  },
  {
    toolSlug: "grafana-stack_list_mute_timings",
    provider: "grafana-stack",
    verb: "list-mute-timings",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_list_mute_timings"]!,
  },
  {
    toolSlug: "grafana-stack_list_dashboard_tags",
    provider: "grafana-stack",
    verb: "list-dashboard-tags",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_list_dashboard_tags"]!,
  },
  {
    toolSlug: "grafana-stack_search_teams",
    provider: "grafana-stack",
    verb: "search-teams",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_search_teams"]!,
  },
  {
    toolSlug: "grafana-stack_list_org_users",
    provider: "grafana-stack",
    verb: "list-org-users",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_list_org_users"]!,
  },
  {
    toolSlug: "grafana-stack_list_library_elements",
    provider: "grafana-stack",
    verb: "list-library-elements",
    mutating: false,
    
    secretName: "grafana-stack.token",
    build: BUILDS["grafana-stack_list_library_elements"]!,
  }
];

const BY_PROVIDER_VERB = new Map(
  MCP_TOOL_DEFS.map((def) => [`${def.provider}:${def.verb}`, def] as const),
);

export function findMcpTool(provider: string, verb: string): McpToolDef | undefined {
  return BY_PROVIDER_VERB.get(`${provider}:${verb}`);
}

export function mcpToolsForProvider(provider: string): readonly McpToolDef[] {
  return MCP_TOOL_DEFS.filter((def) => def.provider === provider);
}

export function mcpProviderNames(): readonly string[] {
  return [...new Set(MCP_TOOL_DEFS.map((def) => def.provider))].sort();
}
