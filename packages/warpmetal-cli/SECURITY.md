# Security model

## Threat model

The reference incident is the Railway breach of 21 October 2026: unauthorized access to customer
environment variables and, in some cases, to their already-decrypted contents. Encryption at rest
does not cover an attacker who reaches the running service. The full analysis — what each control
does and does not defend, and how it is tested — lives in
[`docs/security/threat-model.md`](https://github.com/warpmetal/skills/blob/main/docs/security/threat-model.md).

In scope, and defended:

- Accidental disclosure of a credential through a backup, a copied config
  directory, a `grep` across dotfiles, a committed file, a log aggregator, a
  shell history entry, or a `--json` document piped into a ticket.
- A provider echoing a credential back inside a response body or an error
  message that then reaches an operator screen.
- A typo or a missing approval causing a mutation nobody asked for.
- A local attacker who can read the config directory **as long as the key is
  not in it**: the keychain backend, `WARPMETAL_VAULT_PASSPHRASE` supplied from
  an external secret manager, or the remote vault. A `vault.key` is not created
  by default, for exactly this reason.
- A child process reading the vault passphrase out of its own environment.
  `childEnv()` removes it from every spawn, and a per-call override cannot put
  it back.

Out of scope, and stated rather than implied:

- A local attacker who can read the whole config directory while `vault.key`
  sits beside the vault. `env status` reports that state as
  `keySource: key-file` and `env doctor` fails until it is migrated or
  explicitly accepted with `WARPMETAL_ACCEPT_LOCAL_KEY=1`.
- A local attacker who controls the user's session while the vault is unlocked:
  process memory and `env secret --stdout` are readable by construction.
- A rollback of the vault file to an earlier generation. The generation counter
  is authenticated but not anchored to anything external.
- Revoking a credential at the provider. `env revoke` removes local material and
  reports `unsupported` or `uncertain` for the upstream side. It never claims a
  revocation it cannot see.

## Invariants

1. **One emission path.** A secret value leaves the process only through
   `warpmetal env secret NAME --stdout` (raw, no trailing newline) or the
   encrypted vault. Everything else reports names.
2. **No credential in argv.** `env store set` accepts `--stdin` or `--from-env`
   only, and refuses a TTY so a secret cannot be typed into a shell that records
   history.
3. **No credential in JSON.** `env secret --stdout --json` is rejected outright.
   All other documents pass through a redactor.
4. **No shell.** Child processes are spawned with an argv array and
   `shell: false`. No manifest value, flag or API response is concatenated into
   a command string.
5. **No gate bypass.** A mutating adapter verb sends no request without its
   `--confirm` literal. The bash layer in the skills requires approval before it
   calls the engine, so the check exists twice on purpose.
6. **No false confidence.** `integration status` reports `NEEDS_AUTH` or
   `DEGRADED` rather than rounding up to `OK`, and scope claims the provider
   cannot verify are declared as unknown.
7. **No key beside the vault by accident.** The file backend refuses to create
   `vault.key` without `WARPMETAL_ACCEPT_LOCAL_KEY=1`: it fails with
   `key_required` (exit `4`) and names the keychain, an external passphrase and
   the remote vault as the ways forward. Reading a key that already exists is
   always allowed, so an accepted install keeps working.
8. **No vault secret in a child's environment.** Every spawn builds an explicit
   environment with `childEnv()`, which drops the vault passphrase, the vault
   token and the wallet password even when the caller asks for them back.
9. **No silent ACL verdict on Windows.** `env doctor` reads the real security
   descriptor through Windows PowerShell 5.1, whose `PSModulePath` is pinned for
   that child so a caller launched from PowerShell 7 cannot make `Get-Acl` fail
   to autoload. An unreadable descriptor is reported as `unknown` **with its
   reason attached**, never rounded up to `ok`, and an ACE that only *denies*
   access is not counted as exposure.

## Vault format

```
{ "version": 1,
  "kdf":    { "name": "scrypt", "n": 32768, "r": 8, "p": 1, "salt": "<base64>" },
  "cipher": { "name": "aes-256-gcm", "iv": "<base64>", "tag": "<base64>" },
  "ciphertext": "<base64>" }
```

`warpmetal-env:v1` is bound as additional authenticated data. The vault file is
written `0600`, the containing directories `0700`, and every write is a
write-then-rename. A key file, when one exists, is `0600` too; it is only created
on explicit acceptance. A wrong passphrase, a wrong key file and a tampered
ciphertext all produce the same message on purpose, so the error text cannot be
used as an oracle.

## Reporting

Report a vulnerability through the repository's security policy rather than a
public issue. Include the command, the backend in use and the exit code; do not
include a secret value.
