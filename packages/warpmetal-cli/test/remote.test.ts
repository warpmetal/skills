import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EXIT } from "../src/errors.js";
import {
  RemoteBackend,
  resolveRemoteVault,
  VAULT_SESSION_HEADER,
  VAULT_TOKEN_ENV,
  VAULT_URL_ENV,
  type RemoteVaultSettings,
} from "../src/env/backends/remote.js";
import { StaleWriteError } from "../src/env/backends/types.js";
import { pathsFrom } from "../src/env/paths.js";
import { CredentialStore } from "../src/env/store.js";
import type { HttpFn, HttpResponse } from "../src/integration/http.js";
import { captureOut } from "../src/output.js";
import { runCli } from "../src/dispatch.js";

interface Call {
  readonly method: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

interface StubResult {
  readonly status: number;
  readonly body?: unknown;
}

function stubHttp(handler: (call: Call) => StubResult): { http: HttpFn; calls: Call[] } {
  const calls: Call[] = [];
  const http: HttpFn = async (request) => {
    const url = new URL(request.url);
    const call: Call = {
      method: request.method,
      path: `${url.pathname}${url.search}`,
      headers: request.headers ?? {},
      body: request.body,
    };
    calls.push(call);
    const result = handler(call);
    const text = result.body !== undefined ? JSON.stringify(result.body) : "";
    const response: HttpResponse = {
      status: result.status,
      ok: result.status >= 200 && result.status < 300,
      json: result.body ?? null,
      text,
    };
    return response;
  };
  return { http, calls };
}

const BASE = "https://vault.example.com/vault";
const SESSION_TOKEN = "session-token-value-123456";

function settings(): RemoteVaultSettings {
  return {
    baseUrl: BASE,
    token: SESSION_TOKEN,
    tokenSource: "session",
    sessionFile: "/home/operator/.config/warpmetal/session.json",
  };
}

/**
 * A small but honest vault server: it owns the version, rejects a second create
 * with 409, and requires the bearer token. Good enough to exercise every path
 * the client takes, including the races it is supposed to survive.
 */
function fakeVault(options: { readonly requireAuth?: boolean } = {}) {
  const slots = new Map<string, { value: string; keyVersion: number; updatedAt: string }>();
  let mutation = 0;

  const { http, calls } = stubHttp((call) => {
    if (options.requireAuth !== false && call.headers[VAULT_SESSION_HEADER] !== `Bearer ${SESSION_TOKEN}`) {
      return { status: 401, body: { error: "invalid_customer_authorization" } };
    }

    const path = call.path.replace(/^\/vault/, "");
    if (call.method === "GET" && path === "") {
      // Same shape as `CredentialSummary.as_json()`: per-slot metadata and no
      // vault-level version, which is the case the client must still handle.
      return {
        status: 200,
        body: {
          credentials: [...slots.entries()].map(([name, slot]) => ({
            name,
            provider: name.split(".")[0],
            keyVersion: slot.keyVersion,
            createdAt: "2026-09-01T00:00:00Z",
            updatedAt: slot.updatedAt,
          })),
        },
      };
    }

    if (call.method === "GET") {
      const slot = slots.get(path.slice(1));
      return slot === undefined ? { status: 404 } : { status: 200, body: { name: path.slice(1), value: slot.value } };
    }

    if (call.method === "POST" && path.endsWith(":rotate")) {
      const name = path.slice(1, -":rotate".length);
      const slot = slots.get(name);
      if (slot === undefined) return { status: 404 };
      mutation += 1;
      slots.set(name, {
        value: (call.body as { value: string }).value,
        keyVersion: slot.keyVersion + 1,
        updatedAt: `2026-10-01T00:00:${String(mutation).padStart(2, "0")}Z`,
      });
      return { status: 200, body: { name } };
    }

    if (call.method === "POST") {
      const name = (call.body as { name: string }).name;
      if (slots.has(name)) return { status: 409, body: { error: "credential_already_exists" } };
      mutation += 1;
      slots.set(name, {
        value: (call.body as { value: string }).value,
        keyVersion: 1,
        updatedAt: `2026-10-01T00:00:${String(mutation).padStart(2, "0")}Z`,
      });
      return { status: 201, body: { name } };
    }

    if (call.method === "DELETE") {
      const name = path.slice(1);
      if (!slots.delete(name)) return { status: 404 };
      mutation += 1;
      return { status: 200, body: { status: "revoked" } };
    }

    return { status: 405, body: { error: "method not allowed" } };
  });

  return { http, calls, slots };
}

describe("remote backend", () => {
  it("round-trips a secret through create, read, list and delete", async () => {
    const vault = fakeVault();
    const backend = new RemoteBackend(settings(), vault.http);

    assert.equal(await backend.get("cloudflare.token"), null);
    assert.equal(await backend.has("cloudflare.token"), false);

    const afterWrite = await backend.put("cloudflare.token", "cf-value-123456");
    assert.equal(await backend.get("cloudflare.token"), "cf-value-123456");
    assert.deepEqual(await backend.list(), ["cloudflare.token"]);
    assert.equal(await backend.has("cloudflare.token"), true);

    // A write changes the version the client reports, and the client reports
    // what it derived from the server's own slot metadata.
    assert.equal(afterWrite, await backend.generation());
    assert.equal(await backend.delete("cloudflare.token"), true);
    assert.equal(await backend.delete("cloudflare.token"), false);
    assert.deepEqual(await backend.list(), []);
    assert.notEqual(await backend.generation(), afterWrite);
  });

  it("sends exactly one value per write, never the whole vault", async () => {
    const vault = fakeVault();
    const backend = new RemoteBackend(settings(), vault.http);
    await backend.put("cloudflare.token", "cf-value-123456");
    await backend.put("slack.token", "slack-value-123456");

    const writes = vault.calls.filter((call) => call.method === "POST");
    assert.equal(writes.length, 2);
    for (const write of writes) {
      // A per-key write carries one name and one value. If this ever became a
      // whole-payload PUT, every `env store set` would disclose every secret.
      assert.deepEqual(Object.keys(write.body as object).sort(), ["name", "provider", "value"]);
    }
    assert.deepEqual(
      writes.map((write) => write.body),
      [
        { name: "cloudflare.token", provider: "cloudflare", value: "cf-value-123456" },
        { name: "slack.token", provider: "slack", value: "slack-value-123456" },
      ],
      "each request must carry its own value and nothing else",
    );

    // Presence is answered from metadata: no value is fetched to say "yes".
    const before = vault.calls.length;
    assert.equal(await backend.has("slack.token"), true);
    assert.equal(vault.calls.length, before + 1);
    assert.equal(vault.calls.at(-1)!.path, "/vault");
  });

  it("rotates an existing name instead of creating it twice", async () => {
    const vault = fakeVault();
    const backend = new RemoteBackend(settings(), vault.http);

    await backend.put("slack.token", "first-value-123456");
    await backend.put("slack.token", "second-value-123456");

    assert.equal(await backend.get("slack.token"), "second-value-123456");
    assert.deepEqual(await backend.list(), ["slack.token"]);
    assert.match(vault.calls.filter((call) => call.method === "POST")[1]!.path, /:rotate$/);
  });

  it("sends the device session under Identity's own header, never as a bearer", async () => {
    const vault = fakeVault();
    const backend = new RemoteBackend(settings(), vault.http);
    await backend.get("cloudflare.token");

    const call = vault.calls[0]!;
    assert.equal(call.headers[VAULT_SESSION_HEADER], `Bearer ${SESSION_TOKEN}`);
    assert.equal(call.headers["authorization"], undefined, "the service token belongs to the proxy");
  });

  it("prefers a server-reported version over its own digest", async () => {
    let version = 40;
    const http: HttpFn = async (request) => {
      const body = { credentials: [{ name: "slack.token", provider: "slack", keyVersion: version, updatedAt: "x" }] };
      if (request.method === "GET") {
        return { status: 200, ok: true, json: { version, ...body }, text: JSON.stringify(body) };
      }
      version += 1;
      return { status: 200, ok: true, json: { name: "slack.token" }, text: "{}" };
    };
    const backend = new RemoteBackend(settings(), http);

    assert.equal(await backend.generation(), 40);
    await backend.put("slack.token", "value-123456");
    assert.equal(await backend.generation(), 41);
  });

  it("honours a compare-and-set precondition against the server version", async () => {
    const vault = fakeVault();
    const backend = new RemoteBackend(settings(), vault.http);
    await backend.put("slack.token", "first-value-123456");

    const stale = await backend.generation();
    await backend.put("cloudflare.token", "cf-value-123456");

    await assert.rejects(
      () => backend.put("github.token", "gh-value-123456", { ifGeneration: stale }),
      (error: unknown) => error instanceof StaleWriteError,
    );
    // The rejection must happen before the write reaches the server.
    assert.equal(await backend.get("github.token"), null);

    const current = await backend.generation();
    await backend.put("github.token", "gh-value-123456", { ifGeneration: current });
    assert.equal(await backend.get("github.token"), "gh-value-123456");
  });

  it("survives losing a create race by re-reading and retrying once", async () => {
    const vault = fakeVault();
    let injected = false;

    // A second writer creates the name between our listing and our write.
    const racing: HttpFn = async (request) => {
      if (request.method === "POST" && !String(request.url).includes(":rotate") && !injected) {
        injected = true;
        vault.slots.set("cloudflare.token", {
          value: "someone-else",
          keyVersion: 1,
          updatedAt: "2026-10-01T00:00:09Z",
        });
      }
      return vault.http(request);
    };
    const racer = new RemoteBackend(settings(), racing);

    const version = await racer.put("cloudflare.token", "cf-value-123456");
    assert.equal(typeof version, "number");
    assert.equal(await racer.get("cloudflare.token"), "cf-value-123456");
    // The failed create plus the retry as a rotate: two writes, no data loss.
    const writes = vault.calls.filter((call) => call.method === "POST");
    assert.equal(writes.length, 2);
    assert.match(writes[1]!.path, /:rotate$/);
  });

  it("never caches a version between calls", async () => {
    const vault = fakeVault();
    const backend = new RemoteBackend(settings(), vault.http);
    await backend.put("slack.token", "first-value-123456");
    const seen = await backend.generation();

    // Another process rotates the same name behind our back.
    const other = new RemoteBackend(settings(), vault.http);
    await other.put("slack.token", "second-value-123456");

    assert.notEqual(await backend.generation(), seen);
    assert.equal(await backend.get("slack.token"), "second-value-123456");
  });

  it("fails closed with NEEDS_AUTH and sends nothing when there is no session", async () => {
    const vault = fakeVault();
    const backend = new RemoteBackend({ ...settings(), token: null, tokenSource: null }, vault.http);

    for (const call of [
      () => backend.list(),
      () => backend.generation(),
      () => backend.get("slack.token"),
      () => backend.has("slack.token"),
      () => backend.put("slack.token", "value-123456"),
      () => backend.delete("slack.token"),
      () => backend.exists(),
      () => backend.deletePrefix("slack."),
    ]) {
      await assert.rejects(call, (error: unknown) => {
        assert.equal((error as { code?: string }).code, "provider_auth");
        assert.equal((error as { exitCode?: number }).exitCode, EXIT.NEEDS_AUTH);
        return true;
      });
    }
    assert.equal(vault.calls.length, 0, "an unauthenticated call must not reach the server");
    assert.equal(backend.info().kind, "remote");
    assert.match(backend.info().detail, /no customer session/);
  });

  it("maps a rejected session to NEEDS_AUTH and an outage to backend_unavailable", async () => {
    const rejected = new RemoteBackend(settings(), async () => ({
      status: 403,
      ok: false,
      json: { error: "forbidden" },
      text: "forbidden",
    }));
    await assert.rejects(
      () => rejected.list(),
      (error: unknown) => (error as { exitCode?: number }).exitCode === EXIT.NEEDS_AUTH,
    );

    const down = new RemoteBackend(settings(), async () => ({
      status: 503,
      ok: false,
      json: { error: "vault offline" },
      text: "vault offline",
    }));
    await assert.rejects(
      () => down.list(),
      (error: unknown) => (error as { exitCode?: number }).exitCode === EXIT.INTEGRITY,
    );

    const unreachable = new RemoteBackend(settings(), async () => ({
      status: 0,
      ok: false,
      json: null,
      text: "connect ECONNREFUSED 10.0.0.1:443",
    }));
    await assert.rejects(() => unreachable.list(), /cannot reach the remote vault/);
  });

  it("treats an unreadable listing as corruption, never as an empty vault", async () => {
    const backend = new RemoteBackend(settings(), async () => ({
      status: 200,
      ok: true,
      json: { secrets: { "slack.token": "oops" } },
      text: "{}",
    }));
    await assert.rejects(
      () => backend.list(),
      (error: unknown) => (error as { code?: string }).code === "vault_corrupt",
    );
  });

  it("refuses vault-level operations it cannot perform honestly", async () => {
    const vault = fakeVault();
    const backend = new RemoteBackend(settings(), vault.http);

    await assert.rejects(
      () => backend.rotate(),
      (error: unknown) => (error as { code?: string }).code === "unsupported",
    );
    await assert.rejects(
      () => backend.destroy(),
      (error: unknown) => (error as { code?: string }).code === "unsupported",
    );
    await assert.rejects(
      () => backend.deletePrefix(""),
      (error: unknown) => (error as { code?: string }).code === "invalid_request",
    );
    assert.equal(vault.calls.length, 0, "none of these may send a request");
  });

  it("removes a namespace name by name and reports what it removed", async () => {
    const vault = fakeVault();
    const backend = new RemoteBackend(settings(), vault.http);
    await backend.put("cloudflare.token", "cf-value-123456");
    await backend.put("cloudflare.zone", "zone-value-123456");
    await backend.put("slack.token", "slack-value-123456");

    assert.deepEqual(await backend.deletePrefix("cloudflare."), ["cloudflare.token", "cloudflare.zone"]);
    assert.deepEqual(await backend.list(), ["slack.token"]);
    assert.deepEqual(await backend.deletePrefix("cloudflare."), []);
  });
});

describe("remote backend selection", () => {
  it("chooses the remote backend only when the URL is configured", async () => {
    const paths = pathsFrom({ base: "/tmp/warpmetal-test" }, {});

    assert.equal(await resolveRemoteVault({ env: {}, paths }), null);
    assert.equal(await resolveRemoteVault({ env: { [VAULT_URL_ENV]: "   " }, paths }), null);

    const resolved = await resolveRemoteVault({
      env: { [VAULT_URL_ENV]: `${BASE}/` },
      paths,
      readFile: async () => JSON.stringify({ accessToken: "from-session-file-123456" }),
    });
    assert.equal(resolved?.baseUrl, BASE);
    assert.equal(resolved?.token, "from-session-file-123456");
    assert.equal(resolved?.tokenSource, "session");

    // The explicit token wins over the session file, so CI never needs a file.
    const explicit = await resolveRemoteVault({
      env: { [VAULT_URL_ENV]: BASE, [VAULT_TOKEN_ENV]: " from-env-123456 " },
      paths,
      readFile: async () => JSON.stringify({ accessToken: "from-session-file-123456" }),
    });
    assert.equal(explicit?.token, "from-env-123456");
    assert.equal(explicit?.tokenSource, "env");
  });

  it("treats a missing, malformed or expired session as not signed in", async () => {
    const paths = pathsFrom({ base: "/tmp/warpmetal-test" }, {});
    const now = () => Date.parse("2026-10-01T12:00:00Z");

    const cases: Array<[string, () => Promise<string>]> = [
      ["absent", async () => { throw new Error("ENOENT"); }],
      ["unreadable", async () => { throw new Error("EACCES"); }],
      ["not json", async () => "not json at all"],
      ["no token", async () => JSON.stringify({ expiresAt: "2030-01-01T00:00:00Z" })],
      ["empty token", async () => JSON.stringify({ accessToken: "" })],
      ["expired", async () => JSON.stringify({ accessToken: "tok", expiresAt: "2026-10-01T11:59:59Z" })],
    ];

    for (const [label, readFile] of cases) {
      const resolved = await resolveRemoteVault({
        env: { [VAULT_URL_ENV]: BASE },
        paths,
        readFile,
        now,
      });
      assert.notEqual(resolved, null, `${label}: the remote backend must still be selected`);
      assert.equal(resolved?.token, null, `${label}: expected no usable token`);
    }

    const live = await resolveRemoteVault({
      env: { [VAULT_URL_ENV]: BASE },
      paths,
      readFile: async () => JSON.stringify({ accessToken: "tok", expiresAt: "2026-10-01T12:00:01Z" }),
      now,
    });
    assert.equal(live?.token, "tok");
  });

  it("rejects a URL that is not http(s)", async () => {
    const paths = pathsFrom({ base: "/tmp/warpmetal-test" }, {});
    await assert.rejects(
      () => resolveRemoteVault({ env: { [VAULT_URL_ENV]: "file:///etc/passwd" }, paths }),
      (error: unknown) => (error as { code?: string }).code === "usage_error",
    );
    await assert.rejects(
      () => resolveRemoteVault({ env: { [VAULT_URL_ENV]: "not a url" }, paths }),
      (error: unknown) => (error as { code?: string }).code === "usage_error",
    );
  });

  it("does not fall back to the local vault when a session is missing", async () => {
    const vault = fakeVault();
    const env = {
      WARPMETAL_CONFIG_DIR: "/tmp/warpmetal-remote-test",
      [VAULT_URL_ENV]: BASE,
    };

    const store = await CredentialStore.open({
      env,
      preferKeychain: false,
      vaultHttp: vault.http,
      readSessionFile: async () => {
        throw new Error("ENOENT");
      },
    });

    assert.equal(store.backendInfo().kind, "remote");
    await assert.rejects(
      () => store.read("cloudflare.token"),
      (error: unknown) => (error as { exitCode?: number }).exitCode === EXIT.NEEDS_AUTH,
    );
    await assert.rejects(
      () => store.write("cloudflare.token", "cf-value-123456"),
      (error: unknown) => (error as { exitCode?: number }).exitCode === EXIT.NEEDS_AUTH,
    );
    assert.equal(vault.calls.length, 0);
  });

  it("stores and reads through the store against the server", async () => {
    const vault = fakeVault();
    const env = { WARPMETAL_CONFIG_DIR: "/tmp/warpmetal-remote-test", [VAULT_URL_ENV]: BASE };

    const store = await CredentialStore.open({
      env,
      preferKeychain: false,
      vaultHttp: vault.http,
      readSessionFile: async () => JSON.stringify({ accessToken: "session-token-value-123456" }),
    });

    await store.write("cloudflare.token", "cf-value-123456");
    assert.equal(await store.read("cloudflare.token"), "cf-value-123456");
    assert.deepEqual(await store.listService("cloudflare"), ["cloudflare.token"]);

    const status = await store.status();
    assert.equal(status.backend.kind, "remote");
    assert.equal(status.exists, true);
    assert.equal(status.secretCount, 1);

    assert.deepEqual(await store.removeService("cloudflare"), ["cloudflare.token"]);
    assert.equal(await store.read("cloudflare.token"), null);
  });
});

describe("remote backend through the dispatcher", () => {
  it("exits 4 instead of writing locally when there is no session", async () => {
    const vault = fakeVault();
    const out = captureOut();
    const code = await runCli(["env", "status", "--json"], {
      out,
      env: { WARPMETAL_CONFIG_DIR: "/tmp/warpmetal-remote-test", [VAULT_URL_ENV]: BASE },
      fetchFn: async () => new Response("{}", { status: 200 }),
    });

    assert.equal(code, EXIT.NEEDS_AUTH);
    assert.match(out.err.join(""), /no customer session/);
    assert.equal(vault.calls.length, 0);
  });
});
