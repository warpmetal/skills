import { CliError, errorCodeFor, errorMessage, exitCodeFor } from "./errors.js";
import { createOut, jsonText, Redactor, type Out } from "./output.js";
import { createRunner, type CommandRunner } from "./run.js";
import { createHttp } from "./integration/http.js";
import { CredentialStore } from "./env/store.js";
import type { EnvPaths } from "./env/paths.js";
import { runEnvCommand } from "./commands/env.js";
import { runIntegrationCommand } from "./commands/integration.js";
import {
  defaultInheritSpawn,
  delegate,
  resolveUpstream,
  upstreamVersion,
  type InheritSpawn,
  type UpstreamTarget,
} from "./upstream.js";
import { packageVersion } from "./version.js";

/**
 * The dispatcher.
 *
 * A closed allowlist of locally implemented namespaces; everything else is
 * forwarded verbatim to the published upstream CLI. The allowlist is the whole
 * design: adding a namespace here is a deliberate act, and an unlisted command
 * can never be half-implemented by accident.
 */
export interface CliDeps {
  readonly env?: NodeJS.ProcessEnv;
  readonly out?: Out;
  readonly paths?: Partial<EnvPaths>;
  readonly store?: CredentialStore;
  readonly run?: CommandRunner;
  readonly fetchFn?: typeof fetch;
  readonly spawnInherit?: InheritSpawn;
  /** `undefined` resolves normally; `null` forces "upstream unavailable". */
  readonly upstream?: UpstreamTarget | null;
  readonly readStdin?: () => Promise<string>;
  readonly isTTY?: boolean;
  readonly platform?: NodeJS.Platform;
  readonly fromDir?: string;
}

const LOCAL_NAMESPACES = new Set(["env", "integration"]);

const USAGE = `warpmetal - infrastructure CLI

  warpmetal env ...            Credential store (this package)
  warpmetal integration ...    Provider integrations (this package)
  warpmetal <anything else>    Forwarded verbatim to the upstream CLI

  --version                    Local version plus the resolved upstream
  --help                       This text

Nothing outside \`env\` and \`integration\` is interpreted here.
`;

export async function runCli(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const out = deps.out ?? createOut();

  try {
    return await dispatch(argv, { ...deps, env, out });
  } catch (error) {
    const message = errorMessage(error);
    const code = errorCodeFor(error);
    // A machine consumer (the bash layer) asks for --json errors; a human gets
    // a single stderr line. Neither carries a secret value.
    if (argv.includes("--json")) {
      out.stdout(jsonText({ ok: false, error: code, message }));
    }
    out.stderr(`warpmetal: ${message}\n`);
    return exitCodeFor(error);
  }
}

interface ResolvedDeps extends CliDeps {
  readonly env: NodeJS.ProcessEnv;
  readonly out: Out;
}

async function dispatch(argv: readonly string[], deps: ResolvedDeps): Promise<number> {
  const head = argv[0];

  if (head === undefined || head === "--help" || head === "-h" || head === "help") {
    deps.out.stdout(USAGE);
    return 0;
  }

  if (head === "--version" || head === "-v" || head === "version") {
    const target = resolveTarget(deps);
    const spawn = deps.spawnInherit ?? defaultInheritSpawn();
    const upstream = await upstreamVersion(target, spawn);
    deps.out.stdout(`warpmetal ${packageVersion()}\nupstream ${upstream}\n`);
    return 0;
  }

  if (LOCAL_NAMESPACES.has(head)) {
    const store = deps.store ?? (await CredentialStore.open({
      paths: deps.paths,
      env: deps.env,
      preferKeychain: true,
      vaultHttp: createHttp(deps.fetchFn ?? fetch),
    }));

    if (head === "env") {
      return runEnvCommand(argv.slice(1), {
        store,
        out: deps.out,
        env: deps.env,
        readStdin: deps.readStdin ?? defaultReadStdin,
        isTTY: deps.isTTY ?? process.stdin.isTTY === true,
        platform: deps.platform ?? process.platform,
      });
    }

    return runIntegrationCommand(argv.slice(1), {
      store,
      out: deps.out,
      env: deps.env,
      run: deps.run ?? createRunner(),
      http: createHttp(deps.fetchFn ?? fetch),
      redactor: new Redactor(),
    });
  }

  const target = resolveTarget(deps);
  if (target === null) {
    throw new CliError(
      "usage_error",
      "The upstream warpmetal CLI is not installed. Run `npm install` so packages/warpmetal-cli can resolve it, or point WARPMETAL_UPSTREAM_CLI_JS at its entry file.",
    );
  }
  return delegate(argv, target, deps.spawnInherit ?? defaultInheritSpawn());
}

function resolveTarget(deps: ResolvedDeps): UpstreamTarget | null {
  if (deps.upstream !== undefined) return deps.upstream;
  return resolveUpstream({ env: deps.env, ...(deps.fromDir !== undefined ? { fromDir: deps.fromDir } : {}) });
}

async function defaultReadStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}
