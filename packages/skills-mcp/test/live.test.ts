/**
 * live.test.ts - the payload shapes this server reads, checked against the live
 * WarpMetal service.
 *
 * This suite exists because of the failure mode shapes.ts was written to stop:
 * a payload field that moves does not throw, it returns null, and a null is
 * indistinguishable from a real negative. A check that reads the wrong path
 * answers "no" forever while looking perfectly healthy in review. Fixtures
 * cannot catch that, because a fixture is written from the same belief as the
 * code. Only the live service can.
 *
 * It is gated behind WARPMETAL_MCP_LIVE=1 and wired to a scheduled job, never a
 * pull request, because it depends on a third party being reachable. A vendor
 * outage is not a reason to block a merge, but it is a reason to find out on a
 * schedule.
 *
 * The suite separates what is public from what needs a credential. `health` and
 * `catalog` are discovery: they need the service and nothing else. `state list`
 * reads the CLI's private state, so it skips with a named reason when the host
 * has no accepted credential rather than failing on an absent subject.
 *
 * Everything here is read-only. The one mutating surface it touches is the
 * parser probe on `order status`, which is a read.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { osSupportsRuntime } from "../src/shapes.js";
import { asRecord, bool, str } from "../src/tools/spec.js";
import { cliAvailable, cliStateReady, runCli } from "./cli.js";

const LIVE = process.env["WARPMETAL_MCP_LIVE"] === "1";

const SKIP: false | string = !LIVE
  ? "live contract: set WARPMETAL_MCP_LIVE=1 to run it, it needs the WarpMetal service"
  : cliAvailable()
    ? false
    : "the warpmetal CLI is not installed on this host; `npm ci` installs the pinned devDependency";

/** Generous, because this crosses the public internet to a third party. */
const TIMEOUT_MS = 30_000;

async function liveJson(
  args: readonly string[],
  acceptedExitCodes: readonly number[] = [0],
): Promise<unknown> {
  const run = await runCli([...args, "--json"], TIMEOUT_MS);
  assert.equal(run.timedOut, false, `\`warpmetal ${args.join(" ")}\` timed out`);
  assert.ok(
    acceptedExitCodes.includes(run.exitCode),
    `\`warpmetal ${args.join(" ")}\` exited ${String(run.exitCode)}: ${run.stderr.trim()}`,
  );
  try {
    return JSON.parse(run.stdout) as unknown;
  } catch {
    assert.fail(
      `\`warpmetal ${args.join(" ")}\` did not return JSON: ${run.stdout.slice(0, 400)}`,
    );
  }
}

describe("live: the WarpMetal payloads still carry the fields this server reads", () => {
  it("health still reports the fields the summary and its warnings read", { skip: SKIP, timeout: TIMEOUT_MS }, async () => {
    // Exit 3 is a valid answer here: the service responded and purchasing is
    // paused. The payload is complete, and the server itself treats that as an
    // observation rather than a failure, so the probe must not be stricter than
    // the product.
    const record = asRecord(await liveJson(["health"], [0, 3]));
    assert.ok(record !== null, "health must return an object");

    assert.equal(
      typeof str(record["status"]),
      "string",
      "health.status is what the read summary prints as the service status",
    );
    assert.equal(typeof str(record["service"]), "string", "health.service is the service's own name");

    for (const field of ["purchasingReady", "anyPaymentReady"]) {
      assert.equal(
        typeof bool(record[field]),
        "boolean",
        `health.${field} is a boolean the server reports; a missing one silently reads as unknown`,
      );
    }

    const dependencies = asRecord(record["dependencies"]);
    assert.ok(
      dependencies !== null,
      "health.dependencies must stay an object: every false value in it becomes a warning",
    );
    for (const name of [
      "computeInventory",
      "database",
      "emailNotices",
      "sshProof",
      "worker",
      "x402Contract",
    ]) {
      assert.equal(
        typeof bool(dependencies[name]),
        "boolean",
        `health.dependencies.${name} must stay a boolean, or its outage stops being reported`,
      );
    }

    const methods = asRecord(record["paymentMethods"]);
    assert.ok(methods !== null, "health.paymentMethods must stay an object");
    assert.equal(
      typeof bool(asRecord(methods["crypto"])?.["ready"]),
      "boolean",
      "health.paymentMethods.crypto.ready must stay a boolean",
    );
    const stripe = asRecord(methods["stripe"]);
    assert.equal(typeof bool(stripe?.["ready"]), "boolean", "health.paymentMethods.stripe.ready must stay a boolean");
    assert.equal(
      typeof bool(asRecord(stripe?.["hostedCard"])?.["ready"]),
      "boolean",
      "health.paymentMethods.stripe.hostedCard.ready must stay a boolean",
    );
  });

  it("catalog still publishes every path the sandbox plan gate reads", { skip: SKIP, timeout: TIMEOUT_MS }, async () => {
    const record = asRecord(await liveJson(["catalog"]));
    assert.ok(record !== null, "catalog must return an object");
    assert.equal(
      typeof str(record["pricingRevision"]),
      "string",
      "catalog.pricingRevision is what a plan compares to prove it read the live catalog",
    );

    const products = Array.isArray(record["products"]) ? (record["products"] as unknown[]) : [];
    assert.ok(products.length > 0, "catalog.products must be a non-empty array");

    for (const entry of products) {
      const product = asRecord(entry);
      assert.ok(product !== null, "every catalog product must be an object");
      const planId = str(product["id"]);
      assert.equal(
        typeof planId,
        "string",
        "products[].id is matched against the server's own planId; without it no plan can find its product",
      );

      const runtime = asRecord(product["agentRuntime"]);
      assert.ok(runtime !== null, `products[${String(planId)}].agentRuntime must be an object`);
      assert.equal(
        typeof bool(runtime["supported"]),
        "boolean",
        "agentRuntime.supported gates every sandbox plan before anything is spawned",
      );

      const capacity = asRecord(runtime["capacity"]);
      assert.ok(capacity !== null, "agentRuntime.capacity must be an object");
      const sizes = Array.isArray(runtime["sizes"]) ? (runtime["sizes"] as unknown[]) : [];
      assert.ok(sizes.length > 0, "agentRuntime.sizes must be a non-empty array");

      for (const field of ["cpuMillicores", "memoryMiB", "workspaceDiskGiB"]) {
        assert.equal(
          typeof capacity[field],
          "number",
          `agentRuntime.capacity.${field} must be a number: checkCapacity sums the sizes against it`,
        );
        for (const sizeEntry of sizes) {
          const size = asRecord(sizeEntry);
          assert.ok(size !== null, "every agentRuntime size must be an object");
          assert.equal(
            typeof str(size["id"]),
            "string",
            "agentRuntime.sizes[].id is the exact value a plan matches; a rename makes every size unselectable",
          );
          assert.equal(
            typeof size[field],
            "number",
            `agentRuntime.sizes[].${field} must be a number, or the capacity check goes unverified`,
          );
        }
      }

      const systems = Array.isArray(product["operatingSystems"])
        ? (product["operatingSystems"] as unknown[])
        : [];
      assert.ok(systems.length > 0, "operatingSystems must be a non-empty array");
      for (const systemEntry of systems) {
        const system = asRecord(systemEntry);
        assert.ok(system !== null, "every operating system must be an object");
        assert.equal(typeof str(system["name"]), "string", "operatingSystems[].name is matched against the server's osName");
        assert.equal(
          typeof bool(system["agentRuntimeSupported"]),
          "boolean",
          "operatingSystems[].agentRuntimeSupported is required by the CLI as well as by this server; a boolean check that reads null denies forever",
        );
      }
    }

    // A catalog in which nothing can host Agent Runtime is a working API and a
    // dead product surface: every sandbox plan would refuse, forever, with a
    // perfectly plausible reason. That deserves to fail loudly.
    const hostable =
      products
        .map((entry) => asRecord(entry))
        .find((product) => bool(asRecord(product?.["agentRuntime"])?.["supported"]) === true) ?? null;
    assert.ok(
      hostable !== null,
      "at least one product must publish agentRuntime.supported true, or no sandbox can ever be created",
    );

    const osName =
      (Array.isArray(hostable["operatingSystems"]) ? (hostable["operatingSystems"] as unknown[]) : [])
        .map((entry) => asRecord(entry))
        .map((system) => str(system?.["name"]))
        .find((name) => osSupportsRuntime(hostable, name) === true) ?? null;
    assert.ok(
      osName !== null,
      "at least one operating system must report agentRuntimeSupported true through shapes.osSupportsRuntime, which is the accessor the gate actually calls",
    );
  });

  it("state list still exposes the collections the local summary reads", { timeout: TIMEOUT_MS }, async (t) => {
    if (SKIP) {
      t.skip(SKIP);
      return;
    }
    // The one check that needs a private install, not just a reachable service.
    const ready = await cliStateReady();
    if (!ready.ok) {
      t.skip(`live contract: ${ready.reason}, and this check reads the private collections`);
      return;
    }
    const record = asRecord(await liveJson(["state", "list"]));
    assert.ok(record !== null, "state list must return an object");

    // These two are asserted unconditionally because the summary counts them: a
    // rename would turn "12 server(s)" into a generic sentence that nobody reads
    // as a failure.
    assert.ok(
      Array.isArray(record["servers"]),
      "state list 'servers' must stay an array, the summary counts it",
    );
    assert.ok(
      Array.isArray(record["identities"]),
      "state list 'identities' must stay an array, the summary counts it",
    );

    // The rest are checked only when the CLI includes them. The server does not
    // read them today, so an absence is a note rather than a failure - but a
    // collection that appears and has no id is a real problem, because that is
    // how a sandbox or a grant stops being addressable.
    const collections: ReadonlyArray<{ name: string; idField: string }> = [
      { name: "servers", idField: "serverId" },
      { name: "runtimes", idField: "serverId" },
      { name: "sandboxes", idField: "sandboxId" },
      { name: "accessGrants", idField: "grantId" },
    ];
    for (const { name, idField } of collections) {
      const value = record[name];
      if (value === undefined) {
        continue;
      }
      assert.ok(Array.isArray(value), `state list '${name}' must be an array when present`);
      for (const entry of value as unknown[]) {
        const item = asRecord(entry);
        assert.ok(item !== null, `state list ${name}[] must be an object`);
        assert.equal(
          typeof str(item[idField]),
          "string",
          `state list ${name}[].${idField} is how an id is recovered; without it the record cannot be addressed again`,
        );
      }
    }
  });

  it("accepts --wait paired with --timeout-seconds on a command that documents both", { skip: SKIP, timeout: TIMEOUT_MS }, async () => {
    // This is the closest thing to a safe answer for the one wait budget the
    // registry grants. `sandbox access refresh` is sent `--wait --timeout-seconds
    // 25`, and the global help documents only `[--wait]` for it, while `order
    // status` documents both. Proving the pairing on the read-only command does
    // not prove the mutating one accepts it - nothing that does not mutate can -
    // but it does show the pairing is a real convention and not a misreading.
    const run = await runCli(
      ["order", "status", "--task", "task_contract_probe", "--wait", "--timeout-seconds", "1", "--json"],
      TIMEOUT_MS,
    );
    assert.equal(run.timedOut, false, "the probe must finish, not hang");
    assert.doesNotMatch(
      `${run.stdout}${run.stderr}`,
      /Unknown option/i,
      "the parser must accept --wait with --timeout-seconds together",
    );
    assert.ok(
      run.stdout.trim().length > 0 || run.stderr.trim().length > 0,
      "the probe produced no output, so it established nothing",
    );
  });
});
