/**
 * action-gateway.test.ts - Action Gateway surface on the full profile.
 *
 * Registers the ten catalog tools, lists them, and proves calls go through the
 * injected invoker (or fail with ag_unconfigured) without speaking to DigitalOcean.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  AG_TOOL_COUNT,
  agToolSlugs,
  createMockActionGatewayInvoker,
  jsonSchemaToZodObject,
  loadAgCatalog,
} from "../src/action-gateway/index.js";
import { loadRegistry } from "../src/registry.js";
import { createSkillsServer } from "../src/server.js";
import { ALL_TOOL_SPECS } from "../src/tools/index.js";
import { makeRegistryFixture } from "./helpers.js";

const CONTENT_TOOLS = ["skill_list", "skill_read", "skill_search"] as const;

test("catalog aggregates one hundred tools across all batches with input schemas", () => {
  const tools = loadAgCatalog();
  assert.equal(tools.length, 100);
  assert.equal(AG_TOOL_COUNT, 100);

  const slugs = agToolSlugs();
  const expected = [
    // batch-01
    "github_create_issue",
    "github_list_issues",
    "github_get_issue",
    "github_create_pull_request",
    "github_get_pull_request",
    "github_search_repositories",
    "gitlab_list_projects",
    "gitlab_create_project_issue",
    "gitlab_create_merge_request",
    "notion_search",
    // batch-02
    "notion_query_database",
    "notion_get_page",
    "notion_create_page",
    "notion_append_block_children",
    "stripe_post_customers",
    "stripe_get_customers",
    "stripe_post_payment_intents",
    "stripe_get_payment_intents",
    "stripe_get_balance",
    "stripe_post_invoices",
    // batch-03
    "jira_create_issue",
    "jira_get_issue",
    "jira_add_comment",
    "jira_transition_issue",
    "jira_get_project",
    "confluence_get_page_by_id",
    "confluence_get_pages",
    "linear_create_issue",
    "linear_list_issues",
    "linear_get_issue",
    // batch-04
    "linear_create_comment",
    "supabase_list_projects",
    "supabase_create_a_project",
    "supabase_apply_a_migration",
    "cloudflare_zones_get",
    "cloudflare_accounts_list_accounts",
    "vercel_get_projects",
    "vercel_create_project",
    "vercel_get_deployments",
    "figma_get_file",
    // batch-05
    "figma_get_file_nodes",
    "shopify_list_products",
    "shopify_get_product",
    "shopify_list_orders",
    "hubspot_crm_contacts_list",
    "hubspot_crm_contacts_create",
    "hubspot_crm_deals_list",
    "asana_get_a_task",
    "asana_create_a_project",
    "dropbox_list_folder",
    // batch-06
    "dropbox_search_files",
    "discord_get_my_user",
    "discord_list_my_guilds",
    "airtable_list_bases",
    "intercom_list_all_contacts",
    "intercom_create_contact",
    "snowflake_list_databases",
    "snowflake_list_tables",
    "sentry_list_organization_projects",
    "sentry_list_a_project_s_issues",
    // batch-07
    "datadog_v1_get_ip_ranges",
    "pagerduty_list_incidents",
    "pagerduty_create_incident",
    "pagerduty_list_services",
    "exa_web_search",
    "exa_web_fetch",
    "perplexity_chat_completion",
    "perplexity_search",
    "resend_list_emails",
    "resend_create_contact",
    // batch-08
    "calendly_list_event_types",
    "calendly_get_current_user",
    "clickup_create_task",
    "clickup_get_task",
    "clickup_create_task_comment",
    "posthog_list_project_dashboards",
    "posthog_get_feature_flags_matching_ids",
    "mixpanel_track_event",
    "mixpanel_raw_event_export",
    "circleci_list_pipelines",
    // batch-09
    "circleci_get_pipeline_by_id",
    "mailchimp_list_campaigns",
    "mailchimp_add_member_to_list",
    "x_create_posts",
    "x_get_users_me",
    "x_search_posts_recent",
    "square_list_payments",
    "square_create_payment",
    "square_list_customers",
    "openai_list_models",
    // batch-10
    "gemini_generate_content",
    "gemini_list_models",
    "anthropic-admin_list_workspaces",
    "anthropic-admin_list_api_keys",
    "grafana-cloud_list_stacks",
    "grafana-cloud_get_org",
    "monday_boards",
    "monday_get_workspaces",
    "onesignal_view_an_app",
    "amplitude_get_flags",
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

test("full profile lists every AG tool; content profile does not", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const invoker = createMockActionGatewayInvoker({ configured: true });

    const fullServer = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });
    const [fullClientTransport, fullServerTransport] = InMemoryTransport.createLinkedPair();
    const fullClient = new Client({ name: "ag-full", version: "0.0.0" });
    await Promise.all([
      fullClient.connect(fullClientTransport),
      fullServer.connect(fullServerTransport),
    ]);

    try {
      const { tools } = await fullClient.listTools();
      const names = tools.map((tool) => tool.name);
      for (const slug of agToolSlugs()) {
        assert.ok(names.includes(slug), `full profile missing ${slug}`);
      }
      assert.equal(
        names.length,
        CONTENT_TOOLS.length + ALL_TOOL_SPECS.length + AG_TOOL_COUNT,
      );
      const githubList = tools.find((tool) => tool.name === "github_list_issues");
      assert.ok(githubList?.inputSchema);
      assert.equal((githubList?.inputSchema as { type?: string }).type, "object");
    } finally {
      await fullClient.close();
    }

    const contentServer = createSkillsServer(loaded, {
      profile: "content",
      auditDir: fixture.dir,
      auditEnabled: false,
      actionGateway: invoker,
    });
    const [contentClientTransport, contentServerTransport] = InMemoryTransport.createLinkedPair();
    const contentClient = new Client({ name: "ag-content", version: "0.0.0" });
    await Promise.all([
      contentClient.connect(contentClientTransport),
      contentServer.connect(contentServerTransport),
    ]);

    try {
      const { tools } = await contentClient.listTools();
      const names = tools.map((tool) => tool.name).sort();
      assert.deepEqual(names, [...CONTENT_TOOLS].sort());
      assert.equal(names.filter((name) => name.startsWith("github_")).length, 0);
    } finally {
      await contentClient.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("AG call without credentials returns ag_unconfigured", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const invoker = createMockActionGatewayInvoker({ configured: false });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-unconfigured", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

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
      assert.equal(structured.error?.code, "ag_unconfigured");
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("AG call with mock invoker forwards toolSlug and args and returns ok", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockActionGatewayInvoker({
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
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-invoke-ok", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

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
        { tool: "github_list_issues", args: { owner: "acme", repo: "demo", state: "open" } },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a batch-02 AG tool (notion_get_page) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockActionGatewayInvoker({
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
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-batch02", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("notion_get_page"),
        "the full profile must register batch-02 tools",
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
      assert.deepEqual(calls, [{ tool: "notion_get_page", args: { page_id: "page_123" } }]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a batch-03 AG tool (jira_get_project) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockActionGatewayInvoker({
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
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-batch03", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("jira_get_project"),
        "the full profile must register batch-03 tools",
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
      assert.deepEqual(calls, [{ tool: "jira_get_project", args: { project_key: "AR" } }]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a batch-04 AG tool (cloudflare_zones_get) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockActionGatewayInvoker({
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
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-batch04", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("cloudflare_zones_get"),
        "the full profile must register batch-04 tools",
      );

      const result = await client.callTool({
        name: "cloudflare_zones_get",
        arguments: {},
      });
      assert.notEqual(result.isError, true);
      const structured = result.structuredContent as {
        ok?: boolean;
        tool?: string;
        result?: { result?: Array<{ name?: string }> };
      };
      assert.equal(structured.ok, true);
      assert.equal(structured.tool, "cloudflare_zones_get");
      assert.equal(structured.result?.result?.[0]?.name, "example.com");
      assert.deepEqual(calls, [{ tool: "cloudflare_zones_get", args: {} }]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a batch-05 AG tool (dropbox_list_folder) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockActionGatewayInvoker({
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
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-batch05", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("dropbox_list_folder"),
        "the full profile must register batch-05 tools",
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
        { tool: "dropbox_list_folder", args: { path: "/qa_tree", recursive: true } },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a batch-06 AG tool (discord_list_my_guilds) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockActionGatewayInvoker({
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
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-batch06", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("discord_list_my_guilds"),
        "the full profile must register batch-06 tools",
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
        { tool: "discord_list_my_guilds", args: { limit: 50, with_counts: true } },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a batch-07 AG tool (exa_web_search) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockActionGatewayInvoker({
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
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-batch07", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("exa_web_search"),
        "the full profile must register batch-07 tools",
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
        { tool: "exa_web_search", args: { query: "warpmetal agent runtime", max_results: 5 } },
      ]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a batch-08 AG tool (clickup_get_task) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockActionGatewayInvoker({
      configured: true,
      async invoke(toolSlug, args) {
        calls.push({ tool: toolSlug, args });
        return { id: "abc123", name: "Ship batch 08" };
      },
    });
    const server = createSkillsServer(loaded, {
      profile: "full",
      auditDir: fixture.dir,
      auditEnabled: false,
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-batch08", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("clickup_get_task"),
        "the full profile must register batch-08 tools",
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
      assert.equal(structured.result?.name, "Ship batch 08");
      assert.deepEqual(calls, [{ tool: "clickup_get_task", args: { task_id: "abc123" } }]);
    } finally {
      await client.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("a batch-09 AG tool (openai_list_models) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockActionGatewayInvoker({
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
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-batch09", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("openai_list_models"),
        "the full profile must register batch-09 tools",
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

test("a batch-10 AG tool (grafana-cloud_list_stacks) is registered and forwards its args", async () => {
  const fixture = await makeRegistryFixture();
  try {
    const loaded = await loadRegistry({ registry: fixture.dir });
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const invoker = createMockActionGatewayInvoker({
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
      actionGateway: invoker,
      runner: {
        run: () => Promise.reject(new Error("action-gateway.test must never run the CLI")),
      },
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "ag-batch10", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
      const { tools } = await client.listTools();
      assert.ok(
        tools.map((tool) => tool.name).includes("grafana-cloud_list_stacks"),
        "the full profile must register batch-10 tools",
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
      assert.deepEqual(calls, [{ tool: "grafana-cloud_list_stacks", args: { org_slug: "acme" } }]);
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
