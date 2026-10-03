import { knownFlags, parseArgs, type ParsedArgs } from "../args.js";
import { CliError } from "../errors.js";
import { jsonText, type Out, type Redactor } from "../output.js";
import type { CommandRunner } from "../run.js";
import type { CredentialStore } from "../env/store.js";
import type { HttpFn } from "../integration/http.js";
import { findProvider, PROVIDERS } from "../integration/registry.js";
import { adapters, findAdapter, type AdapterContext, type AdapterResult } from "../integration/adapters/index.js";

export interface IntegrationCommandDeps {
  readonly store: CredentialStore;
  readonly out: Out;
  readonly env: NodeJS.ProcessEnv;
  readonly run: CommandRunner;
  readonly http: HttpFn;
  readonly redactor: Redactor;
}

const USAGE = `warpmetal integration - provider integrations

  integration list [--json]                    Providers, capabilities and honest scopes.
  integration status [provider] [--json]       Non-mutating probe. Never a false OK.
  integration <provider> <verb> [flags] [--json]

Providers and verbs come from the catalog; run \`integration list\` to see them.
Mutating verbs require their own --confirm literal.`;

/**
 * The `integration` namespace.
 *
 * Dispatch is a table lookup against the catalog plus the adapter registry, so
 * an unknown provider is a usage error rather than a silent no-op. Exit codes
 * are the contract the bash layer reads: 0 reported (including DEGRADED), 4
 * needs provider auth, 5 the provider rejected the action.
 */
export async function runIntegrationCommand(
  argv: readonly string[],
  deps: IntegrationCommandDeps,
): Promise<number> {
  const [head, ...rest] = argv;

  if (head === undefined || head === "--help" || head === "-h") {
    deps.out.stdout(USAGE);
    return 0;
  }

  if (head === "list") {
    const args = parseArgs(rest);
    knownFlags(args, ["json"]);
    const document = {
      providers: PROVIDERS.map((provider) => ({
        name: provider.name,
        title: provider.title,
        authModes: provider.authModes,
        capabilities: provider.capabilities,
        secretNames: provider.secretNames,
        requiresTools: provider.requiresTools,
        scoping: provider.scoping,
        filesWritten: provider.filesWritten,
        verifyCommand: provider.verifyCommand,
        errorMap: provider.errorMap,
        revoke: provider.revoke,
        ...(provider.notes !== undefined ? { notes: provider.notes } : {}),
        gates: findAdapter(provider.name)?.gates ?? {},
      })),
    };
    if (args.flags.has("json")) {
      deps.out.stdout(jsonText(document));
    } else {
      for (const provider of document.providers) {
        deps.out.stdout(`${provider.name}  (${provider.title})\n`);
        deps.out.stdout(`  capabilities  ${provider.capabilities.join(", ")}\n`);
        deps.out.stdout(`  auth          ${provider.authModes.join(", ")}\n`);
        deps.out.stdout(`  secrets       ${provider.secretNames.join(", ")}\n`);
        deps.out.stdout(`  revoke        ${provider.revoke}\n`);
      }
    }
    return 0;
  }

  if (head === "status") {
    const args = parseArgs(rest);
    knownFlags(args, ["json"]);
    const requested = args.positionals;
    const targets =
      requested.length === 0
        ? dedupe(adapters().map((adapter) => adapter.spec.name))
        : requested.map((name) => {
            if (findProvider(name) === undefined) {
              throw new CliError("usage_error", `Unknown provider: ${name}.`);
            }
            return name;
          });

    const context = adapterContext(deps);
    const results: AdapterResult[] = [];
    for (const name of targets) {
      const adapter = findAdapter(name);
      if (adapter === undefined) continue;
      results.push(await adapter.status(context));
    }

    if (args.flags.has("json")) {
      deps.out.stdout(jsonText({ status: worst(results), results }));
    } else {
      for (const result of results) {
        deps.out.stdout(`${result.provider ?? "?"}  ${result.status}`);
        if (result.mode !== undefined) deps.out.stdout(`  (${result.mode})`);
        deps.out.stdout("\n");
        for (const warning of result.warnings ?? []) deps.out.stdout(`  ! ${warning}\n`);
        for (const error of result.errors ?? []) deps.out.stderr(`  x ${error}\n`);
      }
    }
    return exitCodeForResults(results);
  }

  const providerName = head;
  const verb = rest[0];
  if (findProvider(providerName) === undefined) {
    throw new CliError("usage_error", `Unknown provider: ${providerName}. Run \`warpmetal integration list\`.`);
  }
  if (verb === undefined) {
    throw new CliError("usage_error", `Missing verb for ${providerName}. Run \`warpmetal integration list\`.`);
  }

  const adapter = findAdapter(providerName)!;
  const args: ParsedArgs = parseArgs(rest.slice(1));
  const result = await adapter.run(verb, args, adapterContext(deps));

  if (args.flags.has("json")) {
    deps.out.stdout(jsonText({ status: worst([result]), results: [result] }, deps.redactor));
  } else {
    deps.out.stdout(`${providerName} ${verb}: ${result.status}\n`);
    for (const warning of result.warnings ?? []) deps.out.stderr(`warning: ${warning}\n`);
    for (const error of result.errors ?? []) deps.out.stderr(`error: ${error}\n`);
    if (result.data !== undefined) deps.out.stdout(`${JSON.stringify(deps.redactor.value(result.data), null, 2)}\n`);
  }
  return exitCodeForResults([result]);
}

function adapterContext(deps: IntegrationCommandDeps): AdapterContext {
  return {
    store: deps.store,
    env: deps.env,
    run: deps.run,
    http: deps.http,
    redactor: deps.redactor,
  };
}

function dedupe(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

/** The worst status across results, so an aggregate is never rosier than a part. */
function worst(results: readonly AdapterResult[]): AdapterResult["status"] {
  const order: AdapterResult["status"][] = ["ERROR", "NEEDS_AUTH", "DEGRADED", "OK"];
  for (const status of order) {
    if (results.some((result) => result.status === status)) return status;
  }
  return "OK";
}

function exitCodeForResults(results: readonly AdapterResult[]): number {
  if (results.some((result) => result.status === "ERROR")) return 5;
  if (results.some((result) => result.status === "NEEDS_AUTH")) return 4;
  // DEGRADED deliberately exits 0: the probe ran and reported honestly, and the
  // caller reads `status` from the JSON rather than guessing from the exit code.
  return 0;
}
