/**
 * exec.ts - the only place that runs a process.
 *
 * Invariants, in order of importance:
 *
 *   1. No shell, ever. `shell: true` and `exec()` with a command string are
 *      absent by design. On Windows the npm shim (`warpmetal.cmd`) cannot be
 *      spawned without a shell (Node >= 18.20, CVE-2024-27980), so we resolve
 *      the underlying `bin/warpmetal.js` and spawn it with the current Node
 *      binary instead. That removes the shell rather than working around it.
 *   2. Tools do not build strings. They name a command from a closed registry
 *      and pass typed flags, which are validated before anything is spawned.
 *   3. Flags that would make a tool block (`--wait`, `--timeout-seconds`) are
 *      refused outright, in every command. Waiting is the MCP server's job: it
 *      runs a bounded, interruptible loop over single polls, so it can give up
 *      honestly instead of being stuck inside a CLI call.
 *   4. The executor never reads WarpMetal state or identity files. It resolves
 *      the CLI binary through public `package.json` metadata and passes identity
 *      paths through untouched.
 *   5. A failure to parse JSON is never silent. It becomes a FAILED result with
 *      the stderr tail attached.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Semaphore, resolveConcurrencyLimit } from "./limits.js";

import {
  SPAWN_FAILED_EXIT_CODE,
  TIMEOUT_EXIT_CODE,
  cap,
  tailLines,
} from "./result.js";

export interface CliCommandSpec {
  readonly argv: readonly string[];
  readonly json: boolean;
  /**
   * True when the CLI accepts `--idempotency-key`. This is not a formality: when
   * the flag is absent the CLI mints a **fresh** key per invocation
   * (`idempotencyKey(kind)` in `src/cli.js`), so two invocations after a timeout
   * are two independent requests to the API. Supplying a key derived from the
   * approval is what makes a retry the same request, and it is the only thing
   * that does.
   */
  readonly idempotent?: boolean;
  /**
   * Set only for a command this server chooses to let wait. The value is the
   * seconds budget granted to the CLI; the registry, never a client, decides it.
   *
   * Exactly one command qualifies, and the reason is structural rather than
   * convenient: `sandbox access refresh` exists to write a connection profile to
   * disk, and this server never reads a file (see the no-private-state-reads
   * rule). So a profile it cannot look at is a profile it cannot poll for -
   * the only way to know the write happened is to let the CLI say so. `--wait`
   * is documented for this command, so sending it cannot be a usage error.
   * Everything else is polled from here instead.
   */
  readonly requiresWait?: number;
}

/**
 * The closed command registry. A tool may only name a key from this object, so
 * there is no way to express an arbitrary argv through the MCP surface.
 */
export const CLI_COMMANDS = {
  // --- Read-only surface ---
  version: { argv: ["--version"], json: false },
  health: { argv: ["health"], json: true },
  catalog: { argv: ["catalog"], json: true },
  stateList: { argv: ["state", "list"], json: true },
  identityList: { argv: ["identity", "list"], json: true },
  serverGet: { argv: ["server", "get"], json: true },
  serverIdentity: { argv: ["server", "identity"], json: true },
  serverLogin: { argv: ["server", "login"], json: true },
  operationGet: { argv: ["operation", "get"], json: true },
  runtimeGet: { argv: ["runtime", "get"], json: true },
  sandboxList: { argv: ["sandbox", "list"], json: true },
  sandboxGet: { argv: ["sandbox", "get"], json: true },
  orderStatus: { argv: ["order", "status"], json: true },

  // --- Additional read-only surface ---
  sandboxAccessList: { argv: ["sandbox", "access", "list"], json: true },
  sandboxAccessGet: { argv: ["sandbox", "access", "get"], json: true },

  // --- Non-destructive mutations.
  // Deliberately absent from this group: `server power`, `server reload`,
  // `sandbox delete`, `sandbox access revoke`, and the `make_persistent` /
  // `refresh_image` sandbox actions. They are the irreversible verbs, and they
  // live in the separate group below, behind the hardened broker.
  //
  // No non-destructive mutation carries `idempotent: true`, and the reason is
  // evidential rather than technical. Two sources disagree about which commands
  // accept `--idempotency-key`, and neither confirms it for the six here:
  //
  //   - `warpmetal --help` (0.8.12) prints the flag for `order prepare`,
  //     `server power`, `server reload` and the four `notifications` commands,
  //     and omits it from every `runtime` and `sandbox` line.
  //   - `the vendor's CLI reference` prints it for `runtime enable` alone, and
  //     for none of the other five.
  //
  // An unsupported flag makes this CLI exit 2 with a usage error before it does
  // anything, so a wrong `true` here does not degrade a retry - it breaks the
  // tool outright. The flag is therefore supplied only where a source states it
  // is accepted, which for these six is nowhere. Flipping one is a one-line
  // change, but only against a source that states it; until then,
  // `acceptsIdempotencyKey` returns false and the retry warning says the
  // retry is a genuinely new request, which is the honest description.
  runtimeEnable: { argv: ["runtime", "enable"], json: true },
  runtimeInstall: { argv: ["runtime", "install"], json: true },
  sandboxCreate: { argv: ["sandbox", "create"], json: true },
  sandboxAction: { argv: ["sandbox", "action"], json: true },
  sandboxAccessKeygen: { argv: ["sandbox", "access", "keygen"], json: true },
  sandboxAccessGrant: { argv: ["sandbox", "access", "grant"], json: true },

  // --- Irreversible surface.
  // Unlike the non-destructive keys, these are reachable, so the guarantee is no longer
  // "the verb does not exist". It is stronger in a different way: every one of
  // them declares a consequence the caller must name, is re-verified against
  // live data in the apply, and is refused outright for an id this server has
  // seen reach `manual_review`.
  //
  // `server power` and `server reload` are the two commands here where BOTH
  // sources agree `--idempotency-key` exists: the installed CLI's `--help`
  // prints it on both usage lines, and `the vendor's CLI reference` prints it
  // too. That agreement is the whole test, which is why these two are marked
  // and `sandbox delete`, `sandbox access revoke` and `sandbox action` are not.
  serverPower: { argv: ["server", "power"], json: true, idempotent: true },
  serverReload: { argv: ["server", "reload"], json: true, idempotent: true },
  sandboxDelete: { argv: ["sandbox", "delete"], json: true },
  sandboxAccessRevoke: { argv: ["sandbox", "access", "revoke"], json: true },

  // The single bounded exception to the no-blocking rule, and its reason is
  // structural rather than convenient. `sandbox access refresh` exists to write
  // a connection profile to disk, and this server never reads a file, so a
  // profile it cannot look at is a profile it cannot poll for. `--wait` is
  // documented for this command, so sending it is safe as well as necessary.
  //
  // The budget is 25 s so that it stays inside the executor's 30 s death clock:
  // the CLI must run out of patience first and exit 8 (PENDING), because a
  // SIGKILL here would leave a profile half-written with no way to tell. A test
  // holds the ordering.
  sandboxAccessRefresh: {
    argv: ["sandbox", "access", "refresh"],
    json: true,
    requiresWait: 25,
  },
} as const satisfies Record<string, CliCommandSpec>;

export type CliCommandKey = keyof typeof CLI_COMMANDS;

/** Whether a command takes a server-supplied idempotency key. */
export function acceptsIdempotencyKey(key: CliCommandKey): boolean {
  const spec: CliCommandSpec = CLI_COMMANDS[key];
  return spec.idempotent === true;
}

/** Derived from the registry, then re-checked at build time. Belt and braces. */
const ALLOWED_SUBCOMMANDS: ReadonlySet<string> = new Set(
  Object.values(CLI_COMMANDS).map((spec) => spec.argv.join(" ")),
);

function specFor(key: CliCommandKey): CliCommandSpec {
  return CLI_COMMANDS[key];
}

/** Flags that turn a bounded call into a blocking one. Refused, not filtered. */
export const FORBIDDEN_FLAGS: readonly string[] = ["wait", "timeout-seconds"];

const FLAG_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const DEGRADED_ARG_PATTERN = /^[A-Za-z0-9._/:=@+-]+$/;

export type CliFlagValue = string | true;
export type CliFlags = Readonly<Record<string, CliFlagValue>>;

/**
 * Headroom between the budget granted to a waiting CLI and the executor's death
 * clock. Positive on purpose: the CLI must be the one to give up, so it can
 * report exit 8 and leave a coherent state, instead of being killed mid-write.
 */
export const WAIT_HEADROOM_MS = 5_000;

/** The caller asked for something the executor is not allowed to do. */
export class CliDeniedError extends Error {
  readonly deniedReason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "CliDeniedError";
    this.deniedReason = reason;
  }
}

/** No usable warpmetal CLI was found. */
export class CliResolutionError extends Error {
  readonly tried: readonly string[];
  constructor(message: string, tried: readonly string[]) {
    super(message);
    this.name = "CliResolutionError";
    this.tried = tried;
  }
}

/**
 * Builds an argv array from a registry key and typed flags.
 * Throws CliDeniedError for anything outside the closed set.
 */
export function buildArgv(key: CliCommandKey, flags: CliFlags = {}): string[] {
  const spec = specFor(key);
  if (spec === undefined) {
    throw new CliDeniedError(`unknown command key: ${String(key)}`);
  }

  const subcommand = spec.argv.join(" ");
  if (!ALLOWED_SUBCOMMANDS.has(subcommand)) {
    throw new CliDeniedError(`subcommand not in the allowlist: ${subcommand}`);
  }

  const argv: string[] = [...spec.argv];

  for (const [name, value] of Object.entries(flags)) {
    if (!FLAG_NAME_PATTERN.test(name)) {
      throw new CliDeniedError(`invalid flag name: ${name}`);
    }
    if (FORBIDDEN_FLAGS.includes(name)) {
      throw new CliDeniedError(
        `flag --${name} is not allowed: waiting is the server's job, so no CLI call may block`,
      );
    }
    // A boolean flag is a server-owned constant that happens to be valueless.
    // It is rendered as a bare `--name`, which is why a caller can never smuggle
    // a value in through one.
    if (value === true) {
      argv.push(`--${name}`);
      continue;
    }
    // A value never needs a control character, and allowing one would let output
    // framing be forged by a reader of progress records.
    if (CONTROL_CHARS.test(value)) {
      throw new CliDeniedError(`flag --${name} has a control character in its value`);
    }
    argv.push(`--${name}`, value);
  }

  // The one documented exception to the no-blocking rule. Both flags come from
  // the registry, never from the caller, so `--wait` remains unexpressible
  // through the MCP surface even though this one command uses it.
  if (spec.requiresWait !== undefined) {
    argv.push("--wait", "--timeout-seconds", String(spec.requiresWait));
  }

  if (spec.json) {
    argv.push("--json");
  }
  return argv;
}

export interface CliTarget {
  command: string;
  prefixArgs: readonly string[];
  /** Non-null when running through a documented degraded path. */
  degraded: string | null;
  description: string;
  /**
   * The CLI's own published version, read from the public `package.json` that
   * was already being opened to find the binary. Null when the target was not
   * reached through a package manifest - an explicit `WARPMETAL_CLI_JS`
   * override, a bare PATH executable, or the degraded cmd shim.
   *
   * Null means *unknown*, never "fine": the version gate treats an unknown
   * version as nothing to refuse on, because refusing on a version nobody read
   * would block a perfectly good CLI on a host this server could not inspect.
   */
  version: string | null;
}

const PACKAGE_SUBDIRS: readonly string[] = [
  path.join("node_modules", "warpmetal"),
  path.join("node_modules", "@warpmetal", "warpmetal"),
];

const KNOWN_BIN_RELATIVE = path.join("bin", "warpmetal.js");

/**
 * The project's own root, found by walking up until a directory owns a
 * `node_modules`. Only existence is probed; no file inside it is opened.
 *
 * This is what lets a locally installed `warpmetal` win over a global one,
 * which is what makes the pinned devDependency mean anything: the server ships
 * with the CLI pinned, and a host that has both should use the pinned one.
 */
export function findProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(current, "node_modules"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

/** A resolved package bin and the version published beside it. */
interface PackageBin {
  bin: string;
  version: string | null;
}

/**
 * Finds the JS entry point of the warpmetal package below `root`, plus the
 * version from the same public manifest. The manifest is read once and never
 * for anything but `bin` and `version`.
 */
function resolvePackageBin(root: string): PackageBin | null {
  for (const sub of PACKAGE_SUBDIRS) {
    const dir = path.join(root, sub);
    const manifest = path.join(dir, "package.json");

    let meta: unknown = null;
    if (existsSync(manifest)) {
      try {
        meta = JSON.parse(readFileSync(manifest, "utf8"));
      } catch {
        // A malformed manifest is not fatal; keep looking.
        meta = null;
      }
    }
    const record =
      meta !== null && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : null;
    const published = record?.["version"];
    const version = typeof published === "string" ? published : null;

    const known = path.join(dir, KNOWN_BIN_RELATIVE);
    if (existsSync(known)) {
      return { bin: known, version };
    }

    if (record === null) {
      continue;
    }
    const bin: unknown = record["bin"];
    let relative: string | undefined;
    if (typeof bin === "string") {
      relative = bin;
    } else if (bin !== null && typeof bin === "object") {
      const named: unknown = (bin as Record<string, unknown>)["warpmetal"];
      if (typeof named === "string") {
        relative = named;
      }
    }
    if (relative === undefined) {
      continue;
    }
    const full = path.join(dir, relative);
    if (existsSync(full)) {
      return { bin: full, version };
    }
  }
  return null;
}

function splitPath(value: string | undefined, delimiter: string): string[] {
  return (value ?? "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function findOnPath(fileName: string, pathValue: string | undefined): string | null {
  for (const dir of splitPath(pathValue, path.delimiter)) {
    const candidate = path.join(dir, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Resolves how to invoke the CLI, in five ordered steps:
 *   1. WARPMETAL_CLI_JS, an explicit override for an unforeseen layout.
 *   2. The project's own `node_modules`, so the pinned devDependency wins over
 *      a global install. Only the directory's existence is probed.
 *   3. `node_modules/warpmetal` under the Node prefix, every PATH entry, and
 *      %APPDATA%\npm. This is the step that covers the Windows npm shim, by
 *      spawning `process.execPath` with the package's own bin file.
 *   4. On POSIX, a real `warpmetal` executable found on PATH.
 *   5. A documented degraded fallback that goes through cmd.exe, with every
 *      argument strictly validated. Reported as degraded so callers see it.
 *
 * `projectRoot` is an explicit parameter rather than something derived here,
 * because a resolver that silently inspects its own installation directory is
 * untestable: "nothing can be found" would depend on whether the devDependency
 * happened to be installed. Callers that want step 2 pass it; a caller that
 * does not gets the pre-existing four-step order. Defaulting it to
 * WARPMETAL_MCP_CLI_ROOT keeps it overridable without a code change.
 */
export function resolveCliTarget(
  env: NodeJS.ProcessEnv = process.env,
  execPath: string = process.execPath,
  projectRoot: string | null = env["WARPMETAL_MCP_CLI_ROOT"] ?? null,
): CliTarget {
  const tried: string[] = [];

  const override = env["WARPMETAL_CLI_JS"];
  if (override !== undefined && override.length > 0) {
    tried.push(`WARPMETAL_CLI_JS=${override}`);
    if (existsSync(override)) {
      return {
        command: execPath,
        prefixArgs: [override],
        degraded: null,
        description: `WARPMETAL_CLI_JS override (${override})`,
        // The override points at a JS entry, not necessarily at a package this
        // server can attribute a version to. Unknown, so nothing is refused.
        version: null,
      };
    }
  }

  const roots = new Set<string>();
  if (projectRoot !== null && projectRoot.length > 0) {
    roots.add(path.normalize(projectRoot));
  }
  roots.add(path.dirname(execPath));
  for (const entry of splitPath(env["PATH"], path.delimiter)) {
    roots.add(path.normalize(entry));
  }
  const appData = env["APPDATA"];
  if (appData !== undefined && appData.length > 0) {
    roots.add(path.join(appData, "npm"));
  }

  for (const root of roots) {
    tried.push(path.join(root, "node_modules", "warpmetal"));
    const pkg = resolvePackageBin(root);
    if (pkg !== null) {
      return {
        command: execPath,
        prefixArgs: [pkg.bin],
        degraded: null,
        description: `package bin ${pkg.bin}`,
        version: pkg.version,
      };
    }
  }

  if (process.platform !== "win32") {
    const direct = findOnPath("warpmetal", env["PATH"]);
    if (direct !== null) {
      return {
        command: direct,
        prefixArgs: [],
        degraded: null,
        description: `PATH executable ${direct}`,
        version: null,
      };
    }
    tried.push("PATH entry named warpmetal");
  } else {
    const shim = findOnPath("warpmetal.cmd", env["PATH"]);
    if (shim !== null) {
      tried.push(shim);
      return {
        command: env["ComSpec"] ?? "cmd.exe",
        prefixArgs: ["/d", "/s", "/c", `"${shim}"`],
        degraded:
          "running through the npm cmd shim because the package bin could not be resolved; arguments are strictly validated",
        description: `degraded cmd shim ${shim}`,
        version: null,
      };
    }
  }

  throw new CliResolutionError(
    "warpmetal CLI not found. Install it with: npm install -g warpmetal",
    tried,
  );
}

export interface RunOutcome {
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  /** Parsed JSON payload when the command was expected to emit one. */
  json: unknown;
  jsonFound: boolean;
  durationMs: number;
  warnings: string[];
  /** Human-readable label with no flag values, safe for logs and summaries. */
  subcommand: string;
}

export interface Runner {
  run(key: CliCommandKey, flags?: CliFlags): Promise<RunOutcome>;
  /**
   * The resolved CLI version, or null when it cannot be read from public
   * manifest metadata. Optional on purpose, and omitted by the conformance
   * fakes: a runner that does not expose it is *unknown*, and unknown refuses
   * nothing. That keeps the version gate from quietly adding a process spawn to
   * every apply, which is what a version probe would otherwise cost.
   */
  cliVersion?: () => Promise<string | null>;
}

export const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 5 * 1024 * 1024;

/**
 * Pulls a JSON payload out of CLI output. Handles pretty-printed JSON preceded
 * by progress lines, which is what the real CLI emits (`health --json` prints
 * an indented object).
 */
export function extractJson(stdout: string): { found: boolean; value: unknown } {
  const lines = stdout.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = (lines[i] ?? "").trim();
    if (!line.startsWith("{") && !line.startsWith("[")) {
      continue;
    }
    const candidate = lines.slice(i).join("\n").trim();
    try {
      return { found: true, value: JSON.parse(candidate) };
    } catch {
      // Not the start of the payload; keep scanning upwards.
    }
  }
  const whole = stdout.trim();
  if (whole.startsWith("{") || whole.startsWith("[")) {
    try {
      return { found: true, value: JSON.parse(whole) };
    } catch {
      // Fall through to not-found.
    }
  }
  return { found: false, value: null };
}

export interface RunnerOptions {
  target?: CliTarget;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  /**
   * The project root whose own `node_modules` should win over a global install.
   * `null` disables that step. Omitted means "discover it from this module's
   * location", which is the server's normal mode and never the tests'.
   */
  projectRoot?: string | null;
  /**
   * How many CLI processes may run at once. Omitted reads
   * WM_MAX_CONCURRENT_CLI, which itself defaults to a small finite number.
   * Exposed so it can be pinned without touching the process environment.
   */
  concurrency?: number;
}

interface Collected {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

function collect(
  stream: NodeJS.ReadableStream | null,
  sink: Collected,
  which: "stdout" | "stderr",
): void {
  if (stream === null) {
    return;
  }
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    const current = which === "stdout" ? sink.stdout : sink.stderr;
    if (current.length >= MAX_OUTPUT_CHARS) {
      sink.truncated = true;
      return;
    }
    const next = current + chunk;
    if (next.length > MAX_OUTPUT_CHARS) {
      sink.truncated = true;
      if (which === "stdout") {
        sink.stdout = next.slice(0, MAX_OUTPUT_CHARS);
      } else {
        sink.stderr = next.slice(0, MAX_OUTPUT_CHARS);
      }
      return;
    }
    if (which === "stdout") {
      sink.stdout = next;
    } else {
      sink.stderr = next;
    }
  });
}

export function createCliRunner(options: RunnerOptions = {}): Runner {
  const env = options.env ?? process.env;
  const execPath = options.execPath ?? process.execPath;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // The project's own root, so the pinned CLI wins over a global install. The
  // caller may pass null to disable it, and the tests do, because a resolution
  // step that reads the server's own installation directory would make
  // "nothing can be found" depend on whether the devDependency is installed.
  const projectRoot =
    options.projectRoot === undefined
      ? findProjectRoot(path.dirname(fileURLToPath(import.meta.url)))
      : options.projectRoot;

  // Success is cached; failure is retried, so installing the CLI mid-session
  // does not require restarting the server.
  let cachedTarget: CliTarget | null = options.target ?? null;

  // One semaphore per runner, so the ceiling is per server instance rather than
  // per call. It is created here and never re-read, because a limit that changes
  // under load would let the ceiling be exceeded by the change itself.
  const slots = new Semaphore(options.concurrency ?? resolveConcurrencyLimit(env));

  const targetOnce = (): CliTarget => {
    if (cachedTarget !== null) {
      return cachedTarget;
    }
    const resolved = options.target ?? resolveCliTarget(env, execPath, projectRoot);
    cachedTarget = resolved;
    return resolved;
  };

  return {
    async cliVersion() {
      try {
        return targetOnce().version;
      } catch {
        // A CLI that cannot be found is run()'s failure to report, with the list
        // of paths it tried. Here the version is simply unknown, and unknown
        // refuses nothing rather than inventing a problem.
        return null;
      }
    },

    async run(key, flags = {}) {
      const argv = buildArgv(key, flags);
      const spec = specFor(key);
      const subcommand = spec.argv.join(" ");

      const target = targetOnce();

      if (target.degraded !== null) {
        // The degraded path goes through cmd.exe, so every argument must be
        // provably inert. Anything else is refused rather than escaped.
        for (const arg of argv) {
          if (!DEGRADED_ARG_PATTERN.test(arg)) {
            throw new CliDeniedError(
              `the degraded executor refuses the argument ${JSON.stringify(arg)}`,
            );
          }
        }
      }

      const warnings: string[] = [];
      if (target.degraded !== null) {
        warnings.push(`executor_degraded: ${target.degraded}`);
      }

      // The ceiling is applied here: after every argument check and before the
      // process exists. Nothing above this line costs the CLI anything, so a
      // refusal never holds a slot. The queue wait also happens strictly before
      // the death clock below starts, which is what keeps `sandbox access
      // refresh` inside its own budget - its 25 s wait and this server's 30 s
      // kill both begin when the process does, not when the call did.
      const waited = await slots.acquire();
      if (waited) {
        warnings.push(
          `cli_queue_wait: the CLI concurrency ceiling (${String(slots.limit)}) was saturated; this call waited for a free slot before spawning`,
        );
      }

      const startedAt = Date.now();
      const sink: Collected = { stdout: "", stderr: "", truncated: false };

      // A command that was granted a wait budget needs a death clock that is
      // strictly longer, so the CLI expires on its own terms. The headroom is
      // the ordering guarantee: the CLI exits 8 first, we never SIGKILL a
      // command that was mid-write.
      const effectiveTimeoutMs =
        spec.requiresWait !== undefined
          ? Math.max(timeoutMs, spec.requiresWait * 1000 + WAIT_HEADROOM_MS)
          : timeoutMs;

      const outcome = await new Promise<RunOutcome>((resolve) => {
        let settled = false;
        let timedOut = false;

        const child = spawn(target.command, [...target.prefixArgs, ...argv], {
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        });

        collect(child.stdout, sink, "stdout");
        collect(child.stderr, sink, "stderr");

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, effectiveTimeoutMs);

        const finish = (exitCode: number): void => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);

          const effectiveCode = timedOut ? TIMEOUT_EXIT_CODE : exitCode;
          const parsed = spec.json
            ? extractJson(sink.stdout)
            : { found: false, value: null };

          const localWarnings = [...warnings];
          if (sink.truncated) {
            localWarnings.push(
              `cli_output_truncated: output exceeded ${String(MAX_OUTPUT_CHARS)} characters`,
            );
          }
          if (timedOut) {
            localWarnings.push(
              `cli_timeout: killed after ${String(effectiveTimeoutMs)} ms; the operation may still be running server-side`,
            );
          }
          if (spec.json && !parsed.found && !timedOut && exitCode === 0) {
            localWarnings.push(
              "cli_json_missing: the command succeeded but emitted no parseable JSON",
            );
          }

          resolve({
            exitCode: effectiveCode,
            timedOut,
            stdout: sink.stdout,
            stderr: sink.stderr,
            json: parsed.value,
            jsonFound: parsed.found,
            durationMs: Date.now() - startedAt,
            warnings: localWarnings,
            subcommand,
          });
        };

        child.on("error", (error: Error) => {
          sink.stderr += `\nspawn error: ${error.message}`;
          finish(SPAWN_FAILED_EXIT_CODE);
        });

        child.on("close", (code: number | null) => {
          finish(code ?? SPAWN_FAILED_EXIT_CODE);
        });
        // The slot is freed here rather than in a separate `catch`: this promise
        // is built to resolve exactly once, and its only rejection path is a
        // synchronous throw from `spawn`, which must also free the slot.
      }).finally(() => {
        slots.release();
      });

      return outcome;
    },
  };
}

/** Human-readable tail of stderr, for the errors array. */
export function stderrTail(outcome: RunOutcome): string[] {
  return tailLines(outcome.stderr, 10).map((line) => cap(line, 400));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * The CLI reports its failures as JSON on **stdout** - the same stream as its
 * payloads - so a fully described error can arrive with an empty stderr. An
 * errors array built from stderr alone therefore announced "no diagnostic"
 * while the real reason sat unread in `data.error`: a failure with a perfectly
 * good explanation, reported as an unexplained one.
 *
 * The shape is `{ error: { type, code, message } }`, and `message` normally
 * repeats the code, so the message is preferred on its own. A payload without a
 * recognisable error object contributes nothing, which is what stops a success
 * that happens to carry `error: null` from inventing a diagnostic.
 */
export function stdoutErrorTail(outcome: RunOutcome): string[] {
  const payload = asRecord(outcome.json);
  const error = asRecord(payload?.["error"]);
  if (error === null) {
    return [];
  }
  const message = error["message"];
  const code = error["code"];
  const detail =
    typeof message === "string" ? message : typeof code === "string" ? code : null;
  return detail === null ? [] : [cap(detail, 400)];
}
