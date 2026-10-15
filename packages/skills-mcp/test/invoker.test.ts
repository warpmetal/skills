/**
 * invoker.test.ts - the real MCP-to-CLI transport.
 *
 * Spawns a fake `warpmetal integration` (a JS fixture, no network) through
 * `WarpMetalProviderInvoker` and proves the four contract points that a mock
 * cannot: arguments travel over stdin, the confirm gate is injected for
 * mutations, the exit codes map to the right provider errors, and an
 * array-root response comes back as `items`.
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  WarpMetalProviderInvoker,
  findProviderToolMapping,
  providerError,
} from "../src/providers/index.js";
import type { CliTarget } from "../src/exec.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeCli = path.join(here, "fixtures", "fake-integration-cli.mjs");

function fakeTarget(): CliTarget {
  return {
    command: process.execPath,
    prefixArgs: [fakeCli],
    degraded: null,
    description: "fake integration cli",
    version: null,
  };
}

function invoker(env: NodeJS.ProcessEnv = process.env): WarpMetalProviderInvoker {
  return new WarpMetalProviderInvoker({ configured: true, target: fakeTarget(), env });
}

test("arguments travel over stdin, not argv", async () => {
  const canary = "canary_owner_value_do_not_put_in_argv";
  const result = (await invoker().invoke("github_list_issues", {
    owner: canary,
    repo: "demo",
  })) as { receivedArgs?: Record<string, unknown>; argv?: string[]; confirm?: string | null };

  assert.deepEqual(result.receivedArgs, { owner: canary, repo: "demo" });
  assert.equal(result.confirm ?? null, null, "a read-only tool sends no --confirm");
  assert.ok(
    !(result.argv ?? []).includes(canary),
    "the payload must never appear in argv (process list)",
  );
  assert.ok(
    !(result.argv ?? []).includes("--args-json"),
    "the invoker must use --args-stdin, not --args-json",
  );
});

test("a mutation carries its confirm gate on argv", async () => {
  const mapping = findProviderToolMapping("github_create_issue");
  assert.ok(mapping?.gate, "github_create_issue must have a gate in the mapping");

  const result = (await invoker().invoke("github_create_issue", {
    owner: "acme",
    repo: "demo",
    title: "hi",
  })) as { confirm?: string | null; argv?: string[] };

  assert.equal(result.confirm, mapping.gate);
  assert.ok((result.argv ?? []).includes("--confirm"));
});

test("exit code 4 maps to provider_unconfigured", async () => {
  const env = { ...process.env, FAKE_CLI_EXIT: "4" };
  await assert.rejects(invoker(env).invoke("github_list_issues", { owner: "a", repo: "b" }), (error) => {
    assert.equal((error as { provider?: { code?: string } }).provider?.code, "provider_unconfigured");
    assert.match(error.message, /credential rejected/);
    return true;
  });
});

test("exit code 5 maps to provider_invoke_failed", async () => {
  const env = { ...process.env, FAKE_CLI_EXIT: "5" };
  await assert.rejects(invoker(env).invoke("github_list_issues", { owner: "a", repo: "b" }), (error) => {
    assert.equal((error as { provider?: { code?: string } }).provider?.code, "provider_invoke_failed");
    assert.match(error.message, /rejected the action/);
    return true;
  });
});

test("an array-root response survives as items", async () => {
  const env = { ...process.env, FAKE_CLI_ARRAY: "1" };
  const result = (await invoker(env).invoke("github_list_issues", { owner: "a", repo: "b" })) as {
    items?: unknown[];
  };
  assert.ok(Array.isArray(result.items), "items must stay an array across the transport");
  assert.equal(result.items?.length, 2);
});

test("an unconfigured invoker fails before spawning", async () => {
  await assert.rejects(
    new WarpMetalProviderInvoker({ configured: false }).invoke("github_list_issues", {}),
    (error) => {
      assert.equal((error as { provider?: { code?: string } }).provider?.code, "provider_unconfigured");
      return true;
    },
  );
});

test("providerError carries a typed code", () => {
  const error = providerError("provider_invalid_args", "bad args");
  assert.equal((error as { provider?: { code?: string } }).provider?.code, "provider_invalid_args");
});
