import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runCli, type CliDeps } from "../src/dispatch.js";
import { captureOut } from "../src/output.js";
import { PROVIDERS } from "../src/integration/registry.js";
import type { RunResult, CommandRunner } from "../src/run.js";
import type { CredentialStore } from "../src/env/store.js";
import { memoryStore } from "./helpers.js";

interface FetchCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

function stubFetch(handler: (call: FetchCall) => { status: number; body?: unknown }) {
  const calls: FetchCall[] = [];
  const fetchFn = (async (input: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: init?.body,
    };
    calls.push(call);
    const result = handler(call);
    return new Response(result.body !== undefined ? JSON.stringify(result.body) : "", { status: result.status });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

function stubRunner(table: Record<string, RunResult>): CommandRunner {
  return async (command) => table[command] ?? { code: 127, stdout: "", stderr: "not found" };
}

/** A runner that also records the argv and the child environment. */
function recordingRunner(
  handler: (command: string, args: readonly string[]) => RunResult,
): { run: CommandRunner; calls: Array<{ command: string; args: readonly string[]; env: Readonly<Record<string, string>> | undefined }> } {
  const calls: Array<{ command: string; args: readonly string[]; env: Readonly<Record<string, string>> | undefined }> = [];
  const run: CommandRunner = async (command, args, options) => {
    calls.push({ command, args, env: options?.env });
    return handler(command, args);
  };
  return { run, calls };
}

const NO_TOOLS = stubRunner({});

async function run(
  args: readonly string[],
  store: CredentialStore,
  extra: Partial<CliDeps> = {},
): Promise<{ code: number; text: string; stdout: string; stderr: string }> {
  const out = captureOut();
  const code = await runCli(args, {
    out,
    store,
    isTTY: false,
    upstream: null,
    run: NO_TOOLS,
    ...extra,
  });
  const stdout = out.out.join("");
  const stderr = out.err.join("");
  return { code, text: stdout + stderr, stdout, stderr };
}

describe("integration catalog", () => {
  it("lists every adapter with its advertised capabilities and gates", async () => {
    const { store } = await memoryStore();
    const result = await run(["integration", "list", "--json"], store);
    assert.equal(result.code, 0);

    const document = JSON.parse(result.stdout) as {
      providers: Array<{ name: string; capabilities: string[]; revoke: string; gates: Record<string, string> }>;
    };
    assert.deepEqual(
      document.providers.map((provider) => provider.name),
      PROVIDERS.map((provider) => provider.name),
    );

    const cloudflare = document.providers.find((provider) => provider.name === "cloudflare")!;
    assert.deepEqual(cloudflare.capabilities, ["dns.record.list", "dns.record.upsert"]);
    assert.equal(cloudflare.gates["dns-upsert"], "CONFIRM DNS CHANGE");
    assert.equal(cloudflare.revoke, "unsupported");
  });

  it("fails fast when no adapter implements a catalog entry", async () => {
    const { adapters } = await import("../src/integration/adapters/index.js");
    const implemented = new Set(adapters().map((adapter) => adapter.spec.name));
    for (const provider of PROVIDERS) {
      assert.equal(implemented.has(provider.name), true, `${provider.name} has no adapter`);
    }
  });

  it("makes every adapter declare the full honesty contract", () => {
    for (const provider of PROVIDERS) {
      // Phase 2 requires each adapter to state tools, auth modes, real scopes,
      // files it writes, a verification command, a revocation story and a
      // redacted error map. An empty declaration is allowed; a missing one is
      // not, because silence reads as a guarantee.
      assert.ok(Array.isArray(provider.authModes) && provider.authModes.length > 0, `${provider.name}: authModes`);
      assert.ok(Array.isArray(provider.secretNames), `${provider.name}: secretNames`);
      assert.ok(Array.isArray(provider.requiresTools), `${provider.name}: requiresTools`);
      assert.ok(Array.isArray(provider.filesWritten), `${provider.name}: filesWritten`);
      assert.ok(provider.scoping.length > 40, `${provider.name}: scoping must be a real statement`);
      assert.match(provider.verifyCommand, /^warpmetal integration status \S+ --json$/, `${provider.name}: verifyCommand`);
      assert.ok(Object.keys(provider.errorMap).length > 0, `${provider.name}: errorMap`);
      assert.equal(["confirmed", "unsupported", "uncertain"].includes(provider.revoke), true, `${provider.name}: revoke`);

      // A provider error code must never be reproduced verbatim from input;
      // the map is a lookup of prepared sentences.
      for (const [code, message] of Object.entries(provider.errorMap)) {
        assert.equal(typeof message, "string");
        assert.equal(message.includes("${"), false, `${provider.name}/${code}: errorMap must not interpolate`);
        assert.equal(message.length > 10, true, `${provider.name}/${code}: errorMap message too thin`);
      }
    }
  });
});

describe("cloudflare adapter", () => {
  it("degrades honestly when there is no credential", async () => {
    const { store } = await memoryStore();
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: {} }));
    const result = await run(["integration", "status", "cloudflare", "--json"], store, { fetchFn });

    assert.equal(result.code, 4);
    assert.equal(calls.length, 0);
    const document = JSON.parse(result.stdout) as { status: string; results: Array<{ status: string }> };
    assert.equal(document.status, "NEEDS_AUTH");
  });

  it("reports OK only when the provider confirms the token is active", async () => {
    const { store } = await memoryStore({ "cloudflare.token": "cf-token-value-1234567" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { result: { status: "active" } } }));
    const result = await run(["integration", "status", "cloudflare", "--json"], store, { fetchFn });

    assert.equal(result.code, 0);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/user\/tokens\/verify$/);
    assert.equal(calls[0]!.headers["authorization"], "Bearer cf-token-value-1234567");
    const document = JSON.parse(result.stdout) as { status: string };
    assert.equal(document.status, "OK");
    // It must not claim scope knowledge it does not have.
    assert.match(result.stdout, /scope is not introspectable|Token scope is not introspectable/);
  });

  it("performs no mutation when the gate is missing", async () => {
    const { store } = await memoryStore({ "cloudflare.token": "cf-token-value-1234567" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { result: [] } }));

    const result = await run(
      ["integration", "cloudflare", "dns-upsert", "--zone-id", "z1", "--name", "a.example.com", "--type", "A", "--content", "1.2.3.4"],
      store,
      { fetchFn },
    );

    assert.equal(result.code, 2);
    assert.match(result.stderr, /CONFIRM DNS CHANGE/);
    assert.equal(calls.length, 0, "no request may be sent without the gate");
  });

  it("reports a missing gate as a usage error even with an empty credential store", async () => {
    // The store is deliberately empty. Exit 4 (`NEEDS_AUTH`) would be the wrong
    // answer here: the invocation was invalid before a credential could matter,
    // and telling the operator to store a token sends them down the wrong path.
    const { store, backend } = await memoryStore();
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { result: [] } }));

    const result = await run(
      ["integration", "cloudflare", "dns-upsert", "--zone-id", "z1", "--name", "a.example.com", "--type", "A", "--content", "1.2.3.4"],
      store,
      { fetchFn },
    );

    assert.equal(result.code, 2, "a missing gate is a usage error, not an auth problem");
    assert.match(result.stderr, /CONFIRM DNS CHANGE/);
    assert.equal(calls.length, 0, "no request may be sent without the gate");
    assert.equal(backend.loads, 0, "a gate-less call must not consult the credential store");
  });

  it("rejects a malformed flag before the credential, so a typo never reads as NEEDS_AUTH", async () => {
    const { store, backend } = await memoryStore();
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { result: [] } }));

    const result = await run(
      [
        "integration", "cloudflare", "dns-upsert",
        "--zone-id", "z1", "--name", "a.example.com", "--type", "A", "--content", "1.2.3.4",
        "--ttl", "0", "--confirm", "CONFIRM DNS CHANGE",
      ],
      store,
      { fetchFn },
    );

    assert.equal(result.code, 2, "an invalid --ttl is a usage error even with the gate approved");
    assert.match(result.stderr, /--ttl must be a positive integer/);
    assert.equal(calls.length, 0);
    assert.equal(backend.loads, 0);
  });

  it("is idempotent: an identical record is reported, not rewritten", async () => {
    const { store } = await memoryStore({ "cloudflare.token": "cf-token-value-1234567" });
    const { fetchFn, calls } = stubFetch(() => ({
      status: 200,
      body: { result: [{ id: "rec-1", content: "1.2.3.4" }] },
    }));

    const result = await run(
      ["integration", "cloudflare", "dns-upsert", "--zone-id", "z1", "--name", "a.example.com", "--type", "A", "--content", "1.2.3.4", "--confirm", "CONFIRM DNS CHANGE", "--json"],
      store,
      { fetchFn },
    );

    assert.equal(result.code, 0);
    assert.equal(calls.length, 1, "only the read should have happened");
    assert.equal(calls[0]!.method, "GET");
    assert.match(result.stdout, /"action": "unchanged"/);
  });

  it("creates when absent and updates when the content differs", async () => {
    const token = { "cloudflare.token": "cf-token-value-1234567" };
    const argv = [
      "integration", "cloudflare", "dns-upsert",
      "--zone-id", "z1", "--name", "a.example.com", "--type", "A", "--content", "5.6.7.8",
      "--confirm", "CONFIRM DNS CHANGE", "--json",
    ];

    const created = await (async () => {
      const { store } = await memoryStore(token);
      const { fetchFn, calls } = stubFetch((call) =>
        call.method === "GET" ? { status: 200, body: { result: [] } } : { status: 200, body: { result: { id: "rec-9" } } },
      );
      const result = await run(argv, store, { fetchFn });
      return { result, calls };
    })();
    assert.equal(created.result.code, 0);
    assert.equal(created.calls[1]!.method, "POST");
    assert.match(created.result.stdout, /"action": "created"/);

    const updated = await (async () => {
      const { store } = await memoryStore(token);
      const { fetchFn, calls } = stubFetch((call) =>
        call.method === "GET" ? { status: 200, body: { result: [{ id: "rec-1", content: "1.1.1.1" }] } } : { status: 200, body: { result: { id: "rec-1" } } },
      );
      const result = await run(argv, store, { fetchFn });
      return { result, calls };
    })();
    assert.equal(updated.result.code, 0);
    assert.equal(updated.calls[1]!.method, "PUT");
    assert.match(updated.calls[1]!.url, /\/dns_records\/rec-1$/);
  });

  it("surfaces a provider rejection as a failure, not a success", async () => {
    const { store } = await memoryStore({ "cloudflare.token": "cf-token-value-1234567" });
    const { fetchFn } = stubFetch(() => ({ status: 500, body: { errors: [{ message: "boom" }] } }));
    const result = await run(["integration", "status", "cloudflare", "--json"], store, { fetchFn });
    assert.equal(result.code, 5);
    assert.match(result.stdout, /"status": "ERROR"/);
  });
});

describe("slack adapter", () => {
  it("reports a webhook as DEGRADED because it cannot be verified without posting", async () => {
    const { store } = await memoryStore({ "slack.webhook": "https://hooks.slack.com/services/T/B/X" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { ok: true } }));
    const result = await run(["integration", "status", "slack", "--json"], store, { fetchFn });

    assert.equal(result.code, 0);
    assert.equal(calls.length, 0, "a status probe must not post a message");
    assert.match(result.stdout, /"status": "DEGRADED"/);
  });

  it("verifies a bot token with auth.test", async () => {
    const { store } = await memoryStore({ "slack.token": "xoxb-token-value-123456" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { ok: true, team: "acme", user: "bot" } }));
    const result = await run(["integration", "status", "slack", "--json"], store, { fetchFn });

    assert.equal(result.code, 0);
    assert.match(calls[0]!.url, /\/auth\.test$/);
    assert.match(result.stdout, /"status": "OK"/);
  });

  it("gates notify and sends nothing without the confirmation", async () => {
    const { store } = await memoryStore({ "slack.token": "xoxb-token-value-123456" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { ok: true } }));

    const blocked = await run(["integration", "slack", "notify", "--channel", "#ops", "--text", "hello"], store, { fetchFn });
    assert.equal(blocked.code, 2);
    assert.match(blocked.stderr, /CONFIRM NOTIFY/);
    assert.equal(calls.length, 0);

    const sent = await run(
      ["integration", "slack", "notify", "--channel", "#ops", "--text", "hello", "--confirm", "CONFIRM NOTIFY", "--json"],
      store,
      { fetchFn },
    );
    assert.equal(sent.code, 0);
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/chat\.postMessage$/);
    assert.deepEqual(JSON.parse(calls[0]!.body!), { channel: "#ops", text: "hello" });
  });
});

describe("github adapter", () => {
  it("reports what is missing rather than a false OK", async () => {
    const { store } = await memoryStore();
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: {} }));
    const result = await run(["integration", "status", "github", "--json"], store, { fetchFn });

    assert.equal(result.code, 4);
    assert.equal(calls.length, 0);
    assert.match(result.stdout, /"status": "NEEDS_AUTH"/);
  });

  it("prefers a gh session when the tool is present", async () => {
    const { store } = await memoryStore();
    const runner = stubRunner({ gh: { code: 0, stdout: "{\"hosts\":{}}", stderr: "" } });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: {} }));
    const result = await run(["integration", "status", "github", "--json"], store, { fetchFn, run: runner });

    assert.equal(result.code, 0);
    assert.equal(calls.length, 0, "a gh session should avoid the API entirely");
    assert.match(result.stdout, /"mode": "gh_session"/);
  });

  it("uses a stored token when gh is unavailable and validates owner/name", async () => {
    const { store } = await memoryStore({ "github.token": "ghp-token-value-1234567" });
    const { fetchFn } = stubFetch(() => ({ status: 200, body: { login: "octocat" } }));
    const status = await run(["integration", "status", "github", "--json"], store, { fetchFn });
    assert.equal(status.code, 0);
    assert.match(status.stdout, /"login": "octocat"/);

    const bad = await run(["integration", "github", "repo-view", "--repo", "not-a-repo"], store, { fetchFn });
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /owner\/name/);
  });
});

describe("notify and platform providers share one honesty contract", () => {
  const NEW_PROVIDERS = [
    "email",
    "discord",
    "vercel",
    "sentry",
    "stripe",
  ] as const;

  it("reports NEEDS_AUTH with an empty store and never touches the network", async () => {
    for (const provider of NEW_PROVIDERS) {
      const { store } = await memoryStore();
      const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: {} }));
      const { run: runner, calls: runnerCalls } = recordingRunner(() => ({ code: 127, stdout: "", stderr: "not found" }));

      const result = await run(["integration", "status", provider, "--json"], store, { fetchFn, run: runner });

      assert.equal(result.code, 4, `${provider}: expected NEEDS_AUTH`);
      assert.match(result.stdout, /"status": "NEEDS_AUTH"/, `${provider}: status document`);
      assert.equal(calls.length, 0, `${provider}: no HTTP request without a credential`);
      assert.equal(runnerCalls.length, 0, `${provider}: no tool probe without a credential`);
    }
  });

  it("validates the confirmation gate before consulting the credential store", async () => {
    const cases: Array<{ provider: string; args: string[]; gate: string }> = [
      { provider: "email", args: ["notify", "--to", "ops@example.com", "--from", "bot@example.com", "--text", "hi"], gate: "CONFIRM NOTIFY" },
      { provider: "discord", args: ["notify", "--text", "hi"], gate: "CONFIRM NOTIFY" },
    ];

    for (const testCase of cases) {
      const { store, backend } = await memoryStore();
      const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: {} }));
      const result = await run(["integration", testCase.provider, ...testCase.args], store, { fetchFn });

      assert.equal(result.code, 2, `${testCase.provider}: a missing gate is a usage error`);
      assert.match(result.stderr, new RegExp(testCase.gate), `${testCase.provider}: gate named in the error`);
      assert.equal(calls.length, 0, `${testCase.provider}: nothing may be sent without the gate`);
      assert.equal(backend.loads, 0, `${testCase.provider}: the store must not be consulted`);
    }
  });

  it("rejects an unknown verb as a usage error without reading the store", async () => {
    for (const provider of NEW_PROVIDERS) {
      const { store, backend } = await memoryStore();
      const { fetchFn } = stubFetch(() => ({ status: 200, body: {} }));
      const result = await run(["integration", provider, "nonsense"], store, { fetchFn });
      assert.equal(result.code, 2, `${provider}: unknown verb`);
      assert.match(result.stderr, new RegExp(`Unknown ${provider} verb`));
      assert.equal(backend.loads, 0, `${provider}: verb check precedes the store`);
    }
  });
});

describe("email adapter", () => {
  it("verifies the key against the sending domains", async () => {
    const { store } = await memoryStore({ "email.api_key": "re-test-key-value-123456" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { data: [{ name: "acme.com", status: "verified" }] } }));

    const result = await run(["integration", "status", "email", "--json"], store, { fetchFn });

    assert.equal(result.code, 0);
    assert.match(calls[0]!.url, /\/domains$/);
    assert.match(result.stdout, /"verifiedDomains": 1/);
  });

  it("sends a gated email and reports the message id", async () => {
    const { store } = await memoryStore({ "email.api_key": "re-test-key-value-123456" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { id: "msg-1" } }));

    const result = await run(
      [
        "integration", "email", "notify",
        "--to", "ops@example.com", "--from", "bot@acme.com", "--subject", "Alert", "--text", "body",
        "--confirm", "CONFIRM NOTIFY", "--json",
      ],
      store,
      { fetchFn },
    );

    assert.equal(result.code, 0);
    assert.equal(calls[0]!.url, "https://api.resend.com/emails");
    const body = JSON.parse(calls[0]!.body!) as { to: string[]; subject: string };
    assert.deepEqual(body.to, ["ops@example.com"]);
    assert.equal(body.subject, "Alert");
  });

  it("treats a rejected key as NEEDS_AUTH", async () => {
    const { store } = await memoryStore({ "email.api_key": "re-test-key-value-123456" });
    const { fetchFn } = stubFetch(() => ({ status: 401, body: { message: "invalid" } }));
    const result = await run(["integration", "status", "email", "--json"], store, { fetchFn });
    assert.equal(result.code, 4);
  });
});

describe("discord adapter", () => {
  it("verifies a bot token with the current-user read", async () => {
    const { store } = await memoryStore({ "discord.token": "discord-bot-token-value-1" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { id: "1", username: "warp" } }));

    const result = await run(["integration", "status", "discord", "--json"], store, { fetchFn });

    assert.equal(result.code, 0);
    assert.match(calls[0]!.url, /\/users\/@me$/);
    assert.equal(calls[0]!.headers["authorization"], "Bot discord-bot-token-value-1");
    assert.match(result.stdout, /"status": "OK"/);
  });

  it("reports a webhook as DEGRADED because it cannot be verified without posting", async () => {
    const { store } = await memoryStore({ "discord.webhook": "https://discord.com/api/webhooks/1/abc" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: {} }));

    const result = await run(["integration", "status", "discord", "--json"], store, { fetchFn });

    assert.equal(result.code, 0);
    assert.equal(calls.length, 0, "a status probe must not post a message");
    assert.match(result.stdout, /"status": "DEGRADED"/);
  });

  it("posts to the webhook when one is stored", async () => {
    const webhook = "https://discord.com/api/webhooks/1/abc";
    const { store } = await memoryStore({ "discord.webhook": webhook });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { id: "m1" } }));

    const result = await run(
      ["integration", "discord", "notify", "--text", "hi", "--confirm", "CONFIRM NOTIFY", "--json"],
      store,
      { fetchFn },
    );

    assert.equal(result.code, 0);
    assert.equal(calls[0]!.url, webhook);
    assert.deepEqual(JSON.parse(calls[0]!.body!), { content: "hi" });
  });
});

describe("vercel adapter", () => {
  it("verifies the token and lists deployments", async () => {
    const token = "vercel-token-value-123456";
    const { store } = await memoryStore({ "vercel.token": token });
    const { fetchFn, calls } = stubFetch((call) =>
      call.url.endsWith("/v2/user")
        ? { status: 200, body: { user: { username: "warp" } } }
        : { status: 200, body: { deployments: [{ uid: "d1", name: "site", state: "READY", url: "site.vercel.app" }] } },
    );

    const status = await run(["integration", "status", "vercel", "--json"], store, { fetchFn });
    assert.equal(status.code, 0);
    assert.match(status.stdout, /"username": "warp"/);

    const list = await run(["integration", "vercel", "deployment-list", "--json"], store, { fetchFn });
    assert.equal(list.code, 0);
    assert.match(calls[1]!.url, /\/v6\/deployments\?limit=20$/);
    assert.match(list.stdout, /"count": 1/);
    assert.equal(list.stdout.includes(token), false);
  });

  it("treats a rejected token as NEEDS_AUTH", async () => {
    const { store } = await memoryStore({ "vercel.token": "vercel-token-value-123456" });
    const { fetchFn } = stubFetch(() => ({ status: 403, body: { error: { code: "forbidden" } } }));
    const result = await run(["integration", "status", "vercel", "--json"], store, { fetchFn });
    assert.equal(result.code, 4);
  });
});

describe("sentry adapter", () => {
  it("verifies the token and lists issues for a project", async () => {
    const { store } = await memoryStore({ "sentry.token": "sentry-token-value-123456" });
    const { fetchFn, calls } = stubFetch((call) =>
      call.url.endsWith("/organizations/")
        ? { status: 200, body: [{ slug: "acme" }] }
        : { status: 200, body: [{ id: "9", shortId: "ACME-1", title: "TypeError", count: "3" }] },
    );

    const status = await run(["integration", "status", "sentry", "--json"], store, { fetchFn });
    assert.equal(status.code, 0);
    assert.match(status.stdout, /"organizationCount": 1/);

    const list = await run(["integration", "sentry", "issue-list", "--org", "acme", "--project", "web", "--json"], store, { fetchFn });
    assert.equal(list.code, 0);
    assert.match(calls[1]!.url, /\/projects\/acme\/web\/issues\/$/);
    assert.match(list.stdout, /"shortId": "ACME-1"/);
  });

  it("requires org and project rather than guessing them", async () => {
    const { store, backend } = await memoryStore({ "sentry.token": "sentry-token-value-123456" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: [] }));

    const result = await run(["integration", "sentry", "issue-list", "--org", "acme"], store, { fetchFn });

    assert.equal(result.code, 2);
    assert.match(result.stderr, /Missing required argument: --project/);
    assert.equal(calls.length, 0);
    assert.equal(backend.loads, 0);
  });
});

describe("stripe adapter", () => {
  it("reads the balance and never claims scope knowledge", async () => {
    const { store } = await memoryStore({ "stripe.token": "sk_test_token_value_123456" });
    const { fetchFn, calls } = stubFetch(() => ({ status: 200, body: { livemode: false, available: [{ currency: "usd", amount: 100 }] } }));

    const result = await run(["integration", "stripe", "balance-get", "--json"], store, { fetchFn });

    assert.equal(result.code, 0);
    assert.equal(calls[0]!.url, "https://api.stripe.com/v1/balance");
    assert.match(result.stdout, /"livemode": false/);
    assert.match(result.stdout, /never moves money/);
  });

  it("treats a rejected key as NEEDS_AUTH", async () => {
    const { store } = await memoryStore({ "stripe.token": "sk_test_token_value_123456" });
    const { fetchFn } = stubFetch(() => ({ status: 401, body: { error: { type: "invalid_request_error" } } }));
    const result = await run(["integration", "status", "stripe", "--json"], store, { fetchFn });
    assert.equal(result.code, 4);
  });
});

describe("dispatch errors", () => {
  it("rejects an unknown provider and an unknown verb", async () => {
    const { store } = await memoryStore();
    const provider = await run(["integration", "status", "nope"], store);
    assert.equal(provider.code, 2);

    const verb = await run(["integration", "cloudflare", "nonsense"], store);
    assert.equal(verb.code, 2);
    assert.match(verb.stderr, /Unknown cloudflare verb/);
  });
});
