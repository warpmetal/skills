# Security model

## Threat model

In scope, and defended:

- Accidental disclosure of a credential through a backup, a copied config
  directory, a `grep` across dotfiles, a committed file, a log aggregator, a
  shell history entry, or a `--json` document piped into a ticket.
- A provider echoing a credential back inside a response body or an error
  message that then reaches an operator screen.
- A typo or a missing approval causing a mutation nobody asked for.

Out of scope, and stated rather than implied:

- A local attacker who can read the whole config directory while the **file**
  backend is in use. The key file sits beside the vault. Use the keychain
  backend, or supply `WARPMETAL_VAULT_PASSPHRASE` from an external secret
  manager, when that attacker is in scope.
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

## Vault format

```
{ "version": 1,
  "kdf":    { "name": "scrypt", "n": 32768, "r": 8, "p": 1, "salt": "<base64>" },
  "cipher": { "name": "aes-256-gcm", "iv": "<base64>", "tag": "<base64>" },
  "ciphertext": "<base64>" }
```

`warpmetal-env:v1` is bound as additional authenticated data. The vault file and
its key file are written `0600`, the containing directories `0700`, and every
write is a write-then-rename. A wrong passphrase, a wrong key file and a
tampered ciphertext all produce the same message on purpose, so the error text
cannot be used as an oracle.

## Reporting

Report a vulnerability through the repository's security policy rather than a
public issue. Include the command, the backend in use and the exit code; do not
include a secret value.
