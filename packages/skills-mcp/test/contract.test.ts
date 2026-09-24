/**
 * contract.test.ts - what this server believes about the CLI, checked against
 * the CLI itself, offline.
 *
 * The conformance suite drives a fake runner, which is the right way to test
 * this server's logic and the wrong way to notice that the CLI changed. Pointing
 * the surface at the real binary, not at a fixture, is what catches a summary
 * that contradicts its own status or an error reader that looks on the wrong
 * stream. This suite is the offline half of that.
 *
 * Two rules keep it from becoming a liability:
 *
 *   1. It never invokes a mutating verb, not even expecting a usage error. A
 *      contract test that spawns `sandbox delete` is one CLI release away from
 *      being the thing that deletes something, because "a missing flag is
 *      always fatal" is exactly the assumption under test. Only read-only verbs
 *      are spawned, and only with input the parser must reject.
 *   2. It asserts the direction that matters. The registry claims a set of
 *      facts about the CLI's surface; each fact is checked against the binary,
 *      so a changed usage line fails here instead of silently authorising a
 *      command the CLI no longer understands.
 *
 * When the CLI is absent every case skips with a reason, rather than passing
 * vacuously. In CI `npm ci` installs the pinned devDependency, so the server's
 * own resolution finds it before any global install.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { MIN_CLI_VERSION, isBelow, joinVersion, parseSemver } from "../src/cli-version.js";
import {
  CLI_COMMANDS,
  acceptsIdempotencyKey,
  findProjectRoot,
  resolveCliTarget,
  type CliCommandKey,
  type CliCommandSpec,
} from "../src/exec.js";
import { PROJECT_ROOT, cliAvailable, runCli } from "./cli.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** `false`, or the reason every case in this file is skipped. */
const SKIP: false | string = cliAvailable()
  ? false
  : "the warpmetal CLI is not installed on this host; `npm ci` installs the pinned devDependency";

let cachedHelp: string | null = null;

async function helpText(): Promise<string> {
  if (cachedHelp === null) {
    const run = await runCli(["--help"]);
    assert.equal(run.exitCode, 0, "`warpmetal --help` must succeed");
    cachedHelp = run.stdout;
  }
  return cachedHelp;
}

interface UsageBlock {
  head: string;
  text: string;
}

/**
 * The usage entries, each with its indented option continuations.
 *
 * A continuation is only accepted when it begins with an option or a bracket
 * group. Prose is indented too, and folding a paragraph into the previous entry
 * would let an unrelated sentence satisfy a flag assertion.
 *
 * Note that `warpmetal <subcommand> --help` prints this same global help text
 * rather than anything command-specific, so this is the only place a flag can be
 * read from.
 */
function usageBlocks(help: string): UsageBlock[] {
  const blocks: UsageBlock[] = [];
  let current: UsageBlock | null = null;
  for (const line of help.split(/\r?\n/)) {
    if (/^ {2}warpmetal\s/.test(line)) {
      current = { head: line.trim(), text: line };
      blocks.push(current);
      continue;
    }
    if (current !== null && /^\s+(?:\[|--|\()/.test(line)) {
      current.text += `\n${line}`;
    }
  }
  return blocks;
}

/** The usage words of an entry, with option tokens and their values removed. */
function usageWords(head: string): string[] {
  return head
    .replace(/^warpmetal\s+/, "")
    .split(/\s+/)
    // Drop options, bracket groups and parenthesised alternations. What remains
    // is the command path and its value placeholders.
    .filter((token) => token.length > 0 && !/^(?:-|\[|\()/.test(token));
}

/**
 * Whether a usage entry describes a command. A pipe group matches any of its
 * alternatives (`sandbox list|get|action|delete`), which is how the CLI collapses
 * read-only verbs, and the word after the command must be a value placeholder or
 * `...` so that `server identity` cannot swallow `server identity attach`.
 */
function matchesCommand(head: string, command: readonly string[]): boolean {
  const words = usageWords(head);
  for (let index = 0; index < command.length; index += 1) {
    const alternatives = (words[index] ?? "").split("|");
    if (!alternatives.includes(command[index] ?? "")) {
      return false;
    }
  }
  const next = words[command.length];
  if (next === undefined) {
    return true;
  }
  return next === "..." || next.startsWith("<") || next.startsWith("(");
}

/** Every usage entry that describes a command, concatenated. */
function helpFor(help: string, command: readonly string[]): string {
  return usageBlocks(help)
    .filter((block) => matchesCommand(block.head, command))
    .map((block) => block.text)
    .join("\n");
}

/** Registry keys that name a subcommand rather than a global flag. */
function subcommandKeys(): CliCommandKey[] {
  return (Object.keys(CLI_COMMANDS) as CliCommandKey[]).filter(
    (key) => CLI_COMMANDS[key].argv[0]?.startsWith("-") !== true,
  );
}

/**
 * `CLI_COMMANDS` is `as const`, so a bare index yields a union of literals and
 * most members lack the optional registry fields. This widens a key to the
 * declared shape, exactly as the conformance suite does.
 */
function registryEntry(key: CliCommandKey): CliCommandSpec {
  return CLI_COMMANDS[key];
}

describe("contract: the installed CLI honours the surface this server builds on", () => {
  it("resolves the CLI through the project's own node_modules", { skip: SKIP }, () => {
    // This is the step that makes the pinned devDependency mean anything, and it
    // is asserted separately because a silently broken step would leave every
    // other case in this file running against a global install.
    assert.equal(
      findProjectRoot(HERE),
      PROJECT_ROOT,
      "the project root must be discovered from the package's own layout",
    );

    // Discovery alone is not the claim; the resolver must act on it. Without
    // these two, a resolution order that read the global prefix first would
    // still report the right project root while every case ran against whatever
    // happened to be installed globally.
    const target = resolveCliTarget(process.env, process.execPath, PROJECT_ROOT);
    assert.equal(
      target.degraded,
      null,
      "the pinned devDependency must resolve without the degraded cmd shim",
    );
    assert.ok(
      String(target.prefixArgs[0]).includes(path.join("node_modules", "warpmetal")),
      `expected the project's own node_modules, got ${String(target.prefixArgs[0])}`,
    );
  });

  it("reports a version at or above the floor this server requires", { skip: SKIP }, async () => {
    const run = await runCli(["--version"]);
    assert.equal(run.exitCode, 0, "`warpmetal --version` must succeed");
    const parsed = parseSemver(run.stdout);
    assert.ok(parsed !== null, `--version printed no parseable version: ${run.stdout.trim()}`);
    assert.equal(
      isBelow(parsed, MIN_CLI_VERSION),
      false,
      `the installed CLI is ${run.stdout.trim()} and this server requires ${joinVersion(MIN_CLI_VERSION)} or newer`,
    );
  });

  it("documents a usage entry for every subcommand in the registry", { skip: SKIP }, async () => {
    const help = await helpText();
    for (const key of subcommandKeys()) {
      const text = helpFor(help, CLI_COMMANDS[key].argv);
      assert.ok(
        text.length > 0,
        `${key} (${CLI_COMMANDS[key].argv.join(" ")}) has no usage entry in --help; either the command moved or this matcher stopped matching`,
      );
    }
  });

  it("documents --idempotency-key for exactly the commands the registry marks", { skip: SKIP }, async () => {
    // The registry's `idempotent: true` is not a preference, it is a claim that
    // the CLI accepts the flag. An unsupported flag is exit 2 before anything
    // runs, so a wrong `true` does not degrade a retry - it breaks the tool.
    const help = await helpText();
    const documented: CliCommandKey[] = [];
    for (const key of subcommandKeys()) {
      const text = helpFor(help, CLI_COMMANDS[key].argv);
      const has = text.includes("--idempotency-key");
      if (has) {
        documented.push(key);
      }
      assert.equal(
        acceptsIdempotencyKey(key),
        has,
        `${key}: the registry says acceptsIdempotencyKey=${String(acceptsIdempotencyKey(key))} but --help says ${String(has)}`,
      );
    }
    assert.deepEqual(
      documented.sort(),
      ["serverPower", "serverReload"],
      "exactly server power and server reload may carry an idempotency key",
    );
  });

  it("documents the --confirm literals the server derives", { skip: SKIP }, async () => {
    // The server never accepts `--confirm` from a client; it derives it from the
    // resolved flags. `<same-action>` is the CLI's own placeholder for a literal
    // that mirrors another argument, which is exactly what the server builds.
    //
    // `sandbox delete` (DELETE) and `sandbox access revoke` (REVOKE) are absent
    // from this table on purpose: the CLI collapses them into
    // `sandbox list|get|action|delete ...` and `... grant|list|get|revoke ...`,
    // so no usage entry states their flags. This suite does not spawn them to
    // find out, because a contract test must not be the thing that discovers a
    // CLI change by mutating something.
    const expected: ReadonlyArray<{ command: readonly string[]; literal: string }> = [
      { command: ["runtime", "install"], literal: "INSTALL" },
      { command: ["sandbox", "create"], literal: "TEMPORARY" },
      { command: ["sandbox", "action"], literal: "<same-action>" },
      { command: ["sandbox", "access", "keygen"], literal: "GENERATE" },
      { command: ["sandbox", "access", "refresh"], literal: "REFRESH" },
      { command: ["server", "power"], literal: "<same-action>" },
      { command: ["server", "reload"], literal: "ERASE" },
    ];
    const help = await helpText();
    for (const { command, literal } of expected) {
      const text = helpFor(help, command);
      assert.ok(
        text.includes(`--confirm ${literal}`),
        `${command.join(" ")} must still document --confirm ${literal}`,
      );
    }
  });

  it("keeps the one granted wait budget on the command whose help documents --wait", { skip: SKIP }, async () => {
    // Exactly one registry entry may grant the CLI a wait budget. Its reason is
    // structural - refresh exists to write a profile this server cannot read -
    // and the flag has to be documented for that command, or sending it would be
    // a usage error rather than a bounded wait.
    const granting = (Object.keys(CLI_COMMANDS) as CliCommandKey[]).filter(
      (key) => registryEntry(key).requiresWait !== undefined,
    );
    assert.deepEqual(granting, ["sandboxAccessRefresh"]);

    const help = await helpText();
    assert.ok(
      helpFor(help, CLI_COMMANDS.sandboxAccessRefresh.argv).includes("--wait"),
      "sandbox access refresh must document --wait, because the registry sends it",
    );
  });

  it("maps a rejected invocation to exit 2 with a structured error", { skip: SKIP }, async () => {
    // Read-only verbs only. Each of these must fail at the parser, before any
    // API call, which is what proves the 2 -> STOPPED mapping in the envelope is
    // still the CLI's own convention rather than a fixture's.
    //
    // A useful detail this pinned: with `--json` present the CLI writes its
    // usage error as JSON, and it writes it to **stderr** with stdout empty. The
    // envelope reads both streams for exactly this reason.
    const probes: ReadonlyArray<readonly string[]> = [
      ["health", "--json", "--definitely-not-a-flag"],
      ["catalog", "--json", "--definitely-not-a-flag"],
      ["server", "get", "--json"],
      ["sandbox", "get", "--json"],
      ["order", "status", "--json"],
      ["operation", "get", "--json"],
    ];

    for (const probe of probes) {
      const run = await runCli(probe);
      assert.equal(
        run.exitCode,
        2,
        `\`warpmetal ${probe.join(" ")}\` must exit 2, got ${String(run.exitCode)}`,
      );
      assert.equal(
        run.stdout.trim(),
        "",
        `\`warpmetal ${probe.join(" ")}\` must put no payload on stdout`,
      );
      assert.match(
        run.stderr,
        /"error"/,
        `\`warpmetal ${probe.join(" ")}\` must describe the failure on stderr`,
      );
    }
  });
});
