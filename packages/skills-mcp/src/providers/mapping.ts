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
