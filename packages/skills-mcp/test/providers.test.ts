/**
 * providers.test.ts - provider surface on the full profile.
 *
 * Registers the ten catalog tools, lists them, and proves calls go through the
 * injected invoker (or fail with provider_unconfigured) without spawning the CLI.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  DESTRUCTIVE_SLUGS,
  EXPERIMENTAL_MARKER,
  EXPERIMENTAL_SLUGS,
  PROVIDER_TOOL_COUNT,
  PROVIDER_TOOL_MAPPINGS,
  providerToolSlugs,
  createMockProviderInvoker,
  jsonSchemaToZodObject,
  loadProviderCatalog,
} from "../src/providers/index.js";
import { loadRegistry } from "../src/registry.js";
import { createSkillsServer } from "../src/server.js";
import { ALL_TOOL_SPECS } from "../src/tools/index.js";
import { makeRegistryFixture } from "./helpers.js";

const CONTENT_TOOLS = ["skill_list", "skill_read", "skill_search"] as const;

test("catalog aggregates one thousand two hundred and seventy-one tools across all providers with input schemas", () => {
  const tools = loadProviderCatalog();
  assert.equal(tools.length, 1271);
  assert.equal(PROVIDER_TOOL_COUNT, 1271);

  const slugs = providerToolSlugs();
  const expected = [
    // airtable
    "airtable_list_bases",
    // amplitude
    "amplitude_get_flags",
    // anthropic-admin
    "anthropic-admin_list_workspaces",
    "anthropic-admin_list_api_keys",
    // asana
    "asana_get_a_task",
    "asana_create_a_project",
    // calendly
    "calendly_list_event_types",
    "calendly_get_current_user",
    // circleci
    "circleci_list_pipelines",
    "circleci_get_pipeline_by_id",
    // clickup
    "clickup_create_task",
    "clickup_get_task",
    "clickup_create_task_comment",
    // cloudflare
    "cloudflare_zones_list",
    "cloudflare_zones_get",
    "cloudflare_dns_records_list",
    "cloudflare_dns_records_create",
    "cloudflare_purge_cache",
    // confluence
    "confluence_get_page_by_id",
    "confluence_get_pages",
    // datadog
    "datadog_v1_get_ip_ranges",
    // discord
    "discord_get_my_user",
    "discord_list_my_guilds",
    // dropbox
    "dropbox_list_folder",
    "dropbox_search_files",
    // exa
    "exa_web_search",
    "exa_web_fetch",
    // figma
    "figma_get_file",
    "figma_get_file_nodes",
    // gemini
    "gemini_generate_content",
    "gemini_list_models",
    // github
    "github_create_issue",
    "github_list_issues",
    "github_get_issue",
    "github_create_pull_request",
    "github_get_pull_request",
    "github_search_repositories",
    // gitlab
    "gitlab_list_projects",
    "gitlab_create_project_issue",
    "gitlab_create_merge_request",
    // grafana-cloud
    "grafana-cloud_list_stacks",
    "grafana-cloud_get_org",
    // grafana-stack
    "grafana-stack_health",
    "grafana-stack_get_current_user",
    "grafana-stack_search",
    "grafana-stack_get_dashboard",
    "grafana-stack_list_datasources",
    "grafana-stack_check_datasource_health",
    "grafana-stack_list_folders",
    "grafana-stack_list_alert_rules",
    "grafana-stack_list_annotations",
    "grafana-stack_list_contact_points",
    "grafana-stack_list_mute_timings",
    "grafana-stack_list_dashboard_tags",
    "grafana-stack_search_teams",
    "grafana-stack_list_org_users",
    "grafana-stack_list_library_elements",
    // hubspot
    "hubspot_crm_contacts_list",
    "hubspot_crm_contacts_create",
    "hubspot_crm_deals_list",
    // intercom
    "intercom_list_all_contacts",
    "intercom_create_contact",
    // jira
    "jira_create_issue",
    "jira_get_issue",
    "jira_add_comment",
    "jira_transition_issue",
    "jira_get_project",
    // linear
    "linear_create_issue",
    "linear_list_issues",
    "linear_get_issue",
    "linear_create_comment",
    // mailchimp
    "mailchimp_list_campaigns",
    "mailchimp_add_member_to_list",
    // mixpanel
    "mixpanel_track_event",
    "mixpanel_raw_event_export",
    // monday
    "monday_boards",
    "monday_get_workspaces",
    // notion
    "notion_search",
    "notion_query_database",
    "notion_get_page",
    "notion_create_page",
    "notion_append_block_children",
    // onesignal
    "onesignal_view_an_app",
    // openai
    "openai_list_models",
    // pagerduty
    "pagerduty_list_incidents",
    "pagerduty_create_incident",
    "pagerduty_list_services",
    // perplexity
    "perplexity_chat_completion",
    "perplexity_search",
    // posthog
    "posthog_list_project_dashboards",
    "posthog_get_feature_flags_matching_ids",
    // resend
    "resend_list_emails",
    "resend_create_contact",
    // sentry
    "sentry_list_organization_projects",
    "sentry_list_a_project_s_issues",
    // shopify
    "shopify_list_products",
    "shopify_get_product",
    "shopify_list_orders",
    // snowflake
    "snowflake_list_databases",
    "snowflake_list_tables",
    // square
    "square_list_payments",
    "square_create_payment",
    "square_list_customers",
    // stripe
    "stripe_post_customers",
    "stripe_get_customers",
    "stripe_post_payment_intents",
    "stripe_get_payment_intents",
    "stripe_get_balance",
    "stripe_post_invoices",
    // supabase
    "supabase_list_projects",
    "supabase_create_a_project",
    "supabase_apply_a_migration",
    // vercel
    "vercel_get_projects",
    "vercel_create_project",
    "vercel_get_deployments",
    // x
    "x_create_posts",
    "x_get_users_me",
    "x_search_posts_recent",
    // zendesk
    "zendesk_list_tickets",
    "zendesk_get_ticket",
    "zendesk_list_ticket_comments",
    "zendesk_search",
    "zendesk_get_current_user",
    "zendesk_list_users",
    "zendesk_list_organizations",
    "zendesk_list_views",
    "zendesk_list_view_tickets",
    "zendesk_create_ticket",
    "zendesk_add_ticket_comment",
    "zendesk_update_ticket",
    "zendesk_get_user",
    "zendesk_get_organization",
    "zendesk_count_view_tickets",
    "zendesk_get_ticket_metrics",
  ];

  for (const slug of expected) {
    assert.ok(slugs.includes(slug), `catalog is missing ${slug}`);
  }
  assert.equal(new Set(slugs).size, slugs.length, "toolSlugs must be unique");

  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.ok(tool.inputSchema.properties);
    assert.ok(tool.description.length > 10);
  }

  assert.equal(PROVIDER_TOOL_MAPPINGS.length, 1271);
  for (const slug of slugs) {
    assert.ok(
      PROVIDER_TOOL_MAPPINGS.some((entry) => entry.toolSlug === slug),
      `mapping missing ${slug}`,
    );
  }
});

test("jsonSchemaToZodObject rejects undeclared fields", () => {
  const schema = jsonSchemaToZodObject({
    type: "object",
    properties: {
      owner: { type: "string", description: "owner" },
    },
    required: ["owner"],
  });
  assert.deepEqual(schema.parse({ owner: "acme" }), { owner: "acme" });
  assert.throws(() => schema.parse({ owner: "acme", extra: true }));
});

test("jsonSchemaToZodObject honours enum, default, items and additionalProperties", () => {
  const schema = jsonSchemaToZodObject({
    type: "object",
    properties: {
      state: { type: "string", enum: ["open", "closed"] },
      limit: { type: "integer", default: 10 },
      tags: { type: "array", items: { type: "string" } },
      nested: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      freeform: {
        type: "object",
        additionalProperties: true,
      },
    },
    required: ["state"],
  });

  assert.deepEqual(schema.parse({ state: "open" }), {
    state: "open",
    limit: 10,
  });
  assert.throws(
    () => schema.parse({ state: "merged" }),
    "enum must reject an unknown value",
  );
  assert.deepEqual(schema.parse({ state: "open", tags: ["a", "b"] }), {
    state: "open",
    limit: 10,
    tags: ["a", "b"],
  });
  assert.throws(
    () => schema.parse({ state: "open", tags: [1] }),
    "array items must be enforced",
  );
  assert.deepEqual(schema.parse({ state: "open", nested: { id: "x" } }), {
    state: "open",
    limit: 10,
    nested: { id: "x" },
  });
  assert.throws(
    () => schema.parse({ state: "open", nested: { id: "x", extra: true } }),
    "a closed nested object stays strict",
  );
  assert.deepEqual(schema.parse({ state: "open", freeform: { anything: 1 } }), {
    state: "open",
    limit: 10,
    freeform: { anything: 1 },
  });
});

test("jsonSchemaToZodObject accepts an anyOf field in either shape", () => {
  // GitLab ids are numeric but the API also takes a URL-encoded path, so the
  // catalog declares `anyOf: [string, integer]`; both must validate.
  const schema = jsonSchemaToZodObject({
    type: "object",
    properties: {
      project_id: {
        description: "The ID or URL-encoded path of the project.",
        anyOf: [{ type: "string" }, { type: "integer" }],
      },
    },
    required: ["project_id"],
  });

  assert.deepEqual(schema.parse({ project_id: "group/project" }), {
    project_id: "group/project",
  });
  assert.deepEqual(schema.parse({ project_id: 87395987 }), {
    project_id: 87395987,
  });
  assert.throws(
    () => schema.parse({ project_id: true }),
    "a boolean must not satisfy the union",
  );
});

test("asana create_a_project accepts workspace as a GID string", () => {
  const tool = loadProviderCatalog().find(
    (entry) => entry.toolSlug === "asana_create_a_project",
  );
  assert.ok(tool, "asana_create_a_project must be in the catalog");
  const schema = jsonSchemaToZodObject(tool.inputSchema);
  // Regression: `workspace` was typed as an object, so a real GID string was
  // rejected by validation before any request, and the object form made Asana
  // answer HTTP 400.
  assert.deepEqual(
    schema.parse({ name: "New project", workspace: "1219343793000865" }),
    {
      name: "New project",
      workspace: "1219343793000865",
    },
  );
  assert.throws(() =>
    schema.parse({ name: "New project", workspace: { gid: "1" } }),
  );
});

test("jsonSchemaToZodObject makes a multi-type field nullable instead of unknown", () => {
  // `"type": ["integer", "null"]` is how the catalog spells a nullable field.
  // Regression: the array fell through to z.unknown(), so any JSON was accepted
  // here and only refused by the provider, and `null` - a documented value - was
  // indistinguishable from an omitted one.
  const schema = jsonSchemaToZodObject({
    type: "object",
    properties: {
      assignee_id: {
        description: "The id of the agent to assign the ticket to.",
        type: ["integer", "null"],
      },
    },
    required: [],
  });

  assert.deepEqual(schema.parse({ assignee_id: null }), { assignee_id: null });
  assert.deepEqual(schema.parse({ assignee_id: 7 }), { assignee_id: 7 });
  assert.deepEqual(schema.parse({}), {});
  assert.throws(
    () => schema.parse({ assignee_id: "7" }),
    "a string must not satisfy a nullable integer",
  );
});

test("zendesk update_ticket accepts null to unassign and rejects a wrong type", () => {
  const tool = loadProviderCatalog().find(
    (entry) => entry.toolSlug === "zendesk_update_ticket",
  );
  assert.ok(tool, "zendesk_update_ticket must be in the catalog");
  const schema = jsonSchemaToZodObject(tool.inputSchema);
  // `assignee_id: null` unassigns, so it must survive validation as a value; a
  // string is not an id and must not reach the provider.
  assert.deepEqual(schema.parse({ ticket_id: 42, assignee_id: null }), {
    ticket_id: 42,
    assignee_id: null,
  });
  assert.deepEqual(schema.parse({ ticket_id: 42, status: "solved" }), {
    ticket_id: 42,
    status: "solved",
  });
  assert.throws(() => schema.parse({ ticket_id: 42, assignee_id: "7" }));
});

test("full profile lists every provider tool; content profile does not", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const invoker = createMockProviderInvoker({ configured: true });

    const fullServer = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });
    const [fullClientTransport, fullServerTransport] =
      InMemoryTransport.createLinkedPair();
    const fullClient = new Client({ name: "providers-full", version: "0.0.0" });
    await Promise.all([
      fullClient.connect(fullClientTransport),
      fullServer.connect(fullServerTransport),
    ]);

    try {
      const { tools } = await fullClient.listTools();
      const names = tools.map((tool) => tool.name);
      for (const slug of providerToolSlugs()) {
        assert.ok(names.includes(slug), `full profile missing ${slug}`);
      }
      assert.equal(
        names.length,
        CONTENT_TOOLS.length + ALL_TOOL_SPECS.length + PROVIDER_TOOL_COUNT,
      );
      const githubList = tools.find(
        (tool) => tool.name === "github_list_issues",
      );
      assert.ok(githubList?.inputSchema);
      assert.equal(
        (githubList?.inputSchema as { type?: string }).type,
        "object",
      );
    } finally {
      await fullClient.close();
    }

    const contentServer = createSkillsServer(loaded, {
      profile: "content",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
    });
    const [contentClientTransport, contentServerTransport] =
      InMemoryTransport.createLinkedPair();
    const contentClient = new Client({
      name: "providers-content",
      version: "0.0.0",
    });
    await Promise.all([
      contentClient.connect(contentClientTransport),
      contentServer.connect(contentServerTransport),
    ]);

    try {
      const { tools } = await contentClient.listTools();
      const names = tools.map((tool) => tool.name).sort();
      assert.deepEqual(names, [...CONTENT_TOOLS].sort());
      assert.equal(
        names.filter((name) => name.startsWith("github_")).length,
        0,
      );
    } finally {
      await contentClient.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("provider call without credentials returns provider_unconfigured", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const invoker = createMockProviderInvoker({ configured: false });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({
      name: "providers-unconfigured",
      version: "0.0.0",
    });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const result = await client.callTool({
        name: "github_list_issues",
        arguments: { owner: "acme", repo: "demo" },
      });
      assert.equal(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        error?: { code?: string };
      };
      assert.equal(structured.ok, false);
      assert.equal(structured.error?.code, "provider_unconfigured");
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("provider call with mock invoker forwards toolSlug and args and returns ok", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { issues: [{ number: 1 }] };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({
      name: "providers-invoke-ok",
      version: "0.0.0",
    });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const result = await client.callTool({
        name: "github_list_issues",
        arguments: { owner: "acme", repo: "demo", state: "open" },
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { issues?: unknown[] };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "github_list_issues");
      assert.equal(structured.result?.issues?.length, 1);
      assert.deepEqual(calls, [
        {
          tool: "github_list_issues",
          args: { owner: "acme", repo: "demo", state: "open" },
        },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("zendesk create_ticket accepts requester_id alone, as its description promises", async () => {
  // Regression: `requester_email` was required in the catalog, so the Zod schema
  // refused a call that named only `requester_id` - a documented and supported
  // form ("takes precedence over requester_email") that the CLI's own builder
  // handles. The requirement made that path unreachable for every MCP client.
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { ticket: { id: 7 } };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-zendesk", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const result = await client.callTool({
        name: "zendesk_create_ticket",
        arguments: { requester_id: 7, subject: "Site down" },
      });
      assert.notEqual(
        result.isError,
        true,
        "requester_id alone must pass validation",
      );
      const structured = result.structuredContent as { ok?: boolean };
      assert.equal(structured.ok, true);
      assert.deepEqual(calls, [
        {
          tool: "zendesk_create_ticket",
          // `public` is absent from the call and arrives as `true` because the
          // catalog declares that default; the builder would apply the same one.
          args: { requester_id: 7, subject: "Site down", public: true },
        },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a notion provider tool (notion_get_page) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { id: "page_123", url: "https://notion.so/page_123" };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-notion", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("notion_get_page"),
        "the full profile must register notion tools",
      );

      const result = await client.callTool({
        name: "notion_get_page",
        arguments: { page_id: "page_123" },
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { id?: string };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "notion_get_page");
      assert.equal(structured.result?.id, "page_123");
      assert.deepEqual(calls, [
        { tool: "notion_get_page", args: { page_id: "page_123" } },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a jira provider tool (jira_get_project) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { key: "AR", name: "Agent Runtime" };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-jira", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("jira_get_project"),
        "the full profile must register jira tools",
      );

      const result = await client.callTool({
        name: "jira_get_project",
        arguments: { project_key: "AR" },
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { key?: string };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "jira_get_project");
      assert.equal(structured.result?.key, "AR");
      assert.deepEqual(calls, [
        { tool: "jira_get_project", args: { project_key: "AR" } },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a cloudflare provider tool (cloudflare_dns_records_list) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { result: [{ id: "zone_1", name: "example.com" }] };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-cloudflare", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("cloudflare_dns_records_list"),
        "the full profile must register cloudflare tools",
      );

      const result = await client.callTool({
        name: "cloudflare_dns_records_list",
        arguments: { zone_id: "zone_1", type: "A" },
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { result?: Array<{ name?: string }> };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "cloudflare_dns_records_list");
      assert.equal(structured.result?.result?.[0]?.name, "example.com");
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.tool, "cloudflare_dns_records_list");
      assert.equal(calls[0]?.args.zone_id, "zone_1");
      assert.equal(calls[0]?.args.type, "A");
      // The catalog carries the spec's own defaults, and `registerProviderTools`
      // honours them, so the invoker sees the declared value for a filter the
      // caller left out rather than an absent key.
      assert.equal(calls[0]?.args.per_page, 100);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a dropbox provider tool (dropbox_list_folder) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { entries: [{ name: "report.pdf" }] };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-dropbox", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("dropbox_list_folder"),
        "the full profile must register dropbox tools",
      );

      const result = await client.callTool({
        name: "dropbox_list_folder",
        arguments: { path: "/qa_tree", recursive: true },
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { entries?: Array<{ name?: string }> };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "dropbox_list_folder");
      assert.equal(structured.result?.entries?.[0]?.name, "report.pdf");
      assert.deepEqual(calls, [
        {
          tool: "dropbox_list_folder",
          args: { path: "/qa_tree", recursive: true },
        },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a discord provider tool (discord_list_my_guilds) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { guilds: [{ id: "123", name: "WarpMetal" }] };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-discord", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("discord_list_my_guilds"),
        "the full profile must register discord tools",
      );

      const result = await client.callTool({
        name: "discord_list_my_guilds",
        arguments: { limit: 50, with_counts: true },
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { guilds?: Array<{ name?: string }> };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "discord_list_my_guilds");
      assert.equal(structured.result?.guilds?.[0]?.name, "WarpMetal");
      assert.deepEqual(calls, [
        {
          tool: "discord_list_my_guilds",
          args: { limit: 50, with_counts: true },
        },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a exa provider tool (exa_web_search) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { results: [{ title: "WarpMetal" }] };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-exa", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("exa_web_search"),
        "the full profile must register exa tools",
      );

      const result = await client.callTool({
        name: "exa_web_search",
        arguments: { query: "warpmetal agent runtime", max_results: 5 },
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { results?: Array<{ title?: string }> };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "exa_web_search");
      assert.equal(structured.result?.results?.[0]?.title, "WarpMetal");
      assert.deepEqual(calls, [
        {
          tool: "exa_web_search",
          args: { query: "warpmetal agent runtime", max_results: 5 },
        },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a clickup provider tool (clickup_get_task) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { id: "abc123", name: "Ship release 08" };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-clickup", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("clickup_get_task"),
        "the full profile must register clickup tools",
      );

      const result = await client.callTool({
        name: "clickup_get_task",
        arguments: { task_id: "abc123" },
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { name?: string };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "clickup_get_task");
      assert.equal(structured.result?.name, "Ship release 08");
      assert.deepEqual(calls, [
        { tool: "clickup_get_task", args: { task_id: "abc123" } },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a openai provider tool (openai_list_models) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { data: [{ id: "gpt-4o" }] };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-openai", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("openai_list_models"),
        "the full profile must register openai tools",
      );

      const result = await client.callTool({
        name: "openai_list_models",
        arguments: {},
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { data?: Array<{ id?: string }> };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "openai_list_models");
      assert.equal(structured.result?.data?.[0]?.id, "gpt-4o");
      assert.deepEqual(calls, [{ tool: "openai_list_models", args: {} }]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a grafana-stack provider tool (grafana-stack_list_folders) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { items: [{ uid: "root", title: "Infra" }] };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-grafana-stack", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("grafana-stack_list_folders"),
        "the full profile must register grafana-stack tools",
      );

      const result = await client.callTool({
        name: "grafana-stack_list_folders",
        arguments: { page: 2, parent_uid: "root" },
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { items?: Array<{ uid?: string }> };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "grafana-stack_list_folders");
      assert.equal(structured.result?.items?.[0]?.uid, "root");
      assert.deepEqual(calls, [
        {
          tool: "grafana-stack_list_folders",
          args: { page: 2, parent_uid: "root" },
        },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a grafana-cloud provider tool (grafana-cloud_list_stacks) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockProviderInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { data: [{ slug: "acme" }] };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "providers-grafana-cloud", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("grafana-cloud_list_stacks"),
        "the full profile must register grafana-cloud tools",
      );

      const result = await client.callTool({
        name: "grafana-cloud_list_stacks",
        arguments: { org_slug: "acme" },
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { data?: Array<{ slug?: string }> };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "grafana-cloud_list_stacks");
      assert.equal(structured.result?.data?.[0]?.slug, "acme");
      assert.deepEqual(calls, [
        { tool: "grafana-cloud_list_stacks", args: { org_slug: "acme" } },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("experimental slugs carry the marker in their registered description", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const invoker = createMockProviderInvoker({ configured: true });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({
      name: "providers-experimental",
      version: "0.0.0",
    });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      for (const tool of tools) {
        const marked = (tool.description ?? "").includes(EXPERIMENTAL_MARKER);
        assert.equal(
          marked,
          EXPERIMENTAL_SLUGS.has(tool.name),
          `${tool.name}: experimental marker must match the curated list`,
        );
      }
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("destructiveHint marks exactly the irreversible mutations", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const invoker = createMockProviderInvoker({ configured: true });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      providers: invoker,
      runner: {
        run: () =>
          Promise.reject(new Error("providers.test must never run the CLI")),
      },
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({
      name: "providers-destructive",
      version: "0.0.0",
    });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    try {
      const { tools } = await client.listTools();
      const providerSlugs = new Set(providerToolSlugs());
      for (const tool of tools) {
        // wm_* CLI tools have their own separate destructive surface.
        if (!providerSlugs.has(tool.name)) continue;
        const destructive = tool.annotations?.destructiveHint === true;
        assert.equal(
          destructive,
          DESTRUCTIVE_SLUGS.has(tool.name),
          `${tool.name}: destructiveHint must match the reviewed set`,
        );
        if (destructive) {
          assert.equal(
            tool.annotations?.readOnlyHint,
            false,
            `${tool.name}: a destructive tool cannot be read-only`,
          );
        }
      }
      for (const slug of DESTRUCTIVE_SLUGS) {
        assert.ok(
          providerSlugs.has(slug),
          `${slug}: destructive slug must be a registered tool`,
        );
      }
      assert.ok(
        DESTRUCTIVE_SLUGS.size >= 10,
        "the destructive set must be non-trivial",
      );
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("buildServer / wm_* surface stays exactly 43 tools", async () => {
  assert.equal(ALL_TOOL_SPECS.length, 43);
});
