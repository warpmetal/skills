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
