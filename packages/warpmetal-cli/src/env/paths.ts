import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Every path the credential store touches, resolved once.
 *
 * Resolution order for the config root:
 *   1. `WARPMETAL_CONFIG_DIR`
 *   2. `XDG_CONFIG_HOME` + `/warpmetal`
 *   3. `~/.config/warpmetal`
 *
 * The store never writes outside these paths, and callers never build them by
 * string concatenation, so a skill cannot accidentally point the vault at a
 * repository directory that gets committed.
 */
export interface EnvPaths {
  /** Config root for warpmetal. */
  readonly base: string;
  /** Credential root: `<base>/env`. */
  readonly root: string;
  /** Encrypted vault file (file backend). */
  readonly vaultFile: string;
  /** Local key material for the file backend. */
  readonly keyFile: string;
  /** Serialized plans written by `env plan`. */
  readonly plansDir: string;
  /** Short-lived 0600 shims written by `env secret --file`. */
  readonly shimsDir: string;
}

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): EnvPaths {
  const explicit = env["WARPMETAL_CONFIG_DIR"];
  const xdg = env["XDG_CONFIG_HOME"];
  const base =
    explicit && explicit.length > 0
      ? explicit
      : xdg && xdg.length > 0
        ? join(xdg, "warpmetal")
        : join(homedir(), ".config", "warpmetal");

  const root = join(base, "env");
  return {
    base,
    root,
    vaultFile: join(root, "vault.enc"),
    keyFile: join(root, "vault.key"),
    plansDir: join(root, "plans"),
    shimsDir: join(root, "shims"),
  };
}

export function pathsFrom(override?: Partial<EnvPaths>, env?: NodeJS.ProcessEnv): EnvPaths {
  const base = resolvePaths(env);
  return { ...base, ...override };
}
