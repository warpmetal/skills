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
