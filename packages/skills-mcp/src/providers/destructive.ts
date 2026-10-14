/**
 * Provider mutations that are irreversible or carry direct cost.
 *
 * `readOnlyHint: false` only says "this writes"; it does not tell a client that
 * repeating the call cannot be undone. These tools move money, publish to a
 * third party, create billed infrastructure, or persist data, so they are
 * marked `destructiveHint: true` and a client should confirm before calling.
 *
 * Kept as the reviewed source of truth: `providers.test.ts` asserts that the
 * catalog's registered annotations match this exact set.
 */
export const DESTRUCTIVE_SLUGS: ReadonlySet<string> = new Set([
  // Money: charges, invoices and direct payments.
  "stripe_post_payment_intents",
  "stripe_post_invoices",
  "stripe_post_customers",
  "square_create_payment",
  // Infrastructure that is created, billed or migrated permanently.
  "supabase_create_a_project",
  "supabase_apply_a_migration",
  "vercel_create_project",
  // Publishing to an external audience (cannot be un-sent).
  "x_create_posts",
  "resend_create_contact",
  "mailchimp_add_member_to_list",
  "intercom_create_contact",
  "pagerduty_create_incident",
  // Zendesk tickets and public comments email the requester and fire the
  // account's triggers and webhooks, so neither can be taken back. The comment
  // tools of Jira, Linear and ClickUp sit in the ordinary write surface because
  // their notifications stay inside the organisation; a Zendesk public comment
  // reaches the customer, which is the case this set names. Updating a ticket is
  // in the same class: a status or assignee change fires the same triggers and
  // can notify the requester, and closing a ticket is not silently reversible.
  "zendesk_create_ticket",
  "zendesk_add_ticket_comment",
  "zendesk_update_ticket",
  // Paid model calls and analytics ingestion with a lasting record.
  "gemini_generate_content",
  "mixpanel_track_event",
  // Creating a persistent, externally visible record in another system. Same
  // class as github_create_issue / linear_create_issue: it notifies people,
  // fires webhooks/CI and cannot be silently retracted.
  "github_create_issue",
  "linear_create_issue",
  "gitlab_create_project_issue",
  "jira_create_issue",
  "clickup_create_task",
  "hubspot_crm_contacts_create",
  "asana_create_a_project",
  "notion_create_page",
  // Cloudflare: what takes a domain or a service off the air, or cannot be
  // recalled. Deleting a zone or a single record stops names from resolving; a
  // batch can delete several records in one call; disabling DNSSEC while the
  // registrar still holds the DS record makes the whole domain fail to resolve;
  // a full cache purge cannot be called back and sends every request to the
  // origin until the cache refills.
  //
  // The zone's firewall deletes are deliberately absent: removing a block rule
  // takes protection away rather than breaking what is running, and every
  // mutating Cloudflare tool already travels behind the provider's confirm gate
  // (`CONFIRM CLOUDFLARE ...`), which is where that decision is enforced.
  //
  // `cloudflare_dns_records_import` is absent too: the operation reads a
  // multipart form and the generated builders speak JSON, so the tool was
  // withdrawn rather than left as one that could never succeed.
  //
  // Wave w2 (storage and compute) is the same rule applied to the other half of
  // the account. A DELETE that removes the resource itself is destructive: a
  // bucket, an object, a script, a queue, a database, a KV namespace, a
  // Vectorize index, a Pages project or a Hyperdrive pool. So are the writes
  // that purge or overwrite in bulk - both queue purges, the two KV bulk
  // endpoints, deleting a KV pair, Vectorize's delete-by-ids and metadata
  // index, the Pages build cache, D1's point-in-time restore - and the two D1
  // SQL tools, because the statement is the caller's and a DROP is as easy to
  // send as a SELECT.
  //
  // A DELETE that only removes a policy, binding, session or secret stays out:
  // the w1 firewall reasoning, since the resource survives and what was removed
  // can be created again. Those entries carry `confirmGate` instead, so a write
  // Cloudflare flags as confirmation-worthy still asks.
  "cloudflare_d1_database_database_id_query",
  "cloudflare_d1_database_database_id_raw_create",
  "cloudflare_d1_database_database_id_time_travel_restore",
  "cloudflare_d1_database_delete",
  "cloudflare_dns_records_batch",
  "cloudflare_dns_records_delete",
  "cloudflare_dnssec_delete",
  "cloudflare_hyperdrive_configs_delete",
  "cloudflare_pages_projects_delete",
  "cloudflare_pages_projects_project_name_purge_build_cache",
  "cloudflare_purge_cache",
  "cloudflare_queues_delete",
  "cloudflare_queues_queue_id_messages_purge",
  "cloudflare_queues_queue_id_purge",
  "cloudflare_r2_buckets_bucket_name_objects_delete",
  "cloudflare_r2_buckets_bucket_name_objects_delete_bulk",
  "cloudflare_r2_buckets_delete",
  "cloudflare_r2_catalog_bucket_name_delete_create",
  "cloudflare_storage_kv_namespaces_delete",
  "cloudflare_storage_kv_namespaces_namespace_id_bulk_delete_create",
  "cloudflare_storage_kv_namespaces_namespace_id_bulk_put",
  "cloudflare_storage_kv_namespaces_namespace_id_values_delete",
  "cloudflare_vectorize_v2_indexes_delete",
  "cloudflare_vectorize_v2_indexes_index_name_delete_by_ids_create",
  "cloudflare_vectorize_v2_indexes_index_name_metadata_index_delete_create",
  "cloudflare_workers_dispatch_namespaces_delete",
  "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_delete",
  "cloudflare_workers_dispatch_namespaces_dispatch_namespace_scripts_delete_all",
  "cloudflare_workers_scripts_delete",
  "cloudflare_workers_workers_delete",
  "cloudflare_workers_workers_worker_id_previews_delete",
  "cloudflare_workers_workers_worker_id_previews_preview_id_deployments_delete",
  "cloudflare_workers_workers_worker_id_versions_delete",
  "cloudflare_workflows_delete",
  "cloudflare_workflows_workflow_name_instances_delete",
  "cloudflare_zones_delete",
  //
  // Wave w3 (Zero Trust) applies the same line to a security surface, where the
  // question is what the caller loses. Deleting an application, an identity
  // provider, a service token, a user, a device registration, a DLP dataset or
  // fingerprint, an MCP endpoint or a route is destructive: the object is gone,
  // and what it stood for - a reachable service, a working sign-in, an
  // enrolled device, the data itself - has to be built again. Revoking a user's
  // tokens is in the same class: a revoked token cannot be restored.
  //
  // Deleting a policy, a group, a rule, a list, a taxonomy entry or a settings
  // object is not: it removes a control or a classification, which the caller
  // can write again, and it follows the w1 firewall precedent. Those entries
  // carry `confirmGate` where Cloudflare asks for confirmation.
  "cloudflare_access_ai_controls_mcp_portals_delete",
  "cloudflare_access_ai_controls_mcp_servers_delete",
  "cloudflare_access_apps_app_id_revoke_tokens",
  "cloudflare_access_apps_delete",
  "cloudflare_access_identity_providers_delete",
  "cloudflare_access_organizations_revoke_user",
  "cloudflare_access_service_tokens_delete",
  "cloudflare_access_users_delete",
  "cloudflare_devices_physical_devices_delete",
  "cloudflare_devices_registrations_delete",
  "cloudflare_devices_registrations_delete_all",
  "cloudflare_dlp_datasets_delete",
  "cloudflare_dlp_document_fingerprints_delete",
  "cloudflare_teamnet_routes_delete",
  "cloudflare_teamnet_virtual_networks_delete",
  "cloudflare_zerotrust_routes_hostname_delete",
  "cloudflare_zerotrust_subnets_warp_delete",
  //
  // Wave w5 (Radar and the operational collections) is the same question again.
  // A load balancer, a pool, a monitor, a stored image, an image signing key, a
  // video, a live input, a Stream key, a video's derived downloads and an
  // origin's health check are objects the caller has to build again: deleting one
  // takes routing, delivery or the data itself away. Revoking a member is not in
  // the list, and neither is a health-check preview: the first is an access
  // binding that re-inviting restores, the second a draft the caller can retype.
  "cloudflare_healthchecks_delete",
  "cloudflare_images_v1_delete",
  "cloudflare_images_v1_keys_delete",
  "cloudflare_load_balancers_delete",
  "cloudflare_load_balancers_monitor_groups_delete",
  "cloudflare_load_balancers_monitors_delete",
  "cloudflare_load_balancers_pools_delete",
  "cloudflare_stream_delete",
  "cloudflare_stream_identifier_downloads_delete",
  "cloudflare_stream_keys_delete",
  "cloudflare_stream_live_inputs_delete",
]);

