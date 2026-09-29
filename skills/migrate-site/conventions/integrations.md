# Integration Convention

## Purpose

Skills need external providers: DNS for a cutover, a chat channel for an alert, a
Git repository for a deploy. Those needs are met through one shared layer, so that
credentials live in exactly one place and a provider call in a skill script is
always a gate-able, journal-able event.

The rule that makes this worth having:

> A skill script never talks to a provider itself.

No `curl https://api.cloudflare.com`, no `gh`, no webhook URL in a skill script. It
calls `conventions/lib/integration.sh`, which calls the `warpmetal` CLI engine. The
engine owns credentials, scopes, retries and idempotence; the skill owns the
decision and the approval.

## Layers

| Layer | Where | Owns |
|-------|-------|------|
| Skill script | `skills/<name>/scripts/*.sh` | The decision, the gate, the journal entry |
| Integration library | `skills/<name>/conventions/lib/integration.sh` | Resolution, honest degradation, secret materialisation |
| Engine | `@warpmetal/cli` (`warpmetal env`, `warpmetal integration`) | Credentials, provider adapters, scopes, idempotence |

```
skill script ──require_confirm──▶ integration_run_mutating ──▶ warpmetal integration … ──▶ provider
                     ▲                      │
                     └── the gate is checked twice: here, and in the engine
```

## API

| Function | Contract |
|----------|----------|
| `integration_available <provider>` | Pure predicate. 0 when the integration can be used right now. Emits no warnings, so it is safe before `result_init`. |
| `integration_require_tools <provider> [purpose]` | Call **after** `result_init`. Records one `check_skipped` warning per missing prerequisite. Returns 1 when something is missing. |
| `integration_run <provider> <verb> [flags…]` | Read-only or already-gated call. Always adds `--json`. Returns the engine's exit code. |
| `integration_run_mutating <provider> <verb> <gate> [flags…]` | Same, but refuses unless `<gate>` was approved in this run and forwards `--confirm <gate>`. Exit 11 on refusal. |
| `integration_secret_file <name>` | 0600 file holding one secret; echoes the path. Registered for cleanup. |
| `integration_emit_secret <name>` | The raw value on stdout. The only way to read a credential. |
| `integration_tmp_cleanup` | Removes every file the library created. |
| `integration_journal <phase> <action> <detail> [code]` | Journal entry with no command line and no value. |
| `integration_denied <provider> <verb> <gate> [code]` | Records a refusal *with its reason*, then returns the code. |
| `integration_cli`, `integration_reset` | Resolution control, mainly for tests. |

`integration_json_string <json> <field>` and `integration_status_of <json>` read a
single top-level field out of the engine envelope. They are deliberately minimal:
use `jq` when a real document has to be traversed.

## Honest degradation

A skipped check must be visible. `warnings: []` next to an unverified claim is a
false OK, and a false OK is the worst outcome for an autonomous consumer — the same
reasoning behind `agency_require_tools`.

`integration_require_tools` therefore reports, in order:

| Situation | Warning |
|-----------|---------|
| No `warpmetal` on `PATH` | `check_skipped: the warpmetal CLI is not installed, so <purpose> was not verified` |
| `warpmetal` present but without `env`/`integration` (the published upstream CLI) | `check_skipped: '<path>' has no env/integration support (install @warpmetal/cli), so <purpose> was not verified` |
| Provider not offered by the installed engine | `check_skipped: the '<provider>' integration is not offered by '<path>', so <purpose> was not verified` |
| A tool the provider prefers is missing | `check_skipped: '<tool>' is not installed, so <purpose> was not verified` |
| The tool list could not be read at all | `check_skipped: could not read the tool requirements for '<provider>', so <purpose> was not verified` |

The third row is why the engine is probed rather than assumed: the published
`warpmetal` package and this engine share a name but not a feature set.

## Credentials

A secret value exists in exactly two places: the encrypted vault and the stream
produced by `integration_emit_secret`. It must not appear in argv, in `--json`
output, in the journal, or in a `result_warn`.

When a tool requires a credentials file on disk, use `integration_secret_file`:

```bash
creds="$(integration_secret_file cloudflare.token)" || fail_with 5 STOPPED "No cloudflare.token in the store"
printf 'dns_cloudflare_api_token = %s\n' "$(cat "${creds}")" >"${CERTBOT_INI}"
integration_tmp_cleanup
```

The file is created under `umask 077` **before** the value is written, so there is
no window in which it is world-readable. The path is recorded in a registry keyed
by `$$`, which is stable across command substitutions, so cleanup works even when
the function was called inside `$( )`.

`integration_tmp_cleanup` installs an `EXIT` trap only when the script does not
already own one — clobbering a script's trap would be a silent regression. **If your
script sets its own `EXIT` trap, you must call `integration_tmp_cleanup` yourself.**

## Gates

There is no bypass. `integration_run_mutating` requires the gate string to have
been approved in this run and re-checks it before calling the engine, because a
helper reachable from a loop must not drift away from the gate that guards it. The
engine checks the same literal again: defense in depth, not redundancy.

Gate strings come from the engine's catalog, not from this document:

```bash
warpmetal integration list --json | jq -r '.providers[] | select(.name=="cloudflare") | .gates["dns-upsert"]'
```

| Provider | Verb | Gate |
|----------|------|------|
| `cloudflare` | `dns-upsert` | `CONFIRM DNS CHANGE` |
| `slack` | `notify` | `CONFIRM NOTIFY` |

`integration_run` (the read-only form) never invents a `--confirm`.

## Providers

Run `warpmetal integration list --json` for the authoritative catalog: auth modes,
secrets, capabilities, required tools, real scopes, files written, a verification
command, a redacted error map, and how confident revocation can be.

| Provider | Capabilities | Secrets | Revocation |
|----------|--------------|---------|------------|
| `cloudflare` | `dns.record.list`, `dns.record.upsert` | `cloudflare.token` | Unsupported; revoke in the dashboard |
| `github` | `repo.view` | `github.token` (or a `gh` session) | Uncertain; confirm in the dashboard |
| `slack` | `notify.send` | `slack.token` or `slack.webhook` | Unsupported; revoke in the dashboard |

Scope is set in the provider's dashboard and cannot be tightened by this toolkit.
Never claim a capability the provider cannot enforce: a fine-grained GitHub PAT can
be limited to selected repositories, a classic PAT cannot be narrowed here, and a
Slack incoming webhook is bound to one channel forever.

`env revoke` reports `unsupported` or `uncertain` rather than pretending a local
delete is a revocation.

## Status and exit codes

`warpmetal integration status` is a probe. It never mutates.

| Engine status | Exit | Meaning |
|---------------|------|---------|
| `OK` | 0 | The provider confirmed it |
| `DEGRADED` | 0 | The probe ran and reported honestly; the detail is in `data`/`warnings` |
| `NEEDS_AUTH` | 4 | A credential is missing or rejected |
| `ERROR` | 5 | The provider rejected the action |

`DEGRADED` deliberately exits 0: the command succeeded at answering the question.
Read `status` from the JSON, never guess from the exit code. A Slack webhook is the
canonical `DEGRADED` — it cannot be verified without sending a message, so no
message is sent and the result says so.

### Exit code mapping

The engine and a skill script answer different questions, so the engine's codes are
mapped rather than passed through. A missing credential is not "git failure"; it is
a missing prerequisite, and the skill's own table (`outputs.md`) has the word for it.

| Engine exit | Meaning | Skill action |
|-------------|---------|--------------|
| `0` | Reported (including `DEGRADED`) | Continue; read `status` from the JSON if the distinction matters. |
| `4` | `NEEDS_AUTH` | `fail_with 5 STOPPED` — prerequisite missing. |
| `5` | `ERROR` (provider rejected it) | `fail_with 1 FAILED`. |
| `11` | The engine's own gate check refused | `integration_denied <provider> <verb> <gate>` then stop. |
| `127` | The engine is not installed or vanished | `fail_with 127 STOPPED`. |

A script must never emit an engine status such as `NEEDS_AUTH` as its own result:
`outputs.md` allows only the shared set plus the skill's own row.

## Manifest references

A manifest stores references, never values. See `client-manifest.md`:

```toml
[integrations.cloudflare]
zone_id = "023e105f4ecef8ad9ca31a8372d0c353"
account = "acme"
secret  = "cloudflare.token"
```

Allowed: zone ids, account names, secret *names*. Never a token.

## Testing

`bash tools/check-all.sh` runs the policy validator, a `bash -n` pass over every
shell script, and `tools/integration-selftest.sh`, which drives this library against
a stub CLI and asserts the degradation warnings, the 0600 secret file, and that an
ungated mutation sends nothing and exits 11.

The validator also enforces this document's central rule: a skill script containing
`api.cloudflare.com`, `api.github.com`, a Slack API URL, `warpmetal integration` or
`warpmetal env secret` fails the build. The library is the only place those are
allowed.
