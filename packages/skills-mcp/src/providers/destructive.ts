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
  "cloudflare_zones_delete",
  "cloudflare_dns_records_delete",
  "cloudflare_dns_records_batch",
  "cloudflare_dnssec_delete",
  "cloudflare_purge_cache",
]);

