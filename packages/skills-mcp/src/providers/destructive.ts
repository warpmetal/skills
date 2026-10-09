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
]);
