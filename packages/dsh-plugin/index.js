/**
 * index.js - the `warpmetalLocal` service: where the MCP server lives.
 *
 * The loaded configuration cannot contain the artifact's absolute path: it is a
 * generated, install-located directory, and a path baked into a patch would be
 * wrong on the next machine and would leak a developer checkout. So the path is
 * resolved here, at load time, from `import.meta.url`, and published as a
 * service that the `@deepseek-ai/dsh-mcp-client` row reads through its own
 * `!!js` config (the documented pattern for rows that need a computed value).
 *
 * This module deliberately imports nothing from `@deepseek-ai`: the plugin is a
 * namespace module (`name`/`apply`, never `export default`, which the Loader
 * unwraps and strips of its named exports), and `ctx.provide` is the shipped
 * Cordis service-registration API. A bundle with no DSH imports has no peer
 * range to guess and no install-time resolution to fail.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const name = "warpmetal-local";

/** The MCP surface the plugin serves. `full` adds the provider tools. */
const PROFILES = new Set(["chatgpt-local", "full"]);

/**
 * The runtime facts `resolveNodeCommand` needs, isolated so the logic is
 * testable without faking `process`.
 *
 * `isElectron` matters because the desktop host runs inside Electron: there
 * `process.execPath` is the Electron binary, which cannot execute the MCP
 * server. Under the CLI and web hosts the harness process *is* Node, so
 * `execPath` is exactly the right command.
 */
export function nodeRuntime(proc = process) {
  return {
    execPath: proc.execPath,
    isElectron: typeof proc.versions?.electron === "string",
    win32: proc.platform === "win32",
  };
}

/**
 * The command that launches the MCP server, in precedence order:
 *
 *  1. an explicit override (`config.command`);
 *  2. `WARPMETAL_DSH_NODE`, then `DSH_NODE`;
 *  3. under Electron, the harness's own Node, found next to the Electron binary
 *     at `resources/runtime/primary-runtime/dependencies/node/bin/`;
 *  4. under a Node host, `process.execPath` (the same choice the shipped MCP
 *     fixtures make with `!!js process.execPath`).
 *
 * Pure: it reads nothing from the filesystem, so the whole ladder is testable.
 */
export function resolveNodeCommand(config, env, runtime) {
  const explicit = config.command ?? env.WARPMETAL_DSH_NODE ?? env.DSH_NODE;
  if (explicit) return explicit;
  if (runtime.isElectron) {
    const bin = runtime.win32 ? "node.exe" : "node";
    return join(
      dirname(runtime.execPath),
      "resources",
      "runtime",
      "primary-runtime",
      "dependencies",
      "node",
      "bin",
      bin,
    );
  }
  return runtime.execPath;
}

/**
 * Resolve everything the MCP row needs. The path is computed, not touched on
 * disk, so the shape is testable offline.
 */
export function resolveLocalPaths(dir, config = {}, env = process.env, runtime = nodeRuntime()) {
  const profile = config.profile ?? "chatgpt-local";
  if (!PROFILES.has(profile)) {
    throw new Error(
      `warpmetal-dsh: invalid profile ${JSON.stringify(profile)} (expected "chatgpt-local" or "full")`,
    );
  }
  const entry = join(dir, "server", "dist", "index.js");
  const command = resolveNodeCommand(config, env, runtime);
  return {
    root: dir,
    entry,
    profile,
    command,
    args: [entry, "--profile", profile, "--registry", dir],
  };
}

/**
 * The body of `apply`, against an explicit directory.
 *
 * Separate from `apply` so the filesystem-facing behaviour is testable without
 * faking `import.meta.url`: the tests hand it a temporary directory.
 */
export function applyAt(ctx, root, config = {}, env = process.env, runtime = nodeRuntime()) {
  const resolved = resolveLocalPaths(root, config, env, runtime);

  // Fail loud at load time rather than serving a server that cannot start: a
  // missing entry means the artifact was built without its `server/` directory.
  if (!existsSync(resolved.entry)) {
    throw new Error(
      `warpmetal-dsh: the MCP server is missing at ${resolved.entry}. ` +
        "This artifact is incomplete; rebuild it with `npm run build:dsh-plugin` " +
        "in the warpmetal/skills repository.",
    );
  }

  // If the *auto-resolved* command is not a file (the harness moved its Node in
  // a newer layout), degrade to `node` on PATH rather than spawn a broken path.
  // An explicit override is trusted as given: the operator owns that value.
  const explicit = config.command ?? env.WARPMETAL_DSH_NODE ?? env.DSH_NODE;
  const command = explicit !== undefined && explicit !== "" ? explicit : existsSync(resolved.command)
    ? resolved.command
    : "node";

  ctx.provide(
    "warpmetalLocal",
    Object.freeze({ command, args: resolved.args, root: resolved.root }),
  );
}

export function apply(ctx, config = {}) {
  applyAt(ctx, fileURLToPath(new URL(".", import.meta.url)), config);
}
