/**
 * Maps MCP provider toolSlugs to warpmetal integration provider/verb calls.
 */
export interface ProviderToolMapping {
  readonly toolSlug: string;
  readonly provider: string;
  readonly verb: string;
  readonly mutating: boolean;
  readonly gate?: string;
}

export const PROVIDER_TOOL_MAPPINGS: readonly ProviderToolMapping[] = [
  {
    "toolSlug": "github_create_issue",
    "provider": "github",
    "verb": "create-issue",
    "mutating": true,
    "gate": "CONFIRM GITHUB CREATE ISSUE"
  },
  {
    "toolSlug": "github_list_issues",
    "provider": "github",
    "verb": "list-issues",
    "mutating": false
  },
  {
    "toolSlug": "github_get_issue",
    "provider": "github",
    "verb": "get-issue",
    "mutating": false
  },
  {
    "toolSlug": "github_create_pull_request",
    "provider": "github",
    "verb": "create-pull-request",
    "mutating": true,
    "gate": "CONFIRM GITHUB CREATE PULL REQUEST"
  },
  {
    "toolSlug": "github_get_pull_request",
    "provider": "github",
    "verb": "get-pull-request",
    "mutating": false
  },
  {
    "toolSlug": "github_search_repositories",
    "provider": "github",
    "verb": "search-repositories",
    "mutating": false
  },
  {
    "toolSlug": "gitlab_list_projects",
    "provider": "gitlab",
    "verb": "list-projects",
    "mutating": false
  },
  {
    "toolSlug": "gitlab_create_project_issue",
    "provider": "gitlab",
    "verb": "create-project-issue",
    "mutating": true,
    "gate": "CONFIRM GITLAB CREATE PROJECT ISSUE"
  },
  {
    "toolSlug": "gitlab_create_merge_request",
    "provider": "gitlab",
    "verb": "create-merge-request",
    "mutating": true,
    "gate": "CONFIRM GITLAB CREATE MERGE REQUEST"
  },
  {
    "toolSlug": "notion_search",
    "provider": "notion",
    "verb": "search",
    "mutating": false
  },
  {
    "toolSlug": "notion_query_database",
    "provider": "notion",
    "verb": "query-database",
    "mutating": false
  },
  {
    "toolSlug": "notion_get_page",
    "provider": "notion",
    "verb": "get-page",
    "mutating": false
  },
  {
    "toolSlug": "notion_create_page",
    "provider": "notion",
    "verb": "create-page",
    "mutating": true,
    "gate": "CONFIRM NOTION CREATE PAGE"
  },
  {
    "toolSlug": "notion_append_block_children",
    "provider": "notion",
    "verb": "append-block-children",
    "mutating": true,
    "gate": "CONFIRM NOTION APPEND BLOCK CHILDREN"
  },
  {
    "toolSlug": "stripe_post_customers",
    "provider": "stripe",
    "verb": "post-customers",
    "mutating": true,
    "gate": "CONFIRM STRIPE POST CUSTOMERS"
  },
  {
    "toolSlug": "stripe_get_customers",
    "provider": "stripe",
    "verb": "get-customers",
    "mutating": false
  },
  {
    "toolSlug": "stripe_post_payment_intents",
    "provider": "stripe",
    "verb": "post-payment-intents",
    "mutating": true,
    "gate": "CONFIRM STRIPE POST PAYMENT INTENTS"
  },
  {
    "toolSlug": "stripe_get_payment_intents",
    "provider": "stripe",
    "verb": "get-payment-intents",
    "mutating": false
  },
  {
    "toolSlug": "stripe_get_balance",
    "provider": "stripe",
    "verb": "get-balance",
    "mutating": false
  },
  {
    "toolSlug": "stripe_post_invoices",
    "provider": "stripe",
    "verb": "post-invoices",
    "mutating": true,
    "gate": "CONFIRM STRIPE POST INVOICES"
  },
  {
    "toolSlug": "jira_create_issue",
    "provider": "jira",
    "verb": "create-issue",
    "mutating": true,
    "gate": "CONFIRM JIRA CREATE ISSUE"
  },
  {
    "toolSlug": "jira_get_issue",
    "provider": "jira",
    "verb": "get-issue",
    "mutating": false
  },
  {
    "toolSlug": "jira_add_comment",
    "provider": "jira",
    "verb": "add-comment",
    "mutating": true,
    "gate": "CONFIRM JIRA ADD COMMENT"
  },
  {
    "toolSlug": "jira_transition_issue",
    "provider": "jira",
    "verb": "transition-issue",
    "mutating": true,
    "gate": "CONFIRM JIRA TRANSITION ISSUE"
  },
  {
    "toolSlug": "jira_get_project",
    "provider": "jira",
    "verb": "get-project",
    "mutating": false
  },
  {
    "toolSlug": "confluence_get_page_by_id",
    "provider": "confluence",
    "verb": "get-page-by-id",
    "mutating": false
  },
  {
    "toolSlug": "confluence_get_pages",
    "provider": "confluence",
    "verb": "get-pages",
    "mutating": false
  },
  {
    "toolSlug": "linear_create_issue",
    "provider": "linear",
    "verb": "create-issue",
    "mutating": true,
    "gate": "CONFIRM LINEAR CREATE ISSUE"
  },
  {
    "toolSlug": "linear_list_issues",
    "provider": "linear",
    "verb": "list-issues",
    "mutating": false
  },
  {
    "toolSlug": "linear_get_issue",
    "provider": "linear",
    "verb": "get-issue",
    "mutating": false
  },
  {
    "toolSlug": "linear_create_comment",
    "provider": "linear",
    "verb": "create-comment",
    "mutating": true,
    "gate": "CONFIRM LINEAR CREATE COMMENT"
  },
  {
    "toolSlug": "supabase_list_projects",
    "provider": "supabase",
    "verb": "list-projects",
    "mutating": false
  },
  {
    "toolSlug": "supabase_create_a_project",
    "provider": "supabase",
    "verb": "create-a-project",
    "mutating": true,
    "gate": "CONFIRM SUPABASE CREATE A PROJECT"
  },
  {
    "toolSlug": "supabase_apply_a_migration",
    "provider": "supabase",
    "verb": "apply-a-migration",
    "mutating": true,
    "gate": "CONFIRM SUPABASE APPLY A MIGRATION"
  },
  {
    "toolSlug": "cloudflare_zones_get",
    "provider": "cloudflare",
    "verb": "zones-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_accounts_list_accounts",
    "provider": "cloudflare",
    "verb": "accounts-list-accounts",
    "mutating": false
  },
  {
    "toolSlug": "vercel_get_projects",
    "provider": "vercel",
    "verb": "get-projects",
    "mutating": false
  },
  {
    "toolSlug": "vercel_create_project",
    "provider": "vercel",
    "verb": "create-project",
    "mutating": true,
    "gate": "CONFIRM VERCEL CREATE PROJECT"
  },
  {
    "toolSlug": "vercel_get_deployments",
    "provider": "vercel",
    "verb": "get-deployments",
    "mutating": false
  },
  {
    "toolSlug": "figma_get_file",
    "provider": "figma",
    "verb": "get-file",
    "mutating": false
  },
  {
    "toolSlug": "figma_get_file_nodes",
    "provider": "figma",
    "verb": "get-file-nodes",
    "mutating": false
  },
  {
    "toolSlug": "shopify_list_products",
    "provider": "shopify",
    "verb": "list-products",
    "mutating": false
  },
  {
    "toolSlug": "shopify_get_product",
    "provider": "shopify",
    "verb": "get-product",
    "mutating": false
  },
  {
    "toolSlug": "shopify_list_orders",
    "provider": "shopify",
    "verb": "list-orders",
    "mutating": false
  },
  {
    "toolSlug": "hubspot_crm_contacts_list",
    "provider": "hubspot",
    "verb": "crm-contacts-list",
    "mutating": false
  },
  {
    "toolSlug": "hubspot_crm_contacts_create",
    "provider": "hubspot",
    "verb": "crm-contacts-create",
    "mutating": true,
    "gate": "CONFIRM HUBSPOT CRM CONTACTS CREATE"
  },
  {
    "toolSlug": "hubspot_crm_deals_list",
    "provider": "hubspot",
    "verb": "crm-deals-list",
    "mutating": false
  },
  {
    "toolSlug": "asana_get_a_task",
    "provider": "asana",
    "verb": "get-a-task",
    "mutating": false
  },
  {
    "toolSlug": "asana_create_a_project",
    "provider": "asana",
    "verb": "create-a-project",
    "mutating": true,
    "gate": "CONFIRM ASANA CREATE A PROJECT"
  },
  {
    "toolSlug": "dropbox_list_folder",
    "provider": "dropbox",
    "verb": "list-folder",
    "mutating": false
  },
  {
    "toolSlug": "dropbox_search_files",
    "provider": "dropbox",
    "verb": "search-files",
    "mutating": false
  },
  {
    "toolSlug": "discord_get_my_user",
    "provider": "discord",
    "verb": "get-my-user",
    "mutating": false
  },
  {
    "toolSlug": "discord_list_my_guilds",
    "provider": "discord",
    "verb": "list-my-guilds",
    "mutating": false
  },
  {
    "toolSlug": "airtable_list_bases",
    "provider": "airtable",
    "verb": "list-bases",
    "mutating": false
  },
  {
    "toolSlug": "intercom_list_all_contacts",
    "provider": "intercom",
    "verb": "list-all-contacts",
    "mutating": false
  },
  {
    "toolSlug": "intercom_create_contact",
    "provider": "intercom",
    "verb": "create-contact",
    "mutating": true,
    "gate": "CONFIRM INTERCOM CREATE CONTACT"
  },
  {
    "toolSlug": "snowflake_list_databases",
    "provider": "snowflake",
    "verb": "list-databases",
    "mutating": false
  },
  {
    "toolSlug": "snowflake_list_tables",
    "provider": "snowflake",
    "verb": "list-tables",
    "mutating": false
  },
  {
    "toolSlug": "sentry_list_organization_projects",
    "provider": "sentry",
    "verb": "list-organization-projects",
    "mutating": false
  },
  {
    "toolSlug": "sentry_list_a_project_s_issues",
    "provider": "sentry",
    "verb": "list-a-project-s-issues",
    "mutating": false
  },
  {
    "toolSlug": "datadog_v1_get_ip_ranges",
    "provider": "datadog",
    "verb": "v1-get-ip-ranges",
    "mutating": false
  },
  {
    "toolSlug": "pagerduty_list_incidents",
    "provider": "pagerduty",
    "verb": "list-incidents",
    "mutating": false
  },
  {
    "toolSlug": "pagerduty_create_incident",
    "provider": "pagerduty",
    "verb": "create-incident",
    "mutating": true,
    "gate": "CONFIRM PAGERDUTY CREATE INCIDENT"
  },
  {
    "toolSlug": "pagerduty_list_services",
    "provider": "pagerduty",
    "verb": "list-services",
    "mutating": false
  },
  {
    "toolSlug": "exa_web_search",
    "provider": "exa",
    "verb": "web-search",
    "mutating": false
  },
  {
    "toolSlug": "exa_web_fetch",
    "provider": "exa",
    "verb": "web-fetch",
    "mutating": false
  },
  {
    "toolSlug": "perplexity_chat_completion",
    "provider": "perplexity",
    "verb": "chat-completion",
    "mutating": false
  },
  {
    "toolSlug": "perplexity_search",
    "provider": "perplexity",
    "verb": "search",
    "mutating": false
  },
  {
    "toolSlug": "resend_list_emails",
    "provider": "email",
    "verb": "list-emails",
    "mutating": false
  },
  {
    "toolSlug": "resend_create_contact",
    "provider": "email",
    "verb": "create-contact",
    "mutating": true,
    "gate": "CONFIRM EMAIL CREATE CONTACT"
  },
  {
    "toolSlug": "calendly_list_event_types",
    "provider": "calendly",
    "verb": "list-event-types",
    "mutating": false
  },
  {
    "toolSlug": "calendly_get_current_user",
    "provider": "calendly",
    "verb": "get-current-user",
    "mutating": false
  },
  {
    "toolSlug": "clickup_create_task",
    "provider": "clickup",
    "verb": "create-task",
    "mutating": true,
    "gate": "CONFIRM CLICKUP CREATE TASK"
  },
  {
    "toolSlug": "clickup_get_task",
    "provider": "clickup",
    "verb": "get-task",
    "mutating": false
  },
  {
    "toolSlug": "clickup_create_task_comment",
    "provider": "clickup",
    "verb": "create-task-comment",
    "mutating": true,
    "gate": "CONFIRM CLICKUP CREATE TASK COMMENT"
  },
  {
    "toolSlug": "posthog_list_project_dashboards",
    "provider": "posthog",
    "verb": "list-project-dashboards",
    "mutating": false
  },
  {
    "toolSlug": "posthog_get_feature_flags_matching_ids",
    "provider": "posthog",
    "verb": "get-feature-flags-matching-ids",
    "mutating": false
  },
  {
    "toolSlug": "mixpanel_track_event",
    "provider": "mixpanel",
    "verb": "track-event",
    "mutating": true,
    "gate": "CONFIRM MIXPANEL TRACK EVENT"
  },
  {
    "toolSlug": "mixpanel_raw_event_export",
    "provider": "mixpanel",
    "verb": "raw-event-export",
    "mutating": false
  },
  {
    "toolSlug": "circleci_list_pipelines",
    "provider": "circleci",
    "verb": "list-pipelines",
    "mutating": false
  },
  {
    "toolSlug": "circleci_get_pipeline_by_id",
    "provider": "circleci",
    "verb": "get-pipeline-by-id",
    "mutating": false
  },
  {
    "toolSlug": "mailchimp_list_campaigns",
    "provider": "mailchimp",
    "verb": "list-campaigns",
    "mutating": false
  },
  {
    "toolSlug": "mailchimp_add_member_to_list",
    "provider": "mailchimp",
    "verb": "add-member-to-list",
    "mutating": true,
    "gate": "CONFIRM MAILCHIMP ADD MEMBER TO LIST"
  },
  {
    "toolSlug": "x_create_posts",
    "provider": "x",
    "verb": "create-posts",
    "mutating": true,
    "gate": "CONFIRM X CREATE POSTS"
  },
  {
    "toolSlug": "x_get_users_me",
    "provider": "x",
    "verb": "get-users-me",
    "mutating": false
  },
  {
    "toolSlug": "x_search_posts_recent",
    "provider": "x",
    "verb": "search-posts-recent",
    "mutating": false
  },
  {
    "toolSlug": "square_list_payments",
    "provider": "square",
    "verb": "list-payments",
    "mutating": false
  },
  {
    "toolSlug": "square_create_payment",
    "provider": "square",
    "verb": "create-payment",
    "mutating": true,
    "gate": "CONFIRM SQUARE CREATE PAYMENT"
  },
  {
    "toolSlug": "square_list_customers",
    "provider": "square",
    "verb": "list-customers",
    "mutating": false
  },
  {
    "toolSlug": "openai_list_models",
    "provider": "openai",
    "verb": "list-models",
    "mutating": false
  },
  {
    "toolSlug": "gemini_generate_content",
    "provider": "gemini",
    "verb": "generate-content",
    "mutating": true,
    "gate": "CONFIRM GEMINI GENERATE CONTENT"
  },
  {
    "toolSlug": "gemini_list_models",
    "provider": "gemini",
    "verb": "list-models",
    "mutating": false
  },
  {
    "toolSlug": "anthropic-admin_list_workspaces",
    "provider": "anthropic-admin",
    "verb": "list-workspaces",
    "mutating": false
  },
  {
    "toolSlug": "anthropic-admin_list_api_keys",
    "provider": "anthropic-admin",
    "verb": "list-api-keys",
    "mutating": false
  },
  {
    "toolSlug": "grafana-cloud_list_stacks",
    "provider": "grafana-cloud",
    "verb": "list-stacks",
    "mutating": false
  },
  {
    "toolSlug": "grafana-cloud_get_org",
    "provider": "grafana-cloud",
    "verb": "get-org",
    "mutating": false
  },
  {
    "toolSlug": "monday_boards",
    "provider": "monday",
    "verb": "boards",
    "mutating": false
  },
  {
    "toolSlug": "monday_get_workspaces",
    "provider": "monday",
    "verb": "get-workspaces",
    "mutating": false
  },
  {
    "toolSlug": "onesignal_view_an_app",
    "provider": "onesignal",
    "verb": "view-an-app",
    "mutating": false
  },
  {
    "toolSlug": "amplitude_get_flags",
    "provider": "amplitude",
    "verb": "get-flags",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_list_tickets",
    "provider": "zendesk",
    "verb": "list-tickets",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_get_ticket",
    "provider": "zendesk",
    "verb": "get-ticket",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_list_ticket_comments",
    "provider": "zendesk",
    "verb": "list-ticket-comments",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_search",
    "provider": "zendesk",
    "verb": "search",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_get_current_user",
    "provider": "zendesk",
    "verb": "get-current-user",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_list_users",
    "provider": "zendesk",
    "verb": "list-users",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_list_organizations",
    "provider": "zendesk",
    "verb": "list-organizations",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_list_views",
    "provider": "zendesk",
    "verb": "list-views",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_list_view_tickets",
    "provider": "zendesk",
    "verb": "list-view-tickets",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_create_ticket",
    "provider": "zendesk",
    "verb": "create-ticket",
    "mutating": true,
    "gate": "CONFIRM ZENDESK CREATE TICKET"
  },
  {
    "toolSlug": "zendesk_add_ticket_comment",
    "provider": "zendesk",
    "verb": "add-ticket-comment",
    "mutating": true,
    "gate": "CONFIRM ZENDESK ADD TICKET COMMENT"
  },
  {
    "toolSlug": "zendesk_update_ticket",
    "provider": "zendesk",
    "verb": "update-ticket",
    "mutating": true,
    "gate": "CONFIRM ZENDESK UPDATE TICKET"
  },
  {
    "toolSlug": "zendesk_get_user",
    "provider": "zendesk",
    "verb": "get-user",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_get_organization",
    "provider": "zendesk",
    "verb": "get-organization",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_count_view_tickets",
    "provider": "zendesk",
    "verb": "count-view-tickets",
    "mutating": false
  },
  {
    "toolSlug": "zendesk_get_ticket_metrics",
    "provider": "zendesk",
    "verb": "get-ticket-metrics",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_health",
    "provider": "grafana-stack",
    "verb": "health",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_get_current_user",
    "provider": "grafana-stack",
    "verb": "get-current-user",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_search",
    "provider": "grafana-stack",
    "verb": "search",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_get_dashboard",
    "provider": "grafana-stack",
    "verb": "get-dashboard",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_list_datasources",
    "provider": "grafana-stack",
    "verb": "list-datasources",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_check_datasource_health",
    "provider": "grafana-stack",
    "verb": "check-datasource-health",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_list_folders",
    "provider": "grafana-stack",
    "verb": "list-folders",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_list_alert_rules",
    "provider": "grafana-stack",
    "verb": "list-alert-rules",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_list_annotations",
    "provider": "grafana-stack",
    "verb": "list-annotations",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_list_contact_points",
    "provider": "grafana-stack",
    "verb": "list-contact-points",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_list_mute_timings",
    "provider": "grafana-stack",
    "verb": "list-mute-timings",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_list_dashboard_tags",
    "provider": "grafana-stack",
    "verb": "list-dashboard-tags",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_search_teams",
    "provider": "grafana-stack",
    "verb": "search-teams",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_list_org_users",
    "provider": "grafana-stack",
    "verb": "list-org-users",
    "mutating": false
  },
  {
    "toolSlug": "grafana-stack_list_library_elements",
    "provider": "grafana-stack",
    "verb": "list-library-elements",
    "mutating": false
  }
] as const;

const BY_SLUG = new Map(PROVIDER_TOOL_MAPPINGS.map((entry) => [entry.toolSlug, entry]));

export function findProviderToolMapping(toolSlug: string): ProviderToolMapping | undefined {
  return BY_SLUG.get(toolSlug);
}

export function mappedProviderToolSlugs(): readonly string[] {
  return PROVIDER_TOOL_MAPPINGS.map((entry) => entry.toolSlug);
}
