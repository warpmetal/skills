import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runCli } from "../src/dispatch.js";
import { captureOut } from "../src/output.js";
import {
  MCP_TOOL_DEFS,
  findMcpTool,
} from "../src/integration/mcp-tools/index.js";
import { PROVIDERS } from "../src/integration/registry.js";
import { memoryStore } from "./helpers.js";

describe("mcp provider tools", () => {
  it("defines exactly 955 tools with unique provider:verb pairs", () => {
    assert.equal(MCP_TOOL_DEFS.length, 955);
    const keys = MCP_TOOL_DEFS.map((def) => `${def.provider}:${def.verb}`);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("every mcp provider is in the integration catalog", () => {
    const names = new Set(PROVIDERS.map((provider) => provider.name));
    for (const def of MCP_TOOL_DEFS) {
      assert.ok(names.has(def.provider), `missing provider ${def.provider}`);
    }
  });

  it("resend slugs map to the email provider", () => {
    assert.equal(
      findMcpTool("email", "list-emails")?.toolSlug,
      "resend_list_emails",
    );
    assert.equal(
      findMcpTool("email", "create-contact")?.toolSlug,
      "resend_create_contact",
    );
  });

  it("github create-issue requires confirm and returns NEEDS_AUTH without a token", async () => {
    const { store } = await memoryStore();
    const out = captureOut();
    const code = await runCli(
      [
        "integration",
        "github",
        "create-issue",
        "--args-json",
        JSON.stringify({ owner: "acme", repo: "demo", title: "hi" }),
        "--confirm",
        "CONFIRM GITHUB CREATE ISSUE",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 4);
    const document = JSON.parse(out.out.join("")) as {
      results: Array<{ status: string }>;
    };
    assert.equal(document.results[0]?.status, "NEEDS_AUTH");
  });

  it("github list-issues succeeds through the mcp route with a stubbed HTTP 200", async () => {
    const { store } = await memoryStore({
      "github.token": "ghp_test_token_value",
    });
    const out = captureOut();
    const fetchFn = (async () =>
      new Response(JSON.stringify([{ id: 1, title: "ok" }]), {
        status: 200,
      })) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "github",
        "list-issues",
        "--args-json",
        JSON.stringify({ owner: "acme", repo: "demo" }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    const document = JSON.parse(out.out.join("")) as {
      results: Array<{
        status: string;
        data?: { toolSlug?: string; items?: unknown[] };
      }>;
    };
    assert.equal(document.results[0]?.status, "OK");
    assert.equal(document.results[0]?.data?.toolSlug, "github_list_issues");
    // A response whose root is an array must stay an array, under `items`.
    assert.deepEqual(document.results[0]?.data?.items, [
      { id: 1, title: "ok" },
    ]);
  });

  it("wraps every array-root provider response under items", async () => {
    const cases: Array<{
      provider: string;
      verb: string;
      slug: string;
      args: Record<string, unknown>;
    }> = [
      {
        provider: "gitlab",
        verb: "list-projects",
        slug: "gitlab_list_projects",
        args: {},
      },
      {
        provider: "discord",
        verb: "list-my-guilds",
        slug: "discord_list_my_guilds",
        args: {},
      },
      {
        provider: "sentry",
        verb: "list-organization-projects",
        slug: "sentry_list_organization_projects",
        args: { organization_slug: "acme" },
      },
      {
        provider: "sentry",
        verb: "list-a-project-s-issues",
        slug: "sentry_list_a_project_s_issues",
        args: { organization_slug: "acme", project_slug: "web" },
      },
    ];

    for (const testCase of cases) {
      const secret = findMcpTool(testCase.provider, testCase.verb)?.secretName;
      assert.ok(secret, `${testCase.slug}: missing tool def`);
      const seed: Record<string, string> = {
        [secret]: "provider_test_token_value",
      };
      if (testCase.provider === "sentry") seed["sentry.organization"] = "acme";

      const { store } = await memoryStore(seed);
      const out = captureOut();
      const fetchFn = (async () =>
        new Response(JSON.stringify([{ id: "1" }, { id: "2" }]), {
          status: 200,
        })) as unknown as typeof fetch;
      const code = await runCli(
        [
          "integration",
          testCase.provider,
          testCase.verb,
          "--args-json",
          JSON.stringify(testCase.args),
          "--json",
        ],
        {
          store,
          out,
          isTTY: false,
          upstream: null,
          fetchFn,
          run: async () => ({ code: 127, stdout: "", stderr: "" }),
        },
      );
      assert.equal(code, 0, `${testCase.slug}: exit code`);
      const document = JSON.parse(out.out.join("")) as {
        results: Array<{
          status: string;
          data?: { toolSlug?: string; items?: unknown[] };
        }>;
      };
      const data = document.results[0]?.data;
      assert.equal(
        document.results[0]?.status,
        "OK",
        `${testCase.slug}: status`,
      );
      assert.ok(
        Array.isArray(data?.items),
        `${testCase.slug}: items must be an array`,
      );
      assert.equal(data?.items?.length, 2, `${testCase.slug}: items length`);
      assert.equal(data?.toolSlug, testCase.slug, `${testCase.slug}: toolSlug`);
      assert.equal(
        (data as Record<string, unknown>)["0"],
        undefined,
        `${testCase.slug}: must not be index-mangled`,
      );
    }
  });

  it("jira create-issue sends Basic base64(email:token) and an ADF fields body", async () => {
    const { store } = await memoryStore({
      "jira.token": "jira_test_token_value",
      "jira.site": "https://acme.atlassian.net",
      "jira.email": "ops@acme.test",
    });
    const out = captureOut();
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ id: "10001", key: "AR-1" }), {
        status: 201,
      });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "jira",
        "create-issue",
        "--args-json",
        JSON.stringify({
          project_key: "AR",
          summary: "hi",
          issue_type: "Task",
          description: "body",
        }),
        "--confirm",
        "CONFIRM JIRA CREATE ISSUE",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string; init: RequestInit };
    const expected = Buffer.from(
      "ops@acme.test:jira_test_token_value",
      "utf8",
    ).toString("base64");
    const headers = capture.init.headers as Record<string, string>;
    assert.equal(headers["Authorization"], `Basic ${expected}`);
    assert.equal(capture.url, "https://acme.atlassian.net/rest/api/3/issue");
    assert.deepEqual(JSON.parse(String(capture.init.body)), {
      fields: {
        project: { key: "AR" },
        summary: "hi",
        issuetype: { name: "Task" },
        description: {
          type: "doc",
          version: 1,
          content: [
            { type: "paragraph", content: [{ type: "text", text: "body" }] },
          ],
        },
      },
    });
  });

  it("jira get-issue is read-only and succeeds without a confirm gate", async () => {
    const { store } = await memoryStore({
      "jira.token": "jira_test_token_value",
      "jira.site": "https://acme.atlassian.net",
      "jira.email": "ops@acme.test",
    });
    const out = captureOut();
    const fetchFn = (async () =>
      new Response(JSON.stringify({ id: "1", key: "AR-1" }), {
        status: 200,
      })) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "jira",
        "get-issue",
        "--args-json",
        JSON.stringify({ issue_key: "AR-1" }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    const document = JSON.parse(out.out.join("")) as {
      results: Array<{ status: string }>;
    };
    assert.equal(document.results[0]?.status, "OK");
    assert.equal(findMcpTool("jira", "get-issue")?.mutating, false);
  });

  it("jira add-comment wraps the comment in an ADF body", async () => {
    const { store } = await memoryStore({
      "jira.token": "jira_test_token_value",
      "jira.site": "https://acme.atlassian.net",
      "jira.email": "ops@acme.test",
    });
    const out = captureOut();
    let seen: { init: RequestInit } | null = null;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify({ id: "c1" }), { status: 201 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "jira",
        "add-comment",
        "--args-json",
        JSON.stringify({ issue_key: "AR-1", comment: "looks good" }),
        "--confirm",
        "CONFIRM JIRA ADD COMMENT",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen);
    const capture = seen as unknown as { init: RequestInit };
    assert.deepEqual(JSON.parse(String(capture.init.body)), {
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "looks good" }],
          },
        ],
      },
    });
  });

  it("jira without an email secret returns NEEDS_AUTH", async () => {
    const { store } = await memoryStore({
      "jira.token": "jira_test_token_value",
      "jira.site": "https://acme.atlassian.net",
    });
    const out = captureOut();
    const code = await runCli(
      [
        "integration",
        "jira",
        "get-project",
        "--args-json",
        JSON.stringify({ project_key: "AR" }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 4);
    const document = JSON.parse(out.out.join("")) as {
      results: Array<{ status: string }>;
    };
    assert.equal(document.results[0]?.status, "NEEDS_AUTH");
  });

  it("reads provider arguments from stdin with --args-stdin", async () => {
    const { store } = await memoryStore({
      "github.token": "ghp_test_token_value",
    });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify([{ id: 1 }]), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      ["integration", "github", "list-issues", "--args-stdin", "--json"],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        readStdin: async () => JSON.stringify({ owner: "acme", repo: "demo" }),
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen);
    const capture = seen as unknown as { url: string };
    assert.match(capture.url, /repos\/acme\/demo\/issues/);
  });

  it("confluence uses the confluence email for Basic auth", async () => {
    const { store } = await memoryStore({
      "confluence.token": "confluence_test_token_value",
      "confluence.site": "https://acme.atlassian.net",
      "confluence.email": "docs@acme.test",
    });
    const out = captureOut();
    let seen: { init: RequestInit } | null = null;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      ["integration", "confluence", "get-pages", "--args-json", "{}", "--json"],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen);
    const capture = seen as unknown as { init: RequestInit };
    const expected = Buffer.from(
      "docs@acme.test:confluence_test_token_value",
      "utf8",
    ).toString("base64");
    const headers = capture.init.headers as Record<string, string>;
    assert.equal(headers["Authorization"], `Basic ${expected}`);
  });

  it("github search-repositories forwards the q parameter from the schema", async () => {
    const { store } = await memoryStore({
      "github.token": "ghp_test_token_value",
    });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(
        JSON.stringify({ total_count: 1, items: [{ id: 1 }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "github",
        "search-repositories",
        "--args-json",
        JSON.stringify({
          q: "warpmetal skills",
          sort: "stars",
          order: "desc",
          max_results: 5,
        }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string };
    const parsed = new URL(capture.url);
    // The bug was reading `args.query` (absent) so the URL went out with no `q`
    // and GitHub answered 422.
    assert.equal(parsed.searchParams.get("q"), "warpmetal skills");
    assert.equal(parsed.searchParams.get("sort"), "stars");
    assert.equal(parsed.searchParams.get("order"), "desc");
    assert.equal(parsed.searchParams.get("per_page"), "5");
  });

  it("distinguishes a rejected credential (401) from a missing scope (403)", async () => {
    const { store } = await memoryStore({
      "github.token": "ghp_test_token_value",
    });

    const unauthorized = captureOut();
    const fetch401 = (async () =>
      new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const code401 = await runCli(
      [
        "integration",
        "github",
        "list-issues",
        "--args-json",
        JSON.stringify({ owner: "a", repo: "b" }),
        "--json",
      ],
      {
        store,
        out: unauthorized,
        isTTY: false,
        upstream: null,
        fetchFn: fetch401,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code401, 4);
    const doc401 = JSON.parse(unauthorized.out.join("")) as {
      results: Array<{ status: string; warnings?: string[] }>;
    };
    assert.equal(doc401.results[0]?.status, "NEEDS_AUTH");
    assert.match(doc401.results[0]?.warnings?.[0] ?? "", /HTTP 401/);
    assert.match(
      doc401.results[0]?.warnings?.[0] ?? "",
      /invalid, expired or revoked/,
    );

    const forbidden = captureOut();
    const fetch403 = (async () =>
      new Response("{}", { status: 403 })) as unknown as typeof fetch;
    const code403 = await runCli(
      [
        "integration",
        "github",
        "list-issues",
        "--args-json",
        JSON.stringify({ owner: "a", repo: "b" }),
        "--json",
      ],
      {
        store,
        out: forbidden,
        isTTY: false,
        upstream: null,
        fetchFn: fetch403,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code403, 4);
    const doc403 = JSON.parse(forbidden.out.join("")) as {
      results: Array<{ status: string; warnings?: string[] }>;
    };
    assert.equal(doc403.results[0]?.status, "NEEDS_AUTH");
    assert.match(doc403.results[0]?.warnings?.[0] ?? "", /HTTP 403/);
    assert.match(doc403.results[0]?.warnings?.[0] ?? "", /the token is valid/);
  });

  it("datadog ip-ranges targets the ip-ranges host, not the api host", async () => {
    const { store } = await memoryStore({
      "datadog.token": "dd_test_token_value",
    });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ version: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "datadog",
        "v1-get-ip-ranges",
        "--args-json",
        "{}",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string };
    assert.equal(capture.url, "https://ip-ranges.datadoghq.com/");
  });

  it("gitlab list-projects forwards the schema's query params", async () => {
    const { store } = await memoryStore({
      "gitlab.token": "glpat_test_token_value",
    });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "gitlab",
        "list-projects",
        "--args-json",
        JSON.stringify({
          search: "acme",
          per_page: 5,
          order_by: "id",
          sort: "desc",
        }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string };
    const parsed = new URL(capture.url);
    // Regression: the builder hardcoded ?membership=true and dropped every filter.
    assert.equal(parsed.searchParams.get("membership"), "true");
    assert.equal(parsed.searchParams.get("search"), "acme");
    assert.equal(parsed.searchParams.get("per_page"), "5");
    assert.equal(parsed.searchParams.get("order_by"), "id");
    assert.equal(parsed.searchParams.get("sort"), "desc");
  });

  it("gitlab create-project-issue forwards body fields and keeps project_id in the path", async () => {
    const { store } = await memoryStore({
      "gitlab.token": "glpat_test_token_value",
    });
    const out = captureOut();
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify({ iid: 1 }), { status: 201 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "gitlab",
        "create-project-issue",
        "--args-json",
        JSON.stringify({
          project_id: "87395987",
          title: "hi",
          description: "body",
          labels: ["bug"],
        }),
        "--confirm",
        "CONFIRM GITLAB CREATE PROJECT ISSUE",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string; init: RequestInit };
    assert.equal(
      capture.url,
      "https://gitlab.com/api/v4/projects/87395987/issues",
    );
    const body = JSON.parse(String(capture.init.body)) as Record<
      string,
      unknown
    >;
    assert.equal(body.title, "hi");
    assert.equal(body.description, "body");
    assert.deepEqual(body.labels, ["bug"]);
    assert.equal(
      body.project_id,
      undefined,
      "project_id belongs in the URL, not the body",
    );
  });

  it("notion query-database forwards filter, sorts and pagination", async () => {
    const { store } = await memoryStore({
      "notion.token": "ntn_test_token_value",
    });
    const out = captureOut();
    let seen: { init: RequestInit } | null = null;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify({ object: "list", results: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "notion",
        "query-database",
        "--args-json",
        JSON.stringify({
          database_id: "db-1",
          filter: { property: "Name", title: { equals: "row-one" } },
          sorts: [{ property: "Name", direction: "ascending" }],
          page_size: 5,
        }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { init: RequestInit };
    // Regression: the builder sent `body: {}` and dropped every query field.
    assert.deepEqual(JSON.parse(String(capture.init.body)), {
      filter: { property: "Name", title: { equals: "row-one" } },
      sorts: [{ property: "Name", direction: "ascending" }],
      page_size: 5,
    });
  });

  it("notion create-page sends the typed parent/properties/children document", async () => {
    const { store } = await memoryStore({
      "notion.token": "ntn_test_token_value",
    });
    const out = captureOut();
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(
        JSON.stringify({ id: "page-1", url: "https://notion.so/page-1" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "notion",
        "create-page",
        "--args-json",
        JSON.stringify({
          parent_page_id: "parent-1",
          title: "My page",
          content: "hello",
        }),
        "--confirm",
        "CONFIRM NOTION CREATE PAGE",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string; init: RequestInit };
    assert.equal(capture.url, "https://api.notion.com/v1/pages");
    // Notion rejects a flat body with HTTP 400; the shape must be typed.
    assert.deepEqual(JSON.parse(String(capture.init.body)), {
      parent: { page_id: "parent-1" },
      properties: {
        title: { title: [{ type: "text", text: { content: "My page" } }] },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: "hello" } }],
          },
        },
      ],
    });
  });

  it("jira get-project forwards expand and properties as query params", async () => {
    const { store } = await memoryStore({
      "jira.token": "jira_test_token_value",
      "jira.site": "https://acme.atlassian.net",
      "jira.email": "ops@acme.test",
    });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ key: "SCRUM" }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "jira",
        "get-project",
        "--args-json",
        JSON.stringify({
          project_key: "SCRUM",
          expand: "issueTypes",
          properties: ["alpha", "beta"],
        }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string };
    const parsed = new URL(capture.url);
    assert.match(capture.url, /\/rest\/api\/3\/project\/SCRUM/);
    assert.equal(parsed.searchParams.get("expand"), "issueTypes");
    assert.equal(parsed.searchParams.get("properties"), "alpha,beta");
  });

  it("linear get-issue binds the issue_id argument to the $id variable", async () => {
    const { store } = await memoryStore({ "linear.token": "lin_api_test" });
    const out = captureOut();
    let seen: { init: RequestInit } | null = null;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify({ data: { issue: { id: "x" } } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "linear",
        "get-issue",
        "--args-json",
        JSON.stringify({ issue_id: "issue-uuid" }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { init: RequestInit };
    const body = JSON.parse(String(capture.init.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    // Regression: variables stayed `{}` because the builder read `id`/`issueId`.
    assert.equal(body.variables.id, "issue-uuid");
  });

  it("linear list-issues forwards first as a GraphQL variable", async () => {
    const { store } = await memoryStore({ "linear.token": "lin_api_test" });
    const out = captureOut();
    let seen: { init: RequestInit } | null = null;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "linear",
        "list-issues",
        "--args-json",
        JSON.stringify({ first: 3 }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { init: RequestInit };
    const body = JSON.parse(String(capture.init.body)) as {
      query: string;
      variables: Record<string, unknown>;
    };
    // Regression: `issues(first: 25)` was hardcoded, so `first` was ignored.
    assert.match(body.query, /issues\(first: \$first\)/);
    assert.equal(body.variables.first, 3);
  });

  it("hubspot deals-list forwards its list params", async () => {
    const { store } = await memoryStore({ "hubspot.token": "pat-test" });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "hubspot",
        "crm-deals-list",
        "--args-json",
        JSON.stringify({ limit: 5, archived: true, properties: ["dealname"] }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string };
    const parsed = new URL(capture.url);
    // Regression: the URL previously had no query string at all.
    assert.equal(parsed.searchParams.get("limit"), "5");
    assert.equal(parsed.searchParams.get("archived"), "true");
    assert.equal(parsed.searchParams.get("properties"), "dealname");
  });

  it("hubspot create-contact accepts a body without associations", async () => {
    const { store } = await memoryStore({ "hubspot.token": "pat-test" });
    const out = captureOut();
    let seen: { init: RequestInit } | null = null;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify({ id: "1" }), { status: 201 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "hubspot",
        "crm-contacts-create",
        "--args-json",
        JSON.stringify({ properties: { email: "a@b.test" } }),
        "--confirm",
        "CONFIRM HUBSPOT CRM CONTACTS CREATE",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    // Regression: `associations` was marked required, so this failed at MCP
    // validation before any request. HubSpot treats it as optional.
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { init: RequestInit };
    assert.deepEqual(JSON.parse(String(capture.init.body)), {
      properties: { email: "a@b.test" },
    });
  });

  it("vercel get-projects forwards camelCase params on v10", async () => {
    const { store } = await memoryStore({ "vercel.token": "t" });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ projects: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "vercel",
        "get-projects",
        "--args-json",
        JSON.stringify({
          limit: 5,
          team_id: "team_x",
          repo_id: "r1",
          search: "api",
        }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    const u = new URL((seen as unknown as { url: string }).url);
    assert.equal(u.pathname, "/v10/projects");
    assert.equal(u.searchParams.get("teamId"), "team_x");
    assert.equal(u.searchParams.get("repoId"), "r1");
    assert.equal(u.searchParams.get("limit"), "5");
  });

  it("vercel create-project posts to the v11 endpoint", async () => {
    const { store } = await memoryStore({ "vercel.token": "t" });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ id: "prj_1" }), { status: 201 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "vercel",
        "create-project",
        "--args-json",
        JSON.stringify({ name: "x" }),
        "--confirm",
        "CONFIRM VERCEL CREATE PROJECT",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    // Creating a project is POST /v11/projects; v10 is only the list endpoint.
    assert.equal(
      new URL((seen as unknown as { url: string }).url).pathname,
      "/v11/projects",
    );
  });

  it("x search-posts-recent maps post_fields to tweet.fields", async () => {
    const { store } = await memoryStore({ "x.token": "t" });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "x",
        "search-posts-recent",
        "--args-json",
        JSON.stringify({
          query: "hi",
          post_fields: "created_at",
          user_fields: "username",
          max_results: 10,
        }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    const u = new URL((seen as unknown as { url: string }).url);
    assert.equal(u.searchParams.get("tweet.fields"), "created_at");
    assert.equal(u.searchParams.get("user.fields"), "username");
    assert.equal(u.searchParams.get("query"), "hi");
  });

  it("stripe get-customers expands the created filter", async () => {
    const { store } = await memoryStore({ "stripe.token": "t" });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "stripe",
        "get-customers",
        "--args-json",
        JSON.stringify({ limit: 2, created: { gte: 100 } }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    const u = new URL((seen as unknown as { url: string }).url);
    assert.equal(u.searchParams.get("created[gte]"), "100");
    assert.equal(u.searchParams.get("limit"), "2");
  });

  it("monday boards builds GraphQL args from the declared fields", async () => {
    const { store } = await memoryStore({ "monday.token": "t" });
    const out = captureOut();
    let seen: { init: RequestInit } | null = null;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify({ data: { boards: [] } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "monday",
        "boards",
        "--args-json",
        JSON.stringify({
          ids: [1, 2],
          board_kind: "public",
          limit: 5,
          page: 2,
        }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    const body = JSON.parse(
      String((seen as unknown as { init: RequestInit }).init.body),
    );
    assert.equal(
      body.query,
      "{ boards(limit: 5, page: 2, ids: [1,2], board_kind: public) { id name } }",
    );
  });

  it("shopify list-products maps first to the REST limit param", async () => {
    const { store } = await memoryStore({
      "shopify.token": "t",
      "shopify.shop": "acme.myshopify.com",
    });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ products: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "shopify",
        "list-products",
        "--args-json",
        JSON.stringify({ first: 7 }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    const u = new URL((seen as unknown as { url: string }).url);
    assert.equal(code, 0);
    assert.equal(u.searchParams.get("limit"), "7");
  });

  it("circleci list-pipelines uses the org-level kebab-case query", async () => {
    const { store } = await memoryStore({ "circleci.token": "t" });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "circleci",
        "list-pipelines",
        "--args-json",
        JSON.stringify({ org_slug: "gh/acme", mine: true, page_token: "pt" }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    const u = new URL((seen as unknown as { url: string }).url);
    assert.equal(u.pathname, "/api/v2/pipeline");
    assert.equal(u.searchParams.get("org-slug"), "gh/acme");
    assert.equal(u.searchParams.get("page-token"), "pt");
  });

  it("linear create-comment maps every declared field into CommentCreateInput", async () => {
    const { store } = await memoryStore({ "linear.token": "t" });
    const out = captureOut();
    let seen: { init: RequestInit } | null = null;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = { init };
      return new Response(
        JSON.stringify({ data: { commentCreate: { success: true } } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "linear",
        "create-comment",
        "--args-json",
        JSON.stringify({
          issue_id: "i1",
          body: "hi",
          parent_id: "p1",
          quoted_text: "q",
          do_not_subscribe_to_issue: true,
        }),
        "--confirm",
        "CONFIRM LINEAR CREATE COMMENT",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    const body = JSON.parse(
      String((seen as unknown as { init: RequestInit }).init.body),
    );
    assert.deepEqual(body.variables.input, {
      issueId: "i1",
      body: "hi",
      parentId: "p1",
      quotedText: "q",
      doNotSubscribeToIssue: true,
    });
  });

  it("exa web-fetch wraps the url in urls[] and nests max_characters", async () => {
    const { store } = await memoryStore({
      "exa.token": "exa_test_token_value",
    });
    const out = captureOut();
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "exa",
        "web-fetch",
        "--args-json",
        JSON.stringify({ url: "https://example.com", max_characters: 500 }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string; init: RequestInit };
    assert.equal(capture.url, "https://api.exa.ai/contents");
    // Regression: the builder forwarded the raw args ({ url }) so Exa answered
    // 400 "Must provide either ids or urls at \"ids.urls\"".
    assert.deepEqual(JSON.parse(String(capture.init.body)), {
      urls: ["https://example.com"],
      text: { maxCharacters: 500 },
    });
  });

  it("exa web-search maps max_results to Exa's numResults", async () => {
    const { store } = await memoryStore({
      "exa.token": "exa_test_token_value",
    });
    const out = captureOut();
    let seen: { init: RequestInit } | null = null;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "exa",
        "web-search",
        "--args-json",
        JSON.stringify({ query: "warpmetal", max_results: 3 }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string; init: RequestInit };
    // Regression: Exa ignored `max_results`; the count field is `numResults`.
    assert.deepEqual(JSON.parse(String(capture.init.body)), {
      query: "warpmetal",
      numResults: 3,
    });
  });

  it("amplitude get-flags targets the local-evaluation host with an Api-Key header", async () => {
    const { store } = await memoryStore({
      "amplitude.token": "ampex_test_key_value",
    });
    const out = captureOut();
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "amplitude",
        "get-flags",
        "--args-json",
        JSON.stringify({ flag_keys: "flag-a,flag-b" }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const u = new URL((seen as unknown as { url: string }).url);
    const headers = (seen as unknown as { init: RequestInit }).init
      .headers as Record<string, string>;
    // Regression: the builder hit experiment.amplitude.com/api/v1/flags (404).
    // The local-evaluation flags API lives on api.lab.amplitude.com and is
    // authenticated with `Api-Key <server deployment key>`.
    assert.equal(
      u.origin + u.pathname,
      "https://api.lab.amplitude.com/v1/flags",
    );
    assert.equal(u.searchParams.get("flag_keys"), "flag-a,flag-b");
    assert.equal(headers["Authorization"], "Api-Key ampex_test_key_value");
  });

  it("asana create-a-project wraps the body in data and keeps workspace a GID string", async () => {
    const { store } = await memoryStore({
      "asana.token": "asana_test_token_value",
    });
    const out = captureOut();
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify({ data: { gid: "1" } }), {
        status: 201,
      });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "asana",
        "create-a-project",
        "--args-json",
        JSON.stringify({ name: "New project", workspace: "1219343793000865" }),
        "--confirm",
        "CONFIRM ASANA CREATE A PROJECT",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string; init: RequestInit };
    assert.equal(capture.url, "https://app.asana.com/api/1.0/projects");
    // Regression: `workspace` was typed as an object in the catalog, so a real
    // GID string was rejected by validation and the object form made Asana 400.
    assert.deepEqual(JSON.parse(String(capture.init.body)), {
      data: { name: "New project", workspace: "1219343793000865" },
    });
  });

  it("posthog get-feature-flags-matching-ids hits the matching_ids route", async () => {
    const { store } = await memoryStore({
      "posthog.token": "phx_test_token_value",
      "posthog.host": "https://us.posthog.com",
    });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "posthog",
        "get-feature-flags-matching-ids",
        "--args-json",
        JSON.stringify({ project_id: "42" }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const u = new URL((seen as unknown as { url: string }).url);
    // Regression: the builder used the feature_flags list endpoint, which
    // returns full flag objects instead of the IDs this tool promises.
    assert.equal(u.pathname, "/api/projects/42/feature_flags/matching_ids/");
  });

  it("grafana-cloud get-org addresses the organization by path", async () => {
    const { store } = await memoryStore({
      "grafana-cloud.token": "glsa_test_token_value",
    });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ id: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "grafana-cloud",
        "get-org",
        "--args-json",
        JSON.stringify({ org_slug: "acme" }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    // Regression: /api/orgs?orgSlug= is the legacy Grafana-server search
    // endpoint; a single organization is GET /api/orgs/{slug}.
    assert.equal(
      (seen as unknown as { url: string }).url,
      "https://grafana.com/api/orgs/acme",
    );
  });

  it("shopify pins a currently supported api version", async () => {
    const { store } = await memoryStore({
      "shopify.token": "t",
      "shopify.shop": "acme.myshopify.com",
    });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ products: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "shopify",
        "list-products",
        "--args-json",
        JSON.stringify({ first: 7 }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const version = new URL(
      (seen as unknown as { url: string }).url,
    ).pathname.match(/\/admin\/api\/(\d{4}-\d{2})\//)?.[1];
    assert.ok(version, "shopify url must pin an api version");
    // Regression: 2024-10 was retired on 2025-10-01 and Shopify silently fell
    // forward to the oldest version still served, so the URL lied about the API.
    assert.notEqual(version, "2024-10");
  });

  it("mailchimp add-member-to-list sends skip_merge_validation as a query param", async () => {
    const { store } = await memoryStore({
      "mailchimp.token": "t",
      "mailchimp.dc": "us1",
    });
    const out = captureOut();
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "mailchimp",
        "add-member-to-list",
        "--args-json",
        JSON.stringify({
          list_id: "abc",
          email_address: "a@b.co",
          status: "subscribed",
          skip_merge_validation: true,
        }),
        "--confirm",
        "CONFIRM MAILCHIMP ADD MEMBER TO LIST",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string; init: RequestInit };
    const u = new URL(capture.url);
    assert.equal(u.pathname, "/3.0/lists/abc/members");
    assert.equal(u.searchParams.get("skip_merge_validation"), "true");
    // Regression: list_id and skip_merge_validation were forwarded into the
    // body, so the flag never reached the API as the query parameter it is.
    const body = JSON.parse(String(capture.init.body)) as Record<
      string,
      unknown
    >;
    assert.equal(body["list_id"], undefined);
    assert.equal(body["skip_merge_validation"], undefined);
    assert.equal(body["email_address"], "a@b.co");
  });

  it("confluence get-page-by-id uses the get-draft query parameter", async () => {
    const { store } = await memoryStore({
      "confluence.token": "t",
      "confluence.site": "https://acme.atlassian.net",
      "confluence.email": "ops@acme.test",
    });
    const out = captureOut();
    let seen: { url: string } | null = null;
    const fetchFn = (async (url: string) => {
      seen = { url: String(url) };
      return new Response(JSON.stringify({ id: "7" }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "confluence",
        "get-page-by-id",
        "--args-json",
        JSON.stringify({ id: 7, draft: true }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const u = new URL((seen as unknown as { url: string }).url);
    assert.equal(u.pathname, "/wiki/api/v2/pages/7");
    // Regression: the draft selector is `get-draft`, not `draft`, so the filter
    // was silently ignored.
    assert.equal(u.searchParams.get("get-draft"), "true");
    assert.equal(u.searchParams.get("draft"), null);
  });

  it("snowflake list-databases orders LIKE before STARTS WITH", async () => {
    const { store } = await memoryStore({
      "snowflake.token": "t",
      "snowflake.account_url": "https://acme.snowflakecomputing.com",
      "snowflake.warehouse": "COMPUTE_WH",
    });
    const out = captureOut();
    let seen: { init: RequestInit } | null = null;
    const fetchFn = (async (_url: string, init: RequestInit) => {
      seen = { init };
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const code = await runCli(
      [
        "integration",
        "snowflake",
        "list-databases",
        "--args-json",
        JSON.stringify({ like: "test_%", starts_with: "TEST" }),
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const body = JSON.parse(
      String((seen as unknown as { init: RequestInit }).init.body),
    ) as {
      statement: string;
    };
    // Regression: the builder emitted STARTS WITH before LIKE, which is not the
    // documented SHOW DATABASES clause order ([HISTORY] [LIKE] [STARTS WITH]).
    assert.ok(
      body.statement.indexOf("LIKE") < body.statement.indexOf("STARTS WITH"),
      body.statement,
    );
  });

  it("mixpanel track-event sends a base64 data field with no auth header", async () => {
    const { store } = await memoryStore({
      "mixpanel.token": "mp_test_service_secret",
    });
    const out = captureOut();
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url: String(url), init };
      return new Response(JSON.stringify({ error: null, status: 1 }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const events = [
      {
        event: "signed_up",
        properties: { token: "project_token", distinct_id: "u1" },
      },
    ];
    const code = await runCli(
      [
        "integration",
        "mixpanel",
        "track-event",
        "--args-json",
        JSON.stringify({ events }),
        "--confirm",
        "CONFIRM MIXPANEL TRACK EVENT",
        "--json",
      ],
      {
        store,
        out,
        isTTY: false,
        upstream: null,
        fetchFn,
        run: async () => ({ code: 127, stdout: "", stderr: "" }),
      },
    );
    assert.equal(code, 0);
    assert.ok(seen, "expected an HTTP request");
    const capture = seen as unknown as { url: string; init: RequestInit };
    assert.equal(capture.url, "https://api.mixpanel.com/track");
    // Regression: a JSON body is answered with HTTP 200 and status 0 ("data,
    // missing or empty"), so the events were silently dropped. /track takes the
    // events as a base64-JSON `data` form field, and the endpoint is public
    // (`security: []`), so it must not carry an Authorization header.
    const headers = capture.init.headers as Record<string, string>;
    assert.equal(headers["Authorization"], undefined);
    const form = new URLSearchParams(String(capture.init.body));
    assert.equal(form.get("verbose"), "1");
    assert.deepEqual(
      JSON.parse(
        Buffer.from(String(form.get("data")), "base64").toString("utf8"),
      ),
      events,
    );
  });
});
