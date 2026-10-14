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
    "toolSlug": "airtable_list_bases",
    "provider": "airtable",
    "verb": "list-bases",
    "mutating": false
  },
  {
    "toolSlug": "amplitude_get_flags",
    "provider": "amplitude",
    "verb": "get-flags",
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
    "toolSlug": "cloudflare_zones_list",
    "provider": "cloudflare",
    "verb": "zones-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zones_create",
    "provider": "cloudflare",
    "verb": "zones-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONES CREATE"
  },
  {
    "toolSlug": "cloudflare_zones_get",
    "provider": "cloudflare",
    "verb": "zones-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zones_update",
    "provider": "cloudflare",
    "verb": "zones-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONES UPDATE"
  },
  {
    "toolSlug": "cloudflare_zones_delete",
    "provider": "cloudflare",
    "verb": "zones-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONES DELETE"
  },
  {
    "toolSlug": "cloudflare_activation_check",
    "provider": "cloudflare",
    "verb": "activation-check",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACTIVATION CHECK"
  },
  {
    "toolSlug": "cloudflare_hold_list",
    "provider": "cloudflare",
    "verb": "hold-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_hold_create",
    "provider": "cloudflare",
    "verb": "hold-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HOLD CREATE"
  },
  {
    "toolSlug": "cloudflare_hold_patch",
    "provider": "cloudflare",
    "verb": "hold-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HOLD PATCH"
  },
  {
    "toolSlug": "cloudflare_hold_delete",
    "provider": "cloudflare",
    "verb": "hold-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HOLD DELETE"
  },
  {
    "toolSlug": "cloudflare_dns_records_list",
    "provider": "cloudflare",
    "verb": "dns-records-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dns_records_create",
    "provider": "cloudflare",
    "verb": "dns-records-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DNS RECORDS CREATE"
  },
  {
    "toolSlug": "cloudflare_dns_records_get",
    "provider": "cloudflare",
    "verb": "dns-records-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dns_records_update",
    "provider": "cloudflare",
    "verb": "dns-records-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DNS RECORDS UPDATE"
  },
  {
    "toolSlug": "cloudflare_dns_records_replace",
    "provider": "cloudflare",
    "verb": "dns-records-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DNS RECORDS REPLACE"
  },
  {
    "toolSlug": "cloudflare_dns_records_delete",
    "provider": "cloudflare",
    "verb": "dns-records-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DNS RECORDS DELETE"
  },
  {
    "toolSlug": "cloudflare_dns_records_batch",
    "provider": "cloudflare",
    "verb": "dns-records-batch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DNS RECORDS BATCH"
  },
  {
    "toolSlug": "cloudflare_dns_settings_list",
    "provider": "cloudflare",
    "verb": "dns-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dns_settings_patch",
    "provider": "cloudflare",
    "verb": "dns-settings-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DNS SETTINGS PATCH"
  },
  {
    "toolSlug": "cloudflare_dnssec_list",
    "provider": "cloudflare",
    "verb": "dnssec-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dnssec_patch",
    "provider": "cloudflare",
    "verb": "dnssec-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DNSSEC PATCH"
  },
  {
    "toolSlug": "cloudflare_dnssec_delete",
    "provider": "cloudflare",
    "verb": "dnssec-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DNSSEC DELETE"
  },
  {
    "toolSlug": "cloudflare_settings_list",
    "provider": "cloudflare",
    "verb": "settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_settings_get",
    "provider": "cloudflare",
    "verb": "settings-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_settings_update",
    "provider": "cloudflare",
    "verb": "settings-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE SETTINGS UPDATE"
  },
  {
    "toolSlug": "cloudflare_purge_cache",
    "provider": "cloudflare",
    "verb": "purge-cache",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PURGE CACHE"
  },
  {
    "toolSlug": "cloudflare_firewall_access_rules_rules_list",
    "provider": "cloudflare",
    "verb": "firewall-access-rules-rules-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_firewall_access_rules_rules_create",
    "provider": "cloudflare",
    "verb": "firewall-access-rules-rules-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE FIREWALL ACCESS RULES RULES CREATE"
  },
  {
    "toolSlug": "cloudflare_firewall_access_rules_rules_update",
    "provider": "cloudflare",
    "verb": "firewall-access-rules-rules-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE FIREWALL ACCESS RULES RULES UPDATE"
  },
  {
    "toolSlug": "cloudflare_firewall_access_rules_rules_delete",
    "provider": "cloudflare",
    "verb": "firewall-access-rules-rules-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE FIREWALL ACCESS RULES RULES DELETE"
  },
  {
    "toolSlug": "cloudflare_firewall_lockdowns_list",
    "provider": "cloudflare",
    "verb": "firewall-lockdowns-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_firewall_lockdowns_create",
    "provider": "cloudflare",
    "verb": "firewall-lockdowns-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE FIREWALL LOCKDOWNS CREATE"
  },
  {
    "toolSlug": "cloudflare_firewall_lockdowns_get",
    "provider": "cloudflare",
    "verb": "firewall-lockdowns-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_firewall_lockdowns_replace",
    "provider": "cloudflare",
    "verb": "firewall-lockdowns-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE FIREWALL LOCKDOWNS REPLACE"
  },
  {
    "toolSlug": "cloudflare_firewall_lockdowns_delete",
    "provider": "cloudflare",
    "verb": "firewall-lockdowns-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE FIREWALL LOCKDOWNS DELETE"
  },
  {
    "toolSlug": "cloudflare_firewall_ua_rules_list",
    "provider": "cloudflare",
    "verb": "firewall-ua-rules-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_firewall_ua_rules_create",
    "provider": "cloudflare",
    "verb": "firewall-ua-rules-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE FIREWALL UA RULES CREATE"
  },
  {
    "toolSlug": "cloudflare_firewall_ua_rules_get",
    "provider": "cloudflare",
    "verb": "firewall-ua-rules-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_firewall_ua_rules_replace",
    "provider": "cloudflare",
    "verb": "firewall-ua-rules-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE FIREWALL UA RULES REPLACE"
  },
  {
    "toolSlug": "cloudflare_firewall_ua_rules_delete",
    "provider": "cloudflare",
    "verb": "firewall-ua-rules-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE FIREWALL UA RULES DELETE"
  },
  {
    "toolSlug": "cloudflare_accounts_list",
    "provider": "cloudflare",
    "verb": "accounts-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_user_tokens_list",
    "provider": "cloudflare",
    "verb": "user-tokens-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_user_tokens_get",
    "provider": "cloudflare",
    "verb": "user-tokens-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_user_tokens_verify",
    "provider": "cloudflare",
    "verb": "user-tokens-verify",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_user_tokens_permission_groups_list",
    "provider": "cloudflare",
    "verb": "user-tokens-permission-groups-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_d1_database_list",
    "provider": "cloudflare",
    "verb": "d1-database-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_d1_database_create",
    "provider": "cloudflare",
    "verb": "d1-database-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE D1 DATABASE CREATE"
  },
  {
    "toolSlug": "cloudflare_d1_database_get",
    "provider": "cloudflare",
    "verb": "d1-database-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_d1_database_replace",
    "provider": "cloudflare",
    "verb": "d1-database-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE D1 DATABASE REPLACE"
  },
  {
    "toolSlug": "cloudflare_d1_database_update",
    "provider": "cloudflare",
    "verb": "d1-database-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE D1 DATABASE UPDATE"
  },
  {
    "toolSlug": "cloudflare_d1_database_delete",
    "provider": "cloudflare",
    "verb": "d1-database-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE D1 DATABASE DELETE"
  },
  {
    "toolSlug": "cloudflare_d1_database_database_id_query",
    "provider": "cloudflare",
    "verb": "d1-database-database-id-query",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE D1 DATABASE DATABASE ID QUERY"
  },
  {
    "toolSlug": "cloudflare_d1_database_database_id_raw_create",
    "provider": "cloudflare",
    "verb": "d1-database-database-id-raw-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE D1 DATABASE DATABASE ID RAW CREATE"
  },
  {
    "toolSlug": "cloudflare_d1_database_database_id_time_travel_bookmark_list",
    "provider": "cloudflare",
    "verb": "d1-database-database-id-time-travel-bookmark-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_d1_database_database_id_time_travel_restore",
    "provider": "cloudflare",
    "verb": "d1-database-database-id-time-travel-restore",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE D1 DATABASE DATABASE ID TIME TRAVEL RESTORE"
  },
  {
    "toolSlug": "cloudflare_d1_database_database_id_undelete_create",
    "provider": "cloudflare",
    "verb": "d1-database-database-id-undelete-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE D1 DATABASE DATABASE ID UNDELETE CREATE"
  },
  {
    "toolSlug": "cloudflare_hyperdrive_configs_list",
    "provider": "cloudflare",
    "verb": "hyperdrive-configs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_hyperdrive_configs_create",
    "provider": "cloudflare",
    "verb": "hyperdrive-configs-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HYPERDRIVE CONFIGS CREATE"
  },
  {
    "toolSlug": "cloudflare_hyperdrive_configs_get",
    "provider": "cloudflare",
    "verb": "hyperdrive-configs-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_hyperdrive_configs_replace",
    "provider": "cloudflare",
    "verb": "hyperdrive-configs-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HYPERDRIVE CONFIGS REPLACE"
  },
  {
    "toolSlug": "cloudflare_hyperdrive_configs_update",
    "provider": "cloudflare",
    "verb": "hyperdrive-configs-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HYPERDRIVE CONFIGS UPDATE"
  },
  {
    "toolSlug": "cloudflare_hyperdrive_configs_delete",
    "provider": "cloudflare",
    "verb": "hyperdrive-configs-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HYPERDRIVE CONFIGS DELETE"
  },
  {
    "toolSlug": "cloudflare_hyperdrive_configs_hyperdrive_id_restart",
    "provider": "cloudflare",
    "verb": "hyperdrive-configs-hyperdrive-id-restart",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HYPERDRIVE CONFIGS HYPERDRIVE ID RESTART"
  },
  {
    "toolSlug": "cloudflare_hyperdrive_planetscale_create_database_signature",
    "provider": "cloudflare",
    "verb": "hyperdrive-planetscale-create-database-signature",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HYPERDRIVE PLANETSCALE CREATE DATABASE SIGNATURE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_list",
    "provider": "cloudflare",
    "verb": "pages-projects-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_pages_projects_create",
    "provider": "cloudflare",
    "verb": "pages-projects-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS CREATE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_get",
    "provider": "cloudflare",
    "verb": "pages-projects-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_pages_projects_update",
    "provider": "cloudflare",
    "verb": "pages-projects-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS UPDATE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_delete",
    "provider": "cloudflare",
    "verb": "pages-projects-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS DELETE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_deployments_list",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-deployments-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_deployments_get",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-deployments-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_deployments_delete",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-deployments-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS PROJECT NAME DEPLOYMENTS DELETE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_deployments_deployment_id_history_logs_list",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-deployments-deployment-id-history-logs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_deployments_deployment_id_retry_create",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-deployments-deployment-id-retry-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS PROJECT NAME DEPLOYMENTS DEPLOYMENT ID RETRY CREATE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_deployments_deployment_id_rollback",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-deployments-deployment-id-rollback",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS PROJECT NAME DEPLOYMENTS DEPLOYMENT ID ROLLBACK"
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_domains_list",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-domains-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_domains_create",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-domains-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS PROJECT NAME DOMAINS CREATE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_domains_get",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-domains-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_domains_update",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-domains-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS PROJECT NAME DOMAINS UPDATE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_domains_delete",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-domains-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS PROJECT NAME DOMAINS DELETE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_purge_build_cache",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-purge-build-cache",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS PROJECT NAME PURGE BUILD CACHE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_source_create",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-source-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS PROJECT NAME SOURCE CREATE"
  },
  {
    "toolSlug": "cloudflare_pages_projects_project_name_source_delete",
    "provider": "cloudflare",
    "verb": "pages-projects-project-name-source-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGES PROJECTS PROJECT NAME SOURCE DELETE"
  },
  {
    "toolSlug": "cloudflare_queues_list",
    "provider": "cloudflare",
    "verb": "queues-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_queues_create",
    "provider": "cloudflare",
    "verb": "queues-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES CREATE"
  },
  {
    "toolSlug": "cloudflare_queues_get",
    "provider": "cloudflare",
    "verb": "queues-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_queues_update",
    "provider": "cloudflare",
    "verb": "queues-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES UPDATE"
  },
  {
    "toolSlug": "cloudflare_queues_delete",
    "provider": "cloudflare",
    "verb": "queues-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES DELETE"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_consumers_list",
    "provider": "cloudflare",
    "verb": "queues-queue-id-consumers-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_consumers_create",
    "provider": "cloudflare",
    "verb": "queues-queue-id-consumers-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID CONSUMERS CREATE"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_consumers_get",
    "provider": "cloudflare",
    "verb": "queues-queue-id-consumers-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_consumers_replace",
    "provider": "cloudflare",
    "verb": "queues-queue-id-consumers-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID CONSUMERS REPLACE"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_consumers_delete",
    "provider": "cloudflare",
    "verb": "queues-queue-id-consumers-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID CONSUMERS DELETE"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_messages_create",
    "provider": "cloudflare",
    "verb": "queues-queue-id-messages-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID MESSAGES CREATE"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_messages_ack_create",
    "provider": "cloudflare",
    "verb": "queues-queue-id-messages-ack-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID MESSAGES ACK CREATE"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_messages_batch",
    "provider": "cloudflare",
    "verb": "queues-queue-id-messages-batch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID MESSAGES BATCH"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_messages_extend_create",
    "provider": "cloudflare",
    "verb": "queues-queue-id-messages-extend-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID MESSAGES EXTEND CREATE"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_messages_peek_create",
    "provider": "cloudflare",
    "verb": "queues-queue-id-messages-peek-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID MESSAGES PEEK CREATE"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_messages_pull_create",
    "provider": "cloudflare",
    "verb": "queues-queue-id-messages-pull-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID MESSAGES PULL CREATE"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_messages_purge",
    "provider": "cloudflare",
    "verb": "queues-queue-id-messages-purge",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID MESSAGES PURGE"
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_metrics_list",
    "provider": "cloudflare",
    "verb": "queues-queue-id-metrics-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_purge_status_get",
    "provider": "cloudflare",
    "verb": "queues-queue-id-purge-status-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_queues_queue_id_purge",
    "provider": "cloudflare",
    "verb": "queues-queue-id-purge",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE QUEUES QUEUE ID PURGE"
  },
  {
    "toolSlug": "cloudflare_r2_catalog_list",
    "provider": "cloudflare",
    "verb": "r2-catalog-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_catalog_get",
    "provider": "cloudflare",
    "verb": "r2-catalog-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_credential_create",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-credential-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 CATALOG BUCKET NAME CREDENTIAL CREATE"
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_credential_status_list",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-credential-status-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_delete_create",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-delete-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 CATALOG BUCKET NAME DELETE CREATE"
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_disable",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-disable",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 CATALOG BUCKET NAME DISABLE"
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_enable",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-enable",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 CATALOG BUCKET NAME ENABLE"
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_maintenance_configs_list",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-maintenance-configs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_maintenance_configs_create",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-maintenance-configs-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 CATALOG BUCKET NAME MAINTENANCE CONFIGS CREATE"
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_namespaces_list",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-namespaces-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_namespaces_namespace_tables_list",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-namespaces-namespace-tables-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_namespaces_namespace_tables_get",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-namespaces-namespace-tables-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_namespaces_namespace_tables_table_name_maintenance_configs_list",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-namespaces-namespace-tables-table-name-maintenance-configs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_namespaces_namespace_tables_table_name_maintenance_configs_create",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-namespaces-namespace-tables-table-name-maintenance-configs-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 CATALOG BUCKET NAME NAMESPACES NAMESPACE TABLES TABLE NAME MAINTENANCE CONFIGS CREATE"
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_namespaces_namespace_tables_table_name_maintenance_configs_configuration_type_queue_create",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-namespaces-namespace-tables-table-name-maintenance-configs-configuration-type-queue-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 CATALOG BUCKET NAME NAMESPACES NAMESPACE TABLES TABLE NAME MAINTENANCE CONFIGS CONFIGURATION TYPE QUEUE CREATE"
  },
  {
    "toolSlug": "cloudflare_r2_catalog_bucket_name_namespaces_namespace_tables_table_name_maintenance_runs_list",
    "provider": "cloudflare",
    "verb": "r2-catalog-bucket-name-namespaces-namespace-tables-table-name-maintenance-runs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_list",
    "provider": "cloudflare",
    "verb": "r2-buckets-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_create",
    "provider": "cloudflare",
    "verb": "r2-buckets-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS CREATE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_get",
    "provider": "cloudflare",
    "verb": "r2-buckets-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_replace",
    "provider": "cloudflare",
    "verb": "r2-buckets-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS REPLACE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_update",
    "provider": "cloudflare",
    "verb": "r2-buckets-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS UPDATE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_delete",
    "provider": "cloudflare",
    "verb": "r2-buckets-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS DELETE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_cors_list",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-cors-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_cors_put",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-cors-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME CORS PUT"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_cors_delete",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-cors-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME CORS DELETE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_domains_custom_list",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-domains-custom-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_domains_custom_create",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-domains-custom-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME DOMAINS CUSTOM CREATE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_domains_custom_get",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-domains-custom-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_domains_custom_replace",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-domains-custom-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME DOMAINS CUSTOM REPLACE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_domains_custom_delete",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-domains-custom-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME DOMAINS CUSTOM DELETE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_domains_managed_list",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-domains-managed-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_domains_managed_put",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-domains-managed-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME DOMAINS MANAGED PUT"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_jobs_list",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-jobs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_jobs_create",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-jobs-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME JOBS CREATE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_jobs_get",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-jobs-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_lifecycle_list",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-lifecycle-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_lifecycle_put",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-lifecycle-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME LIFECYCLE PUT"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_local_uploads_list",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-local-uploads-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_local_uploads_put",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-local-uploads-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME LOCAL UPLOADS PUT"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_lock_list",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-lock-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_lock_put",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-lock-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME LOCK PUT"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_lock_delete",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-lock-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME LOCK DELETE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_objects_list",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-objects-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_objects_delete_bulk",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-objects-delete-bulk",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME OBJECTS DELETE BULK"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_objects_get",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-objects-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_objects_delete",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-objects-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME OBJECTS DELETE"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_sippy_list",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-sippy-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_sippy_put",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-sippy-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME SIPPY PUT"
  },
  {
    "toolSlug": "cloudflare_r2_buckets_bucket_name_sippy_delete",
    "provider": "cloudflare",
    "verb": "r2-buckets-bucket-name-sippy-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 BUCKETS BUCKET NAME SIPPY DELETE"
  },
  {
    "toolSlug": "cloudflare_r2_metrics_list",
    "provider": "cloudflare",
    "verb": "r2-metrics-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_r2_temp_access_credentials_create",
    "provider": "cloudflare",
    "verb": "r2-temp-access-credentials-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE R2 TEMP ACCESS CREDENTIALS CREATE"
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_list",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_create",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STORAGE KV NAMESPACES CREATE"
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_get",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_replace",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STORAGE KV NAMESPACES REPLACE"
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_delete",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STORAGE KV NAMESPACES DELETE"
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_namespace_id_bulk_put",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-namespace-id-bulk-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STORAGE KV NAMESPACES NAMESPACE ID BULK PUT"
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_namespace_id_bulk_delete_create",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-namespace-id-bulk-delete-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STORAGE KV NAMESPACES NAMESPACE ID BULK DELETE CREATE"
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_namespace_id_bulk_get_create",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-namespace-id-bulk-get-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STORAGE KV NAMESPACES NAMESPACE ID BULK GET CREATE"
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_namespace_id_keys_list",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-namespace-id-keys-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_namespace_id_metadata_get",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-namespace-id-metadata-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_namespace_id_values_get",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-namespace-id-values-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_namespace_id_values_replace",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-namespace-id-values-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STORAGE KV NAMESPACES NAMESPACE ID VALUES REPLACE"
  },
  {
    "toolSlug": "cloudflare_storage_kv_namespaces_namespace_id_values_delete",
    "provider": "cloudflare",
    "verb": "storage-kv-namespaces-namespace-id-values-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STORAGE KV NAMESPACES NAMESPACE ID VALUES DELETE"
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_list",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_create",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE VECTORIZE V2 INDEXES CREATE"
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_get",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_delete",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE VECTORIZE V2 INDEXES DELETE"
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_index_name_delete_by_ids_create",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-index-name-delete-by-ids-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE VECTORIZE V2 INDEXES INDEX NAME DELETE BY IDS CREATE"
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_index_name_get_by_ids_create",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-index-name-get-by-ids-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE VECTORIZE V2 INDEXES INDEX NAME GET BY IDS CREATE"
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_index_name_info_list",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-index-name-info-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_index_name_insert_create",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-index-name-insert-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE VECTORIZE V2 INDEXES INDEX NAME INSERT CREATE"
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_index_name_list_list",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-index-name-list-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_index_name_metadata_index_create_create",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-index-name-metadata-index-create-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE VECTORIZE V2 INDEXES INDEX NAME METADATA INDEX CREATE CREATE"
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_index_name_metadata_index_delete_create",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-index-name-metadata-index-delete-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE VECTORIZE V2 INDEXES INDEX NAME METADATA INDEX DELETE CREATE"
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_index_name_metadata_index_list_list",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-index-name-metadata-index-list-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_index_name_query",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-index-name-query",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE VECTORIZE V2 INDEXES INDEX NAME QUERY"
  },
  {
    "toolSlug": "cloudflare_vectorize_v2_indexes_index_name_upsert_create",
    "provider": "cloudflare",
    "verb": "vectorize-v2-indexes-index-name-upsert-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE VECTORIZE V2 INDEXES INDEX NAME UPSERT CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_account_settings_list",
    "provider": "cloudflare",
    "verb": "workers-account-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_account_settings_put",
    "provider": "cloudflare",
    "verb": "workers-account-settings-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS ACCOUNT SETTINGS PUT"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_list",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_create",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_get",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_replace",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES REPLACE"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_update",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES UPDATE"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_delete",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_list",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_delete_all",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-delete-all",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DISPATCH NAMESPACE SCRIPTS DELETE ALL"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_get",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_delete",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DISPATCH NAMESPACE SCRIPTS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_assets_upload_session_create",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-assets-upload-session-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DISPATCH NAMESPACE SCRIPTS SCRIPT NAME ASSETS UPLOAD SESSION CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_bindings_list",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-bindings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_content_list",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-content-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_secrets_list",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-secrets-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_secrets_put",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-secrets-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DISPATCH NAMESPACE SCRIPTS SCRIPT NAME SECRETS PUT"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_secrets_bulk_patch",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-secrets-bulk-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DISPATCH NAMESPACE SCRIPTS SCRIPT NAME SECRETS BULK PATCH"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_secrets_get",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-secrets-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_secrets_delete",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-secrets-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DISPATCH NAMESPACE SCRIPTS SCRIPT NAME SECRETS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_settings_list",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_tags_list",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-tags-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_tags_put",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-tags-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DISPATCH NAMESPACE SCRIPTS SCRIPT NAME TAGS PUT"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_tags_replace",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-tags-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DISPATCH NAMESPACE SCRIPTS SCRIPT NAME TAGS REPLACE"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_tags_update",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-tags-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DISPATCH NAMESPACE SCRIPTS SCRIPT NAME TAGS UPDATE"
  },
  {
    "toolSlug": "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_script_name_tags_delete",
    "provider": "cloudflare",
    "verb": "workers-dispatch-namespaces-dispatch-namespace-scripts-script-name-tags-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DISPATCH NAMESPACES DISPATCH NAMESPACE SCRIPTS SCRIPT NAME TAGS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_domains_list",
    "provider": "cloudflare",
    "verb": "workers-domains-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_domains_put",
    "provider": "cloudflare",
    "verb": "workers-domains-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DOMAINS PUT"
  },
  {
    "toolSlug": "cloudflare_workers_domains_get",
    "provider": "cloudflare",
    "verb": "workers-domains-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_domains_delete",
    "provider": "cloudflare",
    "verb": "workers-domains-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DOMAINS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_durable_objects_namespaces_list",
    "provider": "cloudflare",
    "verb": "workers-durable-objects-namespaces-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_durable_objects_namespaces_id_objects_list",
    "provider": "cloudflare",
    "verb": "workers-durable-objects-namespaces-id-objects-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_durable_objects_namespaces_id_query_v2_create",
    "provider": "cloudflare",
    "verb": "workers-durable-objects-namespaces-id-query-v2-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS DURABLE OBJECTS NAMESPACES ID QUERY V2 CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_agents_sessions_list",
    "provider": "cloudflare",
    "verb": "workers-observability-agents-sessions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_agents_sessions_conversation_id_runs_list",
    "provider": "cloudflare",
    "verb": "workers-observability-agents-sessions-conversation-id-runs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_destinations_list",
    "provider": "cloudflare",
    "verb": "workers-observability-destinations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_destinations_create",
    "provider": "cloudflare",
    "verb": "workers-observability-destinations-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY DESTINATIONS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_destinations_update",
    "provider": "cloudflare",
    "verb": "workers-observability-destinations-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY DESTINATIONS UPDATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_destinations_delete",
    "provider": "cloudflare",
    "verb": "workers-observability-destinations-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY DESTINATIONS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_list",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_automations_list",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-automations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_automations_create",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-automations-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY ISSUES AUTOMATIONS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_automations_get",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-automations-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_automations_replace",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-automations-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY ISSUES AUTOMATIONS REPLACE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_automations_delete",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-automations-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY ISSUES AUTOMATIONS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_groups_create",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-groups-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY ISSUES GROUPS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_groups_delete",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-groups-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY ISSUES GROUPS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_groups_group_id_members_create",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-groups-group-id-members-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY ISSUES GROUPS GROUP ID MEMBERS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_groups_group_id_members_delete",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-groups-group-id-members-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY ISSUES GROUPS GROUP ID MEMBERS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_summary_list",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-summary-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_get",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_update",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY ISSUES UPDATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_issue_id_notification_runs_create",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-issue-id-notification-runs-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY ISSUES ISSUE ID NOTIFICATION RUNS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_issues_issue_id_occurrences_list",
    "provider": "cloudflare",
    "verb": "workers-observability-issues-issue-id-occurrences-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_queries_list",
    "provider": "cloudflare",
    "verb": "workers-observability-queries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_queries_create",
    "provider": "cloudflare",
    "verb": "workers-observability-queries-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY QUERIES CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_queries_get",
    "provider": "cloudflare",
    "verb": "workers-observability-queries-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_queries_update",
    "provider": "cloudflare",
    "verb": "workers-observability-queries-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY QUERIES UPDATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_queries_delete",
    "provider": "cloudflare",
    "verb": "workers-observability-queries-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY QUERIES DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_shared_query",
    "provider": "cloudflare",
    "verb": "workers-observability-shared-query",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY SHARED QUERY"
  },
  {
    "toolSlug": "cloudflare_workers_observability_shared_query_get",
    "provider": "cloudflare",
    "verb": "workers-observability-shared-query-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_observability_telemetry_keys_create",
    "provider": "cloudflare",
    "verb": "workers-observability-telemetry-keys-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY TELEMETRY KEYS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_observability_telemetry_query",
    "provider": "cloudflare",
    "verb": "workers-observability-telemetry-query",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY TELEMETRY QUERY"
  },
  {
    "toolSlug": "cloudflare_workers_observability_telemetry_values_create",
    "provider": "cloudflare",
    "verb": "workers-observability-telemetry-values-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS OBSERVABILITY TELEMETRY VALUES CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_placement_regions_list",
    "provider": "cloudflare",
    "verb": "workers-placement-regions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_search_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-search-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_get",
    "provider": "cloudflare",
    "verb": "workers-scripts-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_delete",
    "provider": "cloudflare",
    "verb": "workers-scripts-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_assets_upload_session_create",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-assets-upload-session-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME ASSETS UPLOAD SESSION CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_content_v2_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-content-v2-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_deployments_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-deployments-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_deployments_create",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-deployments-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME DEPLOYMENTS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_deployments_get",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-deployments-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_deployments_delete",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-deployments-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME DEPLOYMENTS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_schedules_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-schedules-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_schedules_put",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-schedules-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME SCHEDULES PUT"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_script_settings_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-script-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_script_settings_patch",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-script-settings-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME SCRIPT SETTINGS PATCH"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_secrets_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-secrets-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_secrets_put",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-secrets-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME SECRETS PUT"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_secrets_bulk_patch",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-secrets-bulk-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME SECRETS BULK PATCH"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_secrets_get",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-secrets-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_secrets_delete",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-secrets-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME SECRETS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_settings_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_subdomain_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-subdomain-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_subdomain_create",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-subdomain-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME SUBDOMAIN CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_subdomain_delete",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-subdomain-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME SUBDOMAIN DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_tails_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-tails-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_tails_create",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-tails-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME TAILS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_tails_delete",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-tails-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME TAILS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_usage_model_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-usage-model-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_usage_model_put",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-usage-model-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SCRIPTS SCRIPT NAME USAGE MODEL PUT"
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_versions_list",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-versions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_scripts_script_name_versions_get",
    "provider": "cloudflare",
    "verb": "workers-scripts-script-name-versions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_subdomain_list",
    "provider": "cloudflare",
    "verb": "workers-subdomain-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_subdomain_put",
    "provider": "cloudflare",
    "verb": "workers-subdomain-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SUBDOMAIN PUT"
  },
  {
    "toolSlug": "cloudflare_workers_subdomain_delete",
    "provider": "cloudflare",
    "verb": "workers-subdomain-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS SUBDOMAIN DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_list",
    "provider": "cloudflare",
    "verb": "workers-workers-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_workers_create",
    "provider": "cloudflare",
    "verb": "workers-workers-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_get",
    "provider": "cloudflare",
    "verb": "workers-workers-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_workers_replace",
    "provider": "cloudflare",
    "verb": "workers-workers-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS REPLACE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_update",
    "provider": "cloudflare",
    "verb": "workers-workers-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS UPDATE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_delete",
    "provider": "cloudflare",
    "verb": "workers-workers-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_list",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_create",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID PREVIEWS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_get",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_replace",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID PREVIEWS REPLACE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_update",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID PREVIEWS UPDATE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_delete",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID PREVIEWS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_preview_id_deployments_list",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-preview-id-deployments-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_preview_id_deployments_create",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-preview-id-deployments-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID PREVIEWS PREVIEW ID DEPLOYMENTS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_preview_id_deployments_latest_patch",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-preview-id-deployments-latest-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID PREVIEWS PREVIEW ID DEPLOYMENTS LATEST PATCH"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_preview_id_deployments_get",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-preview-id-deployments-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_previews_preview_id_deployments_delete",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-previews-preview-id-deployments-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID PREVIEWS PREVIEW ID DEPLOYMENTS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_versions_list",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-versions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_versions_create",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-versions-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID VERSIONS CREATE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_versions_latest_patch",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-versions-latest-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID VERSIONS LATEST PATCH"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_versions_get",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-versions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_versions_delete",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-versions-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID VERSIONS DELETE"
  },
  {
    "toolSlug": "cloudflare_workers_workers_worker_id_versions_version_id_profile_create",
    "provider": "cloudflare",
    "verb": "workers-workers-worker-id-versions-version-id-profile-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKERS WORKERS WORKER ID VERSIONS VERSION ID PROFILE CREATE"
  },
  {
    "toolSlug": "cloudflare_workflows_list",
    "provider": "cloudflare",
    "verb": "workflows-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workflows_concurrency_list",
    "provider": "cloudflare",
    "verb": "workflows-concurrency-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workflows_concurrency_create",
    "provider": "cloudflare",
    "verb": "workflows-concurrency-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKFLOWS CONCURRENCY CREATE"
  },
  {
    "toolSlug": "cloudflare_workflows_concurrency_get",
    "provider": "cloudflare",
    "verb": "workflows-concurrency-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workflows_concurrency_update",
    "provider": "cloudflare",
    "verb": "workflows-concurrency-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKFLOWS CONCURRENCY UPDATE"
  },
  {
    "toolSlug": "cloudflare_workflows_concurrency_delete",
    "provider": "cloudflare",
    "verb": "workflows-concurrency-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKFLOWS CONCURRENCY DELETE"
  },
  {
    "toolSlug": "cloudflare_workflows_settings_list",
    "provider": "cloudflare",
    "verb": "workflows-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workflows_settings_patch",
    "provider": "cloudflare",
    "verb": "workflows-settings-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKFLOWS SETTINGS PATCH"
  },
  {
    "toolSlug": "cloudflare_workflows_get",
    "provider": "cloudflare",
    "verb": "workflows-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workflows_delete",
    "provider": "cloudflare",
    "verb": "workflows-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKFLOWS DELETE"
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_instances_list",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-instances-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_instances_create",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-instances-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKFLOWS WORKFLOW NAME INSTANCES CREATE"
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_instances_batch",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-instances-batch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKFLOWS WORKFLOW NAME INSTANCES BATCH"
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_instances_get",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-instances-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_instances_delete",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-instances-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKFLOWS WORKFLOW NAME INSTANCES DELETE"
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_instances_instance_id_events_create",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-instances-instance-id-events-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKFLOWS WORKFLOW NAME INSTANCES INSTANCE ID EVENTS CREATE"
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_instances_instance_id_status_patch",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-instances-instance-id-status-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE WORKFLOWS WORKFLOW NAME INSTANCES INSTANCE ID STATUS PATCH"
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_instances_instance_id_step_list",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-instances-instance-id-step-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_versions_list",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-versions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_versions_get",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-versions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_workflows_workflow_name_versions_version_id_graph_list",
    "provider": "cloudflare",
    "verb": "workflows-workflow-name-versions-version-id-graph-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_analytics_portals_portal_id_tool_calls_timeseries_list",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-analytics-portals-portal-id-tool-calls-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_analytics_servers_server_id_tool_calls_timeseries_list",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-analytics-servers-server-id-tool-calls-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_analytics_tool_calls_timeseries_list",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-analytics-tool-calls-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_portals_list",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-portals-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_portals_create",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-portals-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS AI CONTROLS MCP PORTALS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_portals_get",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-portals-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_portals_replace",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-portals-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS AI CONTROLS MCP PORTALS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_portals_delete",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-portals-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS AI CONTROLS MCP PORTALS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_servers_list",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-servers-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_servers_create",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-servers-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS AI CONTROLS MCP SERVERS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_servers_get",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-servers-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_servers_replace",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-servers-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS AI CONTROLS MCP SERVERS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_servers_delete",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-servers-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS AI CONTROLS MCP SERVERS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_ai_controls_mcp_servers_id_sync_create",
    "provider": "cloudflare",
    "verb": "access-ai-controls-mcp-servers-id-sync-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS AI CONTROLS MCP SERVERS ID SYNC CREATE"
  },
  {
    "toolSlug": "cloudflare_access_apps_list",
    "provider": "cloudflare",
    "verb": "access-apps-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_apps_create",
    "provider": "cloudflare",
    "verb": "access-apps-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS APPS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_apps_ca_list",
    "provider": "cloudflare",
    "verb": "access-apps-ca-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_apps_get",
    "provider": "cloudflare",
    "verb": "access-apps-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_apps_replace",
    "provider": "cloudflare",
    "verb": "access-apps-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS APPS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_apps_delete",
    "provider": "cloudflare",
    "verb": "access-apps-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS APPS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_apps_app_id_ca_list",
    "provider": "cloudflare",
    "verb": "access-apps-app-id-ca-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_apps_app_id_ca_create",
    "provider": "cloudflare",
    "verb": "access-apps-app-id-ca-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS APPS APP ID CA CREATE"
  },
  {
    "toolSlug": "cloudflare_access_apps_app_id_ca_delete",
    "provider": "cloudflare",
    "verb": "access-apps-app-id-ca-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS APPS APP ID CA DELETE"
  },
  {
    "toolSlug": "cloudflare_access_apps_app_id_policies_list",
    "provider": "cloudflare",
    "verb": "access-apps-app-id-policies-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_apps_app_id_policies_get",
    "provider": "cloudflare",
    "verb": "access-apps-app-id-policies-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_apps_app_id_policies_policy_id_make_reusable_put",
    "provider": "cloudflare",
    "verb": "access-apps-app-id-policies-policy-id-make-reusable-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS APPS APP ID POLICIES POLICY ID MAKE REUSABLE PUT"
  },
  {
    "toolSlug": "cloudflare_access_apps_app_id_revoke_tokens",
    "provider": "cloudflare",
    "verb": "access-apps-app-id-revoke-tokens",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS APPS APP ID REVOKE TOKENS"
  },
  {
    "toolSlug": "cloudflare_access_apps_app_id_settings_put",
    "provider": "cloudflare",
    "verb": "access-apps-app-id-settings-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS APPS APP ID SETTINGS PUT"
  },
  {
    "toolSlug": "cloudflare_access_apps_app_id_user_policy_checks_list",
    "provider": "cloudflare",
    "verb": "access-apps-app-id-user-policy-checks-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_authenticator_device_aaguids_list",
    "provider": "cloudflare",
    "verb": "access-authenticator-device-aaguids-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_bookmarks_list",
    "provider": "cloudflare",
    "verb": "access-bookmarks-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_bookmarks_get",
    "provider": "cloudflare",
    "verb": "access-bookmarks-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_bookmarks_create",
    "provider": "cloudflare",
    "verb": "access-bookmarks-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS BOOKMARKS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_bookmarks_replace",
    "provider": "cloudflare",
    "verb": "access-bookmarks-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS BOOKMARKS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_bookmarks_delete",
    "provider": "cloudflare",
    "verb": "access-bookmarks-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS BOOKMARKS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_certificates_list",
    "provider": "cloudflare",
    "verb": "access-certificates-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_certificates_create",
    "provider": "cloudflare",
    "verb": "access-certificates-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS CERTIFICATES CREATE"
  },
  {
    "toolSlug": "cloudflare_access_certificates_settings_list",
    "provider": "cloudflare",
    "verb": "access-certificates-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_certificates_settings_put",
    "provider": "cloudflare",
    "verb": "access-certificates-settings-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS CERTIFICATES SETTINGS PUT"
  },
  {
    "toolSlug": "cloudflare_access_certificates_get",
    "provider": "cloudflare",
    "verb": "access-certificates-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_certificates_replace",
    "provider": "cloudflare",
    "verb": "access-certificates-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS CERTIFICATES REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_certificates_delete",
    "provider": "cloudflare",
    "verb": "access-certificates-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS CERTIFICATES DELETE"
  },
  {
    "toolSlug": "cloudflare_access_custom_pages_list",
    "provider": "cloudflare",
    "verb": "access-custom-pages-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_custom_pages_create",
    "provider": "cloudflare",
    "verb": "access-custom-pages-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS CUSTOM PAGES CREATE"
  },
  {
    "toolSlug": "cloudflare_access_custom_pages_validate",
    "provider": "cloudflare",
    "verb": "access-custom-pages-validate",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS CUSTOM PAGES VALIDATE"
  },
  {
    "toolSlug": "cloudflare_access_custom_pages_get",
    "provider": "cloudflare",
    "verb": "access-custom-pages-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_custom_pages_replace",
    "provider": "cloudflare",
    "verb": "access-custom-pages-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS CUSTOM PAGES REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_custom_pages_delete",
    "provider": "cloudflare",
    "verb": "access-custom-pages-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS CUSTOM PAGES DELETE"
  },
  {
    "toolSlug": "cloudflare_access_gateway_ca_list",
    "provider": "cloudflare",
    "verb": "access-gateway-ca-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_gateway_ca_create",
    "provider": "cloudflare",
    "verb": "access-gateway-ca-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS GATEWAY CA CREATE"
  },
  {
    "toolSlug": "cloudflare_access_gateway_ca_delete",
    "provider": "cloudflare",
    "verb": "access-gateway-ca-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS GATEWAY CA DELETE"
  },
  {
    "toolSlug": "cloudflare_access_groups_list",
    "provider": "cloudflare",
    "verb": "access-groups-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_groups_create",
    "provider": "cloudflare",
    "verb": "access-groups-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS GROUPS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_groups_get",
    "provider": "cloudflare",
    "verb": "access-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_groups_replace",
    "provider": "cloudflare",
    "verb": "access-groups-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS GROUPS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_groups_delete",
    "provider": "cloudflare",
    "verb": "access-groups-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS GROUPS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_list",
    "provider": "cloudflare",
    "verb": "access-identity-providers-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_create",
    "provider": "cloudflare",
    "verb": "access-identity-providers-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS IDENTITY PROVIDERS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_get",
    "provider": "cloudflare",
    "verb": "access-identity-providers-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_replace",
    "provider": "cloudflare",
    "verb": "access-identity-providers-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS IDENTITY PROVIDERS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_delete",
    "provider": "cloudflare",
    "verb": "access-identity-providers-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS IDENTITY PROVIDERS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_identity_provider_id_saml_certificate_create",
    "provider": "cloudflare",
    "verb": "access-identity-providers-identity-provider-id-saml-certificate-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS IDENTITY PROVIDERS IDENTITY PROVIDER ID SAML CERTIFICATE CREATE"
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_identity_provider_id_scim_groups_list",
    "provider": "cloudflare",
    "verb": "access-identity-providers-identity-provider-id-scim-groups-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_identity_provider_id_scim_groups_get",
    "provider": "cloudflare",
    "verb": "access-identity-providers-identity-provider-id-scim-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_identity_provider_id_scim_groups_delete",
    "provider": "cloudflare",
    "verb": "access-identity-providers-identity-provider-id-scim-groups-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS IDENTITY PROVIDERS IDENTITY PROVIDER ID SCIM GROUPS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_identity_provider_id_scim_users_list",
    "provider": "cloudflare",
    "verb": "access-identity-providers-identity-provider-id-scim-users-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_identity_provider_id_scim_users_get",
    "provider": "cloudflare",
    "verb": "access-identity-providers-identity-provider-id-scim-users-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_identity_providers_identity_provider_id_scim_users_delete",
    "provider": "cloudflare",
    "verb": "access-identity-providers-identity-provider-id-scim-users-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS IDENTITY PROVIDERS IDENTITY PROVIDER ID SCIM USERS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_idp_federation_grants_list",
    "provider": "cloudflare",
    "verb": "access-idp-federation-grants-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_idp_federation_grants_create",
    "provider": "cloudflare",
    "verb": "access-idp-federation-grants-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS IDP FEDERATION GRANTS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_idp_federation_grants_get",
    "provider": "cloudflare",
    "verb": "access-idp-federation-grants-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_idp_federation_grants_delete",
    "provider": "cloudflare",
    "verb": "access-idp-federation-grants-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS IDP FEDERATION GRANTS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_keys_list",
    "provider": "cloudflare",
    "verb": "access-keys-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_keys_put",
    "provider": "cloudflare",
    "verb": "access-keys-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS KEYS PUT"
  },
  {
    "toolSlug": "cloudflare_access_keys_rotate",
    "provider": "cloudflare",
    "verb": "access-keys-rotate",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS KEYS ROTATE"
  },
  {
    "toolSlug": "cloudflare_access_logs_access_requests_list",
    "provider": "cloudflare",
    "verb": "access-logs-access-requests-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_logs_jit_requests_list",
    "provider": "cloudflare",
    "verb": "access-logs-jit-requests-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_logs_jit_requests_get",
    "provider": "cloudflare",
    "verb": "access-logs-jit-requests-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_logs_scim_updates_list",
    "provider": "cloudflare",
    "verb": "access-logs-scim-updates-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_organizations_list",
    "provider": "cloudflare",
    "verb": "access-organizations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_organizations_create",
    "provider": "cloudflare",
    "verb": "access-organizations-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS ORGANIZATIONS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_organizations_put",
    "provider": "cloudflare",
    "verb": "access-organizations-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS ORGANIZATIONS PUT"
  },
  {
    "toolSlug": "cloudflare_access_organizations_doh_list",
    "provider": "cloudflare",
    "verb": "access-organizations-doh-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_organizations_doh_put",
    "provider": "cloudflare",
    "verb": "access-organizations-doh-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS ORGANIZATIONS DOH PUT"
  },
  {
    "toolSlug": "cloudflare_access_organizations_revoke_user",
    "provider": "cloudflare",
    "verb": "access-organizations-revoke-user",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS ORGANIZATIONS REVOKE USER"
  },
  {
    "toolSlug": "cloudflare_access_policies_list",
    "provider": "cloudflare",
    "verb": "access-policies-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_policies_create",
    "provider": "cloudflare",
    "verb": "access-policies-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS POLICIES CREATE"
  },
  {
    "toolSlug": "cloudflare_access_policies_get",
    "provider": "cloudflare",
    "verb": "access-policies-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_policies_replace",
    "provider": "cloudflare",
    "verb": "access-policies-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS POLICIES REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_policies_delete",
    "provider": "cloudflare",
    "verb": "access-policies-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS POLICIES DELETE"
  },
  {
    "toolSlug": "cloudflare_access_policy_tests_create",
    "provider": "cloudflare",
    "verb": "access-policy-tests-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS POLICY TESTS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_policy_tests_get",
    "provider": "cloudflare",
    "verb": "access-policy-tests-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_policy_tests_policy_test_id_users_list",
    "provider": "cloudflare",
    "verb": "access-policy-tests-policy-test-id-users-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_saml_certificates_list",
    "provider": "cloudflare",
    "verb": "access-saml-certificates-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_saml_certificates_get",
    "provider": "cloudflare",
    "verb": "access-saml-certificates-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_saml_certificates_saml_cert_set_id_pem_list",
    "provider": "cloudflare",
    "verb": "access-saml-certificates-saml-cert-set-id-pem-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_saml_certificates_saml_cert_set_id_rotate",
    "provider": "cloudflare",
    "verb": "access-saml-certificates-saml-cert-set-id-rotate",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS SAML CERTIFICATES SAML CERT SET ID ROTATE"
  },
  {
    "toolSlug": "cloudflare_access_service_tokens_list",
    "provider": "cloudflare",
    "verb": "access-service-tokens-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_service_tokens_create",
    "provider": "cloudflare",
    "verb": "access-service-tokens-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS SERVICE TOKENS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_service_tokens_get",
    "provider": "cloudflare",
    "verb": "access-service-tokens-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_service_tokens_replace",
    "provider": "cloudflare",
    "verb": "access-service-tokens-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS SERVICE TOKENS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_service_tokens_delete",
    "provider": "cloudflare",
    "verb": "access-service-tokens-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS SERVICE TOKENS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_service_tokens_service_token_id_refresh",
    "provider": "cloudflare",
    "verb": "access-service-tokens-service-token-id-refresh",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS SERVICE TOKENS SERVICE TOKEN ID REFRESH"
  },
  {
    "toolSlug": "cloudflare_access_service_tokens_service_token_id_rotate",
    "provider": "cloudflare",
    "verb": "access-service-tokens-service-token-id-rotate",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS SERVICE TOKENS SERVICE TOKEN ID ROTATE"
  },
  {
    "toolSlug": "cloudflare_access_tags_list",
    "provider": "cloudflare",
    "verb": "access-tags-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_tags_create",
    "provider": "cloudflare",
    "verb": "access-tags-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS TAGS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_tags_get",
    "provider": "cloudflare",
    "verb": "access-tags-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_tags_replace",
    "provider": "cloudflare",
    "verb": "access-tags-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS TAGS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_tags_delete",
    "provider": "cloudflare",
    "verb": "access-tags-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS TAGS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_user_populations_list",
    "provider": "cloudflare",
    "verb": "access-user-populations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_user_populations_create",
    "provider": "cloudflare",
    "verb": "access-user-populations-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USER POPULATIONS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_user_populations_get",
    "provider": "cloudflare",
    "verb": "access-user-populations-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_user_populations_replace",
    "provider": "cloudflare",
    "verb": "access-user-populations-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USER POPULATIONS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_user_populations_delete",
    "provider": "cloudflare",
    "verb": "access-user-populations-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USER POPULATIONS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_user_populations_user_population_id_users_list",
    "provider": "cloudflare",
    "verb": "access-user-populations-user-population-id-users-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_user_populations_user_population_id_users_create",
    "provider": "cloudflare",
    "verb": "access-user-populations-user-population-id-users-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USER POPULATIONS USER POPULATION ID USERS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_user_populations_user_population_id_users_get",
    "provider": "cloudflare",
    "verb": "access-user-populations-user-population-id-users-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_user_populations_user_population_id_users_replace",
    "provider": "cloudflare",
    "verb": "access-user-populations-user-population-id-users-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USER POPULATIONS USER POPULATION ID USERS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_user_populations_user_population_id_users_update",
    "provider": "cloudflare",
    "verb": "access-user-populations-user-population-id-users-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USER POPULATIONS USER POPULATION ID USERS UPDATE"
  },
  {
    "toolSlug": "cloudflare_access_user_populations_user_population_id_users_delete",
    "provider": "cloudflare",
    "verb": "access-user-populations-user-population-id-users-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USER POPULATIONS USER POPULATION ID USERS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_users_list",
    "provider": "cloudflare",
    "verb": "access-users-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_users_create",
    "provider": "cloudflare",
    "verb": "access-users-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USERS CREATE"
  },
  {
    "toolSlug": "cloudflare_access_users_get",
    "provider": "cloudflare",
    "verb": "access-users-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_users_replace",
    "provider": "cloudflare",
    "verb": "access-users-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USERS REPLACE"
  },
  {
    "toolSlug": "cloudflare_access_users_delete",
    "provider": "cloudflare",
    "verb": "access-users-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USERS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_users_user_id_active_sessions_list",
    "provider": "cloudflare",
    "verb": "access-users-user-id-active-sessions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_users_user_id_active_sessions_get",
    "provider": "cloudflare",
    "verb": "access-users-user-id-active-sessions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_users_user_id_failed_logins_list",
    "provider": "cloudflare",
    "verb": "access-users-user-id-failed-logins-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_users_user_id_last_seen_identity_list",
    "provider": "cloudflare",
    "verb": "access-users-user-id-last-seen-identity-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_access_users_user_id_mfa_authenticators_delete",
    "provider": "cloudflare",
    "verb": "access-users-user-id-mfa-authenticators-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USERS USER ID MFA AUTHENTICATORS DELETE"
  },
  {
    "toolSlug": "cloudflare_access_users_user_id_passkeys_delete",
    "provider": "cloudflare",
    "verb": "access-users-user-id-passkeys-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCESS USERS USER ID PASSKEYS DELETE"
  },
  {
    "toolSlug": "cloudflare_devices_client_versions_list",
    "provider": "cloudflare",
    "verb": "devices-client-versions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_client_versions_target_environments_list",
    "provider": "cloudflare",
    "verb": "devices-client-versions-target-environments-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_deployment_groups_list",
    "provider": "cloudflare",
    "verb": "devices-deployment-groups-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_deployment_groups_create",
    "provider": "cloudflare",
    "verb": "devices-deployment-groups-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES DEPLOYMENT GROUPS CREATE"
  },
  {
    "toolSlug": "cloudflare_devices_deployment_groups_get",
    "provider": "cloudflare",
    "verb": "devices-deployment-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_deployment_groups_update",
    "provider": "cloudflare",
    "verb": "devices-deployment-groups-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES DEPLOYMENT GROUPS UPDATE"
  },
  {
    "toolSlug": "cloudflare_devices_deployment_groups_delete",
    "provider": "cloudflare",
    "verb": "devices-deployment-groups-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES DEPLOYMENT GROUPS DELETE"
  },
  {
    "toolSlug": "cloudflare_devices_ip_profiles_list",
    "provider": "cloudflare",
    "verb": "devices-ip-profiles-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_ip_profiles_create",
    "provider": "cloudflare",
    "verb": "devices-ip-profiles-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES IP PROFILES CREATE"
  },
  {
    "toolSlug": "cloudflare_devices_ip_profiles_get",
    "provider": "cloudflare",
    "verb": "devices-ip-profiles-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_ip_profiles_update",
    "provider": "cloudflare",
    "verb": "devices-ip-profiles-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES IP PROFILES UPDATE"
  },
  {
    "toolSlug": "cloudflare_devices_ip_profiles_delete",
    "provider": "cloudflare",
    "verb": "devices-ip-profiles-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES IP PROFILES DELETE"
  },
  {
    "toolSlug": "cloudflare_devices_networks_list",
    "provider": "cloudflare",
    "verb": "devices-networks-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_networks_create",
    "provider": "cloudflare",
    "verb": "devices-networks-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES NETWORKS CREATE"
  },
  {
    "toolSlug": "cloudflare_devices_networks_get",
    "provider": "cloudflare",
    "verb": "devices-networks-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_networks_replace",
    "provider": "cloudflare",
    "verb": "devices-networks-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES NETWORKS REPLACE"
  },
  {
    "toolSlug": "cloudflare_devices_networks_delete",
    "provider": "cloudflare",
    "verb": "devices-networks-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES NETWORKS DELETE"
  },
  {
    "toolSlug": "cloudflare_devices_override_codes_create",
    "provider": "cloudflare",
    "verb": "devices-override-codes-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES OVERRIDE CODES CREATE"
  },
  {
    "toolSlug": "cloudflare_devices_physical_devices_list",
    "provider": "cloudflare",
    "verb": "devices-physical-devices-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_physical_devices_get",
    "provider": "cloudflare",
    "verb": "devices-physical-devices-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_physical_devices_update",
    "provider": "cloudflare",
    "verb": "devices-physical-devices-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES PHYSICAL DEVICES UPDATE"
  },
  {
    "toolSlug": "cloudflare_devices_physical_devices_delete",
    "provider": "cloudflare",
    "verb": "devices-physical-devices-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES PHYSICAL DEVICES DELETE"
  },
  {
    "toolSlug": "cloudflare_devices_policies_list",
    "provider": "cloudflare",
    "verb": "devices-policies-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_policy_list",
    "provider": "cloudflare",
    "verb": "devices-policy-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_policy_create",
    "provider": "cloudflare",
    "verb": "devices-policy-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES POLICY CREATE"
  },
  {
    "toolSlug": "cloudflare_devices_policy_patch",
    "provider": "cloudflare",
    "verb": "devices-policy-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES POLICY PATCH"
  },
  {
    "toolSlug": "cloudflare_devices_policy_get",
    "provider": "cloudflare",
    "verb": "devices-policy-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_policy_update",
    "provider": "cloudflare",
    "verb": "devices-policy-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES POLICY UPDATE"
  },
  {
    "toolSlug": "cloudflare_devices_policy_delete",
    "provider": "cloudflare",
    "verb": "devices-policy-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES POLICY DELETE"
  },
  {
    "toolSlug": "cloudflare_devices_posture_list",
    "provider": "cloudflare",
    "verb": "devices-posture-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_posture_create",
    "provider": "cloudflare",
    "verb": "devices-posture-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES POSTURE CREATE"
  },
  {
    "toolSlug": "cloudflare_devices_posture_integration_list",
    "provider": "cloudflare",
    "verb": "devices-posture-integration-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_posture_integration_create",
    "provider": "cloudflare",
    "verb": "devices-posture-integration-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES POSTURE INTEGRATION CREATE"
  },
  {
    "toolSlug": "cloudflare_devices_posture_integration_get",
    "provider": "cloudflare",
    "verb": "devices-posture-integration-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_posture_integration_update",
    "provider": "cloudflare",
    "verb": "devices-posture-integration-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES POSTURE INTEGRATION UPDATE"
  },
  {
    "toolSlug": "cloudflare_devices_posture_integration_delete",
    "provider": "cloudflare",
    "verb": "devices-posture-integration-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES POSTURE INTEGRATION DELETE"
  },
  {
    "toolSlug": "cloudflare_devices_posture_get",
    "provider": "cloudflare",
    "verb": "devices-posture-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_posture_replace",
    "provider": "cloudflare",
    "verb": "devices-posture-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES POSTURE REPLACE"
  },
  {
    "toolSlug": "cloudflare_devices_posture_delete",
    "provider": "cloudflare",
    "verb": "devices-posture-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES POSTURE DELETE"
  },
  {
    "toolSlug": "cloudflare_devices_registrations_list",
    "provider": "cloudflare",
    "verb": "devices-registrations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_registrations_delete_all",
    "provider": "cloudflare",
    "verb": "devices-registrations-delete-all",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES REGISTRATIONS DELETE ALL"
  },
  {
    "toolSlug": "cloudflare_devices_registrations_get",
    "provider": "cloudflare",
    "verb": "devices-registrations-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_registrations_delete",
    "provider": "cloudflare",
    "verb": "devices-registrations-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES REGISTRATIONS DELETE"
  },
  {
    "toolSlug": "cloudflare_devices_registrations_registration_id_override_codes_list",
    "provider": "cloudflare",
    "verb": "devices-registrations-registration-id-override-codes-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_resilience_disconnect_list",
    "provider": "cloudflare",
    "verb": "devices-resilience-disconnect-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_resilience_disconnect_create",
    "provider": "cloudflare",
    "verb": "devices-resilience-disconnect-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES RESILIENCE DISCONNECT CREATE"
  },
  {
    "toolSlug": "cloudflare_devices_settings_list",
    "provider": "cloudflare",
    "verb": "devices-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_devices_settings_patch",
    "provider": "cloudflare",
    "verb": "devices-settings-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES SETTINGS PATCH"
  },
  {
    "toolSlug": "cloudflare_devices_settings_delete",
    "provider": "cloudflare",
    "verb": "devices-settings-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DEVICES SETTINGS DELETE"
  },
  {
    "toolSlug": "cloudflare_devices_device_id_override_codes_list",
    "provider": "cloudflare",
    "verb": "devices-device-id-override-codes-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_custom_prompt_topics_list",
    "provider": "cloudflare",
    "verb": "dlp-custom-prompt-topics-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_custom_prompt_topics_create",
    "provider": "cloudflare",
    "verb": "dlp-custom-prompt-topics-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP CUSTOM PROMPT TOPICS CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_custom_prompt_topics_get",
    "provider": "cloudflare",
    "verb": "dlp-custom-prompt-topics-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_custom_prompt_topics_replace",
    "provider": "cloudflare",
    "verb": "dlp-custom-prompt-topics-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP CUSTOM PROMPT TOPICS REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_custom_prompt_topics_delete",
    "provider": "cloudflare",
    "verb": "dlp-custom-prompt-topics-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP CUSTOM PROMPT TOPICS DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_data_classes_list",
    "provider": "cloudflare",
    "verb": "dlp-data-classes-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_data_classes_create",
    "provider": "cloudflare",
    "verb": "dlp-data-classes-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATA CLASSES CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_data_classes_get",
    "provider": "cloudflare",
    "verb": "dlp-data-classes-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_data_classes_replace",
    "provider": "cloudflare",
    "verb": "dlp-data-classes-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATA CLASSES REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_data_classes_delete",
    "provider": "cloudflare",
    "verb": "dlp-data-classes-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATA CLASSES DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_categories_list",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-categories-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_categories_create",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-categories-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATA TAG CATEGORIES CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_categories_get",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-categories-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_categories_replace",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-categories-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATA TAG CATEGORIES REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_categories_delete",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-categories-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATA TAG CATEGORIES DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_categories_category_id_data_tags_list",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-categories-category-id-data-tags-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_categories_category_id_data_tags_create",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-categories-category-id-data-tags-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATA TAG CATEGORIES CATEGORY ID DATA TAGS CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_categories_category_id_data_tags_get",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-categories-category-id-data-tags-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_categories_category_id_data_tags_replace",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-categories-category-id-data-tags-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATA TAG CATEGORIES CATEGORY ID DATA TAGS REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_categories_category_id_data_tags_delete",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-categories-category-id-data-tags-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATA TAG CATEGORIES CATEGORY ID DATA TAGS DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_category_templates_list",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-category-templates-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_data_tag_category_templates_get",
    "provider": "cloudflare",
    "verb": "dlp-data-tag-category-templates-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_datasets_list",
    "provider": "cloudflare",
    "verb": "dlp-datasets-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_datasets_create",
    "provider": "cloudflare",
    "verb": "dlp-datasets-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATASETS CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_datasets_get",
    "provider": "cloudflare",
    "verb": "dlp-datasets-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_datasets_replace",
    "provider": "cloudflare",
    "verb": "dlp-datasets-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATASETS REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_datasets_delete",
    "provider": "cloudflare",
    "verb": "dlp-datasets-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATASETS DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_datasets_dataset_id_upload",
    "provider": "cloudflare",
    "verb": "dlp-datasets-dataset-id-upload",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DATASETS DATASET ID UPLOAD"
  },
  {
    "toolSlug": "cloudflare_dlp_document_fingerprints_list",
    "provider": "cloudflare",
    "verb": "dlp-document-fingerprints-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_document_fingerprints_create",
    "provider": "cloudflare",
    "verb": "dlp-document-fingerprints-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DOCUMENT FINGERPRINTS CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_document_fingerprints_get",
    "provider": "cloudflare",
    "verb": "dlp-document-fingerprints-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_document_fingerprints_update",
    "provider": "cloudflare",
    "verb": "dlp-document-fingerprints-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DOCUMENT FINGERPRINTS UPDATE"
  },
  {
    "toolSlug": "cloudflare_dlp_document_fingerprints_delete",
    "provider": "cloudflare",
    "verb": "dlp-document-fingerprints-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP DOCUMENT FINGERPRINTS DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_email_account_mapping_list",
    "provider": "cloudflare",
    "verb": "dlp-email-account-mapping-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_email_account_mapping_create",
    "provider": "cloudflare",
    "verb": "dlp-email-account-mapping-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP EMAIL ACCOUNT MAPPING CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_email_rules_list",
    "provider": "cloudflare",
    "verb": "dlp-email-rules-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_email_rules_create",
    "provider": "cloudflare",
    "verb": "dlp-email-rules-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP EMAIL RULES CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_email_rules_patch",
    "provider": "cloudflare",
    "verb": "dlp-email-rules-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP EMAIL RULES PATCH"
  },
  {
    "toolSlug": "cloudflare_dlp_email_rules_get",
    "provider": "cloudflare",
    "verb": "dlp-email-rules-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_email_rules_replace",
    "provider": "cloudflare",
    "verb": "dlp-email-rules-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP EMAIL RULES REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_email_rules_delete",
    "provider": "cloudflare",
    "verb": "dlp-email-rules-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP EMAIL RULES DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_entries_list",
    "provider": "cloudflare",
    "verb": "dlp-entries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_entries_create",
    "provider": "cloudflare",
    "verb": "dlp-entries-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP ENTRIES CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_entries_get",
    "provider": "cloudflare",
    "verb": "dlp-entries-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_entries_replace",
    "provider": "cloudflare",
    "verb": "dlp-entries-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP ENTRIES REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_entries_delete",
    "provider": "cloudflare",
    "verb": "dlp-entries-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP ENTRIES DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_limits_list",
    "provider": "cloudflare",
    "verb": "dlp-limits-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_patterns_validate",
    "provider": "cloudflare",
    "verb": "dlp-patterns-validate",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP PATTERNS VALIDATE"
  },
  {
    "toolSlug": "cloudflare_dlp_profiles_list",
    "provider": "cloudflare",
    "verb": "dlp-profiles-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_profiles_custom_create",
    "provider": "cloudflare",
    "verb": "dlp-profiles-custom-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP PROFILES CUSTOM CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_profiles_custom_replace",
    "provider": "cloudflare",
    "verb": "dlp-profiles-custom-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP PROFILES CUSTOM REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_profiles_custom_delete",
    "provider": "cloudflare",
    "verb": "dlp-profiles-custom-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP PROFILES CUSTOM DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_profiles_predefined_replace",
    "provider": "cloudflare",
    "verb": "dlp-profiles-predefined-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP PROFILES PREDEFINED REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_profiles_get",
    "provider": "cloudflare",
    "verb": "dlp-profiles-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_list",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_create",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP SENSITIVITY GROUPS CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_templates_list",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-templates-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_templates_get",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-templates-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_get",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_replace",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP SENSITIVITY GROUPS REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_delete",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP SENSITIVITY GROUPS DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_sensitivity_group_id_level_order_list",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-sensitivity-group-id-level-order-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_sensitivity_group_id_level_order_put",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-sensitivity-group-id-level-order-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP SENSITIVITY GROUPS SENSITIVITY GROUP ID LEVEL ORDER PUT"
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_sensitivity_group_id_levels_list",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-sensitivity-group-id-levels-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_sensitivity_group_id_levels_create",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-sensitivity-group-id-levels-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP SENSITIVITY GROUPS SENSITIVITY GROUP ID LEVELS CREATE"
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_sensitivity_group_id_levels_get",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-sensitivity-group-id-levels-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_sensitivity_group_id_levels_replace",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-sensitivity-group-id-levels-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP SENSITIVITY GROUPS SENSITIVITY GROUP ID LEVELS REPLACE"
  },
  {
    "toolSlug": "cloudflare_dlp_sensitivity_groups_sensitivity_group_id_levels_delete",
    "provider": "cloudflare",
    "verb": "dlp-sensitivity-groups-sensitivity-group-id-levels-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP SENSITIVITY GROUPS SENSITIVITY GROUP ID LEVELS DELETE"
  },
  {
    "toolSlug": "cloudflare_dlp_settings_list",
    "provider": "cloudflare",
    "verb": "dlp-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_dlp_settings_put",
    "provider": "cloudflare",
    "verb": "dlp-settings-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP SETTINGS PUT"
  },
  {
    "toolSlug": "cloudflare_dlp_settings_patch",
    "provider": "cloudflare",
    "verb": "dlp-settings-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP SETTINGS PATCH"
  },
  {
    "toolSlug": "cloudflare_dlp_settings_delete",
    "provider": "cloudflare",
    "verb": "dlp-settings-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE DLP SETTINGS DELETE"
  },
  {
    "toolSlug": "cloudflare_gateway_list",
    "provider": "cloudflare",
    "verb": "gateway-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_create",
    "provider": "cloudflare",
    "verb": "gateway-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY CREATE"
  },
  {
    "toolSlug": "cloudflare_gateway_app_types_list",
    "provider": "cloudflare",
    "verb": "gateway-app-types-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_audit_ssh_settings_list",
    "provider": "cloudflare",
    "verb": "gateway-audit-ssh-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_audit_ssh_settings_put",
    "provider": "cloudflare",
    "verb": "gateway-audit-ssh-settings-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY AUDIT SSH SETTINGS PUT"
  },
  {
    "toolSlug": "cloudflare_gateway_audit_ssh_settings_rotate_seed",
    "provider": "cloudflare",
    "verb": "gateway-audit-ssh-settings-rotate-seed",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY AUDIT SSH SETTINGS ROTATE SEED"
  },
  {
    "toolSlug": "cloudflare_gateway_categories_list",
    "provider": "cloudflare",
    "verb": "gateway-categories-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_certificates_list",
    "provider": "cloudflare",
    "verb": "gateway-certificates-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_certificates_create",
    "provider": "cloudflare",
    "verb": "gateway-certificates-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY CERTIFICATES CREATE"
  },
  {
    "toolSlug": "cloudflare_gateway_certificates_get",
    "provider": "cloudflare",
    "verb": "gateway-certificates-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_certificates_delete",
    "provider": "cloudflare",
    "verb": "gateway-certificates-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY CERTIFICATES DELETE"
  },
  {
    "toolSlug": "cloudflare_gateway_certificates_certificate_id_activate",
    "provider": "cloudflare",
    "verb": "gateway-certificates-certificate-id-activate",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY CERTIFICATES CERTIFICATE ID ACTIVATE"
  },
  {
    "toolSlug": "cloudflare_gateway_certificates_certificate_id_deactivate",
    "provider": "cloudflare",
    "verb": "gateway-certificates-certificate-id-deactivate",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY CERTIFICATES CERTIFICATE ID DEACTIVATE"
  },
  {
    "toolSlug": "cloudflare_gateway_configuration_list",
    "provider": "cloudflare",
    "verb": "gateway-configuration-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_configuration_put",
    "provider": "cloudflare",
    "verb": "gateway-configuration-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY CONFIGURATION PUT"
  },
  {
    "toolSlug": "cloudflare_gateway_configuration_patch",
    "provider": "cloudflare",
    "verb": "gateway-configuration-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY CONFIGURATION PATCH"
  },
  {
    "toolSlug": "cloudflare_gateway_configuration_custom_certificate_list",
    "provider": "cloudflare",
    "verb": "gateway-configuration-custom-certificate-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_dns_destination_ips_list",
    "provider": "cloudflare",
    "verb": "gateway-dns-destination-ips-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_lists_list",
    "provider": "cloudflare",
    "verb": "gateway-lists-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_lists_create",
    "provider": "cloudflare",
    "verb": "gateway-lists-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY LISTS CREATE"
  },
  {
    "toolSlug": "cloudflare_gateway_lists_get",
    "provider": "cloudflare",
    "verb": "gateway-lists-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_lists_replace",
    "provider": "cloudflare",
    "verb": "gateway-lists-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY LISTS REPLACE"
  },
  {
    "toolSlug": "cloudflare_gateway_lists_update",
    "provider": "cloudflare",
    "verb": "gateway-lists-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY LISTS UPDATE"
  },
  {
    "toolSlug": "cloudflare_gateway_lists_delete",
    "provider": "cloudflare",
    "verb": "gateway-lists-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY LISTS DELETE"
  },
  {
    "toolSlug": "cloudflare_gateway_lists_list_id_items_list",
    "provider": "cloudflare",
    "verb": "gateway-lists-list-id-items-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_locations_list",
    "provider": "cloudflare",
    "verb": "gateway-locations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_locations_create",
    "provider": "cloudflare",
    "verb": "gateway-locations-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY LOCATIONS CREATE"
  },
  {
    "toolSlug": "cloudflare_gateway_locations_get",
    "provider": "cloudflare",
    "verb": "gateway-locations-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_locations_replace",
    "provider": "cloudflare",
    "verb": "gateway-locations-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY LOCATIONS REPLACE"
  },
  {
    "toolSlug": "cloudflare_gateway_locations_delete",
    "provider": "cloudflare",
    "verb": "gateway-locations-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY LOCATIONS DELETE"
  },
  {
    "toolSlug": "cloudflare_gateway_logging_list",
    "provider": "cloudflare",
    "verb": "gateway-logging-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_logging_put",
    "provider": "cloudflare",
    "verb": "gateway-logging-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY LOGGING PUT"
  },
  {
    "toolSlug": "cloudflare_gateway_pacfiles_list",
    "provider": "cloudflare",
    "verb": "gateway-pacfiles-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_pacfiles_create",
    "provider": "cloudflare",
    "verb": "gateway-pacfiles-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY PACFILES CREATE"
  },
  {
    "toolSlug": "cloudflare_gateway_pacfiles_get",
    "provider": "cloudflare",
    "verb": "gateway-pacfiles-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_pacfiles_replace",
    "provider": "cloudflare",
    "verb": "gateway-pacfiles-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY PACFILES REPLACE"
  },
  {
    "toolSlug": "cloudflare_gateway_pacfiles_delete",
    "provider": "cloudflare",
    "verb": "gateway-pacfiles-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY PACFILES DELETE"
  },
  {
    "toolSlug": "cloudflare_gateway_proxy_endpoints_list",
    "provider": "cloudflare",
    "verb": "gateway-proxy-endpoints-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_proxy_endpoints_create",
    "provider": "cloudflare",
    "verb": "gateway-proxy-endpoints-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY PROXY ENDPOINTS CREATE"
  },
  {
    "toolSlug": "cloudflare_gateway_proxy_endpoints_get",
    "provider": "cloudflare",
    "verb": "gateway-proxy-endpoints-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_proxy_endpoints_update",
    "provider": "cloudflare",
    "verb": "gateway-proxy-endpoints-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY PROXY ENDPOINTS UPDATE"
  },
  {
    "toolSlug": "cloudflare_gateway_proxy_endpoints_delete",
    "provider": "cloudflare",
    "verb": "gateway-proxy-endpoints-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY PROXY ENDPOINTS DELETE"
  },
  {
    "toolSlug": "cloudflare_gateway_rules_list",
    "provider": "cloudflare",
    "verb": "gateway-rules-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_rules_create",
    "provider": "cloudflare",
    "verb": "gateway-rules-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY RULES CREATE"
  },
  {
    "toolSlug": "cloudflare_gateway_rules_tenant_list",
    "provider": "cloudflare",
    "verb": "gateway-rules-tenant-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_rules_get",
    "provider": "cloudflare",
    "verb": "gateway-rules-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_gateway_rules_replace",
    "provider": "cloudflare",
    "verb": "gateway-rules-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY RULES REPLACE"
  },
  {
    "toolSlug": "cloudflare_gateway_rules_delete",
    "provider": "cloudflare",
    "verb": "gateway-rules-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY RULES DELETE"
  },
  {
    "toolSlug": "cloudflare_gateway_rules_rule_id_reset_expiration",
    "provider": "cloudflare",
    "verb": "gateway-rules-rule-id-reset-expiration",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE GATEWAY RULES RULE ID RESET EXPIRATION"
  },
  {
    "toolSlug": "cloudflare_teamnet_routes_list",
    "provider": "cloudflare",
    "verb": "teamnet-routes-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_teamnet_routes_create",
    "provider": "cloudflare",
    "verb": "teamnet-routes-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE TEAMNET ROUTES CREATE"
  },
  {
    "toolSlug": "cloudflare_teamnet_routes_ip_get",
    "provider": "cloudflare",
    "verb": "teamnet-routes-ip-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_teamnet_routes_get",
    "provider": "cloudflare",
    "verb": "teamnet-routes-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_teamnet_routes_update",
    "provider": "cloudflare",
    "verb": "teamnet-routes-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE TEAMNET ROUTES UPDATE"
  },
  {
    "toolSlug": "cloudflare_teamnet_routes_delete",
    "provider": "cloudflare",
    "verb": "teamnet-routes-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE TEAMNET ROUTES DELETE"
  },
  {
    "toolSlug": "cloudflare_teamnet_virtual_networks_list",
    "provider": "cloudflare",
    "verb": "teamnet-virtual-networks-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_teamnet_virtual_networks_create",
    "provider": "cloudflare",
    "verb": "teamnet-virtual-networks-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE TEAMNET VIRTUAL NETWORKS CREATE"
  },
  {
    "toolSlug": "cloudflare_teamnet_virtual_networks_get",
    "provider": "cloudflare",
    "verb": "teamnet-virtual-networks-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_teamnet_virtual_networks_update",
    "provider": "cloudflare",
    "verb": "teamnet-virtual-networks-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE TEAMNET VIRTUAL NETWORKS UPDATE"
  },
  {
    "toolSlug": "cloudflare_teamnet_virtual_networks_delete",
    "provider": "cloudflare",
    "verb": "teamnet-virtual-networks-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE TEAMNET VIRTUAL NETWORKS DELETE"
  },
  {
    "toolSlug": "cloudflare_tunnels_list",
    "provider": "cloudflare",
    "verb": "tunnels-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zerotrust_connectivity_settings_list",
    "provider": "cloudflare",
    "verb": "zerotrust-connectivity-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zerotrust_connectivity_settings_patch",
    "provider": "cloudflare",
    "verb": "zerotrust-connectivity-settings-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZEROTRUST CONNECTIVITY SETTINGS PATCH"
  },
  {
    "toolSlug": "cloudflare_zerotrust_routes_hostname_list",
    "provider": "cloudflare",
    "verb": "zerotrust-routes-hostname-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zerotrust_routes_hostname_create",
    "provider": "cloudflare",
    "verb": "zerotrust-routes-hostname-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZEROTRUST ROUTES HOSTNAME CREATE"
  },
  {
    "toolSlug": "cloudflare_zerotrust_routes_hostname_get",
    "provider": "cloudflare",
    "verb": "zerotrust-routes-hostname-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zerotrust_routes_hostname_update",
    "provider": "cloudflare",
    "verb": "zerotrust-routes-hostname-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZEROTRUST ROUTES HOSTNAME UPDATE"
  },
  {
    "toolSlug": "cloudflare_zerotrust_routes_hostname_delete",
    "provider": "cloudflare",
    "verb": "zerotrust-routes-hostname-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZEROTRUST ROUTES HOSTNAME DELETE"
  },
  {
    "toolSlug": "cloudflare_zerotrust_subnets_list",
    "provider": "cloudflare",
    "verb": "zerotrust-subnets-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zerotrust_subnets_cloudflare_source_get",
    "provider": "cloudflare",
    "verb": "zerotrust-subnets-cloudflare-source-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zerotrust_subnets_cloudflare_source_update",
    "provider": "cloudflare",
    "verb": "zerotrust-subnets-cloudflare-source-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZEROTRUST SUBNETS CLOUDFLARE SOURCE UPDATE"
  },
  {
    "toolSlug": "cloudflare_zerotrust_subnets_initial_resolved_ip_get",
    "provider": "cloudflare",
    "verb": "zerotrust-subnets-initial-resolved-ip-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zerotrust_subnets_initial_resolved_ip_replace",
    "provider": "cloudflare",
    "verb": "zerotrust-subnets-initial-resolved-ip-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZEROTRUST SUBNETS INITIAL RESOLVED IP REPLACE"
  },
  {
    "toolSlug": "cloudflare_zerotrust_subnets_warp_create",
    "provider": "cloudflare",
    "verb": "zerotrust-subnets-warp-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZEROTRUST SUBNETS WARP CREATE"
  },
  {
    "toolSlug": "cloudflare_zerotrust_subnets_warp_get",
    "provider": "cloudflare",
    "verb": "zerotrust-subnets-warp-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zerotrust_subnets_warp_update",
    "provider": "cloudflare",
    "verb": "zerotrust-subnets-warp-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZEROTRUST SUBNETS WARP UPDATE"
  },
  {
    "toolSlug": "cloudflare_zerotrust_subnets_warp_delete",
    "provider": "cloudflare",
    "verb": "zerotrust-subnets-warp-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZEROTRUST SUBNETS WARP DELETE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_available_alerts_list",
    "provider": "cloudflare",
    "verb": "alerting-v3-available-alerts-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_destinations_eligible_list",
    "provider": "cloudflare",
    "verb": "alerting-v3-destinations-eligible-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_destinations_pagerduty_list",
    "provider": "cloudflare",
    "verb": "alerting-v3-destinations-pagerduty-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_destinations_pagerduty_delete",
    "provider": "cloudflare",
    "verb": "alerting-v3-destinations-pagerduty-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 DESTINATIONS PAGERDUTY DELETE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_destinations_pagerduty_connect_create",
    "provider": "cloudflare",
    "verb": "alerting-v3-destinations-pagerduty-connect-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 DESTINATIONS PAGERDUTY CONNECT CREATE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_destinations_pagerduty_connect_get",
    "provider": "cloudflare",
    "verb": "alerting-v3-destinations-pagerduty-connect-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_destinations_webhooks_list",
    "provider": "cloudflare",
    "verb": "alerting-v3-destinations-webhooks-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_destinations_webhooks_create",
    "provider": "cloudflare",
    "verb": "alerting-v3-destinations-webhooks-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 DESTINATIONS WEBHOOKS CREATE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_destinations_webhooks_get",
    "provider": "cloudflare",
    "verb": "alerting-v3-destinations-webhooks-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_destinations_webhooks_replace",
    "provider": "cloudflare",
    "verb": "alerting-v3-destinations-webhooks-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 DESTINATIONS WEBHOOKS REPLACE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_destinations_webhooks_delete",
    "provider": "cloudflare",
    "verb": "alerting-v3-destinations-webhooks-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 DESTINATIONS WEBHOOKS DELETE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_history_list",
    "provider": "cloudflare",
    "verb": "alerting-v3-history-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_policies_list",
    "provider": "cloudflare",
    "verb": "alerting-v3-policies-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_policies_create",
    "provider": "cloudflare",
    "verb": "alerting-v3-policies-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 POLICIES CREATE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_policies_get",
    "provider": "cloudflare",
    "verb": "alerting-v3-policies-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_policies_replace",
    "provider": "cloudflare",
    "verb": "alerting-v3-policies-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 POLICIES REPLACE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_policies_delete",
    "provider": "cloudflare",
    "verb": "alerting-v3-policies-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 POLICIES DELETE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_policies_policy_id_email_unsubscribe_list",
    "provider": "cloudflare",
    "verb": "alerting-v3-policies-policy-id-email-unsubscribe-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_policies_policy_id_email_unsubscribe_create",
    "provider": "cloudflare",
    "verb": "alerting-v3-policies-policy-id-email-unsubscribe-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 POLICIES POLICY ID EMAIL UNSUBSCRIBE CREATE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_policies_policy_id_test",
    "provider": "cloudflare",
    "verb": "alerting-v3-policies-policy-id-test",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 POLICIES POLICY ID TEST"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_silences_list",
    "provider": "cloudflare",
    "verb": "alerting-v3-silences-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_silences_create",
    "provider": "cloudflare",
    "verb": "alerting-v3-silences-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 SILENCES CREATE"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_silences_put",
    "provider": "cloudflare",
    "verb": "alerting-v3-silences-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 SILENCES PUT"
  },
  {
    "toolSlug": "cloudflare_alerting_v3_silences_get",
    "provider": "cloudflare",
    "verb": "alerting-v3-silences-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_alerting_v3_silences_delete",
    "provider": "cloudflare",
    "verb": "alerting-v3-silences-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ALERTING V3 SILENCES DELETE"
  },
  {
    "toolSlug": "cloudflare_analytics_query_data_security_content_findings_top_n_create",
    "provider": "cloudflare",
    "verb": "analytics-query-data-security-content-findings-top-n-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ANALYTICS QUERY DATA SECURITY CONTENT FINDINGS TOP N CREATE"
  },
  {
    "toolSlug": "cloudflare_analytics_query_data_security_findings_summary_create",
    "provider": "cloudflare",
    "verb": "analytics-query-data-security-findings-summary-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ANALYTICS QUERY DATA SECURITY FINDINGS SUMMARY CREATE"
  },
  {
    "toolSlug": "cloudflare_analytics_query_data_security_findings_timeseries_create",
    "provider": "cloudflare",
    "verb": "analytics-query-data-security-findings-timeseries-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ANALYTICS QUERY DATA SECURITY FINDINGS TIMESERIES CREATE"
  },
  {
    "toolSlug": "cloudflare_analytics_query_dataset_summary_create",
    "provider": "cloudflare",
    "verb": "analytics-query-dataset-summary-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ANALYTICS QUERY DATASET SUMMARY CREATE"
  },
  {
    "toolSlug": "cloudflare_analytics_query_dataset_timeseries_create",
    "provider": "cloudflare",
    "verb": "analytics-query-dataset-timeseries-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ANALYTICS QUERY DATASET TIMESERIES CREATE"
  },
  {
    "toolSlug": "cloudflare_analytics_query_dataset_top_n_create",
    "provider": "cloudflare",
    "verb": "analytics-query-dataset-top-n-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ANALYTICS QUERY DATASET TOP N CREATE"
  },
  {
    "toolSlug": "cloudflare_logpush_datasets_dataset_id_fields_list",
    "provider": "cloudflare",
    "verb": "logpush-datasets-dataset-id-fields-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logpush_datasets_dataset_id_jobs_list",
    "provider": "cloudflare",
    "verb": "logpush-datasets-dataset-id-jobs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logpush_jobs_list",
    "provider": "cloudflare",
    "verb": "logpush-jobs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logpush_jobs_create",
    "provider": "cloudflare",
    "verb": "logpush-jobs-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH JOBS CREATE"
  },
  {
    "toolSlug": "cloudflare_logpush_jobs_get",
    "provider": "cloudflare",
    "verb": "logpush-jobs-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logpush_jobs_replace",
    "provider": "cloudflare",
    "verb": "logpush-jobs-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH JOBS REPLACE"
  },
  {
    "toolSlug": "cloudflare_logpush_jobs_delete",
    "provider": "cloudflare",
    "verb": "logpush-jobs-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH JOBS DELETE"
  },
  {
    "toolSlug": "cloudflare_logpush_ownership_create",
    "provider": "cloudflare",
    "verb": "logpush-ownership-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH OWNERSHIP CREATE"
  },
  {
    "toolSlug": "cloudflare_logpush_ownership_validate",
    "provider": "cloudflare",
    "verb": "logpush-ownership-validate",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH OWNERSHIP VALIDATE"
  },
  {
    "toolSlug": "cloudflare_logpush_transformers_list",
    "provider": "cloudflare",
    "verb": "logpush-transformers-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logpush_transformers_create",
    "provider": "cloudflare",
    "verb": "logpush-transformers-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH TRANSFORMERS CREATE"
  },
  {
    "toolSlug": "cloudflare_logpush_transformers_preview",
    "provider": "cloudflare",
    "verb": "logpush-transformers-preview",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH TRANSFORMERS PREVIEW"
  },
  {
    "toolSlug": "cloudflare_logpush_transformers_get",
    "provider": "cloudflare",
    "verb": "logpush-transformers-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logpush_transformers_replace",
    "provider": "cloudflare",
    "verb": "logpush-transformers-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH TRANSFORMERS REPLACE"
  },
  {
    "toolSlug": "cloudflare_logpush_transformers_delete",
    "provider": "cloudflare",
    "verb": "logpush-transformers-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH TRANSFORMERS DELETE"
  },
  {
    "toolSlug": "cloudflare_logpush_transformers_transformer_id_content_list",
    "provider": "cloudflare",
    "verb": "logpush-transformers-transformer-id-content-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logpush_transformers_transformer_id_versions_list",
    "provider": "cloudflare",
    "verb": "logpush-transformers-transformer-id-versions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logpush_validate_destination_create",
    "provider": "cloudflare",
    "verb": "logpush-validate-destination-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH VALIDATE DESTINATION CREATE"
  },
  {
    "toolSlug": "cloudflare_logpush_validate_destination_exists_create",
    "provider": "cloudflare",
    "verb": "logpush-validate-destination-exists-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH VALIDATE DESTINATION EXISTS CREATE"
  },
  {
    "toolSlug": "cloudflare_logpush_validate_origin_create",
    "provider": "cloudflare",
    "verb": "logpush-validate-origin-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH VALIDATE ORIGIN CREATE"
  },
  {
    "toolSlug": "cloudflare_logs_explorer_datasets_list",
    "provider": "cloudflare",
    "verb": "logs-explorer-datasets-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logs_explorer_datasets_create",
    "provider": "cloudflare",
    "verb": "logs-explorer-datasets-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGS EXPLORER DATASETS CREATE"
  },
  {
    "toolSlug": "cloudflare_logs_explorer_datasets_available_list",
    "provider": "cloudflare",
    "verb": "logs-explorer-datasets-available-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logs_explorer_datasets_get",
    "provider": "cloudflare",
    "verb": "logs-explorer-datasets-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logs_explorer_datasets_replace",
    "provider": "cloudflare",
    "verb": "logs-explorer-datasets-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGS EXPLORER DATASETS REPLACE"
  },
  {
    "toolSlug": "cloudflare_logs_explorer_datasets_delete",
    "provider": "cloudflare",
    "verb": "logs-explorer-datasets-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGS EXPLORER DATASETS DELETE"
  },
  {
    "toolSlug": "cloudflare_logs_explorer_query_sql_create",
    "provider": "cloudflare",
    "verb": "logs-explorer-query-sql-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGS EXPLORER QUERY SQL CREATE"
  },
  {
    "toolSlug": "cloudflare_logs_list_list",
    "provider": "cloudflare",
    "verb": "logs-list-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logs_retrieve_list",
    "provider": "cloudflare",
    "verb": "logs-retrieve-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_rulesets_list",
    "provider": "cloudflare",
    "verb": "rulesets-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_rulesets_create",
    "provider": "cloudflare",
    "verb": "rulesets-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE RULESETS CREATE"
  },
  {
    "toolSlug": "cloudflare_rulesets_phases_ruleset_phase_entrypoint_list",
    "provider": "cloudflare",
    "verb": "rulesets-phases-ruleset-phase-entrypoint-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_rulesets_phases_ruleset_phase_entrypoint_put",
    "provider": "cloudflare",
    "verb": "rulesets-phases-ruleset-phase-entrypoint-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE RULESETS PHASES RULESET PHASE ENTRYPOINT PUT"
  },
  {
    "toolSlug": "cloudflare_rulesets_phases_ruleset_phase_entrypoint_versions_list",
    "provider": "cloudflare",
    "verb": "rulesets-phases-ruleset-phase-entrypoint-versions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_rulesets_phases_ruleset_phase_entrypoint_versions_get",
    "provider": "cloudflare",
    "verb": "rulesets-phases-ruleset-phase-entrypoint-versions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_rulesets_get",
    "provider": "cloudflare",
    "verb": "rulesets-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_rulesets_replace",
    "provider": "cloudflare",
    "verb": "rulesets-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE RULESETS REPLACE"
  },
  {
    "toolSlug": "cloudflare_rulesets_delete",
    "provider": "cloudflare",
    "verb": "rulesets-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE RULESETS DELETE"
  },
  {
    "toolSlug": "cloudflare_rulesets_ruleset_id_rules_create",
    "provider": "cloudflare",
    "verb": "rulesets-ruleset-id-rules-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE RULESETS RULESET ID RULES CREATE"
  },
  {
    "toolSlug": "cloudflare_rulesets_ruleset_id_rules_update",
    "provider": "cloudflare",
    "verb": "rulesets-ruleset-id-rules-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE RULESETS RULESET ID RULES UPDATE"
  },
  {
    "toolSlug": "cloudflare_rulesets_ruleset_id_rules_delete",
    "provider": "cloudflare",
    "verb": "rulesets-ruleset-id-rules-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE RULESETS RULESET ID RULES DELETE"
  },
  {
    "toolSlug": "cloudflare_rulesets_ruleset_id_versions_list",
    "provider": "cloudflare",
    "verb": "rulesets-ruleset-id-versions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_rulesets_ruleset_id_versions_get",
    "provider": "cloudflare",
    "verb": "rulesets-ruleset-id-versions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_rulesets_ruleset_id_versions_delete",
    "provider": "cloudflare",
    "verb": "rulesets-ruleset-id-versions-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE RULESETS RULESET ID VERSIONS DELETE"
  },
  {
    "toolSlug": "cloudflare_rulesets_ruleset_id_versions_ruleset_version_by_tag_get",
    "provider": "cloudflare",
    "verb": "rulesets-ruleset-id-versions-ruleset-version-by-tag-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_account_analytics_sql_list",
    "provider": "cloudflare",
    "verb": "account-analytics-sql-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_account_analytics_sql_create",
    "provider": "cloudflare",
    "verb": "account-analytics-sql-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ACCOUNT ANALYTICS SQL CREATE"
  },
  {
    "toolSlug": "cloudflare_account_analytics_sql_introspection_list",
    "provider": "cloudflare",
    "verb": "account-analytics-sql-introspection-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_analytics_sql_list",
    "provider": "cloudflare",
    "verb": "analytics-sql-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_analytics_sql_create",
    "provider": "cloudflare",
    "verb": "analytics-sql-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ANALYTICS SQL CREATE"
  },
  {
    "toolSlug": "cloudflare_analytics_sql_introspection_list",
    "provider": "cloudflare",
    "verb": "analytics-sql-introspection-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_analytics_colos_list",
    "provider": "cloudflare",
    "verb": "analytics-colos-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_analytics_dashboard_list",
    "provider": "cloudflare",
    "verb": "analytics-dashboard-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_cache_cache_reserve_list",
    "provider": "cloudflare",
    "verb": "cache-cache-reserve-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_cache_cache_reserve_patch",
    "provider": "cloudflare",
    "verb": "cache-cache-reserve-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE CACHE RESERVE PATCH"
  },
  {
    "toolSlug": "cloudflare_cache_cache_reserve_clear_list",
    "provider": "cloudflare",
    "verb": "cache-cache-reserve-clear-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_cache_cache_reserve_clear_create",
    "provider": "cloudflare",
    "verb": "cache-cache-reserve-clear-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE CACHE RESERVE CLEAR CREATE"
  },
  {
    "toolSlug": "cloudflare_cache_origin_cloud_regions_list",
    "provider": "cloudflare",
    "verb": "cache-origin-cloud-regions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_cache_origin_cloud_regions_create",
    "provider": "cloudflare",
    "verb": "cache-origin-cloud-regions-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE ORIGIN CLOUD REGIONS CREATE"
  },
  {
    "toolSlug": "cloudflare_cache_origin_cloud_regions_patch",
    "provider": "cloudflare",
    "verb": "cache-origin-cloud-regions-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE ORIGIN CLOUD REGIONS PATCH"
  },
  {
    "toolSlug": "cloudflare_cache_origin_cloud_regions_batch",
    "provider": "cloudflare",
    "verb": "cache-origin-cloud-regions-batch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE ORIGIN CLOUD REGIONS BATCH"
  },
  {
    "toolSlug": "cloudflare_cache_origin_cloud_regions_batch_delete",
    "provider": "cloudflare",
    "verb": "cache-origin-cloud-regions-batch-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE ORIGIN CLOUD REGIONS BATCH DELETE"
  },
  {
    "toolSlug": "cloudflare_cache_origin_cloud_regions_supported_regions_list",
    "provider": "cloudflare",
    "verb": "cache-origin-cloud-regions-supported-regions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_cache_origin_cloud_regions_get",
    "provider": "cloudflare",
    "verb": "cache-origin-cloud-regions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_cache_origin_cloud_regions_delete",
    "provider": "cloudflare",
    "verb": "cache-origin-cloud-regions-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE ORIGIN CLOUD REGIONS DELETE"
  },
  {
    "toolSlug": "cloudflare_cache_origin_post_quantum_encryption_list",
    "provider": "cloudflare",
    "verb": "cache-origin-post-quantum-encryption-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_cache_origin_post_quantum_encryption_put",
    "provider": "cloudflare",
    "verb": "cache-origin-post-quantum-encryption-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE ORIGIN POST QUANTUM ENCRYPTION PUT"
  },
  {
    "toolSlug": "cloudflare_cache_regional_tiered_cache_list",
    "provider": "cloudflare",
    "verb": "cache-regional-tiered-cache-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_cache_regional_tiered_cache_patch",
    "provider": "cloudflare",
    "verb": "cache-regional-tiered-cache-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE REGIONAL TIERED CACHE PATCH"
  },
  {
    "toolSlug": "cloudflare_cache_tiered_cache_smart_topology_get",
    "provider": "cloudflare",
    "verb": "cache-tiered-cache-smart-topology-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_cache_tiered_cache_smart_topology_enable",
    "provider": "cloudflare",
    "verb": "cache-tiered-cache-smart-topology-enable",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE TIERED CACHE SMART TOPOLOGY ENABLE"
  },
  {
    "toolSlug": "cloudflare_cache_tiered_cache_smart_topology_update",
    "provider": "cloudflare",
    "verb": "cache-tiered-cache-smart-topology-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE TIERED CACHE SMART TOPOLOGY UPDATE"
  },
  {
    "toolSlug": "cloudflare_cache_tiered_cache_smart_topology_delete",
    "provider": "cloudflare",
    "verb": "cache-tiered-cache-smart-topology-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE TIERED CACHE SMART TOPOLOGY DELETE"
  },
  {
    "toolSlug": "cloudflare_cache_variants_list",
    "provider": "cloudflare",
    "verb": "cache-variants-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_cache_variants_patch",
    "provider": "cloudflare",
    "verb": "cache-variants-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE VARIANTS PATCH"
  },
  {
    "toolSlug": "cloudflare_cache_variants_delete",
    "provider": "cloudflare",
    "verb": "cache-variants-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE CACHE VARIANTS DELETE"
  },
  {
    "toolSlug": "cloudflare_zone_logpush_datasets_dataset_id_fields_list",
    "provider": "cloudflare",
    "verb": "zone-logpush-datasets-dataset-id-fields-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_logpush_datasets_dataset_id_jobs_list",
    "provider": "cloudflare",
    "verb": "zone-logpush-datasets-dataset-id-jobs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logpush_edge_jobs_list",
    "provider": "cloudflare",
    "verb": "logpush-edge-jobs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_logpush_edge_jobs_create",
    "provider": "cloudflare",
    "verb": "logpush-edge-jobs-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOGPUSH EDGE JOBS CREATE"
  },
  {
    "toolSlug": "cloudflare_zone_logpush_jobs_list",
    "provider": "cloudflare",
    "verb": "zone-logpush-jobs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_logpush_jobs_create",
    "provider": "cloudflare",
    "verb": "zone-logpush-jobs-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGPUSH JOBS CREATE"
  },
  {
    "toolSlug": "cloudflare_zone_logpush_jobs_get",
    "provider": "cloudflare",
    "verb": "zone-logpush-jobs-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_logpush_jobs_replace",
    "provider": "cloudflare",
    "verb": "zone-logpush-jobs-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGPUSH JOBS REPLACE"
  },
  {
    "toolSlug": "cloudflare_zone_logpush_jobs_delete",
    "provider": "cloudflare",
    "verb": "zone-logpush-jobs-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGPUSH JOBS DELETE"
  },
  {
    "toolSlug": "cloudflare_zone_logpush_ownership_create",
    "provider": "cloudflare",
    "verb": "zone-logpush-ownership-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGPUSH OWNERSHIP CREATE"
  },
  {
    "toolSlug": "cloudflare_zone_logpush_ownership_validate",
    "provider": "cloudflare",
    "verb": "zone-logpush-ownership-validate",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGPUSH OWNERSHIP VALIDATE"
  },
  {
    "toolSlug": "cloudflare_zone_logpush_validate_destination_create",
    "provider": "cloudflare",
    "verb": "zone-logpush-validate-destination-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGPUSH VALIDATE DESTINATION CREATE"
  },
  {
    "toolSlug": "cloudflare_zone_logpush_validate_destination_exists_create",
    "provider": "cloudflare",
    "verb": "zone-logpush-validate-destination-exists-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGPUSH VALIDATE DESTINATION EXISTS CREATE"
  },
  {
    "toolSlug": "cloudflare_zone_logpush_validate_origin_create",
    "provider": "cloudflare",
    "verb": "zone-logpush-validate-origin-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGPUSH VALIDATE ORIGIN CREATE"
  },
  {
    "toolSlug": "cloudflare_zone_logs_explorer_datasets_list",
    "provider": "cloudflare",
    "verb": "zone-logs-explorer-datasets-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_logs_explorer_datasets_create",
    "provider": "cloudflare",
    "verb": "zone-logs-explorer-datasets-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGS EXPLORER DATASETS CREATE"
  },
  {
    "toolSlug": "cloudflare_zone_logs_explorer_datasets_available_list",
    "provider": "cloudflare",
    "verb": "zone-logs-explorer-datasets-available-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_logs_explorer_datasets_get",
    "provider": "cloudflare",
    "verb": "zone-logs-explorer-datasets-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_logs_explorer_datasets_replace",
    "provider": "cloudflare",
    "verb": "zone-logs-explorer-datasets-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGS EXPLORER DATASETS REPLACE"
  },
  {
    "toolSlug": "cloudflare_zone_logs_explorer_datasets_delete",
    "provider": "cloudflare",
    "verb": "zone-logs-explorer-datasets-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGS EXPLORER DATASETS DELETE"
  },
  {
    "toolSlug": "cloudflare_zone_logs_explorer_query_sql_create",
    "provider": "cloudflare",
    "verb": "zone-logs-explorer-query-sql-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE LOGS EXPLORER QUERY SQL CREATE"
  },
  {
    "toolSlug": "cloudflare_observability_tracing_rules_list",
    "provider": "cloudflare",
    "verb": "observability-tracing-rules-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_observability_tracing_rules_put",
    "provider": "cloudflare",
    "verb": "observability-tracing-rules-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE OBSERVABILITY TRACING RULES PUT"
  },
  {
    "toolSlug": "cloudflare_observability_tracing_rules_delete",
    "provider": "cloudflare",
    "verb": "observability-tracing-rules-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE OBSERVABILITY TRACING RULES DELETE"
  },
  {
    "toolSlug": "cloudflare_observability_tracing_settings_list",
    "provider": "cloudflare",
    "verb": "observability-tracing-settings-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_observability_tracing_settings_patch",
    "provider": "cloudflare",
    "verb": "observability-tracing-settings-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE OBSERVABILITY TRACING SETTINGS PATCH"
  },
  {
    "toolSlug": "cloudflare_observability_tracing_settings_delete",
    "provider": "cloudflare",
    "verb": "observability-tracing-settings-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE OBSERVABILITY TRACING SETTINGS DELETE"
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_list",
    "provider": "cloudflare",
    "verb": "zone-rulesets-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_create",
    "provider": "cloudflare",
    "verb": "zone-rulesets-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE RULESETS CREATE"
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_phases_ruleset_phase_entrypoint_list",
    "provider": "cloudflare",
    "verb": "zone-rulesets-phases-ruleset-phase-entrypoint-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_phases_ruleset_phase_entrypoint_put",
    "provider": "cloudflare",
    "verb": "zone-rulesets-phases-ruleset-phase-entrypoint-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE RULESETS PHASES RULESET PHASE ENTRYPOINT PUT"
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_phases_ruleset_phase_entrypoint_versions_list",
    "provider": "cloudflare",
    "verb": "zone-rulesets-phases-ruleset-phase-entrypoint-versions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_phases_ruleset_phase_entrypoint_versions_get",
    "provider": "cloudflare",
    "verb": "zone-rulesets-phases-ruleset-phase-entrypoint-versions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_get",
    "provider": "cloudflare",
    "verb": "zone-rulesets-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_replace",
    "provider": "cloudflare",
    "verb": "zone-rulesets-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE RULESETS REPLACE"
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_delete",
    "provider": "cloudflare",
    "verb": "zone-rulesets-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE RULESETS DELETE"
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_ruleset_id_rules_create",
    "provider": "cloudflare",
    "verb": "zone-rulesets-ruleset-id-rules-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE RULESETS RULESET ID RULES CREATE"
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_ruleset_id_rules_update",
    "provider": "cloudflare",
    "verb": "zone-rulesets-ruleset-id-rules-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE RULESETS RULESET ID RULES UPDATE"
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_ruleset_id_rules_delete",
    "provider": "cloudflare",
    "verb": "zone-rulesets-ruleset-id-rules-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE RULESETS RULESET ID RULES DELETE"
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_ruleset_id_versions_list",
    "provider": "cloudflare",
    "verb": "zone-rulesets-ruleset-id-versions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_ruleset_id_versions_get",
    "provider": "cloudflare",
    "verb": "zone-rulesets-ruleset-id-versions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_ruleset_id_versions_delete",
    "provider": "cloudflare",
    "verb": "zone-rulesets-ruleset-id-versions-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE ZONE RULESETS RULESET ID VERSIONS DELETE"
  },
  {
    "toolSlug": "cloudflare_zone_rulesets_ruleset_id_versions_ruleset_version_by_tag_get",
    "provider": "cloudflare",
    "verb": "zone-rulesets-ruleset-id-versions-ruleset-version-by-tag-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_security_center_insights_list",
    "provider": "cloudflare",
    "verb": "security-center-insights-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_security_center_insights_audit_log_list",
    "provider": "cloudflare",
    "verb": "security-center-insights-audit-log-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_security_center_insights_class_list",
    "provider": "cloudflare",
    "verb": "security-center-insights-class-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_security_center_insights_scans_list",
    "provider": "cloudflare",
    "verb": "security-center-insights-scans-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_security_center_insights_scans_create",
    "provider": "cloudflare",
    "verb": "security-center-insights-scans-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE SECURITY CENTER INSIGHTS SCANS CREATE"
  },
  {
    "toolSlug": "cloudflare_security_center_insights_severity_list",
    "provider": "cloudflare",
    "verb": "security-center-insights-severity-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_security_center_insights_type_list",
    "provider": "cloudflare",
    "verb": "security-center-insights-type-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_security_center_insights_issue_id_audit_log_list",
    "provider": "cloudflare",
    "verb": "security-center-insights-issue-id-audit-log-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_security_center_insights_issue_id_classification_patch",
    "provider": "cloudflare",
    "verb": "security-center-insights-issue-id-classification-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE SECURITY CENTER INSIGHTS ISSUE ID CLASSIFICATION PATCH"
  },
  {
    "toolSlug": "cloudflare_security_center_insights_issue_id_dismiss_put",
    "provider": "cloudflare",
    "verb": "security-center-insights-issue-id-dismiss-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE SECURITY CENTER INSIGHTS ISSUE ID DISMISS PUT"
  },
  {
    "toolSlug": "cloudflare_security_center_securitytxt_list",
    "provider": "cloudflare",
    "verb": "security-center-securitytxt-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_security_center_securitytxt_put",
    "provider": "cloudflare",
    "verb": "security-center-securitytxt-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE SECURITY CENTER SECURITYTXT PUT"
  },
  {
    "toolSlug": "cloudflare_security_center_securitytxt_delete",
    "provider": "cloudflare",
    "verb": "security-center-securitytxt-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE SECURITY CENTER SECURITYTXT DELETE"
  },
  {
    "toolSlug": "cloudflare_speed_api_availabilities_list",
    "provider": "cloudflare",
    "verb": "speed-api-availabilities-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_speed_api_pages_list",
    "provider": "cloudflare",
    "verb": "speed-api-pages-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_speed_api_pages_url_tests_list",
    "provider": "cloudflare",
    "verb": "speed-api-pages-url-tests-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_speed_api_pages_url_tests_create",
    "provider": "cloudflare",
    "verb": "speed-api-pages-url-tests-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE SPEED API PAGES URL TESTS CREATE"
  },
  {
    "toolSlug": "cloudflare_speed_api_pages_url_tests_delete",
    "provider": "cloudflare",
    "verb": "speed-api-pages-url-tests-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE SPEED API PAGES URL TESTS DELETE"
  },
  {
    "toolSlug": "cloudflare_speed_api_pages_url_tests_get",
    "provider": "cloudflare",
    "verb": "speed-api-pages-url-tests-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_speed_api_pages_url_trend_list",
    "provider": "cloudflare",
    "verb": "speed-api-pages-url-trend-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_speed_api_schedule_get",
    "provider": "cloudflare",
    "verb": "speed-api-schedule-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_speed_api_schedule_create",
    "provider": "cloudflare",
    "verb": "speed-api-schedule-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE SPEED API SCHEDULE CREATE"
  },
  {
    "toolSlug": "cloudflare_speed_api_schedule_delete",
    "provider": "cloudflare",
    "verb": "speed-api-schedule-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE SPEED API SCHEDULE DELETE"
  },
  {
    "toolSlug": "cloudflare_images_v1_keys_list",
    "provider": "cloudflare",
    "verb": "images-v1-keys-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v1_keys_replace",
    "provider": "cloudflare",
    "verb": "images-v1-keys-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V1 KEYS REPLACE"
  },
  {
    "toolSlug": "cloudflare_images_v1_keys_delete",
    "provider": "cloudflare",
    "verb": "images-v1-keys-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V1 KEYS DELETE"
  },
  {
    "toolSlug": "cloudflare_images_v1_stats_list",
    "provider": "cloudflare",
    "verb": "images-v1-stats-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v1_variants_list",
    "provider": "cloudflare",
    "verb": "images-v1-variants-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v1_variants_create",
    "provider": "cloudflare",
    "verb": "images-v1-variants-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V1 VARIANTS CREATE"
  },
  {
    "toolSlug": "cloudflare_images_v1_variants_get",
    "provider": "cloudflare",
    "verb": "images-v1-variants-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v1_variants_update",
    "provider": "cloudflare",
    "verb": "images-v1-variants-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V1 VARIANTS UPDATE"
  },
  {
    "toolSlug": "cloudflare_images_v1_variants_delete",
    "provider": "cloudflare",
    "verb": "images-v1-variants-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V1 VARIANTS DELETE"
  },
  {
    "toolSlug": "cloudflare_images_v1_get",
    "provider": "cloudflare",
    "verb": "images-v1-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v1_update",
    "provider": "cloudflare",
    "verb": "images-v1-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V1 UPDATE"
  },
  {
    "toolSlug": "cloudflare_images_v1_delete",
    "provider": "cloudflare",
    "verb": "images-v1-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V1 DELETE"
  },
  {
    "toolSlug": "cloudflare_images_v1_image_id_blob_list",
    "provider": "cloudflare",
    "verb": "images-v1-image-id-blob-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v2_list",
    "provider": "cloudflare",
    "verb": "images-v2-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_migrations_list",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-migrations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_migrations_create",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-migrations-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V2 SOURCINGKIT MIGRATIONS CREATE"
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_migrations_get",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-migrations-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_migrations_delete",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-migrations-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V2 SOURCINGKIT MIGRATIONS DELETE"
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_migrations_migration_id_lifecycle_list",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-migrations-migration-id-lifecycle-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_migrations_migration_id_lifecycle_abort_patch",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-migrations-migration-id-lifecycle-abort-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V2 SOURCINGKIT MIGRATIONS MIGRATION ID LIFECYCLE ABORT PATCH"
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_migrations_migration_id_lifecycle_start_patch",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-migrations-migration-id-lifecycle-start-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V2 SOURCINGKIT MIGRATIONS MIGRATION ID LIFECYCLE START PATCH"
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_migrations_migration_id_logs_list",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-migrations-migration-id-logs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_sources_list",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-sources-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_sources_create",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-sources-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V2 SOURCINGKIT SOURCES CREATE"
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_sources_connectivity_precheck_create",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-sources-connectivity-precheck-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V2 SOURCINGKIT SOURCES CONNECTIVITY PRECHECK CREATE"
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_sources_get",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-sources-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_sources_update",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-sources-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V2 SOURCINGKIT SOURCES UPDATE"
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_sources_delete",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-sources-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE IMAGES V2 SOURCINGKIT SOURCES DELETE"
  },
  {
    "toolSlug": "cloudflare_images_v2_sourcingkit_sources_source_id_connectivity_list",
    "provider": "cloudflare",
    "verb": "images-v2-sourcingkit-sources-source-id-connectivity-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_list",
    "provider": "cloudflare",
    "verb": "load-balancers-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_create",
    "provider": "cloudflare",
    "verb": "load-balancers-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS CREATE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitor_groups_list",
    "provider": "cloudflare",
    "verb": "load-balancers-monitor-groups-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitor_groups_create",
    "provider": "cloudflare",
    "verb": "load-balancers-monitor-groups-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS MONITOR GROUPS CREATE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitor_groups_get",
    "provider": "cloudflare",
    "verb": "load-balancers-monitor-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitor_groups_replace",
    "provider": "cloudflare",
    "verb": "load-balancers-monitor-groups-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS MONITOR GROUPS REPLACE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitor_groups_update",
    "provider": "cloudflare",
    "verb": "load-balancers-monitor-groups-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS MONITOR GROUPS UPDATE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitor_groups_delete",
    "provider": "cloudflare",
    "verb": "load-balancers-monitor-groups-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS MONITOR GROUPS DELETE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitor_groups_monitor_group_id_references_list",
    "provider": "cloudflare",
    "verb": "load-balancers-monitor-groups-monitor-group-id-references-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitors_list",
    "provider": "cloudflare",
    "verb": "load-balancers-monitors-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitors_create",
    "provider": "cloudflare",
    "verb": "load-balancers-monitors-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS MONITORS CREATE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitors_get",
    "provider": "cloudflare",
    "verb": "load-balancers-monitors-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitors_replace",
    "provider": "cloudflare",
    "verb": "load-balancers-monitors-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS MONITORS REPLACE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitors_update",
    "provider": "cloudflare",
    "verb": "load-balancers-monitors-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS MONITORS UPDATE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitors_delete",
    "provider": "cloudflare",
    "verb": "load-balancers-monitors-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS MONITORS DELETE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitors_monitor_id_preview",
    "provider": "cloudflare",
    "verb": "load-balancers-monitors-monitor-id-preview",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS MONITORS MONITOR ID PREVIEW"
  },
  {
    "toolSlug": "cloudflare_load_balancers_monitors_monitor_id_references_list",
    "provider": "cloudflare",
    "verb": "load-balancers-monitors-monitor-id-references-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_pools_list",
    "provider": "cloudflare",
    "verb": "load-balancers-pools-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_pools_create",
    "provider": "cloudflare",
    "verb": "load-balancers-pools-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS POOLS CREATE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_pools_patch",
    "provider": "cloudflare",
    "verb": "load-balancers-pools-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS POOLS PATCH"
  },
  {
    "toolSlug": "cloudflare_load_balancers_pools_get",
    "provider": "cloudflare",
    "verb": "load-balancers-pools-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_pools_replace",
    "provider": "cloudflare",
    "verb": "load-balancers-pools-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS POOLS REPLACE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_pools_update",
    "provider": "cloudflare",
    "verb": "load-balancers-pools-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS POOLS UPDATE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_pools_delete",
    "provider": "cloudflare",
    "verb": "load-balancers-pools-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS POOLS DELETE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_pools_pool_id_health_list",
    "provider": "cloudflare",
    "verb": "load-balancers-pools-pool-id-health-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_pools_pool_id_preview",
    "provider": "cloudflare",
    "verb": "load-balancers-pools-pool-id-preview",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS POOLS POOL ID PREVIEW"
  },
  {
    "toolSlug": "cloudflare_load_balancers_pools_pool_id_references_list",
    "provider": "cloudflare",
    "verb": "load-balancers-pools-pool-id-references-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_preview",
    "provider": "cloudflare",
    "verb": "load-balancers-preview",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_regions_list",
    "provider": "cloudflare",
    "verb": "load-balancers-regions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_regions_get",
    "provider": "cloudflare",
    "verb": "load-balancers-regions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_search",
    "provider": "cloudflare",
    "verb": "load-balancers-search",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_usage_list",
    "provider": "cloudflare",
    "verb": "load-balancers-usage-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_get",
    "provider": "cloudflare",
    "verb": "load-balancers-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_load_balancers_replace",
    "provider": "cloudflare",
    "verb": "load-balancers-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS REPLACE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_update",
    "provider": "cloudflare",
    "verb": "load-balancers-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS UPDATE"
  },
  {
    "toolSlug": "cloudflare_load_balancers_delete",
    "provider": "cloudflare",
    "verb": "load-balancers-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE LOAD BALANCERS DELETE"
  },
  {
    "toolSlug": "cloudflare_members_list",
    "provider": "cloudflare",
    "verb": "members-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_members_create",
    "provider": "cloudflare",
    "verb": "members-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE MEMBERS CREATE"
  },
  {
    "toolSlug": "cloudflare_members_get",
    "provider": "cloudflare",
    "verb": "members-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_members_replace",
    "provider": "cloudflare",
    "verb": "members-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE MEMBERS REPLACE"
  },
  {
    "toolSlug": "cloudflare_members_delete",
    "provider": "cloudflare",
    "verb": "members-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE MEMBERS DELETE"
  },
  {
    "toolSlug": "cloudflare_registrar_sandbox_domain_check_create",
    "provider": "cloudflare",
    "verb": "registrar-sandbox-domain-check-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE REGISTRAR SANDBOX DOMAIN CHECK CREATE"
  },
  {
    "toolSlug": "cloudflare_registrar_sandbox_domain_search_list",
    "provider": "cloudflare",
    "verb": "registrar-sandbox-domain-search-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_sandbox_extensions_list",
    "provider": "cloudflare",
    "verb": "registrar-sandbox-extensions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_sandbox_extensions_get",
    "provider": "cloudflare",
    "verb": "registrar-sandbox-extensions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_sandbox_registrations_list",
    "provider": "cloudflare",
    "verb": "registrar-sandbox-registrations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_sandbox_registrations_create",
    "provider": "cloudflare",
    "verb": "registrar-sandbox-registrations-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE REGISTRAR SANDBOX REGISTRATIONS CREATE"
  },
  {
    "toolSlug": "cloudflare_registrar_sandbox_registrations_get",
    "provider": "cloudflare",
    "verb": "registrar-sandbox-registrations-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_sandbox_registrations_update",
    "provider": "cloudflare",
    "verb": "registrar-sandbox-registrations-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE REGISTRAR SANDBOX REGISTRATIONS UPDATE"
  },
  {
    "toolSlug": "cloudflare_registrar_sandbox_registrations_domain_name_registration_status_list",
    "provider": "cloudflare",
    "verb": "registrar-sandbox-registrations-domain-name-registration-status-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_sandbox_registrations_domain_name_update_status_list",
    "provider": "cloudflare",
    "verb": "registrar-sandbox-registrations-domain-name-update-status-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_domain_check_create",
    "provider": "cloudflare",
    "verb": "registrar-domain-check-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE REGISTRAR DOMAIN CHECK CREATE"
  },
  {
    "toolSlug": "cloudflare_registrar_domain_search_list",
    "provider": "cloudflare",
    "verb": "registrar-domain-search-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_domain_transfer_check_create",
    "provider": "cloudflare",
    "verb": "registrar-domain-transfer-check-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE REGISTRAR DOMAIN TRANSFER CHECK CREATE"
  },
  {
    "toolSlug": "cloudflare_registrar_extensions_list",
    "provider": "cloudflare",
    "verb": "registrar-extensions-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_extensions_get",
    "provider": "cloudflare",
    "verb": "registrar-extensions-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_registrations_list",
    "provider": "cloudflare",
    "verb": "registrar-registrations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_registrations_create",
    "provider": "cloudflare",
    "verb": "registrar-registrations-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE REGISTRAR REGISTRATIONS CREATE"
  },
  {
    "toolSlug": "cloudflare_registrar_registrations_get",
    "provider": "cloudflare",
    "verb": "registrar-registrations-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_registrations_update",
    "provider": "cloudflare",
    "verb": "registrar-registrations-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE REGISTRAR REGISTRATIONS UPDATE"
  },
  {
    "toolSlug": "cloudflare_registrar_registrations_domain_name_registration_status_list",
    "provider": "cloudflare",
    "verb": "registrar-registrations-domain-name-registration-status-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_registrations_domain_name_transfer_in_create",
    "provider": "cloudflare",
    "verb": "registrar-registrations-domain-name-transfer-in-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE REGISTRAR REGISTRATIONS DOMAIN NAME TRANSFER IN CREATE"
  },
  {
    "toolSlug": "cloudflare_registrar_registrations_domain_name_transfer_in_status_list",
    "provider": "cloudflare",
    "verb": "registrar-registrations-domain-name-transfer-in-status-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_registrar_registrations_domain_name_update_status_list",
    "provider": "cloudflare",
    "verb": "registrar-registrations-domain-name-update-status-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_stream_list",
    "provider": "cloudflare",
    "verb": "stream-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_stream_copy",
    "provider": "cloudflare",
    "verb": "stream-copy",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM COPY"
  },
  {
    "toolSlug": "cloudflare_stream_direct_upload",
    "provider": "cloudflare",
    "verb": "stream-direct-upload",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM DIRECT UPLOAD"
  },
  {
    "toolSlug": "cloudflare_stream_keys_list",
    "provider": "cloudflare",
    "verb": "stream-keys-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_stream_keys_create",
    "provider": "cloudflare",
    "verb": "stream-keys-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM KEYS CREATE"
  },
  {
    "toolSlug": "cloudflare_stream_keys_delete",
    "provider": "cloudflare",
    "verb": "stream-keys-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM KEYS DELETE"
  },
  {
    "toolSlug": "cloudflare_stream_live_inputs_list",
    "provider": "cloudflare",
    "verb": "stream-live-inputs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_stream_live_inputs_create",
    "provider": "cloudflare",
    "verb": "stream-live-inputs-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM LIVE INPUTS CREATE"
  },
  {
    "toolSlug": "cloudflare_stream_live_inputs_get",
    "provider": "cloudflare",
    "verb": "stream-live-inputs-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_stream_live_inputs_replace",
    "provider": "cloudflare",
    "verb": "stream-live-inputs-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM LIVE INPUTS REPLACE"
  },
  {
    "toolSlug": "cloudflare_stream_live_inputs_delete",
    "provider": "cloudflare",
    "verb": "stream-live-inputs-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM LIVE INPUTS DELETE"
  },
  {
    "toolSlug": "cloudflare_stream_live_inputs_live_input_identifier_disable",
    "provider": "cloudflare",
    "verb": "stream-live-inputs-live-input-identifier-disable",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM LIVE INPUTS LIVE INPUT IDENTIFIER DISABLE"
  },
  {
    "toolSlug": "cloudflare_stream_live_inputs_live_input_identifier_enable",
    "provider": "cloudflare",
    "verb": "stream-live-inputs-live-input-identifier-enable",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM LIVE INPUTS LIVE INPUT IDENTIFIER ENABLE"
  },
  {
    "toolSlug": "cloudflare_stream_live_inputs_live_input_identifier_rotate_keys",
    "provider": "cloudflare",
    "verb": "stream-live-inputs-live-input-identifier-rotate-keys",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM LIVE INPUTS LIVE INPUT IDENTIFIER ROTATE KEYS"
  },
  {
    "toolSlug": "cloudflare_stream_storage_usage_list",
    "provider": "cloudflare",
    "verb": "stream-storage-usage-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_stream_usage_list",
    "provider": "cloudflare",
    "verb": "stream-usage-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_stream_webhook_list",
    "provider": "cloudflare",
    "verb": "stream-webhook-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_stream_webhook_put",
    "provider": "cloudflare",
    "verb": "stream-webhook-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM WEBHOOK PUT"
  },
  {
    "toolSlug": "cloudflare_stream_webhook_delete",
    "provider": "cloudflare",
    "verb": "stream-webhook-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM WEBHOOK DELETE"
  },
  {
    "toolSlug": "cloudflare_stream_get",
    "provider": "cloudflare",
    "verb": "stream-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_stream_update",
    "provider": "cloudflare",
    "verb": "stream-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM UPDATE"
  },
  {
    "toolSlug": "cloudflare_stream_delete",
    "provider": "cloudflare",
    "verb": "stream-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM DELETE"
  },
  {
    "toolSlug": "cloudflare_stream_identifier_downloads_create",
    "provider": "cloudflare",
    "verb": "stream-identifier-downloads-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM IDENTIFIER DOWNLOADS CREATE"
  },
  {
    "toolSlug": "cloudflare_stream_identifier_downloads_delete",
    "provider": "cloudflare",
    "verb": "stream-identifier-downloads-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM IDENTIFIER DOWNLOADS DELETE"
  },
  {
    "toolSlug": "cloudflare_stream_identifier_token_create",
    "provider": "cloudflare",
    "verb": "stream-identifier-token-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE STREAM IDENTIFIER TOKEN CREATE"
  },
  {
    "toolSlug": "cloudflare_radar_agent_readiness_summary_get",
    "provider": "cloudflare",
    "verb": "radar-agent-readiness-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ai_bots_summary_get",
    "provider": "cloudflare",
    "verb": "radar-ai-bots-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ai_bots_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-ai-bots-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ai_bots_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-ai-bots-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ai_inference_summary_get",
    "provider": "cloudflare",
    "verb": "radar-ai-inference-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ai_inference_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-ai-inference-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ai_markdown_for_agents_summary_list",
    "provider": "cloudflare",
    "verb": "radar-ai-markdown-for-agents-summary-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ai_markdown_for_agents_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-ai-markdown-for-agents-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_annotations_list",
    "provider": "cloudflare",
    "verb": "radar-annotations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_annotations_outages_list",
    "provider": "cloudflare",
    "verb": "radar-annotations-outages-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_annotations_outages_locations_list",
    "provider": "cloudflare",
    "verb": "radar-annotations-outages-locations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_annotations_get",
    "provider": "cloudflare",
    "verb": "radar-annotations-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_as112_summary_get",
    "provider": "cloudflare",
    "verb": "radar-as112-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_as112_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-as112-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_as112_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-as112-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_as112_top_locations_list",
    "provider": "cloudflare",
    "verb": "radar-as112-top-locations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_as112_top_locations_dnssec_get",
    "provider": "cloudflare",
    "verb": "radar-as112-top-locations-dnssec-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_as112_top_locations_edns_get",
    "provider": "cloudflare",
    "verb": "radar-as112-top-locations-edns-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_as112_top_locations_ip_version_get",
    "provider": "cloudflare",
    "verb": "radar-as112-top-locations-ip-version-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer3_summary_get",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer3-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer3_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer3-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer3_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer3-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer3_top_attacks_list",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer3-top-attacks-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer3_top_locations_origin_list",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer3-top-locations-origin-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer3_top_locations_target_list",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer3-top-locations-target-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer7_summary_get",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer7-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer7_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer7-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer7_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer7-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer7_top_ases_origin_list",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer7-top-ases-origin-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer7_top_attacks_list",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer7-top-attacks-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer7_top_locations_origin_list",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer7-top-locations-origin-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_attacks_layer7_top_locations_target_list",
    "provider": "cloudflare",
    "verb": "radar-attacks-layer7-top-locations-target-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_hijacks_events_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-hijacks-events-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_ips_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-ips-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_ips_top_ases_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-ips-top-ases-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_leaks_events_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-leaks-events-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_routes_ases_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-routes-ases-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_routes_moas_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-routes-moas-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_routes_paths_get",
    "provider": "cloudflare",
    "verb": "radar-bgp-routes-paths-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_routes_pfx2as_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-routes-pfx2as-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_routes_realtime_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-routes-realtime-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_routes_stats_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-routes-stats-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_routes_upstreams_asn_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-routes-upstreams-asn-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_rpki_aspa_changes_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-rpki-aspa-changes-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_rpki_aspa_snapshot_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-rpki-aspa-snapshot-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_rpki_aspa_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-rpki-aspa-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_rpki_roas_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-rpki-roas-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_top_ases_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-top-ases-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_top_ases_prefixes_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-top-ases-prefixes-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bgp_top_prefixes_list",
    "provider": "cloudflare",
    "verb": "radar-bgp-top-prefixes-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bots_list",
    "provider": "cloudflare",
    "verb": "radar-bots-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bots_crawlers_summary_get",
    "provider": "cloudflare",
    "verb": "radar-bots-crawlers-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bots_crawlers_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-bots-crawlers-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bots_summary_get",
    "provider": "cloudflare",
    "verb": "radar-bots-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bots_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-bots-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bots_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-bots-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_bots_get",
    "provider": "cloudflare",
    "verb": "radar-bots-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ct_authorities_list",
    "provider": "cloudflare",
    "verb": "radar-ct-authorities-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ct_authorities_get",
    "provider": "cloudflare",
    "verb": "radar-ct-authorities-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ct_logs_list",
    "provider": "cloudflare",
    "verb": "radar-ct-logs-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ct_logs_get",
    "provider": "cloudflare",
    "verb": "radar-ct-logs-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ct_summary_get",
    "provider": "cloudflare",
    "verb": "radar-ct-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ct_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-ct-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ct_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-ct-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_datasets_list",
    "provider": "cloudflare",
    "verb": "radar-datasets-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_datasets_download",
    "provider": "cloudflare",
    "verb": "radar-datasets-download",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE RADAR DATASETS DOWNLOAD"
  },
  {
    "toolSlug": "cloudflare_radar_datasets_get",
    "provider": "cloudflare",
    "verb": "radar-datasets-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_dns_summary_get",
    "provider": "cloudflare",
    "verb": "radar-dns-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_dns_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-dns-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_dns_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-dns-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_dns_top_ases_list",
    "provider": "cloudflare",
    "verb": "radar-dns-top-ases-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_dns_top_locations_list",
    "provider": "cloudflare",
    "verb": "radar-dns-top-locations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_email_routing_summary_get",
    "provider": "cloudflare",
    "verb": "radar-email-routing-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_email_routing_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-email-routing-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_email_security_summary_get",
    "provider": "cloudflare",
    "verb": "radar-email-security-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_email_security_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-email-security-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_email_security_top_tlds_list",
    "provider": "cloudflare",
    "verb": "radar-email-security-top-tlds-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_email_security_top_tlds_malicious_get",
    "provider": "cloudflare",
    "verb": "radar-email-security-top-tlds-malicious-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_email_security_top_tlds_spam_get",
    "provider": "cloudflare",
    "verb": "radar-email-security-top-tlds-spam-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_email_security_top_tlds_spoof_get",
    "provider": "cloudflare",
    "verb": "radar-email-security-top-tlds-spoof-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_entities_asns_list",
    "provider": "cloudflare",
    "verb": "radar-entities-asns-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_entities_asns_botnet_threat_feed_list",
    "provider": "cloudflare",
    "verb": "radar-entities-asns-botnet-threat-feed-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_entities_asns_ip_list",
    "provider": "cloudflare",
    "verb": "radar-entities-asns-ip-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_entities_asns_get",
    "provider": "cloudflare",
    "verb": "radar-entities-asns-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_entities_asns_asn_as_set_list",
    "provider": "cloudflare",
    "verb": "radar-entities-asns-asn-as-set-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_entities_asns_asn_rel_list",
    "provider": "cloudflare",
    "verb": "radar-entities-asns-asn-rel-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_entities_ip_list",
    "provider": "cloudflare",
    "verb": "radar-entities-ip-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_entities_locations_list",
    "provider": "cloudflare",
    "verb": "radar-entities-locations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_entities_locations_get",
    "provider": "cloudflare",
    "verb": "radar-entities-locations-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_geolocations_list",
    "provider": "cloudflare",
    "verb": "radar-geolocations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_geolocations_get",
    "provider": "cloudflare",
    "verb": "radar-geolocations-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_summary_get",
    "provider": "cloudflare",
    "verb": "radar-http-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-http-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-http-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_ases_list",
    "provider": "cloudflare",
    "verb": "radar-http-top-ases-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_ases_bot_class_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-ases-bot-class-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_ases_browser_family_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-ases-browser-family-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_ases_device_type_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-ases-device-type-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_ases_http_protocol_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-ases-http-protocol-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_ases_http_version_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-ases-http-version-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_ases_ip_version_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-ases-ip-version-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_ases_os_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-ases-os-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_ases_tls_version_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-ases-tls-version-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_locations_list",
    "provider": "cloudflare",
    "verb": "radar-http-top-locations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_locations_bot_class_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-locations-bot-class-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_locations_browser_family_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-locations-browser-family-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_locations_device_type_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-locations-device-type-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_locations_http_protocol_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-locations-http-protocol-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_locations_http_version_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-locations-http-version-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_locations_ip_version_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-locations-ip-version-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_locations_os_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-locations-os-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_http_top_locations_tls_version_get",
    "provider": "cloudflare",
    "verb": "radar-http-top-locations-tls-version-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_leaked_credential_checks_summary_get",
    "provider": "cloudflare",
    "verb": "radar-leaked-credential-checks-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_leaked_credential_checks_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-leaked-credential-checks-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_netflows_summary_get",
    "provider": "cloudflare",
    "verb": "radar-netflows-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_netflows_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-netflows-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_netflows_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-netflows-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_netflows_top_ases_list",
    "provider": "cloudflare",
    "verb": "radar-netflows-top-ases-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_netflows_top_locations_list",
    "provider": "cloudflare",
    "verb": "radar-netflows-top-locations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_origins_list",
    "provider": "cloudflare",
    "verb": "radar-origins-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_origins_summary_get",
    "provider": "cloudflare",
    "verb": "radar-origins-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_origins_timeseries_list",
    "provider": "cloudflare",
    "verb": "radar-origins-timeseries-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_origins_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-origins-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_origins_get",
    "provider": "cloudflare",
    "verb": "radar-origins-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_post_quantum_origin_summary_get",
    "provider": "cloudflare",
    "verb": "radar-post-quantum-origin-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_post_quantum_origin_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-post-quantum-origin-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_post_quantum_tls_support_list",
    "provider": "cloudflare",
    "verb": "radar-post-quantum-tls-support-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_quality_iqi_summary_list",
    "provider": "cloudflare",
    "verb": "radar-quality-iqi-summary-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_quality_iqi_timeseries_groups_list",
    "provider": "cloudflare",
    "verb": "radar-quality-iqi-timeseries-groups-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_quality_speed_histogram_list",
    "provider": "cloudflare",
    "verb": "radar-quality-speed-histogram-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_quality_speed_summary_list",
    "provider": "cloudflare",
    "verb": "radar-quality-speed-summary-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_quality_speed_top_ases_list",
    "provider": "cloudflare",
    "verb": "radar-quality-speed-top-ases-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_quality_speed_top_locations_list",
    "provider": "cloudflare",
    "verb": "radar-quality-speed-top-locations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ranking_domain_get",
    "provider": "cloudflare",
    "verb": "radar-ranking-domain-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ranking_internet_services_categories_list",
    "provider": "cloudflare",
    "verb": "radar-ranking-internet-services-categories-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ranking_internet_services_timeseries_groups_list",
    "provider": "cloudflare",
    "verb": "radar-ranking-internet-services-timeseries-groups-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ranking_internet_services_top_list",
    "provider": "cloudflare",
    "verb": "radar-ranking-internet-services-top-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ranking_timeseries_groups_list",
    "provider": "cloudflare",
    "verb": "radar-ranking-timeseries-groups-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_ranking_top_list",
    "provider": "cloudflare",
    "verb": "radar-ranking-top-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_robots_txt_top_domain_categories_list",
    "provider": "cloudflare",
    "verb": "radar-robots-txt-top-domain-categories-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_robots_txt_top_user_agents_directive_list",
    "provider": "cloudflare",
    "verb": "radar-robots-txt-top-user-agents-directive-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_search_global_list",
    "provider": "cloudflare",
    "verb": "radar-search-global-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_tcp_resets_timeouts_summary_list",
    "provider": "cloudflare",
    "verb": "radar-tcp-resets-timeouts-summary-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_tcp_resets_timeouts_timeseries_groups_list",
    "provider": "cloudflare",
    "verb": "radar-tcp-resets-timeouts-timeseries-groups-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_tlds_list",
    "provider": "cloudflare",
    "verb": "radar-tlds-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_tlds_performance_summary_get",
    "provider": "cloudflare",
    "verb": "radar-tlds-performance-summary-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_tlds_performance_timeseries_groups_get",
    "provider": "cloudflare",
    "verb": "radar-tlds-performance-timeseries-groups-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_tlds_get",
    "provider": "cloudflare",
    "verb": "radar-tlds-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_traffic_anomalies_list",
    "provider": "cloudflare",
    "verb": "radar-traffic-anomalies-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_traffic_anomalies_locations_list",
    "provider": "cloudflare",
    "verb": "radar-traffic-anomalies-locations-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_radar_traffic_anomalies_get",
    "provider": "cloudflare",
    "verb": "radar-traffic-anomalies-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_email_routing_list",
    "provider": "cloudflare",
    "verb": "email-routing-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_email_routing_put",
    "provider": "cloudflare",
    "verb": "email-routing-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL ROUTING PUT"
  },
  {
    "toolSlug": "cloudflare_email_routing_patch",
    "provider": "cloudflare",
    "verb": "email-routing-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL ROUTING PATCH"
  },
  {
    "toolSlug": "cloudflare_email_routing_dns_list",
    "provider": "cloudflare",
    "verb": "email-routing-dns-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_email_routing_dns_create",
    "provider": "cloudflare",
    "verb": "email-routing-dns-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL ROUTING DNS CREATE"
  },
  {
    "toolSlug": "cloudflare_email_routing_dns_patch",
    "provider": "cloudflare",
    "verb": "email-routing-dns-patch",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL ROUTING DNS PATCH"
  },
  {
    "toolSlug": "cloudflare_email_routing_dns_delete",
    "provider": "cloudflare",
    "verb": "email-routing-dns-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL ROUTING DNS DELETE"
  },
  {
    "toolSlug": "cloudflare_email_routing_rules_list",
    "provider": "cloudflare",
    "verb": "email-routing-rules-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_email_routing_rules_create",
    "provider": "cloudflare",
    "verb": "email-routing-rules-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL ROUTING RULES CREATE"
  },
  {
    "toolSlug": "cloudflare_email_routing_rules_catch_all_list",
    "provider": "cloudflare",
    "verb": "email-routing-rules-catch-all-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_email_routing_rules_catch_all_put",
    "provider": "cloudflare",
    "verb": "email-routing-rules-catch-all-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL ROUTING RULES CATCH ALL PUT"
  },
  {
    "toolSlug": "cloudflare_email_routing_rules_get",
    "provider": "cloudflare",
    "verb": "email-routing-rules-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_email_routing_rules_replace",
    "provider": "cloudflare",
    "verb": "email-routing-rules-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL ROUTING RULES REPLACE"
  },
  {
    "toolSlug": "cloudflare_email_routing_rules_delete",
    "provider": "cloudflare",
    "verb": "email-routing-rules-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL ROUTING RULES DELETE"
  },
  {
    "toolSlug": "cloudflare_email_sending_subdomains_list",
    "provider": "cloudflare",
    "verb": "email-sending-subdomains-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_email_sending_subdomains_create",
    "provider": "cloudflare",
    "verb": "email-sending-subdomains-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL SENDING SUBDOMAINS CREATE"
  },
  {
    "toolSlug": "cloudflare_email_sending_subdomains_preview",
    "provider": "cloudflare",
    "verb": "email-sending-subdomains-preview",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL SENDING SUBDOMAINS PREVIEW"
  },
  {
    "toolSlug": "cloudflare_email_sending_subdomains_get",
    "provider": "cloudflare",
    "verb": "email-sending-subdomains-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_email_sending_subdomains_update",
    "provider": "cloudflare",
    "verb": "email-sending-subdomains-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL SENDING SUBDOMAINS UPDATE"
  },
  {
    "toolSlug": "cloudflare_email_sending_subdomains_delete",
    "provider": "cloudflare",
    "verb": "email-sending-subdomains-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL SENDING SUBDOMAINS DELETE"
  },
  {
    "toolSlug": "cloudflare_email_sending_subdomains_subdomain_id_dns_list",
    "provider": "cloudflare",
    "verb": "email-sending-subdomains-subdomain-id-dns-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_email_sending_subdomains_subdomain_id_dns_create",
    "provider": "cloudflare",
    "verb": "email-sending-subdomains-subdomain-id-dns-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE EMAIL SENDING SUBDOMAINS SUBDOMAIN ID DNS CREATE"
  },
  {
    "toolSlug": "cloudflare_email_sending_subdomains_subdomain_id_dns_status_list",
    "provider": "cloudflare",
    "verb": "email-sending-subdomains-subdomain-id-dns-status-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_email_sending_subdomains_subdomain_id_reputation_complaints_list",
    "provider": "cloudflare",
    "verb": "email-sending-subdomains-subdomain-id-reputation-complaints-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_healthchecks_list",
    "provider": "cloudflare",
    "verb": "healthchecks-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_healthchecks_create",
    "provider": "cloudflare",
    "verb": "healthchecks-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HEALTHCHECKS CREATE"
  },
  {
    "toolSlug": "cloudflare_healthchecks_preview_create",
    "provider": "cloudflare",
    "verb": "healthchecks-preview-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HEALTHCHECKS PREVIEW CREATE"
  },
  {
    "toolSlug": "cloudflare_healthchecks_preview_get",
    "provider": "cloudflare",
    "verb": "healthchecks-preview-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_healthchecks_preview_delete",
    "provider": "cloudflare",
    "verb": "healthchecks-preview-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HEALTHCHECKS PREVIEW DELETE"
  },
  {
    "toolSlug": "cloudflare_healthchecks_get",
    "provider": "cloudflare",
    "verb": "healthchecks-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_healthchecks_replace",
    "provider": "cloudflare",
    "verb": "healthchecks-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HEALTHCHECKS REPLACE"
  },
  {
    "toolSlug": "cloudflare_healthchecks_update",
    "provider": "cloudflare",
    "verb": "healthchecks-update",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HEALTHCHECKS UPDATE"
  },
  {
    "toolSlug": "cloudflare_healthchecks_delete",
    "provider": "cloudflare",
    "verb": "healthchecks-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE HEALTHCHECKS DELETE"
  },
  {
    "toolSlug": "cloudflare_page_shield_list",
    "provider": "cloudflare",
    "verb": "page-shield-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_page_shield_put",
    "provider": "cloudflare",
    "verb": "page-shield-put",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGE SHIELD PUT"
  },
  {
    "toolSlug": "cloudflare_page_shield_connections_list",
    "provider": "cloudflare",
    "verb": "page-shield-connections-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_page_shield_connections_get",
    "provider": "cloudflare",
    "verb": "page-shield-connections-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_page_shield_cookies_list",
    "provider": "cloudflare",
    "verb": "page-shield-cookies-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_page_shield_cookies_get",
    "provider": "cloudflare",
    "verb": "page-shield-cookies-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_page_shield_policies_list",
    "provider": "cloudflare",
    "verb": "page-shield-policies-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_page_shield_policies_create",
    "provider": "cloudflare",
    "verb": "page-shield-policies-create",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGE SHIELD POLICIES CREATE"
  },
  {
    "toolSlug": "cloudflare_page_shield_policies_get",
    "provider": "cloudflare",
    "verb": "page-shield-policies-get",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_page_shield_policies_replace",
    "provider": "cloudflare",
    "verb": "page-shield-policies-replace",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGE SHIELD POLICIES REPLACE"
  },
  {
    "toolSlug": "cloudflare_page_shield_policies_delete",
    "provider": "cloudflare",
    "verb": "page-shield-policies-delete",
    "mutating": true,
    "gate": "CONFIRM CLOUDFLARE PAGE SHIELD POLICIES DELETE"
  },
  {
    "toolSlug": "cloudflare_page_shield_scripts_list",
    "provider": "cloudflare",
    "verb": "page-shield-scripts-list",
    "mutating": false
  },
  {
    "toolSlug": "cloudflare_page_shield_scripts_get",
    "provider": "cloudflare",
    "verb": "page-shield-scripts-get",
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
    "toolSlug": "datadog_v1_get_ip_ranges",
    "provider": "datadog",
    "verb": "v1-get-ip-ranges",
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
    "toolSlug": "onesignal_view_an_app",
    "provider": "onesignal",
    "verb": "view-an-app",
    "mutating": false
  },
  {
    "toolSlug": "openai_list_models",
    "provider": "openai",
    "verb": "list-models",
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
  }
] as const;

const BY_SLUG = new Map(PROVIDER_TOOL_MAPPINGS.map((entry) => [entry.toolSlug, entry]));

export function findProviderToolMapping(toolSlug: string): ProviderToolMapping | undefined {
  return BY_SLUG.get(toolSlug);
}

export function mappedProviderToolSlugs(): readonly string[] {
  return PROVIDER_TOOL_MAPPINGS.map((entry) => entry.toolSlug);
}
