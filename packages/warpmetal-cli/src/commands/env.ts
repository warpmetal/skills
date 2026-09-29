import { statSync } from "node:fs";

import { knownFlags, parseArgs, requireConfirm, requireFlag } from "../args.js";
import { CliError } from "../errors.js";
import { jsonText, type Out } from "../output.js";
import { PROVIDERS } from "../integration/registry.js";
import type { CredentialStore } from "../env/store.js";

export interface EnvCommandDeps {
  readonly store: CredentialStore;
  readonly out: Out;
  readonly env: NodeJS.ProcessEnv;
  readonly readStdin: () => Promise<string>;
  readonly isTTY: boolean;
  readonly platform: NodeJS.Platform;
}

const USAGE = `warpmetal env - the credential store

  env secret <name> --stdout        Emit one secret on stdout. Nothing else may read it.
  env list [--json]                 List secret names (never values).
  env status [--json]               Backend, generation and secret count.
  env plan [--json]                 Read-only: which provider secrets exist and which are missing.
  env doctor [--json]               Diagnose the store. Never prints a secret.
  env store set <name> --stdin      Store a secret read from stdin.
  env store set <name> --from-env V  Store a secret read from an environment variable.
  env store remove <name>           Remove one secret.
  env store rotate --confirm ROTATE Bump the generation without touching values.
  env store destroy --confirm DESTROY  Delete the vault and its local key material.
  env revoke --service <name> --confirm REVOKE  Remove a provider namespace.
`;

/**
 * The `env` namespace.
 *
 * The one invariant that shapes every branch here: a secret value leaves the
 * process through exactly two paths, `env secret --stdout` and the encrypted
 * vault. It never enters argv, a plan, a status document or a `--json` payload.
 */
export async function runEnvCommand(argv: readonly string[], deps: EnvCommandDeps): Promise<number> {
  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case undefined:
    case "--help":
    case "-h":
      deps.out.stdout(USAGE);
      return 0;
    case "secret":
      return secret(parseArgs(rest), deps);
    case "list":
      return list(parseArgs(rest), deps);
    case "status":
      return status(parseArgs(rest), deps);
    case "plan":
      return plan(parseArgs(rest), deps);
    case "doctor":
      return doctor(parseArgs(rest), deps);
    case "revoke":
      return revoke(parseArgs(rest), deps);
    case "store":
      return store(rest, deps);
    default:
      throw new CliError("usage_error", `Unknown env command: ${subcommand}. Run \`warpmetal env --help\`.`);
  }
}

async function secret(args: ReturnType<typeof parseArgs>, deps: EnvCommandDeps): Promise<number> {
  knownFlags(args, ["stdout", "json"]);
  const name = args.positionals[0];
  if (name === undefined) throw new CliError("usage_error", "Missing secret name.");

  // The explicit flag is not ceremony: it is the acknowledgement that the
  // operator intends a raw value on a stream, which is the only moment this
  // CLI ever writes one.
  if (!args.flags.has("stdout")) {
    throw new CliError(
      "usage_error",
      "Secrets are only emitted with --stdout. Use `warpmetal env secret NAME --stdout`.",
    );
  }
  if (args.flags.has("json")) {
    throw new CliError("usage_error", "--json is not allowed here: it would serialize a secret.");
  }

  const value = await deps.store.read(name);
  if (value === null) {
    throw new CliError("secret_missing", `No secret named ${name} in the store.`);
  }
  // No trailing newline: consumers embed this in files and `!command` indirection.
  deps.out.stdout(value);
  return 0;
}

async function list(args: ReturnType<typeof parseArgs>, deps: EnvCommandDeps): Promise<number> {
  knownFlags(args, ["json"]);
  const names = await deps.store.list();
  if (args.flags.has("json")) {
    deps.out.stdout(jsonText({ count: names.length, names }));
  } else if (names.length === 0) {
    deps.out.stdout("No secrets stored.\n");
  } else {
    deps.out.stdout(`${names.join("\n")}\n`);
  }
  return 0;
}

async function status(args: ReturnType<typeof parseArgs>, deps: EnvCommandDeps): Promise<number> {
  knownFlags(args, ["json"]);
  const current = await deps.store.status();
  const document = {
    backend: current.backend.kind,
    location: current.backend.location,
    detail: current.backend.detail,
    exists: current.exists,
    generation: current.generation,
    secretCount: current.secretCount,
  };
  if (args.flags.has("json")) {
    deps.out.stdout(jsonText(document));
  } else {
    deps.out.stdout(`backend     ${document.backend}\n`);
    deps.out.stdout(`location    ${document.location}\n`);
    deps.out.stdout(`generation  ${document.generation}\n`);
    deps.out.stdout(`secrets     ${document.secretCount}\n`);
    deps.out.stdout(`note        ${document.detail}\n`);
  }
  return 0;
}

/**
 * Read-only preview. It answers "what is configured, what is missing" for a
 * fresh machine, and it is safe to run in CI because it never touches a
 * provider and never prints a value.
 */
async function plan(args: ReturnType<typeof parseArgs>, deps: EnvCommandDeps): Promise<number> {
  knownFlags(args, ["json"]);
  const current = await deps.store.status();

  const providers = [];
  for (const provider of PROVIDERS) {
    const secrets = [];
    for (const name of provider.secretNames) {
      secrets.push({ name, present: await deps.store.has(name) });
    }
    const present = secrets.filter((entry) => entry.present).length;
    providers.push({
      name: provider.name,
      capabilities: provider.capabilities,
      secrets,
      configured: present > 0,
      // A provider is only "ready" when every secret it declares is present;
      // a partial configuration is called out rather than rounded up.
      ready: present === secrets.length,
      revoke: provider.revoke,
    });
  }

  const document = {
    backend: current.backend.kind,
    generation: current.generation,
    providers,
    pendingChanges: 0,
    note: "Read-only preview. This command never writes and never contacts a provider.",
  };

  if (args.flags.has("json")) {
    deps.out.stdout(jsonText(document));
  } else {
    deps.out.stdout("Provider     Ready  Secrets\n");
    for (const provider of providers) {
      const state = provider.ready ? "yes" : provider.configured ? "partial" : "no";
      const secrets = provider.secrets.map((entry) => `${entry.name}:${entry.present ? "ok" : "missing"}`).join(", ");
      deps.out.stdout(`${provider.name.padEnd(12)} ${state.padEnd(6)} ${secrets}\n`);
    }
  }
  return 0;
}

/**
 * Diagnostics. Every check reports a name and an outcome; none of them reads a
 * value out of the store, so `doctor` is safe to paste into a ticket.
 */
async function doctor(args: ReturnType<typeof parseArgs>, deps: EnvCommandDeps): Promise<number> {
  knownFlags(args, ["json"]);
  const checks: Array<{ name: string; status: "ok" | "warn" | "error"; detail: string }> = [];
  const warnings: string[] = [];

  const current = await deps.store.status();
  checks.push({ name: "backend", status: "ok", detail: current.backend.kind });

  try {
    await deps.store.assertReadable();
    checks.push({ name: "vault", status: "ok", detail: current.exists ? "decrypted successfully" : "not created yet" });
  } catch (error) {
    checks.push({ name: "vault", status: "error", detail: (error as Error).message });
  }

  if (deps.platform !== "win32" && current.backend.kind === "file") {
    for (const path of [current.backend.location]) {
      try {
        const mode = statSync(path).mode & 0o777;
        if ((mode & 0o077) !== 0) {
          checks.push({ name: "permissions", status: "warn", detail: `${path} is ${mode.toString(8)}; expected 600.` });
          warnings.push("The vault is readable by other users.");
        } else {
          checks.push({ name: "permissions", status: "ok", detail: `${path} is 600.` });
        }
      } catch {
        checks.push({ name: "permissions", status: "ok", detail: "vault not created yet" });
      }
    }
  }

  if (!deps.isTTY) {
    warnings.push("Not attached to a TTY; interactive prompts are unavailable.");
  }

  for (const provider of PROVIDERS) {
    let present = 0;
    for (const name of provider.secretNames) {
      if (await deps.store.has(name)) present += 1;
    }
    const status = present === 0 ? "warn" : present === provider.secretNames.length ? "ok" : "warn";
    checks.push({
      name: `provider:${provider.name}`,
      status,
      detail: `${present}/${provider.secretNames.length} secrets present`,
    });
  }

  const errors = checks.filter((check) => check.status === "error").length;
  const document = { ok: errors === 0, checks, warnings };

  if (args.flags.has("json")) {
    deps.out.stdout(jsonText(document));
  } else {
    for (const check of checks) deps.out.stdout(`${check.status.padEnd(5)} ${check.name.padEnd(22)} ${check.detail}\n`);
    for (const warning of warnings) deps.out.stderr(`warning: ${warning}\n`);
  }
  return errors === 0 ? 0 : 5;
}

/**
 * `revoke` removes the local material and states plainly what it cannot do:
 * this CLI has no way to revoke a token at the provider, and a namespace
 * removal is not a revocation. Reporting `unsupported`/`uncertain` here is the
 * whole point of the command.
 */
async function revoke(args: ReturnType<typeof parseArgs>, deps: EnvCommandDeps): Promise<number> {
  knownFlags(args, ["service", "confirm", "json"]);
  const service = requireFlag(args, "service");
  requireConfirm(args, "REVOKE");

  const provider = PROVIDERS.find((entry) => entry.name === service);
  const removed = await deps.store.removeService(service);

  const document = {
    service,
    removed,
    removedCount: removed.length,
    upstream: provider?.revoke ?? "uncertain",
    upstreamNote:
      provider?.revoke === "unsupported"
        ? "This CLI cannot revoke credentials at this provider. Revoke them in the provider's dashboard."
        : provider?.revoke === "uncertain"
          ? "Upstream revocation was not verified. Confirm it in the provider's dashboard."
          : "No provider-side credential is expected to exist.",
    remaining: (await deps.store.list()).length,
  };

  if (args.flags.has("json")) {
    deps.out.stdout(jsonText(document));
  } else {
    deps.out.stdout(`removed ${document.removedCount} secret(s) for ${service}\n`);
    deps.out.stdout(`upstream revocation: ${document.upstream}\n`);
    deps.out.stdout(`${document.upstreamNote}\n`);
  }
  return 0;
}

async function store(argv: readonly string[], deps: EnvCommandDeps): Promise<number> {
  const [action, ...rest] = argv;
  const args = parseArgs(rest);

  switch (action) {
    case "set": {
      knownFlags(args, ["stdin", "from-env"]);
      const name = args.positionals[0];
      if (name === undefined) throw new CliError("usage_error", "Missing secret name.");
      const fromEnv = args.flags.get("from-env");
      if (args.flags.has("stdin") && typeof fromEnv === "string") {
        throw new CliError("usage_error", "Use either --stdin or --from-env, not both.");
      }
      if (typeof fromEnv === "string") {
        const value = deps.env[fromEnv];
        if (value === undefined || value.length === 0) {
          throw new CliError("secret_missing", `Environment variable ${fromEnv} is not set.`);
        }
        await deps.store.write(name, value);
      } else if (args.flags.has("stdin")) {
        if (deps.isTTY) {
          throw new CliError("usage_error", "Refusing to read a secret from an interactive terminal. Pipe it in instead.");
        }
        const raw = await deps.readStdin();
        // Strip exactly one trailing newline from the pipe; that is transport,
        // not part of the secret.
        const value = raw.endsWith("\r\n") ? raw.slice(0, -2) : raw.endsWith("\n") ? raw.slice(0, -1) : raw;
        await deps.store.write(name, value);
      } else {
        throw new CliError("usage_error", "Secrets are never passed as arguments. Use --stdin or --from-env.");
      }
      deps.out.stdout(`stored ${name}\n`);
      return 0;
    }
    case "remove": {
      knownFlags(args, []);
      const name = args.positionals[0];
      if (name === undefined) throw new CliError("usage_error", "Missing secret name.");
      const removed = await deps.store.remove(name);
      deps.out.stdout(removed ? `removed ${name}\n` : `no secret named ${name}\n`);
      return removed ? 0 : 3;
    }
    case "status":
      return status(args, deps);
    case "rotate": {
      knownFlags(args, ["confirm", "json"]);
      requireConfirm(args, "ROTATE");
      const generation = await deps.store.rotate();
      if (args.flags.has("json")) deps.out.stdout(jsonText({ generation }));
      else deps.out.stdout(`generation ${generation}\n`);
      return 0;
    }
    case "destroy": {
      knownFlags(args, ["confirm", "json"]);
      requireConfirm(args, "DESTROY");
      await deps.store.destroy();
      if (args.flags.has("json")) deps.out.stdout(jsonText({ destroyed: true }));
      else deps.out.stdout("vault destroyed\n");
      return 0;
    }
    default:
      throw new CliError("usage_error", `Unknown env store action: ${String(action)}.`);
  }
}
