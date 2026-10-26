/**
 * The environment a child process is allowed to see.
 *
 * The Railway incident is the reason this file exists: encryption at rest did
 * not help, because the attacker reached the running service, where secrets
 * live in the environment. A CLI that keeps its vault passphrase in its own
 * environment and then spawns `gh`, `stripe`, `git` or the upstream WarpMetal
 * CLI hands that passphrase to every one of them - and `/proc/<pid>/environ`
 * is readable by the same user, by root, and by anything that can read a crash
 * dump.
 *
 * So children get an explicit copy with the vault material removed. It is
 * always an explicit copy, never `undefined`: "inherit" is how the leak
 * happened in the first place.
 */
const DENY: readonly string[] = [
  "WARPMETAL_VAULT_PASSPHRASE",
  "WARPMETAL_VAULT_TOKEN",
  "WARPMETAL_ACCEPT_LOCAL_KEY",
  "X402API_WALLET_PASSWORD",
];

/**
 * A copy of `base` without vault or wallet secrets, plus `overrides`.
 *
 * A denied name in `overrides` is dropped too: no caller gets to reintroduce the
 * vault passphrase into a child by asking for it.
 */
export function childEnv(
  base: NodeJS.ProcessEnv = process.env,
  overrides?: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (DENY.includes(key)) continue;
    sanitized[key] = value;
  }
  if (overrides !== undefined) {
    for (const [key, value] of Object.entries(overrides)) {
      if (DENY.includes(key)) continue;
      sanitized[key] = value;
    }
  }
  return sanitized;
}
