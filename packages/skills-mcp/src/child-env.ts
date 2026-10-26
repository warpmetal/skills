/**
 * The environment a spawned CLI is allowed to see.
 *
 * The server itself holds no vault material, but it may be launched by a host
 * whose environment carries `WARPMETAL_VAULT_PASSPHRASE` (a CI job, a shell
 * profile, an agent runtime). Inheriting that into the CLI - and from there into
 * every provider tool the CLI spawns - is exactly the Railway failure mode: the
 * secret follows the process tree.
 *
 * Both spawn sites in this package go through it: the `wm_*` executor and the
 * provider invoker. It is kept deliberately separate from the CLI's copy in
 * `packages/warpmetal-cli/src/child-env.ts`: the two packages share no runtime
 * dependency, and a security boundary that depends on a version match is worse
 * than a short list repeated once.
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
