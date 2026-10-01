# @warpmetal/cli

The `warpmetal` binary. It owns two things locally and forwards everything else
to the published upstream CLI, verbatim.

```
warpmetal env ...            credential store          (implemented here)
warpmetal integration ...    provider integrations     (implemented here)
warpmetal <anything else>    forwarded to upstream     (no reinterpretation)
```

## Why a superset instead of a fork

The VPS lifecycle commands already ship in the published `warpmetal` package.
Re-implementing them here would create two engines that drift. Instead this
package declares the upstream as a dependency under an alias
(`"warpmetal-upstream": "npm:warpmetal@0.8.12"`) so both binaries can be named
`warpmetal` without colliding, and the dispatcher forwards every argv it does
not own:

- The allowlist of local namespaces is `env` and `integration`. It is a closed
  set; nothing else is ever interpreted here.
- Flag order, values and unknown flags are preserved exactly. An upstream
  release that adds a command works here with no change.
- Resolution only looks inside `node_modules`, and rejects any candidate whose
  real path is this CLI. A PATH lookup would find this binary and recurse.
- `WARPMETAL_UPSTREAM_CLI_JS` points the delegation at an explicit entry file,
  which is how the tests exercise it and how a red build is diagnosed.

## Credential model

One vault, one API. There is no call that returns the whole vault, so a command
cannot leak every secret by spreading an object it was handed.

| Backend    | When                         | What it protects                                                                 |
| ---------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `remote`   | `WARPMETAL_VAULT_URL` is set | Everything, centrally. The value never touches local disk; the server holds the ciphertext and enforces compare-and-set per name. |
| `keychain` | `@napi-rs/keyring` present   | Everything. No key material is written to the config directory.                   |
| `file`     | everywhere else (default)    | The vault at rest: backups, copied dotfiles, a stray commit. Not a local attacker who can read the config directory. |

The file backend is AES-256-GCM with a scrypt-derived key (`N=2^15, r=8, p=1`).
The key comes from `WARPMETAL_VAULT_PASSPHRASE`, or from `env/vault.key` created
`0600` on first use. Write-then-rename means an interrupted write cannot leave a
half vault behind.

The vault lives under `$WARPMETAL_CONFIG_DIR`, `$XDG_CONFIG_HOME/warpmetal` or
`~/.config/warpmetal`, in `env/`.

### Remote vault

Setting `WARPMETAL_VAULT_URL` to a customer-facing endpoint that fronts WarpMetal
Identity's `/internal/customer/cli/credentials*` routes makes the server the vault. It
is consulted before the local backends, so an explicit `WARPMETAL_VAULT_URL` is never
silently ignored.

- **The session** is the customer CLI device token, sent as
  `X-Warpmetal-Customer-Authorization`. `WARPMETAL_VAULT_TOKEN` overrides it for CI;
  otherwise the token is read from `<config>/session.json`.
- **It fails closed.** No session, or an expired one, is exit `4` on every operation.
  It never falls back to the local file, so a rejected session cannot put a credential
  somewhere you did not choose.
- **It is per-key.** A write sends the one value it was given, and presence is answered
  from list metadata, so `env plan` and `env doctor` never fetch a value.
- **Nothing is cached.** `generation` is the version the server reports, so another
  client's write is visible immediately and can invalidate the next write.
- **Two commands are refused.** `env store rotate` and `env store destroy` return
  `unsupported` (exit `6`): the version is the server's, and destroying a tenant vault
  is not a local act. Use `env revoke`, which removes a namespace one name at a time.

### Where a secret is allowed to go

Exactly two places. `warpmetal env secret NAME --stdout` writes a raw value to
stdout with no trailing newline, and the encrypted vault holds it at rest — the local
file, the OS keychain, or the server's ciphertext when the remote backend is in use.
It must not appear in:

- argv, ever. `env store set` refuses positional values; it reads `--stdin` or
  `--from-env` and rejects an interactive terminal.
- `--json` output. Every document is passed through a redactor that strips both
  keys that look like credentials and any registered secret value.
- plans, status, `doctor` or the journal. Those report names and outcomes only.
- error messages. Provider failures are projected onto a prepared `errorMap`,
  never reproduced from the response body.

`env secret NAME --stdout --json` is a usage error, not a convenience: a JSON
serializer is exactly how a secret ends up in a log aggregator.

## Exit codes

| Code | Meaning                                                     |
| ---- | ----------------------------------------------------------- |
| 0    | Reported. Includes `DEGRADED`, which is an honest answer.    |
| 2    | Usage or configuration error.                                |
| 3    | Something is missing first (no such secret).                 |
| 4    | Needs provider authentication.                               |
| 5    | The provider rejected the action, or the apply failed.       |
| 6    | Integrity: corrupt or unsupported vault, unsupported platform.|

`warpmetal env status`, `env list`, `env doctor`, `env plan` and
`integration status` report names and outcomes only, which is why they are safe
to run in CI and safe to paste into a ticket.

## Integrations

`warpmetal integration list --json` is the contract. Each provider declares the
auth modes it accepts, the secrets it reads, its capabilities, the external
tools it prefers, what its scopes can and cannot enforce, the files it writes, a
verification command, a redacted error map, and how confident revocation can be.

Two rules hold for every adapter:

1. `status` never mutates and never prints a success it cannot verify. A Slack
   incoming webhook reports `DEGRADED`, because the only way to verify it is to
   send a message.
2. A mutating verb carries its own `--confirm` literal. `dns-upsert` needs
   `--confirm "CONFIRM DNS CHANGE"`, `notify` needs `--confirm "CONFIRM NOTIFY"`,
   and without it **no request is sent at all**. This is defense in depth: the
   bash layer in the skills has already asked for approval.

`revoke` removes local material and states plainly that it cannot revoke a token
at the provider. `unsupported` and `uncertain` are reported as such.

The operator-facing walkthrough — the three layers, the remote vault, the bash library
API and the exit-code mapping — is in
[`INTEGRATIONS.md`](https://github.com/warpmetal/skills/blob/main/INTEGRATIONS.md)
([español](https://github.com/warpmetal/skills/blob/main/INTEGRATIONS.es.md)).

## Development

```
npm install
npm test        # tsc + node:test, no network
npm run typecheck
```

The suite is network-free by construction: the fetch function, the process
runner and the credential backend are all injected. A secret-canary test proves
a stored value never appears in any diagnostic, plan, list, error or `--json`
document, and that it *does* appear on the one sanctioned stream.
