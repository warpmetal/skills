/**
 * conformance.test.ts - the checks that keep the server honest.
 *
 * Checks 4 and 5 are the load-bearing ones: they are what stop a change from
 * quietly reintroducing a hand-rolled HTTP client or a blocking tool. The
 * mutation checks add the mirror-image guarantees: that no destructive verb is
 * reachable, that no safety constant can come from the client, and that a
 * timeout never consumes an approval.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

import { ApprovalStore } from "../src/approval.js";
import { idempotencyKeyFor, effectiveArgv } from "../src/approval.js";
import { appendAudit, redact } from "../src/audit.js";
import { LatchStore } from "../src/latch.js";
import {
  CLI_COMMANDS,
  CliDeniedError,
  CliResolutionError,
  DEFAULT_TIMEOUT_MS,
  FORBIDDEN_FLAGS,
  WAIT_HEADROOM_MS,
  acceptsIdempotencyKey,
  buildArgv,
  createCliRunner,
  extractJson,
  resolveCliTarget,
  type CliCommandKey,
  type CliCommandSpec,
  type CliFlagValue,
  type Runner,
  type RunOutcome,
} from "../src/exec.js";
import {
  DEFAULT_MAX_CONCURRENT_CLI,
  Semaphore,
  resolveConcurrencyLimit,
} from "../src/limits.js";
import {
  DEFAULT_DEADLINE_SECONDS,
  MAX_DEADLINE_SECONDS,
  MIN_INTERVAL_MS,
  pollUntilTerminal,
} from "../src/poll.js";
import {
  APPROVAL_REQUIRED_EXIT_CODE,
  DENIED_EXIT_CODE,
  EXIT_STATUS,
  KNOWN_EXIT_CODES,
  TIMEOUT_EXIT_CODE,
  WM_STATUSES,
  mapExitCode,
  wmResultSchema,
} from "../src/result.js";
import { sandboxActions } from "../src/schemas.js";
import {
  GRANT_TERMINAL_STATES,
  OPERATION_TERMINAL_STATES,
  RUNTIME_TERMINAL_STATES,
  SANDBOX_TERMINAL_STATES,
  TASK_TERMINAL_STATES,
  checkCapacity,
  grantIdOf,
  grantList,
  grantRecord,
  osSupportsRuntime,
  runtimeState,
  sandboxIdOf,
  sandboxList,
  sandboxRecord,
  stateOf,
  taskRecord,
} from "../src/shapes.js";
import { buildServer } from "../src/server.js";
import { TaskRegistry } from "../src/tasks.js";
import { ALL_TOOL_SPECS } from "../src/tools/index.js";
import {
  resolveEffectArgv,
  resolveFlags,
  asRecord,
  type EffectDeclaration,
  type WmToolSpec,
} from "../src/tools/spec.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(HERE, "..", "src");
/** These suites run from source through `tsx`, so the package root is one level up. */
const PACKAGE_JSON = path.join(HERE, "..", "package.json");

const tempDirs: string[] = [];
after(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "warpmetal-mcp-test-"));
  tempDirs.push(dir);
  return dir;
}

interface FakeRunner {
  runner: Runner;
  calls: Array<{ key: CliCommandKey; flags: Record<string, CliFlagValue> }>;
}

function fakeRunner(
  payload: unknown,
  options: { exitCode?: number; stderr?: string; jsonFound?: boolean; timedOut?: boolean } = {},
): FakeRunner {
  const calls: FakeRunner["calls"] = [];
  const exitCode = options.exitCode ?? 0;
  const jsonFound = options.jsonFound ?? payload !== undefined;
  const runner: Runner = {
    run(key, flags = {}) {
      calls.push({ key, flags: { ...flags } });
      const outcome: RunOutcome = {
        exitCode,
        timedOut: options.timedOut ?? exitCode === TIMEOUT_EXIT_CODE,
        stdout: jsonFound ? JSON.stringify(payload, null, 2) : "",
        stderr: options.stderr ?? "",
        json: jsonFound ? payload : null,
        jsonFound,
        durationMs: 1,
        warnings: [],
        subcommand: CLI_COMMANDS[key].argv.join(" "),
      };
      return Promise.resolve(outcome);
    },
  };
  return { runner, calls };
}

/**
 * A runner that answers per command key, so a tool that probes several
 * commands in one call can be driven realistically.
 */
function keyedRunner(byKey: Readonly<Record<string, unknown>>): FakeRunner {
  const calls: FakeRunner["calls"] = [];
  const runner: Runner = {
    run(key, flags = {}) {
      calls.push({ key, flags: { ...flags } });
      const payload = byKey[key] ?? {};
      const outcome: RunOutcome = {
        exitCode: 0,
        timedOut: false,
        stdout: JSON.stringify(payload),
        stderr: "",
        json: payload,
        jsonFound: true,
        durationMs: 1,
        warnings: [],
        subcommand: CLI_COMMANDS[key].argv.join(" "),
      };
      return Promise.resolve(outcome);
    },
  };
  return { runner, calls };
}

/**
 * A runner whose answer per key can change between calls, which is what a test
 * needs to model a world that moves. `keyedRunner` fixes its answers for the
 * whole session and therefore cannot express "it existed at plan time and did
 * not at apply time".
 */
function scriptedRunner(
  handler: (key: CliCommandKey, flags: Record<string, CliFlagValue>) => {
    payload?: unknown;
    exitCode?: number;
  },
): FakeRunner {
  const calls: FakeRunner["calls"] = [];
  const runner: Runner = {
    run(key, flags = {}) {
      calls.push({ key, flags: { ...flags } });
      const answer = handler(key, flags);
      const payload = answer.payload ?? {};
      const exitCode = answer.exitCode ?? 0;
      const outcome: RunOutcome = {
        exitCode,
        timedOut: exitCode === TIMEOUT_EXIT_CODE,
        stdout: JSON.stringify(payload),
        stderr: "",
        json: payload,
        jsonFound: true,
        durationMs: 1,
        warnings: [],
        subcommand: CLI_COMMANDS[key].argv.join(" "),
      };
      return Promise.resolve(outcome);
    },
  };
  return { runner, calls };
}

/**
 * A runner that answers with a different payload per attempt, then repeats the
 * last one. The poll loop is only meaningful across several attempts, so a
 * single fixed answer cannot exercise it.
 */
function sequenceRunner(steps: ReadonlyArray<{ payload: unknown; exitCode?: number }>): FakeRunner {
  const calls: FakeRunner["calls"] = [];
  let index = 0;
  const runner: Runner = {
    run(key, flags = {}) {
      calls.push({ key, flags: { ...flags } });
      const step = steps[Math.min(index, steps.length - 1)] ?? { payload: null };
      index += 1;
      const exitCode = step.exitCode ?? 0;
      const outcome: RunOutcome = {
        exitCode,
        timedOut: false,
        stdout: JSON.stringify(step.payload),
        stderr: "",
        json: step.payload,
        jsonFound: true,
        durationMs: 1,
        warnings: [],
        subcommand: CLI_COMMANDS[key].argv.join(" "),
      };
      return Promise.resolve(outcome);
    },
  };
  return { runner, calls };
}

interface Session {
  client: Client;
  close: () => Promise<void>;
}

async function connect(
  runner: Runner,
  options: { auditDir?: string; auditEnabled?: boolean } = {},
): Promise<Session> {
  const server = buildServer({
    runner,
    auditEnabled: options.auditEnabled ?? false,
    auditDir: options.auditDir ?? tempDir(),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "conformance", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
    },
  };
}

interface CallResult {
  isError: boolean | undefined;
  envelope: Record<string, unknown>;
  text: string;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallResult> {
  const raw = await client.callTool({ name, arguments: args });
  const result = raw as unknown as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content?: Array<{ type: string; text?: string }>;
  };
  const envelope = result.structuredContent;
  assert.ok(envelope, `${name} returned no structuredContent`);
  const text = result.content?.[0]?.text ?? "";
  return { isError: result.isError, envelope, text };
}

function toolFlags(spec: (typeof ALL_TOOL_SPECS)[number]): Record<string, unknown> {
  const schema = z.toJSONSchema(spec.input, { io: "input" }) as {
    properties?: Record<string, unknown>;
    additionalProperties?: unknown;
  };
  assert.equal(
    schema.additionalProperties,
    false,
    `${spec.name} input must be strict at the schema level, not only on the wire`,
  );
  return schema.properties ?? {};
}

const HEALTH_FIXTURE = {
  anyPaymentReady: true,
  dependencies: {
    computeInventory: true,
    database: true,
    emailNotices: true,
    sshProof: true,
    worker: true,
    x402Contract: true,
  },
  paymentMethods: { crypto: { ready: true }, stripe: { hostedCard: { ready: true }, ready: true } },
  purchasingReady: true,
  service: "warpmetal-backend",
  status: "ok",
};

const HEALTH_PAUSED_FIXTURE = { ...HEALTH_FIXTURE, purchasingReady: false, anyPaymentReady: false };

/** `server get` wraps the record in `task`. */
function serverFixture(state: string): Record<string, unknown> {
  return { task: { id: "srv_fixture_01", planId: "agent", osName: "ubuntu-24.04", state } };
}

/** `runtime get` wraps the record in `runtime`. */
function runtimeFixture(state: string): Record<string, unknown> {
  return { runtime: { serverId: "srv_fixture_01", state } };
}

/** `sandbox get` wraps the record in `sandbox`. */
function sandboxFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sandbox: {
      id: "sbx_fixture_01",
      name: "agent-1",
      observedState: "running",
      desiredState: "running",
      lifetime: "temporary",
      expiresAt: "2026-09-22T00:00:00.000000+00:00",
      ...overrides,
    },
  };
}

/** `sandbox access get` wraps the record in `accessGrant`. */
function grantFixture(state: string): Record<string, unknown> {
  return { accessGrant: { id: "grant_fixture_01", observedState: state, keyFingerprint: "SHA256:fixture" } };
}

const CATALOG_FIXTURE = {
  paymentMethods: ["crypto", "stripe"],
  pricingRevision: "b804a25cf5804c8e741ed646228a03eefb59449eb618984f691bd6ee788bb6f0",
  pricingUpdatedAt: "2026-09-08T12:50:28.889324+00:00",
  refreshedAt: "2026-09-21T21:00:00.000000+00:00",
  products: [
    {
      agentRuntime: {
        capacity: { cpuMillicores: 1500, memoryMiB: 3072, workspaceDiskGiB: 30 },
        sizes: [
          { cpuMillicores: 500, id: "small", memoryMiB: 1024, pids: 256, workspaceDiskGiB: 10 },
          { cpuMillicores: 1000, id: "medium", memoryMiB: 2048, pids: 512, workspaceDiskGiB: 20 },
          { cpuMillicores: 2000, id: "large", memoryMiB: 4096, pids: 1024, workspaceDiskGiB: 40 },
          { cpuMillicores: 4000, id: "xlarge", memoryMiB: 8192, pids: 2048, workspaceDiskGiB: 80 },
        ],
        supported: true,
      },
      id: "agent",
      name: "Agent",
      // The CLI does `operatingSystems.find(s => s.name === osName)` and reads
      // `agentRuntimeSupported`, so these are objects, not strings.
      operatingSystems: [
        { name: "ubuntu-24.04", agentRuntimeSupported: true },
        { name: "debian-12", agentRuntimeSupported: false },
      ],
      priceAtomic: "15000000",
      priceUsd: 15,
      regions: ["us-east"],
      termDays: 30,
    },
  ],
};

/**
 * Mirrors the live `state list` payload. Identifiers are fabricated on purpose:
 * the real ones belong to the operator and must never be committed as fixtures.
 */
const STATE_FIXTURE = {
  stateFile: "C:\\Users\\operator\\AppData\\Roaming\\WarpMetal\\state.json",
  orders: [{ taskId: "task_fixture_01", serverId: "srv_fixture_01", planId: "agent", credentialStored: true }],
  servers: [{ serverId: "srv_fixture_01", taskId: "task_fixture_01", recoveryCredentialStored: true }],
  operations: [{ operationId: "op_fixture_01", serverId: "srv_fixture_01", kind: "power:reboot" }],
  runtimes: [{ serverId: "srv_fixture_01", state: "ready", desiredRevision: 14, appliedRevision: 14 }],
  sandboxes: [
    {
      serverId: "srv_fixture_01",
      sandboxId: "sbx_fixture_01",
      name: "agent-1",
      size: "small",
      lifetime: "persistent",
      expiresAt: null,
      desiredState: "running",
      observedState: "running",
    },
  ],
  accessGrants: [
    {
      serverId: "srv_fixture_01",
      sandboxId: "sbx_fixture_01",
      grantId: "grant_fixture_01",
      name: "agent-1",
      sshFingerprint: "SHA256:AAAA",
      desiredState: "active",
      observedState: "applied",
    },
  ],
  identities: [
    {
      identityId: "idn_fixture_01",
      keyName: "warpmetal-fixture",
      hostnameAtCreation: "fixture",
      publicKeyPath: "C:\\keys\\warpmetal-fixture.pub",
      privateKeyPath: "C:\\keys\\warpmetal-fixture",
      sshFingerprint: "SHA256:BBBB",
      serverId: "srv_fixture_01",
      taskId: "task_fixture_01",
    },
  ],
  renewals: [
    { serverId: "srv_fixture_01", wallet: "fixture-wallet", refillTargetAtomic: "15000000" },
  ],
};

describe("1. schema conformance", () => {
  it("registers exactly 43 tools, each strict, described and with an output schema", async () => {
    const session = await connect(fakeRunner({}).runner);
    try {
      const { tools } = await session.client.listTools();
      assert.equal(tools.length, 43);
      assert.equal(tools.length, ALL_TOOL_SPECS.length);

      for (const tool of tools) {
        assert.ok(tool.description && tool.description.length > 40, `${tool.name} needs a real description`);

        const input = tool.inputSchema as { type?: unknown; additionalProperties?: unknown };
        assert.equal(input.type, "object", `${tool.name} input must be an object`);
        assert.equal(
          input.additionalProperties,
          false,
          `${tool.name} input schema must set additionalProperties:false so the CLI never sees an unexpected field`,
        );

        assert.ok(tool.outputSchema, `${tool.name} must declare an output schema`);
        const output = tool.outputSchema as { type?: unknown };
        assert.equal(output.type, "object", `${tool.name} output must be an object`);

        assert.ok(tool.annotations, `${tool.name} must declare annotations`);
        // `destructiveHint: true` is no longer impossible, but it is still
        // narrow: only an apply may claim it, and only when it erases
        // something. A read or a plan that claims it would be advertising
        // damage it cannot cause, which makes the hint useless as a signal.
        if (tool.annotations.destructiveHint === true) {
          const spec = ALL_TOOL_SPECS.find((entry) => entry.name === tool.name);
          assert.equal(
            spec?.kind,
            "apply",
            `${tool.name} claims destructiveness but is not an apply`,
          );
        }
      }
    } finally {
      await session.close();
    }
  });

  it("declares the destructive hint for erasing actions and for nothing else", () => {
    const destructive: string[] = [];
    let applies = 0;
    for (const spec of ALL_TOOL_SPECS) {
      const kind = spec.kind ?? "read";
      if (kind === "apply") {
        applies += 1;
        assert.equal(spec.annotations.readOnlyHint, false, `${spec.name} writes and must say so`);
        // Replaying an apply is refused by the token gate rather than by the
        // operation, which is exactly what idempotentHint:false communicates.
        assert.equal(spec.annotations.idempotentHint, false, `${spec.name} is gated and single-use`);
        if (spec.annotations.destructiveHint === true) {
          destructive.push(spec.name);
        }
      } else {
        assert.equal(
          spec.annotations.readOnlyHint,
          true,
          `${spec.name} is a ${kind} and must still be read-only`,
        );
        assert.equal(
          spec.annotations.destructiveHint,
          false,
          `${spec.name} is a ${kind} and cannot destroy anything`,
        );
      }
    }
    assert.equal(applies, 12, "there must be exactly twelve applies across the mutation and destructive surfaces");
    // Five of the twelve: reload, sandbox delete, sandbox lifecycle, access
    // revoke and access refresh. `server_power` is deliberately absent, because
    // `availability` is a real consequence that destroys nothing, and the MCP
    // hint is specifically about destruction. The gate treats all six
    // identically; only the advertisement differs.
    assert.equal(destructive.length, 5, "five applies must advertise destructiveness");
    assert.ok(
      !destructive.includes("wm_server_power_apply"),
      "powering a server off is a consequence, not a destruction, and the hint must not overstate it",
    );
    assert.ok(
      destructive.includes("wm_sandbox_delete_apply") &&
        destructive.includes("wm_server_reload_apply"),
      "the two verbs that erase a disk must advertise destructiveness",
    );
  });

  it("rejects an unknown argument before it ever reaches the runner", async () => {
    const fake = fakeRunner(STATE_FIXTURE);
    const session = await connect(fake.runner);
    try {
      let rejected = false;
      try {
        const result = await call(session.client, "wm_server_get", {
          serverId: "srv_fixture_01",
          unexpectedField: "boom",
        });
        rejected = result.isError === true;
      } catch {
        rejected = true;
      }
      assert.equal(rejected, true, "an undeclared field must be rejected");
      assert.equal(fake.calls.length, 0, "validation must fail before the CLI is invoked");
    } finally {
      await session.close();
    }
  });
});

describe("2. command whitelist", () => {
  it("builds argv only from the closed registry", () => {
    assert.deepEqual(buildArgv("sandboxList"), ["sandbox", "list", "--json"]);
    assert.deepEqual(buildArgv("serverGet", { server: "srv_x" }), [
      "server",
      "get",
      "--server",
      "srv_x",
      "--json",
    ]);
    assert.deepEqual(buildArgv("version"), ["--version"]);
  });

  it("refuses an unregistered key, an invalid flag name and a control character", () => {
    assert.throws(() => buildArgv("nope" as CliCommandKey), CliDeniedError);
    assert.throws(() => buildArgv("health", { "bad flag": "x" }), CliDeniedError);
    assert.throws(() => buildArgv("health", { "--json": "x" }), CliDeniedError);
    assert.throws(() => buildArgv("health", { plan: "a\nb" }), CliDeniedError);
  });

  it("maps every tool to a registry key and reports DENIED without spawning", async () => {
    for (const spec of ALL_TOOL_SPECS) {
      if (spec.kind === "task") {
        assert.equal(spec.cli, undefined, `${spec.name} is a task tool and runs no single command`);
        continue;
      }
      if (spec.kind === "plan") {
        assert.equal(spec.cli, undefined, `${spec.name} is a plan and must not spawn anything`);
        assert.ok(spec.mintsFor, `${spec.name} must declare the effect it authorises`);
        assert.ok(
          Object.prototype.hasOwnProperty.call(CLI_COMMANDS, spec.mintsFor.cli),
          `${spec.name} names an unknown command key in mintsFor`,
        );
        continue;
      }
      assert.ok(spec.cli, `${spec.name} must name a command key`);
      assert.ok(
        Object.prototype.hasOwnProperty.call(CLI_COMMANDS, spec.cli),
        `${spec.name} names an unknown command key`,
      );
    }

    const denied: Runner = {
      run() {
        return Promise.reject(new CliDeniedError("subcommand not in the allowlist: rm -rf"));
      },
    };
    const session = await connect(denied);
    try {
      const result = await call(session.client, "wm_health");
      assert.equal(result.envelope["status"], "DENIED");
      assert.equal(result.isError, true);
      // -3 marks a refusal this server made before launching anything, which
      // keeps it distinguishable from the CLI's own exit 11.
      assert.equal(result.envelope["exit_code"], DENIED_EXIT_CODE);
    } finally {
      await session.close();
    }
  });
});

describe("3. redaction", () => {
  const PEM =
    "-----BEGIN OPENSSH PRIVATE KEY-----\nZmFrZWtleW1hdGVyaWFs\n-----END OPENSSH PRIVATE KEY-----";
  const GITHUB_TOKEN = "ghp_0123456789abcdefghijklmnopqrstuvwx";
  const BEARER_URL = "https://checkout.example.com/c/expiring-bearer-capability";

  it("redacts secrets by key name, by bearer path and by value shape", () => {
    const payload = {
      challengeHandle: "handler_should_never_leave",
      humanCheckout: { url: BEARER_URL, qrPayload: BEARER_URL, afterPayment: { argv: ["warpmetal", "order"] } },
      ownerToken: "tok_live",
      identities: [{ privateKeyPath: "C:\\keys\\id_ed25519", publicKeyPath: "C:\\keys\\id_ed25519.pub" }],
      nested: { deeper: { paymentArtifact: "/tmp/artifact.json" } },
      notes: `a key: ${PEM}`,
      remote: `token=${GITHUB_TOKEN}`,
      // These must survive: a presence boolean and a timestamp are useful.
      credentialStored: true,
      accessTokenExpiresAt: "2026-09-17T01:52:10Z",
    };

    const { value, redacted } = redact(payload);
    const serialized = JSON.stringify(value);

    assert.ok(!serialized.includes("handler_should_never_leave"), "challengeHandle leaked");
    assert.ok(!serialized.includes(BEARER_URL), "the bearer checkout URL leaked");
    assert.ok(!serialized.includes("tok_live"), "ownerToken leaked");
    assert.ok(!serialized.includes("C:\\keys\\id_ed25519"), "privateKeyPath leaked");
    assert.ok(!serialized.includes("ZmFrZWtleW1hdGVyaWFs"), "inline key material leaked");
    assert.ok(!serialized.includes(GITHUB_TOKEN), "github token leaked");
    assert.ok(!serialized.includes("artifact.json"), "payment artifact path leaked");

    for (const needle of [
      "$.challengeHandle",
      "$.humanCheckout.url",
      "$.humanCheckout.qrPayload",
      "$.ownerToken",
      "$.identities[0].privateKeyPath",
      "$.nested.deeper.paymentArtifact",
    ]) {
      assert.ok(redacted.includes(needle), `redacted[] must name ${needle}`);
    }
    assert.ok(
      redacted.some((entry) => entry.endsWith("(private-key)")),
      "an inline PEM must be reported as a value-level scrub",
    );
    assert.ok(
      redacted.some((entry) => entry.endsWith("(github-token)")),
      "a GitHub token must be reported as a value-level scrub",
    );

    // The rule must stay precise rather than blunt.
    assert.equal((value as Record<string, unknown>)["credentialStored"], true);
    assert.equal((value as Record<string, unknown>)["accessTokenExpiresAt"], "2026-09-17T01:52:10Z");
    const identities = (value as { identities: Array<Record<string, unknown>> }).identities;
    assert.equal(identities[0]?.["publicKeyPath"], "C:\\keys\\id_ed25519.pub");

    // Nothing in redacted[] may be a value.
    for (const entry of redacted) {
      assert.ok(!entry.includes("C:\\keys"), "redacted[] must never contain a value");
      assert.ok(!entry.includes(GITHUB_TOKEN), "redacted[] must never contain a value");
    }
  });

  it("carries the redaction through a real tool call", async () => {
    const fake = fakeRunner({
      status: "ok",
      challengeHandle: "handler_live_value",
      identities: [{ privateKeyPath: "C:\\secret\\key" }],
    });
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_health");
      assert.ok(!result.text.includes("handler_live_value"), "the text channel leaked a secret");
      assert.ok(!result.text.includes("C:\\secret\\key"), "the text channel leaked a path");
      const data = result.envelope["data"] as Record<string, unknown>;
      assert.equal(data["challengeHandle"], "[REDACTED]");
      assert.ok(Array.isArray(result.envelope["redacted"]));
      assert.ok((result.envelope["redacted"] as string[]).includes("$.challengeHandle"));
      assert.ok(wmResultSchema.safeParse(result.envelope).success);
    } finally {
      await session.close();
    }
  });

  it("never writes flag values to the audit log", async () => {
    const fake = fakeRunner({ status: "ok" });
    const auditDir = tempDir();
    const session = await connect(fake.runner, { auditEnabled: true, auditDir });
    const identityPath = "/home/operator/.ssh/id_ed25519";
    try {
      await call(session.client, "wm_server_login", {
        serverId: "srv_fixture_01",
        identity: identityPath,
      });

      const log = readFileSync(path.join(auditDir, "audit.jsonl"), "utf8");
      assert.ok(log.includes("server login"), "the log must record the subcommand");
      assert.ok(!log.includes(identityPath), "the log leaked a flag value");
      assert.ok(!log.includes("id_ed25519"), "the log leaked an identity name");
      for (const line of log.trim().split("\n")) {
        const record = JSON.parse(line) as Record<string, unknown>;
        assert.deepEqual(Object.keys(record).sort(), [
          "approval",
          "consequence",
          "duration_ms",
          "exit_code",
          "latch",
          "redacted",
          "status",
          "subcommand",
          "tool",
          "ts",
        ]);
        // The approval field is an enum and nothing else: the log must never
        // become a place a token could be read back from. The same holds for
        // the consequence and latch fields, which are enums precisely so that
        // the record grows without the log acquiring a free-text surface.
        assert.equal(record["approval"], "not_required");
        assert.equal(record["consequence"], "none");
        assert.equal(record["latch"], "not_checked");
      }
    } finally {
      await session.close();
    }
  });

  it("reports a failing audit log instead of swallowing it", () => {
    // A file standing in for a directory makes the recursive mkdir fail with
    // ENOTDIR, which is the realistic "audit directory is unusable" case.
    const blocker = path.join(tempDir(), "blocker");
    writeFileSync(blocker, "not a directory");
    const outcome = appendAudit(
      {
        ts: new Date().toISOString(),
        tool: "wm_health",
        subcommand: "health",
        exit_code: 0,
        status: "OBSERVED",
        duration_ms: 1,
        redacted: [],
        approval: "not_required",
        consequence: "none",
        latch: "not_checked",
      },
      path.join(blocker, "state"),
    );
    assert.equal(outcome.ok, false);
    assert.ok(outcome.error !== undefined);
  });
});

describe("4. no HTTP client, no protocol reimplementation", () => {
  const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
    { name: "fetch()", pattern: /\bfetch\s*\(/ },
    { name: "node:http import", pattern: /from\s+["']node:https?["']/ },
    { name: "node:http require", pattern: /require\(\s*["']node:https?["']\s*\)/ },
    { name: "http2", pattern: /node:http2/ },
    { name: "XMLHttpRequest", pattern: /XMLHttpRequest/ },
    { name: "axios", pattern: /\baxios\b/ },
    { name: "undici", pattern: /\bundici\b/ },
    { name: "got", pattern: /from\s+["']got["']/ },
    { name: "raw .request()", pattern: /\.request\s*\(/ },
  ];

  /**
   * The CLI stack must never hand-roll HTTP: the `warpmetal` binary is the only
   * interface to WarpMetal, and a second HTTP client is exactly the drift this
   * suite exists to catch.
   *
   * Three files are excluded because they are not part of that stack. This
   * package also hosts the skills content server, which reads the skills
   * registry over HTTPS by design (`fetch`) and serves its own HTTP transport
   * (`node:http`). Both predate the merge, so the exclusion is by name rather
   * than by directory: the invariant must keep covering every file that talks
   * to WarpMetal, including any file added later.
   */
  const CONTENT_TRANSPORT_FILES: ReadonlySet<string> = new Set([
    "http.ts", // the Streamable HTTP transport, used only by the content profile
    "registry.ts", // fetches the remote registry with `fetch`
    "skills.ts", // fetches remote skill files with `fetch`
  ]);

  it("contains no HTTP call anywhere in the CLI stack", () => {
    const files = readdirSync(SRC_DIR, { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith(".ts"))
      .filter((entry) => !entry.endsWith(".d.ts"))
      .map((entry) => entry.split(path.sep).join("/"))
      .filter((entry) => !CONTENT_TRANSPORT_FILES.has(entry));

    assert.ok(
      files.length >= 9,
      `expected at least 9 source files in the CLI stack, found ${String(files.length)}`,
    );

    for (const relative of files) {
      const contents = readFileSync(path.join(SRC_DIR, relative), "utf8");
      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        assert.ok(
          !pattern.test(contents),
          `${relative} must not use ${name}: the CLI is the only interface`,
        );
      }
    }
  });

  it("depends on nothing beyond the SDK and Zod", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}).sort(), [
      "@modelcontextprotocol/sdk",
      "zod",
    ]);
    for (const version of Object.values(pkg.dependencies ?? {})) {
      assert.ok(
        /^\d+\.\d+\.\d+$/.test(version),
        `dependency ${version} must be pinned to an exact version`,
      );
    }
  });
});

describe("5. no blocking flags", () => {
  /** Every spec that actually spawns something. Plans and task tools spawn nothing. */
  const spawning = ALL_TOOL_SPECS.filter((spec) => spec.cli !== undefined);

  /**
   * The registry entry for a key, widened so the optional registry fields are
   * readable. `CLI_COMMANDS` is `as const`, so a bare index yields a union of
   * literals and most members lack the property.
   */
  function registryEntry(key: CliCommandKey): CliCommandSpec {
    return CLI_COMMANDS[key];
  }

  it("declares no wait or timeout flag on any tool", () => {
    for (const spec of ALL_TOOL_SPECS) {
      for (const flag of Object.keys(spec.flags ?? {})) {
        assert.ok(
          !FORBIDDEN_FLAGS.includes(flag),
          `${spec.name} declares the blocking flag --${flag}`,
        );
      }
      const properties = toolFlags(spec);
      for (const field of Object.keys(properties)) {
        assert.ok(
          !["wait", "timeout", "timeoutseconds"].includes(field.toLowerCase()),
          `${spec.name} exposes a blocking argument ${field}`,
        );
      }
    }
  });

  it("confines the one long call to wm_task_wait, with a hard ceiling", () => {
    // The server does introduce a call that can take minutes, and pretending
    // otherwise would be dishonest. The difference from a CLI --wait is that the
    // budget is the server's own, it is capped by the schema, and the loop can
    // always give up and report PENDING.
    const withBudget = ALL_TOOL_SPECS.filter((spec) =>
      Object.prototype.hasOwnProperty.call(toolFlags(spec), "deadlineSeconds"),
    ).map((spec) => spec.name);
    assert.deepEqual(withBudget, ["wm_task_wait"]);
    const schema = z.toJSONSchema(
      (ALL_TOOL_SPECS.find((spec) => spec.name === "wm_task_wait") as WmToolSpec).input,
      { io: "input" },
    ) as { properties?: Record<string, { maximum?: number }> };
    assert.equal(schema.properties?.["deadlineSeconds"]?.maximum, MAX_DEADLINE_SECONDS);
  });

  it("produces no blocking flag in any generated argv except the one command the registry allows", () => {
    assert.ok(spawning.length >= 25, "expected the spawning surface to be non-trivial");
    const allowed: string[] = [];
    for (const spec of spawning) {
      const key = spec.cli as CliCommandKey;
      const argv = buildArgv(key, {});
      const carries = FORBIDDEN_FLAGS.filter((forbidden) => argv.includes(`--${forbidden}`));
      if (carries.length === 0) {
        continue;
      }
      allowed.push(spec.name);
      // The exception is not a loosening of the rule, it is a registry fact:
      // the flag can only appear because `requiresWait` is declared, and the
      // caller still cannot express it. See the next test for the ordering.
      assert.equal(
        registryEntry(key).requiresWait !== undefined,
        true,
        `${spec.name} produced --wait without declaring requiresWait`,
      );
    }
    assert.deepEqual(
      allowed,
      ["wm_sandbox_access_refresh_apply"],
      "exactly one tool may carry the wait allowlist",
    );
  });

  it("keeps the CLI's wait budget strictly inside the executor's death clock", () => {
    // The ordering is the whole point of the exception. If the CLI's own
    // timeout were larger, the executor would SIGKILL it mid-write, and a
    // half-written connection profile cannot be told apart from a complete one.
    const waiting = (Object.keys(CLI_COMMANDS) as CliCommandKey[]).filter(
      (key) => registryEntry(key).requiresWait !== undefined,
    );
    assert.deepEqual(waiting, ["sandboxAccessRefresh"]);
    for (const key of waiting) {
      const budget = registryEntry(key).requiresWait ?? 0;
      const deathClock = Math.max(DEFAULT_TIMEOUT_MS, budget * 1000 + WAIT_HEADROOM_MS);
      assert.ok(
        budget * 1000 < deathClock,
        `${key} must be allowed to expire before the executor kills it`,
      );
      assert.ok(WAIT_HEADROOM_MS > 0, "the headroom must be positive to be a guarantee");
      const argv = buildArgv(key, {});
      assert.deepEqual(argv.slice(-4), ["--wait", "--timeout-seconds", String(budget), "--json"]);
    }
  });

  it("refuses a blocking flag instead of filtering it", () => {
    for (const spec of spawning) {
      assert.throws(() => buildArgv(spec.cli as CliCommandKey, { wait: "true" }), CliDeniedError);
      assert.throws(
        () => buildArgv(spec.cli as CliCommandKey, { "timeout-seconds": "600" }),
        CliDeniedError,
      );
    }
  });

  it("passes an idempotency key exactly where the registry says the CLI takes one", () => {
    // The CLI mints a fresh key per invocation when none is supplied, so a retry
    // after a timeout is normally two independent requests. The server supplies
    // one when it can prove the command accepts it - and never lets a client
    // choose it.
    for (const spec of ALL_TOOL_SPECS) {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(toolFlags(spec), "idempotencyKey"),
        `${spec.name} must not let a client choose the idempotency key`,
      );
      assert.ok(
        !Object.prototype.hasOwnProperty.call(toolFlags(spec), "idempotency-key"),
        `${spec.name} must not expose the raw flag either`,
      );

      if (spec.kind !== "apply" || spec.cli === undefined) {
        continue;
      }
      const accepts = acceptsIdempotencyKey(spec.cli);
      const effective = effectiveArgv(["cmd"], "nonce_fixture", accepts);
      assert.equal(
        effective.includes("--idempotency-key"),
        accepts,
        `${spec.name} must supply a key exactly when the CLI accepts one`,
      );
      if (accepts) {
        assert.equal(effective[effective.length - 1], idempotencyKeyFor("nonce_fixture"));
      }
    }

    // No non-destructive command is marked, because no source confirms the flag
    // for one: `warpmetal --help` prints it only for `order prepare`,
    // `server power`, `server reload` and `notifications *`, and the vendor's
    // CLI reference only for `runtime enable`. An unsupported flag is exit 2
    // before anything runs, so an unproven `true` breaks the tool rather than
    // merely losing deduplication.
    for (const key of [
      "runtimeEnable",
      "runtimeInstall",
      "sandboxCreate",
      "sandboxAction",
      "sandboxAccessKeygen",
      "sandboxAccessGrant",
      "sandboxDelete",
      "sandboxAccessRevoke",
    ] as const) {
      assert.equal(
        acceptsIdempotencyKey(key),
        false,
        `${key} must not be marked idempotent without a source confirming the flag`,
      );
    }
    assert.equal(acceptsIdempotencyKey("sandboxGet"), false);

    // Two of the irreversible commands are marked. These are the commands where
    // the installed CLI's own `--help` and the vendor's CLI reference agree
    // that the flag exists, which is the entire test. Everything else stays off.
    for (const key of ["serverPower", "serverReload"] as const) {
      assert.equal(
        acceptsIdempotencyKey(key),
        true,
        `${key} is marked idempotent by both sources and must supply the key`,
      );
    }

    // The mechanism stays wired, so marking one command later is a one-line
    // change rather than a new code path: minting binds the key into the digest
    // and verifying recomputes it from the nonce.
    const store = new ApprovalStore();
    const minted = store.mint({
      tool: "wm_fixture_apply",
      subcommand: "fixture",
      argv: ["cmd", "--json"],
      idempotent: true,
      effect: "a fixture effect",
    });
    assert.match(minted.argv.join(" "), /--idempotency-key mcp-[0-9a-f]{32}$/);
    const okVerdict = store.verify(minted.token, {
      tool: "wm_fixture_apply",
      subcommand: "fixture",
      argv: ["cmd", "--json"],
      idempotent: true,
    });
    assert.equal(okVerdict.ok, true);
    assert.equal(okVerdict.ok === true ? okVerdict.argv.join(" ") : null, minted.argv.join(" "));
    // A key the token did not authorise is a mismatch, not a silent extra flag.
    const crossed = store.verify(minted.token, {
      tool: "wm_fixture_apply",
      subcommand: "fixture",
      argv: ["cmd", "--json", "--idempotency-key", "mcp-other"],
      idempotent: true,
    });
    assert.equal(crossed.ok, false);
  });
});

describe("6. exit-code mapping", () => {
  it("covers the documented codes exactly", () => {
    assert.deepEqual(KNOWN_EXIT_CODES, [0, 1, 2, 3, 4, 5, 6, 7, 8, 11]);
  });

  it("maps every known code and never lets an unknown one look ordinary", () => {
    for (const code of KNOWN_EXIT_CODES) {
      const mapping = mapExitCode(code);
      assert.equal(mapping.known, true);
      assert.equal(mapping.ok, code === 0);
    }
    const unknown = mapExitCode(42);
    assert.equal(unknown.known, false, "an unmapped code must be flagged as unknown");
    assert.equal(unknown.status, "FAILED");
    assert.equal(unknown.ok, false);
  });

  it("only reports statuses that exist", () => {
    for (const status of Object.values(EXIT_STATUS)) {
      assert.ok(WM_STATUSES.includes(status), `${status} is not a declared status`);
    }
  });

  it("reports UNAVAILABLE for exit 3 with the payload preserved", async () => {
    const fake = fakeRunner(HEALTH_PAUSED_FIXTURE, { exitCode: 3 });
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_health");
      assert.equal(result.envelope["status"], "UNAVAILABLE");
      assert.equal(result.envelope["exit_code"], 3);
      assert.equal(result.isError, false, "a paused service is an observation, not a tool failure");
      const data = result.envelope["data"] as Record<string, unknown>;
      assert.equal(data["purchasingReady"], false);
      const warnings = result.envelope["warnings"] as string[];
      assert.ok(warnings.some((entry) => entry.startsWith("purchasing_unavailable")));
      const next = result.envelope["next_actions"] as Array<{ tool: string }>;
      assert.ok(next.some((entry) => entry.tool === "wm_catalog"));
    } finally {
      await session.close();
    }
  });

  it("reports PENDING for exit 8 and MANUAL_REVIEW for exit 6", async () => {
    // `order status` emits `{ task, nextAction? }`: a flat fixture here would be
    // testing a payload the CLI never sends, and the manual_review warning is
    // exactly the one that must fire in production.
    const pendingTask = { task: { id: "task_fixture_01", state: "pending" } };
    const pending = await connect(fakeRunner(pendingTask, { exitCode: 8 }).runner);
    try {
      const result = await call(pending.client, "wm_order_status", { taskId: "task_fixture_01" });
      assert.equal(result.envelope["status"], "PENDING");
      assert.equal(result.isError, false);
    } finally {
      await pending.close();
    }

    const reviewTask = { task: { id: "task_fixture_01", state: "manual_review" } };
    const review = await connect(fakeRunner(reviewTask, { exitCode: 6 }).runner);
    try {
      const result = await call(review.client, "wm_order_status", { taskId: "task_fixture_01" });
      assert.equal(result.envelope["status"], "MANUAL_REVIEW");
      assert.equal(result.isError, true);
      const warnings = result.envelope["warnings"] as string[];
      assert.ok(warnings.some((entry) => entry.startsWith("manual_review_terminal")));
    } finally {
      await review.close();
    }
  });

  it("reports an unknown exit code with an explicit warning", async () => {
    const fake = fakeRunner(HEALTH_FIXTURE, { exitCode: 99, stderr: "something odd happened" });
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_health");
      assert.equal(result.envelope["status"], "FAILED");
      const warnings = result.envelope["warnings"] as string[];
      assert.ok(warnings.some((entry) => entry.startsWith("unknown_exit_code")));
      const errors = result.envelope["errors"] as string[];
      assert.ok(errors.some((entry) => entry.includes("something odd happened")));
    } finally {
      await session.close();
    }
  });

  it("reports a spawn failure as FAILED rather than as a silent success", async () => {
    const failing: Runner = {
      run() {
        return Promise.resolve({
          exitCode: -1,
          timedOut: false,
          stdout: "",
          stderr: "spawn error: ENOENT",
          json: null,
          jsonFound: false,
          durationMs: 1,
          warnings: [],
          subcommand: "health",
        });
      },
    };
    const session = await connect(failing);
    try {
      const result = await call(session.client, "wm_health");
      assert.equal(result.envelope["status"], "FAILED");
      assert.equal(result.isError, true);
      assert.equal(result.envelope["data"], null);
    } finally {
      await session.close();
    }
  });

  it("surfaces an unresolvable CLI as FAILED with an actionable message", async () => {
    const runner: Runner = {
      run() {
        return Promise.reject(
          new CliResolutionError("warpmetal CLI not found. Install it with: npm install -g warpmetal", [
            "C:\\nodejs\\node_modules\\warpmetal",
          ]),
        );
      },
    };
    const session = await connect(runner);
    try {
      const result = await call(session.client, "wm_version");
      assert.equal(result.envelope["status"], "FAILED");
      assert.ok(result.text.includes("npm install -g warpmetal"));
      assert.ok(result.text.includes("cli_unavailable"));
    } finally {
      await session.close();
    }
  });
});

describe("7. contract fixtures", () => {
  it("parses pretty-printed JSON that is preceded by progress lines", () => {
    const stdout = [
      "checking service",
      "still checking",
      '{"status":"ok",',
      ' "nested":{"deep":[1,2,3]}}',
    ].join("\n");
    const parsed = extractJson(stdout);
    assert.equal(parsed.found, true);
    assert.deepEqual(parsed.value, { status: "ok", nested: { deep: [1, 2, 3] } });

    const absent = extractJson("no payload here\n");
    assert.equal(absent.found, false);
    assert.equal(absent.value, null);
  });

  it("preserves the live health shape", async () => {
    const session = await connect(fakeRunner(HEALTH_FIXTURE).runner);
    try {
      const result = await call(session.client, "wm_health");
      assert.equal(result.envelope["status"], "OBSERVED");
      assert.ok(wmResultSchema.safeParse(result.envelope).success);
      const data = result.envelope["data"] as Record<string, unknown>;
      assert.equal(data["purchasingReady"], true);
      assert.equal(data["service"], "warpmetal-backend");
      assert.equal((data["dependencies"] as Record<string, unknown>)["sshProof"], true);
      assert.deepEqual(result.envelope["warnings"], []);
    } finally {
      await session.close();
    }
  });

  it("returns the catalog untruncated, including every runtime size", async () => {
    const session = await connect(fakeRunner(CATALOG_FIXTURE).runner);
    try {
      const result = await call(session.client, "wm_catalog");
      assert.equal(result.envelope["status"], "OBSERVED");
      const data = result.envelope["data"] as Record<string, unknown>;
      assert.equal(data["pricingRevision"], CATALOG_FIXTURE.pricingRevision);
      const products = data["products"] as Array<Record<string, unknown>>;
      assert.equal(products.length, 1);
      const runtime = products[0]?.["agentRuntime"] as {
        supported: boolean;
        sizes: Array<{ id: string }>;
      };
      assert.equal(runtime.supported, true);
      assert.deepEqual(
        runtime.sizes.map((size) => size.id),
        ["small", "medium", "large", "xlarge"],
      );
      // The whole payload must survive: dropping products or sizes silently
      // would make every later decision wrong.
      assert.ok(result.text.length > 500, "the catalog payload looks truncated");
    } finally {
      await session.close();
    }
  });

  it("reads the live state shape and redacts the private key path", async () => {
    const session = await connect(fakeRunner(STATE_FIXTURE).runner);
    try {
      const result = await call(session.client, "wm_state_list");
      assert.equal(result.envelope["status"], "OBSERVED");
      const data = result.envelope["data"] as Record<string, unknown>;
      assert.equal(data["stateFile"], STATE_FIXTURE.stateFile);
      assert.equal((data["servers"] as unknown[]).length, 1);
      assert.equal((data["sandboxes"] as unknown[]).length, 1);
      assert.equal((data["runtimes"] as unknown[]).length, 1);
      assert.ok(result.text.includes("ready"), "public runtime metadata must survive");

      const identities = data["identities"] as Array<Record<string, unknown>>;
      assert.equal(identities[0]?.["privateKeyPath"], "[REDACTED]");
      assert.equal(identities[0]?.["publicKeyPath"], "C:\\keys\\warpmetal-fixture.pub");
      // The private path is a strict prefix of the public one, so the only
      // precise check is on the field itself.
      assert.match(
        result.text,
        /"privateKeyPath":\s*"\[REDACTED\]"/,
        "privateKeyPath must be redacted in the text channel too",
      );
      assert.ok((result.envelope["redacted"] as string[]).includes("$.identities[0].privateKeyPath"));
    } finally {
      await session.close();
    }
  });

  it("reports an expiring temporary sandbox as a warning", async () => {
    // `sandbox get` emits `{ sandbox: { observedState, lifetime, expiresAt } }`.
    // The nesting matters here: a flat fixture would have hidden the fact that
    // the expiry warning never fired against a real payload.
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const fake = fakeRunner({
      sandbox: {
        id: "sbx_fixture_01",
        observedState: "running",
        desiredState: "running",
        lifetime: "temporary",
        expiresAt,
      },
    });
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_sandbox_get", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
      });
      const warnings = result.envelope["warnings"] as string[];
      assert.ok(warnings.some((entry) => entry.startsWith("sandbox_expiring_soon")));
      assert.match(String(result.envelope["summary"]), /sandbox running \(temporary\)/);
    } finally {
      await session.close();
    }
  });
});

describe("8. approval gate", () => {
  const READY_SERVER = { status: "ready" };

  it("refuses an apply with no token, without spawning anything", async () => {
    const fake = fakeRunner(READY_SERVER);
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
      });
      assert.equal(result.envelope["status"], "APPROVAL_REQUIRED");
      assert.equal(result.envelope["exit_code"], APPROVAL_REQUIRED_EXIT_CODE);
      assert.equal(result.isError, true);
      assert.equal(fake.calls.length, 0, "no process may be spawned without a token");
      const approval = result.envelope["approval"] as Record<string, unknown>;
      assert.equal(approval["state"], "required");
      assert.equal(approval["token"], undefined, "a refusal must not mint a token");
    } finally {
      await session.close();
    }
  });

  it("consumes the token on the happy path and refuses a replay", async () => {
    const fake = fakeRunner({ status: "ready", operationId: "op_gate_01" });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_runtime_enable_plan", {
        serverId: "srv_fixture_01",
      });
      const token = String(
        (planned.envelope["approval"] as Record<string, unknown>)["token"],
      );

      const first = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: token,
      });
      assert.equal(first.envelope["status"], "OBSERVED");
      assert.equal((first.envelope["approval"] as Record<string, unknown>)["state"], "granted");
      assert.equal(fake.calls.length, 3, "two plan probes and exactly one apply");

      const second = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: token,
      });
      assert.equal(second.envelope["status"], "DENIED");
      assert.equal(second.envelope["exit_code"], DENIED_EXIT_CODE);
      const warnings = second.envelope["warnings"] as string[];
      assert.ok(
        warnings.some((entry) => entry.includes("already used")),
        "a replay must say the token was consumed",
      );
      assert.equal(fake.calls.length, 3, "the replay must not spawn a process");
    } finally {
      await session.close();
    }
  });

  it("refuses a token issued for a different action on the same tool", async () => {
    const fake = fakeRunner({ observedState: "running", status: "running", operationId: "op_x" });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_action_plan", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        action: "stop",
      });
      const token = String((planned.envelope["approval"] as Record<string, unknown>)["token"]);
      const callsAfterPlan = fake.calls.length;

      const crossed = await call(session.client, "wm_sandbox_action_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        action: "restart",
        approvalToken: token,
      });
      assert.equal(crossed.envelope["status"], "DENIED");
      const warnings = crossed.envelope["warnings"] as string[];
      assert.ok(
        warnings.some((entry) => entry.includes("different effect")),
        "a token for stop must not authorise restart",
      );
      assert.equal(fake.calls.length, callsAfterPlan, "the crossed token must not spawn a process");
    } finally {
      await session.close();
    }
  });

  it("refuses a token whose effect was never planned by this server", async () => {
    const fake = fakeRunner(READY_SERVER);
    const session = await connect(fake.runner);
    try {
      const forged = Buffer.from(
        JSON.stringify({ v: 1, tool: "wm_runtime_enable_apply", subcommand: "runtime enable" }),
      ).toString("base64url");
      const result = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: `${forged}.notasignature`,
      });
      assert.equal(result.envelope["status"], "DENIED");
      const warnings = result.envelope["warnings"] as string[];
      assert.ok(warnings.some((entry) => entry.includes("not a token this server issued")));
      assert.equal(fake.calls.length, 0);
    } finally {
      await session.close();
    }
  });

  it("refuses an expired token", async () => {
    // The store is exercised directly: an expiry cannot be waited out in a test.
    const store = new ApprovalStore();
    const argv = ["runtime", "enable", "--server", "srv_fixture_01", "--json"];
    const minted = store.mint({
      tool: "wm_runtime_enable_apply",
      subcommand: "runtime enable",
      argv,
      effect: "enable the runtime",
      idempotent: false,
      ttlMs: 1_000,
      now: 0,
    });
    const verdict = store.verify(
      minted.token,
      { tool: "wm_runtime_enable_apply", subcommand: "runtime enable", argv, idempotent: false },
      60_000,
    );
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false ? verdict.reason : null, "expired");
  });

  it("binds the token to the resolved argv, including the server's constants", () => {
    const applySpec = ALL_TOOL_SPECS.find((spec) => spec.name === "wm_sandbox_action_apply");
    assert.ok(applySpec, "wm_sandbox_action_apply must exist");
    const argv = effectArgvOf(applySpec, {
      serverId: "srv_fixture_01",
      sandboxId: "sbx_fixture_01",
      action: "start",
    });
    assert.deepEqual(argv, [
      "sandbox",
      "action",
      "--server",
      "srv_fixture_01",
      "--sandbox",
      "sbx_fixture_01",
      "--action",
      "start",
      // The confirmation is a server constant derived from the action, and it
      // is part of what the token covers.
      "--confirm",
      "start",
      "--json",
    ]);
  });

  it("does not consume an approval when the outcome is unknown", async () => {
    const fake = sequenceRunner([
      { payload: READY_SERVER },
      { payload: READY_SERVER },
      { payload: null, exitCode: TIMEOUT_EXIT_CODE },
      { payload: null, exitCode: TIMEOUT_EXIT_CODE },
    ]);
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_runtime_enable_plan", {
        serverId: "srv_fixture_01",
      });
      const token = String((planned.envelope["approval"] as Record<string, unknown>)["token"]);

      const timedOut = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: token,
      });
      assert.equal(timedOut.envelope["status"], "FAILED");
      assert.equal((timedOut.envelope["approval"] as Record<string, unknown>)["state"], "granted");
      const warnings = timedOut.envelope["warnings"] as string[];
      assert.ok(
        warnings.some((entry) => entry.includes("approval_not_consumed")),
        "an unknown outcome must say the approval survives",
      );
      assert.ok(
        warnings.some((entry) => entry.includes("no idempotency key")),
        "the tool must be honest that a retry is a second request while the flag is unproven",
      );

      const retry = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: token,
      });
      assert.notEqual(retry.envelope["status"], "DENIED", "the retry must not be refused as a replay");
      assert.equal((retry.envelope["approval"] as Record<string, unknown>)["state"], "granted");
      assert.equal(fake.calls.length, 4, "two plan probes and two applies actually ran");

      // The honest state while the flag is unproven: neither attempt carries an
      // idempotency key, so the API cannot deduplicate them and the two calls
      // really are two requests. The test records that rather than pretending
      // otherwise; flipping `idempotent` on a command in the registry is what
      // would change this line's expectation.
      const applied = fake.calls.filter((entry) => entry.key === "runtimeEnable");
      assert.equal(applied.length, 2);
      for (const entry of applied) {
        assert.equal(
          entry.flags["idempotency-key"],
          undefined,
          "no key may be sent for a command whose support is unconfirmed",
        );
      }
    } finally {
      await session.close();
    }
  });
  it("states the irreversible consequences of a temporary sandbox in the effect", async () => {
    const fake = keyedRunner({
      catalog: CATALOG_FIXTURE,
      serverGet: { task: { id: "srv_fixture_01", planId: "agent", osName: "ubuntu-24.04", state: "ready" } },
      runtimeGet: { runtime: { state: "ready", desiredRevision: 14, appliedRevision: 14 } },
      sandboxList: { runtime: { state: "ready" }, sandboxes: [] },
    });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_create_plan", {
        serverId: "srv_fixture_01",
        name: "agent-1",
        size: "small",
        lifetime: "temporary",
        expiresInSeconds: 3600,
      });
      assert.equal(planned.envelope["status"], "PLANNED");
      const approval = planned.envelope["approval"] as Record<string, unknown>;
      assert.equal(approval["state"], "required");
      assert.equal(typeof approval["token"], "string");
      assert.ok(
        String(planned.text).includes(String(approval["token"])),
        "the token must be visible in the text channel the model relays",
      );

      // The human approves the effect, so the effect must name the damage.
      const effect = String(approval["effect"]);
      for (const phrase of [
        "permanently deleted",
        "terminated",
        "revoked",
        "cannot be extended",
      ]) {
        assert.ok(effect.includes(phrase), `the effect must state that the workspace is ${phrase}`);
      }

      // And the plan must be honest about what it could not check.
      const data = planned.envelope["data"] as Record<string, unknown>;
      const verification = data["verification"] as Record<string, unknown>;
      assert.equal(verification["planCheckedAgainst"], "live server planId");
      assert.equal(verification["sizeCheckedAgainst"], "live catalog agentRuntime.sizes");
      assert.equal(
        verification["osCheckedAgainst"],
        "live catalog operatingSystems[].agentRuntimeSupported",
      );
      assert.equal(verification["nameCheckedAgainst"], "live sandbox list");
      assert.equal(verification["capacityChecked"], true, "capacity is checkable and must be checked");
      assert.ok(String(verification["capacityNote"]).length > 20);
    } finally {
      await session.close();
    }
  });

  it("refuses a plan when the runtime cannot be verified, without minting a token", async () => {
    // The runtime answers, but not with a state that can accept a sandbox.
    const degraded = keyedRunner({
      catalog: CATALOG_FIXTURE,
      serverGet: { task: { id: "srv_fixture_01", planId: "agent", osName: "ubuntu-24.04" } },
      runtimeGet: { runtime: { state: "degraded" } },
      sandboxList: { sandboxes: [] },
    });
    const session = await connect(degraded.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_create_plan", {
        serverId: "srv_fixture_01",
        name: "agent-1",
        size: "small",
      });
      assert.equal(planned.envelope["status"], "DENIED");
      assert.equal(planned.envelope["exit_code"], DENIED_EXIT_CODE);
      assert.equal(
        (planned.envelope["approval"] as Record<string, unknown> | undefined)?.["token"],
        undefined,
      );
      // The refusal names the state it found, so the operator knows what to fix.
      assert.match(
        String(planned.envelope["summary"]),
        /degraded/,
        "the refusal must quote the runtime state it observed",
      );
      const errors = planned.envelope["errors"] as string[];
      assert.ok(errors.some((entry) => entry.includes("must report ready")));
    } finally {
      await session.close();
    }
  });

  it("refuses a plan for an OS the catalog says cannot host Agent Runtime", async () => {
    // The CLI requires both the product flag and the per-OS flag; checking only
    // the first would authorise a command the CLI then refuses with exit 2.
    const fake = keyedRunner({
      catalog: CATALOG_FIXTURE,
      serverGet: { task: { id: "srv_fixture_01", planId: "agent", osName: "debian-12" } },
      runtimeGet: { runtime: { state: "ready" } },
      sandboxList: { sandboxes: [] },
    });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_create_plan", {
        serverId: "srv_fixture_01",
        name: "agent-1",
        size: "small",
      });
      assert.equal(planned.envelope["status"], "DENIED");
      assert.match(String(planned.envelope["summary"]), /debian-12/);
    } finally {
      await session.close();
    }
  });

  it("refuses a plan for a size the server's own plan does not publish", async () => {
    const fake = keyedRunner({
      catalog: CATALOG_FIXTURE,
      serverGet: { task: { id: "srv_fixture_01", planId: "unknown-plan", osName: "ubuntu-24.04" } },
      runtimeGet: { runtime: { state: "ready" } },
      sandboxList: { sandboxes: [] },
    });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_create_plan", {
        serverId: "srv_fixture_01",
        name: "agent-1",
        size: "small",
      });
      assert.equal(planned.envelope["status"], "DENIED");
      assert.match(String(planned.envelope["summary"]), /unknown-plan/);
    } finally {
      await session.close();
    }
  });
});

describe("9. destructive surface, gated and enumerated", () => {
  it("reaches only the destructive verbs the registry declares, and no others", () => {
    const reachable = Object.values(CLI_COMMANDS).map((command) => command.argv.join(" "));
    // Now reachable, each behind a consequence gate and a TOCTOU re-check.
    for (const subcommand of [
      "server power",
      "server reload",
      "sandbox delete",
      "sandbox access revoke",
      "sandbox access refresh",
    ]) {
      assert.ok(
        reachable.includes(subcommand),
        `${subcommand} is declared by the registry and must be reachable`,
      );
    }
    // Still deferred, with a reason. `install-ssh` and `remove-ssh` write the
    // user's ~/.ssh/config; `connect` is interactive and cannot be a tool;
    // `order prepare` and `server delete` need spending authority and a wider
    // review than a token. Their absence is still the guarantee for them.
    for (const subcommand of [
      "sandbox access install-ssh",
      "sandbox access remove-ssh",
      "sandbox connect",
      "server delete",
      "order prepare",
    ]) {
      assert.ok(
        !reachable.includes(subcommand),
        `${subcommand} is out of scope and must not be reachable`,
      );
    }
  });

  it("exposes exactly start, stop and restart as sandbox actions", () => {
    // The non-destructive surface assertion stands as a regression guard, which
    // is exactly why the irreversible lifecycle actions live in their own tool
    // rather than here.
    assert.deepEqual([...sandboxActions], ["start", "stop", "restart"]);
    const spec = ALL_TOOL_SPECS.find((entry) => entry.name === "wm_sandbox_action_plan");
    assert.ok(spec);
    const schema = z.toJSONSchema(spec.input, { io: "input" }) as {
      properties?: Record<string, { enum?: unknown }>;
    };
    assert.deepEqual(
      schema.properties?.["action"]?.enum,
      ["start", "stop", "restart"],
      "the schema must not offer a destructive action",
    );
    const lifecycle = ALL_TOOL_SPECS.find(
      (entry) => entry.name === "wm_sandbox_lifecycle_plan",
    );
    assert.ok(lifecycle, "the irreversible lifecycle actions need their own tool");
    const lifecycleSchema = z.toJSONSchema(lifecycle.input, { io: "input" }) as {
      properties?: Record<string, { enum?: unknown }>;
    };
    assert.deepEqual(
      lifecycleSchema.properties?.["action"]?.enum,
      ["make_persistent", "refresh_image"],
    );
  });

  it("requires a plan half for every apply, and a consequence for every erasing pair", () => {
    for (const spec of ALL_TOOL_SPECS) {
      const kind = spec.kind ?? "read";
      if (kind === "apply") {
        assert.ok(spec.approvalSource, `${spec.name} is an apply and must name its plan tool`);
        assert.ok(
          ALL_TOOL_SPECS.some((entry) => entry.name === spec.approvalSource),
          `${spec.name} points at a plan tool that does not exist`,
        );
      }
      // A consequence is only ever meaningful on an apply; a plan that declared
      // one would be promising damage it cannot do.
      if (kind !== "apply") {
        assert.equal(spec.consequence, undefined, `${spec.name} declares a consequence but is not an apply`);
      }
    }
    const plans = ALL_TOOL_SPECS.filter((spec) => spec.kind === "plan").map((spec) => spec.name);
    const applies = ALL_TOOL_SPECS.filter((spec) => spec.kind === "apply").map((spec) => spec.name);
    assert.equal(plans.length, 12);
    assert.equal(applies.length, 12);
    for (const apply of applies) {
      assert.ok(plans.includes(apply.replace(/_apply$/, "_plan")), `${apply} has no plan half`);
    }

    // The five erasing pairs must re-verify in the apply, which is what makes
    // the TOCTOU window between plan and apply closed rather than assumed.
    for (const name of [
      "wm_server_power_apply",
      "wm_server_reload_apply",
      "wm_sandbox_delete_apply",
      "wm_sandbox_lifecycle_apply",
      "wm_sandbox_access_revoke_apply",
      "wm_sandbox_access_refresh_apply",
    ]) {
      const spec = ALL_TOOL_SPECS.find((entry) => entry.name === name);
      assert.ok(spec, `${name} must exist`);
      assert.ok(spec.consequence, `${name} must declare a consequence`);
      assert.ok(spec.preflight, `${name} must re-verify against live data in the apply`);
    }
  });

  it("keeps every plan's effect declaration identical to its apply", () => {
    // The plan resolves its flags from `mintsFor` and the apply resolves its own
    // from `spec.flags`. If those drift, the effect a human reads and the argv
    // that runs stop describing the same thing. Comparing them here is what makes
    // that a test failure instead of a sentence nobody can verify.
    const byName = new Map(ALL_TOOL_SPECS.map((spec) => [spec.name, spec]));
    const plans = ALL_TOOL_SPECS.filter((spec) => spec.kind === "plan");
    assert.equal(plans.length, 12);

    for (const plan of plans) {
      const decl = plan.mintsFor;
      assert.ok(decl !== undefined, `${plan.name} must declare what it authorises`);
      const apply = byName.get(decl.tool);
      assert.ok(apply !== undefined, `${plan.name} points at an unregistered apply`);
      assert.equal(apply.kind, "apply", `${decl.tool} must be an apply tool`);

      assert.deepEqual(
        decl.flags,
        apply.flags,
        `${plan.name} and ${decl.tool} must declare the same flags, or the effect lies`,
      );
      assert.equal(
        decl.constants,
        apply.constants,
        `${decl.tool} must supply the same safety constants the plan authorised`,
      );
      // The consequence lives on both, from one declaration, for the same
      // reason: the word the plan names and the word the apply demands must be
      // produced by the same function.
      assert.equal(
        decl.consequence,
        apply.consequence,
        `${decl.tool} must demand the consequence the plan named`,
      );
      assert.equal(apply.approvalSource, plan.name, `${decl.tool} must name its own plan`);
      assert.equal(apply.mintsFor, undefined, "an apply must not mint approvals");
      assert.equal(plan.approvalSource, undefined, "a plan must not consume approvals");
    }
  });

  it("keeps the destructive verbs out of the non-destructive mutation surface", () => {
    // A regression guard on the promise this group makes: `wm_sandbox_action`
    // must not have grown a destructive action, and no non-destructive pair may
    // have been quietly re-pointed at a command that erases.
    const nonDestructive = ALL_TOOL_SPECS.filter(
      (spec) =>
        (spec.kind === "plan" || spec.kind === "apply") &&
        (spec.name.startsWith("wm_runtime_") ||
          spec.name.startsWith("wm_sandbox_create") ||
          spec.name.startsWith("wm_sandbox_action") ||
          spec.name.startsWith("wm_sandbox_access_keygen") ||
          spec.name.startsWith("wm_sandbox_access_grant")),
    );
    assert.equal(nonDestructive.length, 12, "the six non-destructive pairs must still be present");
    for (const spec of nonDestructive) {
      assert.equal(spec.consequence, undefined, `${spec.name} must not have acquired a consequence`);
      assert.equal(spec.annotations.destructiveHint, false, `${spec.name} must remain non-destructive`);
    }
  });
});

describe("10. safety constants never come from the client", () => {
  it("exposes no confirm field in any input schema", () => {
    for (const spec of ALL_TOOL_SPECS) {
      const properties = toolFlags(spec);
      assert.ok(
        !Object.prototype.hasOwnProperty.call(properties, "confirm"),
        `${spec.name} exposes a confirm field`,
      );
      // The irreversible additions, for the same reason: a blocking flag or a
      // safety boolean a client could set is a safety boolean a client could
      // unset. `--wait` is expressed only by `requiresWait` in the registry, and
      // the two booleans only by `constants`.
      for (const forbidden of [
        "wait",
        "timeoutSeconds",
        "timeout-seconds",
        "powerOffFirst",
        "power-off-first",
        "acknowledgeAgentRuntimeReset",
        "acknowledge-agent-runtime-reset",
        "idempotencyKey",
      ]) {
        assert.ok(
          !Object.prototype.hasOwnProperty.call(properties, forbidden),
          `${spec.name} exposes ${forbidden}, which is the server's to decide`,
        );
      }
      const isApply = (spec.kind ?? "read") === "apply";
      assert.equal(
        Object.prototype.hasOwnProperty.call(properties, "approvalToken"),
        isApply,
        `${spec.name} approvalToken presence is wrong for its kind`,
      );
      // The acknowledgement is present exactly on an apply that can cause
      // damage, so a tool that cannot destroy never asks for one.
      const needsConsequence = isApply && spec.consequence !== undefined;
      assert.equal(
        Object.prototype.hasOwnProperty.call(properties, "acknowledgedConsequence"),
        needsConsequence,
        `${spec.name} acknowledgedConsequence presence is wrong for its consequence`,
      );
    }
  });

  it("rejects a client-supplied confirm before the runner sees it", async () => {
    const fake = fakeRunner({ status: "ready" });
    const session = await connect(fake.runner);
    try {
      let rejected = false;
      try {
        const result = await call(session.client, "wm_runtime_install_apply", {
          serverId: "srv_fixture_01",
          approvalToken: "x".repeat(32),
          confirm: "INSTALL",
        });
        rejected = result.isError === true;
      } catch {
        rejected = true;
      }
      assert.equal(rejected, true, "a client must not be able to supply --confirm");
      assert.equal(fake.calls.length, 0);
    } finally {
      await session.close();
    }
  });

  it("supplies the constants itself, derived from the resolved flags", () => {
    const install = ALL_TOOL_SPECS.find((spec) => spec.name === "wm_runtime_install_apply");
    assert.ok(install);
    assert.deepEqual(effectArgvOf(install, { serverId: "srv_fixture_01" }), [
      "runtime",
      "install",
      "--server",
      "srv_fixture_01",
      "--confirm",
      "INSTALL",
      "--ssh-user",
      "root",
      "--json",
    ]);

    const temporary = ALL_TOOL_SPECS.find((spec) => spec.name === "wm_sandbox_create_apply");
    assert.ok(temporary);
    const withLifetime = effectArgvOf(temporary, {
      serverId: "srv_fixture_01",
      name: "agent-1",
      size: "small",
      lifetime: "temporary",
      expiresInSeconds: 3600,
    });
    assert.ok(withLifetime.includes("--confirm"));
    assert.equal(withLifetime[withLifetime.indexOf("--confirm") + 1], "TEMPORARY");

    const persistent = effectArgvOf(temporary, {
      serverId: "srv_fixture_01",
      name: "agent-1",
      size: "small",
    });
    assert.ok(
      !persistent.includes("--confirm"),
      "a persistent sandbox must not carry the temporary confirmation",
    );
  });
});

function effectArgvOf(spec: WmToolSpec, args: Record<string, unknown>): string[] {
  const decl: EffectDeclaration = {
    tool: spec.name,
    cli: spec.cli as CliCommandKey,
    flags: spec.flags ?? {},
  };
  if (spec.constants !== undefined) {
    decl.constants = spec.constants;
  }
  return resolveEffectArgv(decl, args);
}

describe("11. task registry", () => {
  it("holds identifiers only, and stays bounded", () => {
    const registry = new TaskRegistry(3);
    for (let index = 0; index < 4; index += 1) {
      registry.register({
        taskId: `op_${String(index)}`,
        kind: "operation",
        label: `operation ${String(index)}`,
        observeWith: "wm_operation_get",
        lastStatus: "pending",
        // A flag value must never be stored: this is the shape a record may have.
      });
    }
    assert.equal(registry.size, 3, "the registry must evict rather than grow");
    assert.equal(registry.get("op_0"), null, "the oldest entry must be the one evicted");
    assert.ok(registry.get("op_3"));

    const allowed = new Set([
      "taskId",
      "kind",
      "label",
      "createdAt",
      "observeWith",
      "serverId",
      "sandboxId",
      "sandboxName",
      "lastStatus",
      "lastObservedAt",
    ]);
    for (const record of registry.list()) {
      for (const key of Object.keys(record)) {
        assert.ok(allowed.has(key), `TaskRecord carries an unexpected field: ${key}`);
      }
    }
    // Re-registration refreshes rather than duplicating.
    registry.register({
      taskId: "op_3",
      kind: "operation",
      label: "operation 3 again",
      observeWith: "wm_operation_get",
    });
    assert.equal(registry.size, 3);
  });

  it("marks a record as stale once it has not been observed recently", () => {
    const registry = new TaskRegistry();
    const registeredAt = 1_000_000;
    registry.register(
      {
        taskId: "op_stale",
        kind: "operation",
        label: "operation stale",
        observeWith: "wm_operation_get",
      },
      registeredAt,
    );
    const registered = registry.get("op_stale");
    assert.ok(registered, "the record must have been registered");
    const fresh = registry.observed(registered, registeredAt + 1_000);
    assert.equal(fresh.stale, false);
    const stale = registry.observed(registered, registeredAt + 16 * 60 * 1000);
    assert.equal(stale.stale, true, "an unobserved task must be flagged, not presented as current");
  });

  it("lists an empty registry honestly and refuses an unknown task", async () => {
    const session = await connect(fakeRunner({}).runner);
    try {
      const list = await call(session.client, "wm_task_list");
      assert.equal(list.envelope["status"], "OBSERVED");
      const data = list.envelope["data"] as Record<string, unknown>;
      assert.equal(data["count"], 0);
      const warnings = list.envelope["warnings"] as string[];
      assert.ok(
        warnings.some((entry) => entry.includes("task_registry_empty")),
        "an empty registry must not look like a successful sweep",
      );

      const unknown = await call(session.client, "wm_task_get", { taskId: "op_not_mine" });
      assert.equal(unknown.envelope["status"], "DENIED");
      assert.equal(unknown.envelope["exit_code"], DENIED_EXIT_CODE);
    } finally {
      await session.close();
    }
  });

  it("registers the task an apply produces, and never invents an id", async () => {
    const fake = fakeRunner({ status: "running", operationId: "op_registered_01" });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_action_plan", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        action: "start",
      });
      const token = String((planned.envelope["approval"] as Record<string, unknown>)["token"]);
      const applied = await call(session.client, "wm_sandbox_action_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        action: "start",
        approvalToken: token,
      });
      assert.equal(applied.envelope["task_id"], "op_registered_01");

      const list = await call(session.client, "wm_task_list");
      const data = list.envelope["data"] as { tasks: Array<Record<string, unknown>> };
      assert.equal(data.tasks.length, 1);
      assert.equal(data.tasks[0]?.["taskId"], "op_registered_01");
      assert.equal(data.tasks[0]?.["kind"], "sandbox");

      const observed = await call(session.client, "wm_task_get", {
        taskId: "op_registered_01",
      });
      assert.equal(observed.envelope["task_id"], "op_registered_01");
    } finally {
      await session.close();
    }
  });

  it("never invents a sandbox id when the create response omits one", async () => {
    const fake = fakeRunner({ status: "creating" });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_create_plan", {
        serverId: "srv_fixture_01",
        name: "agent-1",
        size: "small",
      });
      // The plan needs the catalog to publish the size; the fixture doubles as
      // the catalog answer, which publishes nothing, so it must be refused.
      assert.equal(planned.envelope["status"], "DENIED");
      assert.equal(
        planned.envelope["exit_code"],
        DENIED_EXIT_CODE,
        "a refusal must not imply the CLI answered",
      );
      assert.equal(
        (planned.envelope["approval"] as Record<string, unknown> | undefined)?.["token"],
        undefined,
        "a refused plan must not mint a token",
      );
    } finally {
      await session.close();
    }
  });
});

describe("12. poll loop", () => {
  function clocked(): { now: () => number; sleep: (ms: number) => Promise<void>; sleeps: number[] } {
    let clock = 0;
    const sleeps: number[] = [];
    return {
      now: () => clock,
      sleep: (ms: number) => {
        sleeps.push(ms);
        clock += ms;
        return Promise.resolve();
      },
      sleeps,
    };
  }

  const isReady = (payload: unknown): boolean =>
    (payload as { status?: string } | null)?.status === "ready";

  it("polls until the payload settles, never below the interval floor", async () => {
    const fake = sequenceRunner([
      { payload: { status: "pending" }, exitCode: 8 },
      { payload: { status: "pending" }, exitCode: 8 },
      { payload: { status: "ready" } },
    ]);
    const timer = clocked();
    const outcome = await pollUntilTerminal({
      runner: fake.runner,
      cli: "runtimeGet",
      flags: { server: "srv_fixture_01" },
      deadlineMs: 60_000,
      terminal: isReady,
      sleep: timer.sleep,
      now: timer.now,
    });

    assert.equal(outcome.attempts, 3);
    assert.equal(outcome.exhausted, false);
    assert.equal(outcome.stoppedBecause, null);
    assert.deepEqual(timer.sleeps, [MIN_INTERVAL_MS, 3_000], "backoff must grow and stay in budget");
    for (const slept of timer.sleeps) {
      assert.ok(slept >= MIN_INTERVAL_MS, `a sleep of ${String(slept)}ms is a hot loop`);
    }
  });

  it("gives up at the deadline and never reports a pending task as settled", async () => {
    const fake = sequenceRunner([{ payload: { status: "pending" }, exitCode: 8 }]);
    const timer = clocked();
    const outcome = await pollUntilTerminal({
      runner: fake.runner,
      cli: "runtimeGet",
      flags: { server: "srv_fixture_01" },
      deadlineMs: 30_000,
      terminal: isReady,
      sleep: timer.sleep,
      now: timer.now,
    });

    assert.equal(outcome.exhausted, true, "a spent budget is not a settled task");
    assert.ok(outcome.attempts >= 2, "the loop must actually retry");
    assert.ok(outcome.elapsedMs <= 30_000, "the loop must not overshoot its deadline");
    const total = timer.sleeps.reduce((sum, value) => sum + value, 0);
    assert.ok(total <= 30_000, "sleeping must never push past the deadline");
  });

  it("stops immediately on a settled refusal instead of polling it", async () => {
    for (const [code, needle] of [
      [4, "credential"],
      [5, "conflict"],
      [6, "manual review"],
    ] as ReadonlyArray<[number, string]>) {
      const fake = sequenceRunner([{ payload: { status: "denied" }, exitCode: code }]);
      const timer = clocked();
      const outcome = await pollUntilTerminal({
        runner: fake.runner,
        cli: "runtimeGet",
        flags: { server: "srv_fixture_01" },
        deadlineMs: 60_000,
        terminal: isReady,
        sleep: timer.sleep,
        now: timer.now,
      });
      assert.equal(outcome.attempts, 1, `exit ${String(code)} must not be polled again`);
      assert.equal(outcome.exhausted, false);
      assert.ok(outcome.stoppedBecause?.includes(needle), `exit ${String(code)} needs a real reason`);
    }
  });

  it("keeps its budget inside the documented bounds", () => {
    assert.equal(DEFAULT_DEADLINE_SECONDS, 120);
    assert.equal(MAX_DEADLINE_SECONDS, 300);
    const spec = ALL_TOOL_SPECS.find((entry) => entry.name === "wm_task_wait");
    assert.ok(spec);
    const schema = z.toJSONSchema(spec.input, { io: "input" }) as {
      properties?: Record<string, { maximum?: number; minimum?: number }>;
    };
    assert.equal(schema.properties?.["deadlineSeconds"]?.maximum, MAX_DEADLINE_SECONDS);
  });

  it("reports a spent budget as PENDING through the tool, not as success", async () => {
    const pending = sequenceRunner([{ payload: { status: "pending" }, exitCode: 8 }]);
    const registry = new TaskRegistry();
    registry.register({
      taskId: "op_wait_01",
      kind: "operation",
      label: "operation wait",
      observeWith: "wm_operation_get",
    });
    const server = buildServer({
      runner: pending.runner,
      auditEnabled: false,
      auditDir: tempDir(),
      tasks: registry,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "conformance", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    try {
      const result = await call(client, "wm_task_wait", {
        taskId: "op_wait_01",
        deadlineSeconds: 1,
      });
      assert.equal(
        result.envelope["status"],
        "PENDING",
        "an exhausted wait is pending, never applied",
      );
      assert.equal(result.isError, false);
      const warnings = result.envelope["warnings"] as string[];
      assert.ok(warnings.some((entry) => entry.includes("may still be running")));
    } finally {
      await client.close();
    }
  });
});

describe("13. read-only surface", () => {
  const READ_ONLY_TOOLS = [
    "wm_version",
    "wm_health",
    "wm_catalog",
    "wm_state_list",
    "wm_identity_list",
    "wm_server_get",
    "wm_server_identity",
    "wm_server_login",
    "wm_operation_get",
    "wm_runtime_get",
    "wm_sandbox_list",
    "wm_sandbox_get",
    "wm_order_status",
  ];

  it("keeps every read-only tool, strict and read-only", async () => {
    const session = await connect(fakeRunner(HEALTH_FIXTURE).runner);
    try {
      const { tools } = await session.client.listTools();
      const names = tools.map((tool) => tool.name);
      for (const expected of READ_ONLY_TOOLS) {
        assert.ok(names.includes(expected), `${expected} disappeared`);
      }
      for (const tool of tools) {
        if (!READ_ONLY_TOOLS.includes(tool.name)) {
          continue;
        }
        const input = tool.inputSchema as { additionalProperties?: unknown };
        assert.equal(input.additionalProperties, false, `${tool.name} lost its strict input`);
        assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} stopped being read-only`);
        assert.equal(tool.annotations?.idempotentHint, true, `${tool.name} stopped being idempotent`);
      }
      assert.equal(tools.length, 43, "the surface must be exactly the documented 43 tools");
    } finally {
      await session.close();
    }
  });

  it("still answers the read paths unchanged", async () => {
    const session = await connect(fakeRunner(HEALTH_FIXTURE).runner);
    try {
      const result = await call(session.client, "wm_health");
      assert.equal(result.envelope["status"], "OBSERVED");
      assert.equal(result.envelope["exit_code"], 0);
      assert.equal(wmResultSchema.safeParse(result.envelope).success, true);
    } finally {
      await session.close();
    }
  });
});

describe("14. payload shapes match the CLI's own envelopes", () => {
  // Every fixture below is the shape the CLI emits, taken from the `emit()` call
  // in the handler named in each case. This suite exists because the dangerous
  // failure mode is silent: reading the wrong path yields null, a null reads as
  // "no", and a warning that never fires looks exactly like a warning that was
  // not needed.
  it("reads the runtime state from the runtime envelope", () => {
    // handleRuntimeGet: `Runtime ${serverId}: ${result.data.runtime.state}`
    assert.equal(runtimeState({ runtime: { state: "ready", appliedRevision: 14 } }), "ready");
    assert.equal(runtimeState({ runtime: { state: "needs_reinstall" } }), "needs_reinstall");
    // A flat payload is not this command's shape, and must read as unknown.
    assert.equal(runtimeState({ state: "ready" }), null);
    assert.equal(runtimeState({}), null);
    assert.equal(runtimeState(null), null);
  });

  it("reads a sandbox from either of the two shapes sandbox commands use", () => {
    // handleSandboxGet / handleSandboxAction wrap one record in `sandbox`.
    assert.equal(stateOf(sandboxRecord({ sandbox: { id: "sbx_1", observedState: "running" } })), "running");
    // handleSandboxList / handleSandboxCreate emit flat items in `sandboxes`.
    assert.equal(
      stateOf(sandboxRecord({ runtime: { state: "ready" }, sandboxes: [{ id: "sbx_1", observedState: "stopped" }] })),
      "stopped",
    );
    assert.equal(sandboxList({ sandboxes: [{ id: "a" }, { id: "b" }] }).length, 2);
    assert.equal(sandboxList({ sandbox: { id: "a" } }).length, 0);
    assert.equal(sandboxIdOf(sandboxRecord({ sandboxes: [{ id: "sbx_9" }] })), "sbx_9");
  });

  it("unwraps the access-grant envelope, singular and listed", () => {
    // handleAccessList: each item is `{ accessGrant: {...} }`.
    const listed = { accessGrants: [{ accessGrant: { id: "grant_1", name: "a", observedState: "applied" } }] };
    assert.equal(grantList(listed).length, 1);
    assert.equal(grantIdOf(asRecord(grantList(listed)[0])), "grant_1");
    assert.equal(stateOf(asRecord(grantList(listed)[0])), "applied");
    // handleAccessGet / handleAccessGrant: one record under `accessGrant`.
    assert.equal(grantIdOf(grantRecord({ accessGrant: { id: "grant_2", observedState: "pending" } })), "grant_2");
    assert.equal(stateOf(grantRecord({ accessGrant: { observedState: "pending" } })), "pending");
    // The old, wrong key must not accidentally work: a payload with `grants` is
    // not a shape this CLI emits, and pretending otherwise would hide a change.
    assert.equal(grantList({ grants: [{ id: "grant_3" }] }).length, 0);
  });

  it("prefers the observed state over the desired one", () => {
    // `sandbox action` returns both. Reporting the desired state as if it were
    // observed is how "stop requested" becomes "stopped".
    assert.equal(stateOf({ observedState: "running", desiredState: "stopped" }), "running");
    assert.equal(stateOf({ desiredState: "stopped" }), "stopped");
  });

  it("reads an order's state from the task envelope", () => {
    // handleTaskStatus: `emit(output)` where output is `{ ...result.data }`,
    // i.e. `{ task: {...}, nextAction? }`.
    assert.equal(stateOf(taskRecord({ task: { id: "task_1", state: "manual_review" } })), "manual_review");
    assert.equal(stateOf(taskRecord({ state: "manual_review" })), null);
  });

  it("keeps the terminal sets identical to the CLI's own", () => {
    // Copied verbatim from the Sets in node_modules/warpmetal/src/cli.js.
    assert.deepEqual([...TASK_TERMINAL_STATES], [
      "ready",
      "expired",
      "cancellation_pending",
      "cancelled",
      "failed",
      "manual_review",
    ]);
    assert.deepEqual([...OPERATION_TERMINAL_STATES], ["succeeded", "failed", "manual_review"]);
    assert.deepEqual([...RUNTIME_TERMINAL_STATES], ["ready", "degraded", "offline", "needs_reinstall"]);
    assert.deepEqual([...SANDBOX_TERMINAL_STATES], ["running", "stopped", "deleted", "failed"]);
    assert.deepEqual([...GRANT_TERMINAL_STATES], ["applied", "revoked", "failed"]);
    // An invented extra state would end a poll early; an invented missing one
    // would poll a finished job until the deadline.
    assert.ok(!SANDBOX_TERMINAL_STATES.includes("error"));
    assert.ok(!GRANT_TERMINAL_STATES.includes("expired"));
    assert.ok(!OPERATION_TERMINAL_STATES.includes("completed"));
  });

  it("checks runtime capacity the way the CLI checks it", () => {
    // validateRuntimeCatalog sums cpuMillicores, memoryMiB and workspaceDiskGiB
    // and compares against runtime.capacity.
    const runtime = { capacity: { cpuMillicores: 1500, memoryMiB: 3072, workspaceDiskGiB: 30 } };
    const small = { id: "small", cpuMillicores: 500, memoryMiB: 1024, workspaceDiskGiB: 10 };
    const within = checkCapacity(runtime, [small, small]);
    assert.equal(within.checked, true);
    assert.equal(within.exceeds, null);
    assert.equal(within.requested["cpuMillicores"], 1000);

    const large = { id: "large", cpuMillicores: 2000, memoryMiB: 4096, workspaceDiskGiB: 40 };
    const over = checkCapacity(runtime, [large]);
    assert.equal(over.exceeds, "cpuMillicores");

    // A catalog that does not publish the numbers cannot be checked, and saying
    // so is the only honest answer.
    assert.equal(checkCapacity({}, [large]).checked, false);
    assert.equal(checkCapacity(runtime, [null]).checked, false);
  });

  it("requires the per-OS flag the CLI requires", () => {
    const product = {
      operatingSystems: [
        { name: "ubuntu-24.04", agentRuntimeSupported: true },
        { name: "debian-12", agentRuntimeSupported: false },
      ],
    };
    assert.equal(osSupportsRuntime(product, "ubuntu-24.04"), true);
    assert.equal(osSupportsRuntime(product, "debian-12"), false);
    assert.equal(osSupportsRuntime(product, "alpine"), null);
    assert.equal(osSupportsRuntime(product, null), null);
    // An array of strings is not the live shape; it must not be mistaken for a
    // yes, because `agentRuntime.supported` alone is not the CLI's whole test.
    assert.equal(osSupportsRuntime({ operatingSystems: ["ubuntu-24.04"] }, "ubuntu-24.04"), null);
  });
});

describe("executor target resolution", () => {
  it("resolves the npm package bin instead of the Windows cmd shim", () => {
    const target = resolveCliTarget(
      { PATH: path.dirname(process.execPath), APPDATA: "" },
      process.execPath,
    );
    assert.equal(target.degraded, null, "the primary path must not be degraded");
    assert.equal(target.command, process.execPath);
    assert.equal(target.prefixArgs.length, 1);
    assert.ok(
      String(target.prefixArgs[0]).endsWith(path.join("bin", "warpmetal.js")),
      `expected the package bin, got ${String(target.prefixArgs[0])}`,
    );
  });

  it("fails with an actionable message when nothing can be found", () => {
    assert.throws(
      () => resolveCliTarget({ PATH: "", APPDATA: "" }, path.join(tmpdir(), "no-node")),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.ok(message.includes("npm install -g warpmetal"), message);
        return true;
      },
    );
  });
});

describe("15. the consequence gate", () => {
  const probes = {
    serverGet: serverFixture("running"),
    runtimeGet: runtimeFixture("ready"),
    sandboxGet: sandboxFixture(),
    sandboxAccessGet: grantFixture("applied"),
  };

  /** Plans a delete and returns the token, which is the only way to reach an apply. */
  async function planDelete(client: Client): Promise<string> {
    const planned = await call(client, "wm_sandbox_delete_plan", {
      serverId: "srv_fixture_01",
      sandboxId: "sbx_fixture_01",
    });
    assert.equal(planned.envelope["status"], "PLANNED", "the plan must succeed for this test to mean anything");
    const approval = planned.envelope["approval"] as { token?: string; effect?: string } | undefined;
    assert.ok(approval?.token, "the plan must issue a token");
    // The plan has to name the exact word, or the gate teaches nothing.
    assert.match(String(approval.effect), /permanently destroyed/);
    const warnings = planned.envelope["warnings"] as string[];
    assert.ok(
      warnings.some((entry) => entry.includes('acknowledgedConsequence="workspace_deletion"')),
      "the plan must state the exact word the apply will demand",
    );
    const nextActions = planned.envelope["next_actions"] as Array<{ args?: Record<string, unknown> }>;
    assert.equal(
      nextActions[0]?.args?.["acknowledgedConsequence"],
      "workspace_deletion",
      "the plan's next_action must carry the acknowledgement, not make the model guess it",
    );
    return approval.token;
  }

  function deletesIn(fake: FakeRunner): number {
    return fake.calls.filter((entry) => entry.key === "sandboxDelete").length;
  }

  it("refuses an apply that does not name the damage, without spawning", async () => {
    const fake = keyedRunner(probes);
    const session = await connect(fake.runner);
    try {
      const token = await planDelete(session.client);
      const before = deletesIn(fake);

      const missing = await call(session.client, "wm_sandbox_delete_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        approvalToken: token,
      });
      assert.equal(missing.envelope["status"], "DENIED");
      assert.match(String(missing.envelope["summary"]), /consequence/i);
      assert.equal(deletesIn(fake), before, "the CLI must not have run");
    } finally {
      await session.close();
    }
  });

  it("refuses the acknowledgement of a different consequence", async () => {
    const fake = keyedRunner(probes);
    const session = await connect(fake.runner);
    try {
      const token = await planDelete(session.client);
      const before = deletesIn(fake);

      // Valid vocabulary, wrong class. This is the case the schema cannot catch
      // and the handler has to: a model that reaches for the nearest enum word
      // instead of the one it was given must be stopped, not humoured.
      const crossed = await call(session.client, "wm_sandbox_delete_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        approvalToken: token,
        acknowledgedConsequence: "server_erasure",
      });
      assert.equal(crossed.envelope["status"], "DENIED");
      assert.match(String(crossed.envelope["summary"]), /consequence/i);
      assert.equal(deletesIn(fake), before, "the CLI must not have run");

      // The token is untouched by a consequence refusal, so the corrected call
      // still works. A token burnt by a missing word would make the gate a trap.
      const applied = await call(session.client, "wm_sandbox_delete_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        approvalToken: token,
        acknowledgedConsequence: "workspace_deletion",
      });
      assert.equal(applied.envelope["status"], "OBSERVED");
      assert.equal(deletesIn(fake), before + 1, "the corrected call must reach the CLI");
    } finally {
      await session.close();
    }
  });

  it("does not demand an acknowledgement for an action that cannot destroy anything", async () => {
    const fake = keyedRunner({ serverGet: serverFixture("stopped") });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_server_power_plan", {
        serverId: "srv_fixture_01",
        action: "boot",
      });
      assert.equal(planned.envelope["status"], "PLANNED");
      const warnings = planned.envelope["warnings"] as string[];
      assert.ok(
        !warnings.some((entry) => entry.includes("consequence_required")),
        "boot cannot destroy anything, so demanding a word for it would train the caller to ignore the field",
      );
      const approval = planned.envelope["approval"] as { token: string };
      const applied = await call(session.client, "wm_server_power_apply", {
        serverId: "srv_fixture_01",
        action: "boot",
        approvalToken: approval.token,
      });
      assert.equal(applied.envelope["status"], "OBSERVED");
      assert.equal(fake.calls.filter((entry) => entry.key === "serverPower").length, 1);
    } finally {
      await session.close();
    }
  });

  it("demands one for a reboot, which interrupts service", async () => {
    const fake = keyedRunner({ serverGet: serverFixture("running") });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_server_power_plan", {
        serverId: "srv_fixture_01",
        action: "reboot",
      });
      assert.equal(planned.envelope["status"], "PLANNED");
      const approval = planned.envelope["approval"] as { token: string };
      const refused = await call(session.client, "wm_server_power_apply", {
        serverId: "srv_fixture_01",
        action: "reboot",
        approvalToken: approval.token,
      });
      assert.equal(refused.envelope["status"], "DENIED");
      assert.equal(
        fake.calls.filter((entry) => entry.key === "serverPower").length,
        0,
        "a reboot without an acknowledgement must not reach the CLI",
      );
    } finally {
      await session.close();
    }
  });

  it("records the damage that was on the table, not only that it declined", async () => {
    // A refusal is the event worth auditing, and "the tool did nothing" is the
    // least useful way to write it down. The class of damage the call demanded
    // is what tells a reviewer what almost happened.
    const auditDir = tempDir();
    const fake = keyedRunner(probes);
    const session = await connect(fake.runner, { auditDir, auditEnabled: true });
    try {
      const token = await planDelete(session.client);
      await call(session.client, "wm_sandbox_delete_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        approvalToken: token,
      });

      const records = readFileSync(path.join(auditDir, "audit.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const refusal = records[records.length - 1];
      assert.equal(refusal?.["status"], "DENIED");
      assert.equal(refusal?.["consequence"], "workspace_deletion");
      assert.equal(refusal?.["latch"], "clear");
      assert.equal(
        refusal?.["approval"],
        "granted",
        "the token had been verified; the refusal was about the missing word",
      );
      // The token was not spent on a refusal, so the log and the store agree.
      assert.ok(
        !JSON.stringify(refusal).includes(token),
        "the audit record must never contain the token itself",
      );
    } finally {
      await session.close();
    }
  });
});

describe("16. re-verification in the apply", () => {
  it("refuses when the world changed since the plan, and keeps the token", async () => {
    // The TOCTOU window is real: a token lives minutes, and a sandbox can be
    // deleted by someone else inside it. The plan's own checks therefore run
    // again in the apply, after the gate and before the spawn.
    let alive = true;
    const fake = scriptedRunner((key) => {
      if (key === "sandboxGet") {
        return alive
          ? { payload: sandboxFixture() }
          : { payload: { error: "not found" }, exitCode: 5 };
      }
      return { payload: {} };
    });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_delete_plan", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
      });
      assert.equal(planned.envelope["status"], "PLANNED");
      const token = (planned.envelope["approval"] as { token: string }).token;

      alive = false;
      const refused = await call(session.client, "wm_sandbox_delete_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        approvalToken: token,
        acknowledgedConsequence: "workspace_deletion",
      });
      assert.equal(refused.envelope["status"], "DENIED");
      assert.equal(
        fake.calls.filter((entry) => entry.key === "sandboxDelete").length,
        0,
        "nothing may spawn when the re-check refuses",
      );

      // The refusal must not have burnt the token: the world could have been
      // restored, or the read could have failed transiently, and forcing a fresh
      // approval for either would make the re-check a liability.
      alive = true;
      const applied = await call(session.client, "wm_sandbox_delete_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        approvalToken: token,
        acknowledgedConsequence: "workspace_deletion",
      });
      assert.equal(applied.envelope["status"], "OBSERVED");
      assert.equal(fake.calls.filter((entry) => entry.key === "sandboxDelete").length, 1);
    } finally {
      await session.close();
    }
  });

  it("refuses a reload whose runtime cannot be read, rather than erasing blindly", async () => {
    // The plan cannot tell a human what will be lost if it cannot enumerate the
    // runtime, and "you may lose workspaces I could not see" is not consent.
    const fake = scriptedRunner((key) => {
      if (key === "serverGet") {
        return { payload: serverFixture("running") };
      }
      if (key === "runtimeGet") {
        return { payload: { error: "unavailable" }, exitCode: 3 };
      }
      return { payload: {} };
    });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_server_reload_plan", {
        serverId: "srv_fixture_01",
      });
      assert.equal(planned.envelope["status"], "DENIED");
      assert.equal(planned.envelope["approval"], undefined, "a refused plan mints nothing");
      assert.equal(fake.calls.filter((entry) => entry.key === "serverReload").length, 0);
    } finally {
      await session.close();
    }
  });
});

describe("17. the manual_review latch", () => {
  it("holds identifiers and codes only, and stays bounded", () => {
    const dir = tempDir();
    const store = new LatchStore(dir, { maxEntries: 3, maxAgeMs: 60_000 });
    assert.equal(store.record("task_a", "task", "manual_review").ok, true);
    assert.equal(store.record("task_b", "task", "payment_expired_unsettled").ok, true);
    assert.equal(store.record("task_c", "sandbox", "manual_review").ok, true);
    assert.equal(store.record("task_d", "task", "manual_review").ok, true);
    assert.equal(store.size, 3, "the store must stay bounded");

    // A re-observation of the same id and code is not a second entry.
    assert.equal(store.record("task_d", "task", "manual_review").duplicate, true);
    assert.equal(store.size, 3);

    // Anything that is not an identifier or an enum word is refused, so the file
    // cannot be used as a text sink for a path or a token.
    assert.equal(store.record("/home/operator/.ssh/id_ed25519", "task", "manual_review").ok, false);
    assert.equal(store.record("task_e", "task", "a sentence with spaces").ok, false);
    assert.equal(store.record("ok_id", "task", "manual_review").ok, true);

    const raw = readFileSync(path.join(dir, "manual-review.jsonl"), "utf8");
    assert.ok(!raw.includes("id_ed25519"), "the file must not contain a path");
    assert.ok(!raw.includes("sentence"), "the file must not contain prose");
    for (const line of raw.trim().split("\n")) {
      const record = JSON.parse(line) as Record<string, unknown>;
      assert.deepEqual(Object.keys(record).sort(), ["code", "id", "kind", "ts"]);
    }
  });

  it("drops entries past the age window and survives a corrupt line", () => {
    const dir = tempDir();
    const file = path.join(dir, "manual-review.jsonl");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      file,
      [
        JSON.stringify({ ts: "2020-01-01T00:00:00.000Z", id: "ancient", kind: "task", code: "manual_review" }),
        "{ this is not json",
        JSON.stringify({ ts: new Date().toISOString(), id: "recent", kind: "task", code: "manual_review" }),
        JSON.stringify({ ts: new Date().toISOString(), id: "no_kind", kind: "nonsense", code: "manual_review" }),
      ].join("\n"),
    );
    const store = new LatchStore(dir, { maxAgeMs: 24 * 60 * 60 * 1000 });
    assert.equal(store.isLatched("recent"), true);
    assert.equal(store.isLatched("ancient"), false, "an entry past the window must be dropped");
    assert.equal(store.isLatched("no_kind"), false, "an unknown kind must be rejected");
  });

  it("refuses every mutation for a latched id, keeps reading, and outlives the process", async () => {
    const auditDir = tempDir();
    // A sandbox action that ends in manual_review: exit 6, a real terminal state
    // the safety rules forbid retrying.
    const acting = scriptedRunner((key) =>
      key === "sandboxAction"
        ? { payload: { sandbox: { id: "sbx_fixture_01", observedState: "running" } }, exitCode: 6 }
        : { payload: sandboxFixture() },
    );
    const first = await connect(acting.runner, { auditDir });
    try {
      const planned = await call(first.client, "wm_sandbox_action_plan", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        action: "restart",
      });
      assert.equal(planned.envelope["status"], "PLANNED");
      const token = (planned.envelope["approval"] as { token: string }).token;
      const applied = await call(first.client, "wm_sandbox_action_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        action: "restart",
        approvalToken: token,
      });
      assert.equal(applied.envelope["status"], "MANUAL_REVIEW");
      const warnings = applied.envelope["warnings"] as string[];
      assert.ok(
        warnings.some((entry) => entry.includes("manual_review_latched")),
        "an observation at manual_review must say that it was written down",
      );

      // The mutation is now refused, at plan and at apply.
      const replan = await call(first.client, "wm_sandbox_delete_plan", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
      });
      assert.equal(replan.envelope["status"], "DENIED");
      assert.match(String(replan.envelope["summary"]), /manual_review/);
      assert.equal(
        first.client !== undefined && replan.envelope["approval"] === undefined,
        true,
        "a latched id must not be minted a token",
      );

      // Reading is still allowed, which is the only way the latch can ever be
      // observed clearing.
      const read = await call(first.client, "wm_sandbox_get", { serverId: "srv_fixture_01", sandboxId: "sbx_fixture_01" });
      assert.equal(read.envelope["status"], "OBSERVED");

      // Precision matters as much as the refusal. The manual_review was about
      // the sandbox, so the server must stay usable: a latch that froze every
      // mutation on the host would be routed around rather than respected.
      const unrelated = await call(first.client, "wm_server_power_plan", {
        serverId: "srv_fixture_01",
        action: "reboot",
      });
      assert.equal(
        unrelated.envelope["status"],
        "PLANNED",
        "a latched sandbox must not latch its whole server",
      );
    } finally {
      await first.close();
    }

    // A new server over the same state directory is a new process. The memory is
    // on disk precisely so that it is still there.
    const second = await connect(
      keyedRunner({
        serverGet: serverFixture("running"),
        sandboxGet: sandboxFixture(),
      }).runner,
      { auditDir },
    );
    try {
      const listed = await call(second.client, "wm_manual_review_list");
      const data = listed.envelope["data"] as { entries: Array<{ id: string; code: string }>; count: number };
      assert.equal(data.count, 1);
      assert.equal(data.entries[0]?.id, "sbx_fixture_01");
      assert.equal(data.entries[0]?.code, "manual_review");

      const stillRefused = await call(second.client, "wm_sandbox_delete_plan", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
      });
      assert.equal(stillRefused.envelope["status"], "DENIED");
    } finally {
      await second.close();
    }
  });

  it("answers a latched id before it answers the token, and says so in the log", async () => {
    // The order carries meaning. The latch is a memory of an outcome the
    // caller cannot see; the token is a question about the caller's own
    // paperwork. Answering the paperwork first would invite a human to approve
    // an action that is about to be refused, spending exactly the attention
    // the gate exists to protect - and the refusal would look like a bug.
    const auditDir = tempDir();
    const acting = scriptedRunner((key) =>
      key === "sandboxAction"
        ? { payload: { sandbox: { id: "sbx_fixture_01", observedState: "running" } }, exitCode: 6 }
        : { payload: sandboxFixture() },
    );
    const session = await connect(acting.runner, { auditDir, auditEnabled: true });
    try {
      const planned = await call(session.client, "wm_sandbox_action_plan", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        action: "restart",
      });
      const token = (planned.envelope["approval"] as { token: string }).token;
      const applied = await call(session.client, "wm_sandbox_action_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        action: "restart",
        approvalToken: token,
      });
      assert.equal(applied.envelope["status"], "MANUAL_REVIEW");

      // No token at all, on a latched id. If the gate answered first this would
      // be APPROVAL_REQUIRED.
      const bare = await call(session.client, "wm_sandbox_delete_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        acknowledgedConsequence: "workspace_deletion",
      });
      assert.equal(
        bare.envelope["status"],
        "DENIED",
        "the latch must answer before the gate, not after it",
      );
      assert.match(String(bare.envelope["summary"]), /manual_review/);

      const records = readFileSync(path.join(auditDir, "audit.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      const refusal = records[records.length - 1];
      assert.equal(refusal?.["status"], "DENIED");
      assert.equal(refusal?.["latch"], "refused");
      assert.equal(
        refusal?.["approval"],
        "not_attempted",
        "a token that was never examined must not be recorded as missing",
      );
      assert.equal(refusal?.["consequence"], "none");

      // The three records read as one story, and each is the interesting one for
      // its own reason: the plan consulted the latch and found nothing, the apply
      // found a terminal state and wrote it down, the retry was stopped by what
      // the apply had written. "checked and clear" must never look like "never
      // checked" when the log is read after the fact.
      const observation = records[records.length - 2];
      assert.equal(observation?.["latch"], "recorded");
      assert.equal(observation?.["status"], "MANUAL_REVIEW");
      const plan = records[records.length - 3];
      assert.equal(plan?.["latch"], "clear");
      assert.equal(plan?.["approval"], "not_required");
    } finally {
      await session.close();
    }
  });

  it("reports an empty latch honestly instead of implying nothing was reviewed", async () => {
    const session = await connect(fakeRunner({ status: "ok" }).runner, { auditDir: tempDir() });
    try {
      const listed = await call(session.client, "wm_manual_review_list");
      assert.equal(listed.envelope["status"], "OBSERVED");
      const warnings = listed.envelope["warnings"] as string[];
      assert.ok(warnings.some((entry) => entry.includes("latch_empty")));
      assert.match(
        warnings.join(" "),
        /invisible/,
        "an empty latch must say what it cannot know, not that nothing happened",
      );
    } finally {
      await session.close();
    }
  });
});

describe("18. server-owned boolean flags", () => {
  it("renders a boolean flag without a value and a string flag with one", () => {
    const argv = buildArgv("serverReload", {
      server: "srv_fixture_01",
      confirm: "ERASE",
      "power-off-first": true,
      "acknowledge-agent-runtime-reset": true,
    });
    assert.deepEqual(argv, [
      "server",
      "reload",
      "--server",
      "srv_fixture_01",
      "--confirm",
      "ERASE",
      "--power-off-first",
      "--acknowledge-agent-runtime-reset",
      "--json",
    ]);
    // A bare boolean must not be followed by a value, or the CLI would read the
    // next flag as its argument.
    assert.ok(!argv.includes("true"), "a boolean flag must not render its value");
  });

  it("builds them itself and never reads them from the client", () => {
    const reload = ALL_TOOL_SPECS.find((spec) => spec.name === "wm_server_reload_apply");
    assert.ok(reload);
    const flags = resolveFlags(reload, { serverId: "srv_fixture_01" });
    assert.equal(flags["power-off-first"], true);
    assert.equal(flags["acknowledge-agent-runtime-reset"], true);
    assert.equal(flags["confirm"], "ERASE");

    for (const spec of ALL_TOOL_SPECS) {
      const properties = toolFlags(spec);
      for (const field of ["powerOffFirst", "acknowledgeAgentRuntimeReset"]) {
        assert.ok(
          !Object.prototype.hasOwnProperty.call(properties, field),
          `${spec.name} exposes ${field}, which the server must own`,
        );
      }
    }
  });

  it("derives the sandbox confirmation from the action it is confirming", () => {
    // The echo is what stops a token minted for one action being spent on
    // another: `--confirm` must equal the action the argv actually carries.
    const lifecycle = ALL_TOOL_SPECS.find((spec) => spec.name === "wm_sandbox_lifecycle_plan");
    assert.ok(lifecycle);
    for (const action of ["make_persistent", "refresh_image"]) {
      const flags = resolveFlags(lifecycle.mintsFor as never, { action });
      assert.equal(flags["confirm"], action);
    }
  });
});

describe("19. idempotency turned on", () => {
  it("sends the same server-derived key on a retry after an unknown outcome", async () => {
    // `server reload` is one of the two commands both sources agree takes the
    // flag, so a retry is the same request rather than a second one. The key is
    // derived from the token nonce inside the digest, which is what makes this
    // true without either side storing it.
    const fake = scriptedRunner((key) =>
      key === "serverReload"
        ? { payload: { operation: { id: "op_fixture_01", state: "pending" } }, exitCode: TIMEOUT_EXIT_CODE }
        : { payload: key === "serverGet" ? serverFixture("running") : runtimeFixture("ready") },
    );
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_server_reload_plan", {
        serverId: "srv_fixture_01",
      });
      assert.equal(planned.envelope["status"], "PLANNED");
      const token = (planned.envelope["approval"] as { token: string }).token;

      const applyArgs = {
        serverId: "srv_fixture_01",
        approvalToken: token,
        acknowledgedConsequence: "server_erasure",
      };
      const first = await call(session.client, "wm_server_reload_apply", applyArgs);
      assert.equal(first.envelope["status"], "FAILED");
      const firstWarnings = first.envelope["warnings"] as string[];
      assert.ok(
        firstWarnings.some((entry) => entry.includes("approval_not_consumed")),
        "an unknown outcome must keep the approval",
      );
      assert.ok(
        firstWarnings.some((entry) => entry.includes("same idempotency key")),
        "the warning must say the retry carries the same key, because here it does",
      );

      const second = await call(session.client, "wm_server_reload_apply", applyArgs);
      assert.equal(second.envelope["status"], "FAILED");

      const keys = fake.calls
        .filter((entry) => entry.key === "serverReload")
        .map((entry) => entry.flags["idempotency-key"]);
      assert.equal(keys.length, 2, "both attempts must have reached the CLI");
      assert.match(String(keys[0]), /^mcp-[0-9a-f]{32}$/);
      assert.equal(keys[0], keys[1], "a retry must present the same key, or it is a second request");
      assert.equal(
        fake.calls.filter((entry) => entry.key === "serverReload")[0]?.flags["confirm"],
        "ERASE",
      );
    } finally {
      await session.close();
    }
  });

  it("still says a retry is a new request on a command that takes no key", async () => {
    // The honest half of the same design. No source confirms the flag for
    // `sandbox delete`, so the warning must not promise deduplication it cannot
    // deliver.
    const fake = scriptedRunner((key) => {
      if (key === "sandboxDelete") {
        return { payload: {}, exitCode: TIMEOUT_EXIT_CODE };
      }
      return { payload: sandboxFixture() };
    });
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_delete_plan", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
      });
      const token = (planned.envelope["approval"] as { token: string }).token;
      const applied = await call(session.client, "wm_sandbox_delete_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        approvalToken: token,
        acknowledgedConsequence: "workspace_deletion",
      });
      assert.equal(applied.envelope["status"], "FAILED");
      const warnings = applied.envelope["warnings"] as string[];
      assert.ok(warnings.some((entry) => entry.includes("genuinely new request")));
      assert.ok(
        !fake.calls.some((entry) => entry.flags["idempotency-key"] !== undefined),
        "no key may be sent for a command that does not accept one",
      );
      const nextActions = applied.envelope["next_actions"] as Array<{ action: string }>;
      assert.ok(
        nextActions.some((entry) => entry.action.includes("observe the real state")),
        "the caller must be told to look before retrying",
      );
    } finally {
      await session.close();
    }
  });
});

describe("20. a failed call must not read as a success", () => {
  /**
   * The exact shape the real CLI produced during the destructive verification,
   * when `runtime install` could not flush the signature it had just written:
   * a JSON error on stdout, nothing on stderr.
   */
  const STDOUT_ONLY_ERROR = {
    error: { type: "Error", code: "EPERM", message: "EPERM: operation not permitted, fsync" },
  };

  it("does not let a failed apply keep its success-path summary", async () => {
    // `wm_sandbox_delete_apply` describes itself as "delete accepted", which is
    // written as an assertion about a finished action. Beside status FAILED it
    // is the envelope claiming something the caller cannot check, and it
    // contradicts `status` in the same object.
    const fake = scriptedRunner((key) =>
      key === "sandboxDelete"
        ? { payload: STDOUT_ONLY_ERROR, exitCode: 1 }
        : { payload: sandboxFixture() },
    );
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_delete_plan", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
      });
      const token = (planned.envelope["approval"] as { token: string }).token;

      const applied = await call(session.client, "wm_sandbox_delete_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        approvalToken: token,
        acknowledgedConsequence: "workspace_deletion",
      });

      assert.equal(applied.envelope["status"], "FAILED");
      assert.equal(applied.envelope["exit_code"], 1);
      assert.equal(applied.envelope["ok"], false);
      const summary = String(applied.envelope["summary"]);
      assert.ok(
        !summary.includes("accepted"),
        `a failed apply must not report acceptance: ${summary}`,
      );
      assert.match(summary, /did not succeed \(FAILED\)/);
      assert.match(summary, /fsync/, "the summary must carry the CLI's own reason");
    } finally {
      await session.close();
    }
  });

  it("reads the CLI's error JSON from stdout, not only stderr", async () => {
    // The CLI reports failures on stdout, the same stream as its payloads, so an
    // errors array built from stderr alone announced "no diagnostic" while the
    // reason sat unread in `data.error`.
    const fake = fakeRunner(STDOUT_ONLY_ERROR, { exitCode: 1 });
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_health");
      assert.equal(result.envelope["status"], "FAILED");
      const errors = result.envelope["errors"] as string[];
      assert.ok(
        errors.some((entry) => entry.includes("fsync")),
        "the stdout error object must reach errors",
      );
      assert.ok(
        !errors.some((entry) => entry.includes("no diagnostic")),
        "a described failure must not be reported as an unexplained one",
      );
      const data = result.envelope["data"] as Record<string, unknown>;
      assert.equal(
        (data["error"] as Record<string, unknown>)["code"],
        "EPERM",
        "the machine-readable taxonomy must still reach data",
      );
    } finally {
      await session.close();
    }
  });

  it("puts the stdout error ahead of the stderr progress lines", async () => {
    // stderr carries progress, not the reason. Keeping the reason first is what
    // makes `errors[0]` worth reading.
    const fake = fakeRunner(STDOUT_ONLY_ERROR, {
      exitCode: 1,
      stderr: "Signing file C:\\Temp\\warpmetal-ssh-abc\\challenge.txt",
    });
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_health");
      const errors = result.envelope["errors"] as string[];
      assert.ok(errors[0]?.includes("fsync"), `the reason must come first: ${JSON.stringify(errors)}`);
      assert.ok(errors.some((entry) => entry.includes("Signing file")));
    } finally {
      await session.close();
    }
  });

  it("still reports stderr when the CLI offers no error object", async () => {
    const fake = fakeRunner({}, { exitCode: 1, jsonFound: false, stderr: "something odd happened" });
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_health");
      assert.equal(result.envelope["status"], "FAILED");
      const errors = result.envelope["errors"] as string[];
      assert.ok(errors.some((entry) => entry.includes("something odd happened")));
    } finally {
      await session.close();
    }
  });

  it("does not invent a diagnostic from an error field that is null", async () => {
    // A payload may legitimately carry `error: null`, and treating the presence
    // of the field as a reason would manufacture one.
    const fake = fakeRunner({ status: "ok", error: null }, { exitCode: 1 });
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_health");
      const errors = result.envelope["errors"] as string[];
      assert.ok(
        errors.some((entry) => entry.includes("no diagnostic")),
        `an absent diagnostic must still be admitted: ${JSON.stringify(errors)}`,
      );
    } finally {
      await session.close();
    }
  });

  it("leaves a read summary alone, because reads already degrade to the status", async () => {
    // The guard is deliberately narrow. Read summaries are derived from the
    // payload and already fall back to the status, so rewriting them here would
    // discard the observation the CLI did manage to deliver.
    const fake = fakeRunner({ runtime: {} }, { exitCode: 6 });
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_runtime_get", { serverId: "srv_fixture_01" });
      assert.equal(result.envelope["status"], "MANUAL_REVIEW");
      assert.equal(result.envelope["summary"], "Agent Runtime reported as MANUAL_REVIEW");
    } finally {
      await session.close();
    }
  });

  it("keeps an apply's own words when it did succeed", async () => {
    // The mirror of the first check: on success the static summary must survive,
    // or the fix would have traded one wrong message for another.
    const fake = scriptedRunner((key) =>
      key === "sandboxDelete" ? { payload: {} } : { payload: sandboxFixture() },
    );
    const session = await connect(fake.runner);
    try {
      const planned = await call(session.client, "wm_sandbox_delete_plan", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
      });
      const token = (planned.envelope["approval"] as { token: string }).token;
      const applied = await call(session.client, "wm_sandbox_delete_apply", {
        serverId: "srv_fixture_01",
        sandboxId: "sbx_fixture_01",
        approvalToken: token,
        acknowledgedConsequence: "workspace_deletion",
      });
      assert.equal(applied.envelope["status"], "OBSERVED");
      assert.match(String(applied.envelope["summary"]), /accepted/);
    } finally {
      await session.close();
    }
  });
});

describe("21. the CLI concurrency ceiling", () => {
  // The unit cases pin the mechanism exactly; the cases below them spawn real
  // processes, because a semaphore that is never wired into the executor would
  // pass every unit test and still let a burst of tool calls fan out.
  it("reads the limit from the environment and ignores anything that is not a positive integer", () => {
    assert.equal(resolveConcurrencyLimit({}), DEFAULT_MAX_CONCURRENT_CLI);
    assert.equal(resolveConcurrencyLimit({ WM_MAX_CONCURRENT_CLI: "1" }), 1);
    assert.equal(resolveConcurrencyLimit({ WM_MAX_CONCURRENT_CLI: " 8 " }), 8);
    assert.equal(resolveConcurrencyLimit({ WM_MAX_CONCURRENT_CLI: "1000" }), 64);
    // A typo must fall back rather than be coerced: parseInt("4abc") is 4, and
    // honouring that silently is worse than ignoring the variable.
    assert.equal(resolveConcurrencyLimit({ WM_MAX_CONCURRENT_CLI: "4abc" }), DEFAULT_MAX_CONCURRENT_CLI);
    assert.equal(resolveConcurrencyLimit({ WM_MAX_CONCURRENT_CLI: "0" }), DEFAULT_MAX_CONCURRENT_CLI);
    assert.equal(resolveConcurrencyLimit({ WM_MAX_CONCURRENT_CLI: "-2" }), DEFAULT_MAX_CONCURRENT_CLI);
    assert.equal(resolveConcurrencyLimit({ WM_MAX_CONCURRENT_CLI: "" }), DEFAULT_MAX_CONCURRENT_CLI);
  });

  it("never lets a burst exceed the ceiling", async () => {
    const gate = new Semaphore(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 9 }, async () => {
        await gate.acquire();
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setImmediate(resolve));
        active -= 1;
        gate.release();
      }),
    );
    assert.equal(peak, 2, `the ceiling was exceeded: peak ${String(peak)}`);
    assert.equal(gate.active, 0, "every slot must be returned");
  });

  it("hands a freed slot to the oldest waiter, not the newest", async () => {
    const gate = new Semaphore(1);
    await gate.acquire();
    const order: number[] = [];
    const waiting = [1, 2, 3].map(async (id) => {
      await gate.acquire();
      order.push(id);
      gate.release();
    });
    assert.equal(gate.queued, 3, "all three must be parked behind the one slot");
    gate.release();
    await Promise.all(waiting);
    assert.deepEqual(order, [1, 2, 3], "the queue must be FIFO");
  });

  /**
   * The world's smallest stand-in for the CLI: one process per call that logs
   * when it starts and when it ends. The overlap is computed afterwards, which is
   * the only way to tell "two at once" from "two at once when only one slot
   * existed" - a marker file cannot encode the ceiling it is meant to respect.
   *
   * Each attempt takes the next value from `sleeps`, so a case can make the first
   * call long and the rest short without touching the runner's fixed timeout.
   */
  function probeScript(dir: string, sleeps: readonly number[]): string {
    return `
const fs = require("node:fs");
const path = require("node:path");
const dir = ${JSON.stringify(dir)};
const sleeps = ${JSON.stringify(sleeps)};
const counter = path.join(dir, "attempts");
let seen = 0;
try { seen = Number(fs.readFileSync(counter, "utf8")); } catch { seen = 0; }
fs.writeFileSync(counter, String(seen + 1));
fs.appendFileSync(path.join(dir, "events"), "start " + String(Date.now()) + "\\n");
const sleepMs = sleeps[Math.min(seen, sleeps.length - 1)];
const until = Date.now() + sleepMs;
while (Date.now() < until) {}
fs.appendFileSync(path.join(dir, "events"), "end " + String(Date.now()) + "\\n");
process.stdout.write(JSON.stringify({ ok: true }) + "\\n");
`;
  }

  /** The highest number of probe processes that were running at the same moment. */
  function peakConcurrency(eventsPath: string): number {
    const events = readFileSync(eventsPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.length > 0)
      .map((line) => {
        const [kind, at] = line.split(" ");
        // An "end" sorts before a "start" at the same millisecond, which can only
        // understate the peak. Understating it fails the invariant, so the
        // conservative direction is the safe one.
        return { delta: kind === "end" ? -1 : 1, at: Number(at) };
      });
    events.sort((left, right) => left.at - right.at || left.delta - right.delta);
    let active = 0;
    let peak = 0;
    for (const event of events) {
      active += event.delta;
      peak = Math.max(peak, active);
    }
    return peak;
  }

  /**
   * The real executor, pointed at that script instead of at the CLI. Injecting
   * the target is what keeps the semaphore, the death clock and the envelope on
   * the code path under test; a fake `Runner` would replace all three.
   */
  function probeRunner(
    dir: string,
    options: { limit: number; timeoutMs: number; sleeps: readonly number[] },
  ): Runner {
    const scriptPath = path.join(dir, "probe.cjs");
    writeFileSync(scriptPath, probeScript(dir, options.sleeps));
    return createCliRunner({
      target: {
        command: process.execPath,
        prefixArgs: [scriptPath],
        degraded: null,
        description: "test probe",
        version: null,
      },
      concurrency: options.limit,
      timeoutMs: options.timeoutMs,
    });
  }

  it("never runs more CLI processes at once than the ceiling", { timeout: 60_000 }, async () => {
    const dir = tempDir();
    const ceiling = 2;
    const runner = probeRunner(dir, { limit: ceiling, timeoutMs: 30_000, sleeps: [250] });

    const outcomes = await Promise.all(Array.from({ length: 6 }, () => runner.run("health")));

    for (const outcome of outcomes) {
      assert.equal(outcome.timedOut, false);
      assert.equal(outcome.exitCode, 0);
    }
    const peak = peakConcurrency(path.join(dir, "events"));
    assert.ok(peak <= ceiling, `the ceiling of ${String(ceiling)} was exceeded: peak ${String(peak)}`);
    const waited = outcomes.filter((outcome) =>
      outcome.warnings.some((warning) => warning.startsWith("cli_queue_wait")),
    );
    assert.ok(
      waited.length >= 4,
      `the four calls beyond the ceiling must report their wait, saw ${String(waited.length)}; without this the peak proves nothing about the ceiling`,
    );
  });

  it("frees the slot when a call times out", { timeout: 60_000 }, async () => {
    const dir = tempDir();
    const runner = probeRunner(dir, { limit: 1, timeoutMs: 200, sleeps: [2_000, 10, 10] });

    const killed = await runner.run("health");
    assert.equal(killed.timedOut, true, "the probe must be killed, or this proves nothing");
    assert.ok(killed.warnings.some((warning) => warning.startsWith("cli_timeout")));

    // If the timeout leaked the slot this would park forever, which is why the
    // case carries its own timeout.
    const next = await runner.run("health");
    assert.equal(next.timedOut, false, "a timed-out call must not hold its slot");
    assert.equal(next.exitCode, 0);
  });

  it("does not spend the CLI's own budget on the queue wait", { timeout: 60_000 }, async () => {
    // `sandbox access refresh` is the reason this matters: it is given a 25 s
    // wait budget and a 30 s death clock, and a call that queued for 20 s must
    // still get its own 25 s once it starts.
    //
    // The two calls are identical, so comparing them is what makes this
    // assertion portable: an absolute bound would only measure how fast this
    // machine spawns a process. If the wait were billed, the queued call would
    // measure its own run *plus* the first one.
    const dir = tempDir();
    const sleepMs = 500;
    const runner = probeRunner(dir, { limit: 1, timeoutMs: 30_000, sleeps: [sleepMs] });

    const startedAt = Date.now();
    const [first, second] = await Promise.all([runner.run("health"), runner.run("health")]);
    const wallMs = Date.now() - startedAt;

    assert.ok(wallMs > sleepMs * 1.5, `the second call must have waited; wall was ${String(wallMs)} ms`);
    assert.ok(
      second.durationMs < first.durationMs + sleepMs * 0.8,
      `a queued call must measure its own run, not the wait: first ${String(first.durationMs)} ms, second ${String(second.durationMs)} ms`,
    );
    assert.ok(
      second.warnings.some((warning) => warning.startsWith("cli_queue_wait")),
      "a call that waited must say so",
    );
    assert.equal(first.timedOut, false);
    assert.equal(second.timedOut, false);
  });

  it("does not take a slot to refuse a call", { timeout: 60_000 }, async () => {
    // A latch, a missing token or an unacknowledged consequence is decided before
    // the executor is reached, so a refusal must never join the CLI queue. This
    // pins the ordering the ceiling depends on: refusals are free.
    const dir = tempDir();
    const runner = probeRunner(dir, { limit: 1, timeoutMs: 30_000, sleeps: [400] });
    const session = await connect(runner);
    try {
      const slow = call(session.client, "wm_health");
      await new Promise((resolve) => setTimeout(resolve, 100));

      const refused = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
      });
      assert.equal(refused.envelope["status"], "APPROVAL_REQUIRED");
      const warnings = refused.envelope["warnings"] as string[];
      assert.equal(
        warnings.some((warning) => warning.includes("cli_queue_wait")),
        false,
        "a refusal must never enter the CLI queue",
      );

      await slow;
      assert.equal(
        Number(readFileSync(path.join(dir, "attempts"), "utf8")),
        1,
        "only the one non-refused call may spawn",
      );
    } finally {
      await session.close();
    }
  });
});

describe("22. the CLI version floor", () => {
  /** A fake runner that also reports a version, which is what the gate reads. */
  function versionedRunner(payload: unknown, version: string | null): FakeRunner {
    const fake = fakeRunner(payload);
    const runner: Runner = {
      run: (key, flags) => fake.runner.run(key, flags),
      cliVersion: () => Promise.resolve(version),
    };
    return { runner, calls: fake.calls };
  }

  /** Plans an enable and returns the token, which the apply path always needs. */
  async function planEnable(client: Client): Promise<string> {
    const planned = await call(client, "wm_runtime_enable_plan", { serverId: "srv_fixture_01" });
    assert.equal(planned.envelope["status"], "PLANNED");
    return String((planned.envelope["approval"] as { token: string }).token);
  }

  it("refuses an apply on a CLI below the floor, before the token and before the spawn", async () => {
    const fake = versionedRunner({ status: "ready", operationId: "op_old" }, "0.7.4");
    const session = await connect(fake.runner);
    try {
      const token = await planEnable(session.client);
      const callsAfterPlan = fake.calls.length;

      const applied = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: token,
      });

      assert.equal(applied.envelope["status"], "DENIED");
      assert.equal(applied.envelope["exit_code"], DENIED_EXIT_CODE);
      assert.match(String(applied.envelope["summary"]), /0\.7\.4/);
      const warnings = applied.envelope["warnings"] as string[];
      assert.ok(warnings.some((warning) => warning.startsWith("cli_too_old")));
      assert.equal(
        fake.calls.length,
        callsAfterPlan,
        "an old CLI must be refused before a process exists",
      );

      // The refusal must not read as a token problem, or the model would go
      // looking for an approval when the remedy is an upgrade.
      const words = [...warnings, ...((applied.envelope["errors"] as string[]) ?? [])].join(" ");
      assert.doesNotMatch(words, /already used|expired|not a token this server issued/i);
    } finally {
      await session.close();
    }
  });

  it("does not spend the approval on a refusal, so an upgrade needs no new plan", async () => {
    const fake = versionedRunner({ status: "ready", operationId: "op_old" }, "0.7.4");
    const session = await connect(fake.runner);
    try {
      const token = await planEnable(session.client);
      const first = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: token,
      });
      const second = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: token,
      });

      assert.equal(first.envelope["status"], "DENIED");
      assert.equal(second.envelope["status"], "DENIED");
      assert.ok(
        (second.envelope["warnings"] as string[]).some((warning) =>
          warning.startsWith("cli_too_old"),
        ),
        "the second refusal must be the version again, not a spent token",
      );
    } finally {
      await session.close();
    }
  });

  it("still runs reads on a CLI below the floor, because diagnosis needs them", async () => {
    const fake = versionedRunner({ status: "ok" }, "0.7.4");
    const session = await connect(fake.runner);
    try {
      const result = await call(session.client, "wm_health");
      assert.notEqual(result.envelope["status"], "DENIED");
      assert.notEqual(result.isError, true);
    } finally {
      await session.close();
    }
  });

  it("allows an apply at or above the floor", async () => {
    const fake = versionedRunner({ status: "ready", operationId: "op_ok" }, "0.8.12");
    const session = await connect(fake.runner);
    try {
      const token = await planEnable(session.client);
      const applied = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: token,
      });
      assert.equal(applied.envelope["status"], "OBSERVED");
      assert.equal(applied.envelope["exit_code"], 0);
    } finally {
      await session.close();
    }
  });

  it("refuses nothing when the version could not be read", async () => {
    // Unknown is not below. A host this server could not inspect is not a host it
    // may refuse: an override, a bare PATH executable or the degraded cmd shim
    // has no manifest to read, and inventing a refusal from that would break a
    // working CLI for a fact nobody established.
    const fake = versionedRunner({ status: "ready", operationId: "op_unknown" }, null);
    const session = await connect(fake.runner);
    try {
      const token = await planEnable(session.client);
      const applied = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: token,
      });
      assert.equal(applied.envelope["status"], "OBSERVED");
    } finally {
      await session.close();
    }
  });

  it("treats an unparseable version as unknown rather than as zero", async () => {
    // A nightly or a malformed string must not be read as 0.0.0, which would
    // refuse every apply on a CLI that is probably newer, not older.
    const fake = versionedRunner({ status: "ready", operationId: "op_nightly" }, "nightly");
    const session = await connect(fake.runner);
    try {
      const token = await planEnable(session.client);
      const applied = await call(session.client, "wm_runtime_enable_apply", {
        serverId: "srv_fixture_01",
        approvalToken: token,
      });
      assert.equal(applied.envelope["status"], "OBSERVED");
    } finally {
      await session.close();
    }
  });
});
