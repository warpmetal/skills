# Third-party integrations

How the agency skills talk to GitHub, Cloudflare and Slack: how the machinery works,
what it can do today, and what it deliberately cannot. This describes what the code
actually does, including the cases where it refuses to act.

**Contents**

1. [The rule that explains the rest](#1-the-rule-that-explains-the-rest)
2. [The three layers](#2-the-three-layers)
3. [Why two binaries are both called `warpmetal`](#3-why-two-binaries-are-both-called-warpmetal)
4. [What it can do today](#4-what-it-can-do-today)
5. [Credentials: where a secret is allowed to live](#5-credentials-where-a-secret-is-allowed-to-live)
6. [The bash library API](#6-the-bash-library-api)
7. [Gates: the double check](#7-gates-the-double-check)
8. [Honest degradation](#8-honest-degradation)
9. [How the skills actually use it](#9-how-the-skills-actually-use-it)
10. [Configuration: the client manifest](#10-configuration-the-client-manifest)
11. [Getting started](#11-getting-started)
12. [What it cannot do](#12-what-it-cannot-do)
13. [How it is tested](#13-how-it-is-tested)
14. [Adding a provider](#14-adding-a-provider)

---

## 1. The rule that explains the rest

> **A skill script never talks to a provider itself.**

No `curl https://api.cloudflare.com`, no `gh`, no webhook URL inside a skill script. The
script calls `conventions/lib/integration.sh`, and that library calls the `warpmetal`
engine. The engine owns credentials, scopes, retries and idempotence; the skill owns
**the decision and the approval**.

This is not a style preference. `scripts/validate-skills.mjs` fails the build when a
skill script contains `api.cloudflare.com`, `api.github.com`, a Slack API URL,
`warpmetal integration` or `warpmetal env secret`. The library is the only place those
strings are allowed to appear.

The practical consequences: **one place where credentials live**, and **every provider
call is a gate-able, journal-able event**.

---

## 2. The three layers

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

---

## 3. Why two binaries are both called `warpmetal`

The published `warpmetal` package already exists and already implements the VPS
lifecycle commands (deploy, rollback, and so on). Re-implementing them here would create
two engines that drift apart. Instead `@warpmetal/cli` is a **superset** that wraps the
published package:

```
warpmetal env ...            credential store          (implemented here)
warpmetal integration ...    provider integrations     (implemented here)
warpmetal <anything else>    forwarded to upstream     (no reinterpretation)
```

Details that matter:

- The allowlist of local namespaces (`env`, `integration`) is a **closed set**. Nothing
  else is ever interpreted here.
- Flag order, values and unknown flags are preserved **exactly**. An upstream release
  that adds a command works here with no change.
- The upstream is declared as a dependency under an alias
  (`"warpmetal-upstream": "npm:warpmetal@0.8.12"`) so both binaries can be named
  `warpmetal` without colliding.
- Resolution only looks inside `node_modules`, and rejects any candidate whose real path
  is this CLI. A `PATH` lookup would find this binary and recurse into itself.

**Why this is a real problem the library solves:** the published CLI is also called
`warpmetal` but has **no `env` namespace**. So the bash library does not check whether
the binary exists; it checks whether it *can do this*:

```bash
if "${INTEGRATION_CLI}" env status --json >/dev/null 2>&1; then
    INTEGRATION_CLI_OK=true
fi
```

The difference between "installed" and "installed and able to do this" is a **warning**,
not a crash. `WARPMETAL_CLI` points the library at an explicit binary, which is how the
tests drive it.

---

## 4. What it can do today

`warpmetal integration list --json` is the authoritative contract. Summary:

| Provider | Verbs | Gate | Secrets | Extra tool |
|----------|-------|------|---------|------------|
| `cloudflare` | `status`, `dns-list`, `dns-upsert` | `CONFIRM DNS CHANGE` (`dns-upsert` only) | `cloudflare.token` | — |
| `github` | `status`, `repo-view` | — (read-only) | `github.token`, or a `gh` session | `gh` (optional) |
| `slack` | `status`, `notify` | `CONFIRM NOTIFY` (`notify` only) | `slack.token` or `slack.webhook` | — |
| `email` | `status`, `notify` | `CONFIRM NOTIFY` (`notify` only) | `email.api_key` | — |
| `discord` | `status`, `notify` | `CONFIRM NOTIFY` (`notify` only) | `discord.token` or `discord.webhook` | — |
| `vercel` | `status`, `deployment-list` | — (read-only) | `vercel.token` | — |
| `sentry` | `status`, `issue-list` | — (read-only) | `sentry.token` | — |
| `stripe` | `status`, `balance-get` | — (read-only) | `stripe.token` | — |

Two verb families are shared so a skill does not learn a vendor vocabulary per
provider: `notify` for every messaging provider and `dns-list` / `dns-upsert` for
every DNS provider. The platform providers are read-only and therefore ungated.

### Direct examples

```bash
# The full catalog
warpmetal integration list --json

# Probe a provider (never mutates)
warpmetal integration status cloudflare --json
warpmetal integration status github --json
warpmetal integration status slack --json

# Read the DNS records of a zone
warpmetal integration cloudflare dns-list --zone-id <zone> --type A --name acme.com --json

# Write an A record (the gate is required)
warpmetal integration cloudflare dns-upsert \
  --zone-id <zone> --name acme.com --type A --content 203.0.113.10 --ttl 60 \
  --confirm "CONFIRM DNS CHANGE" --json

# View a repository
warpmetal integration github repo-view --repo org/acme --json

# Send a notification
warpmetal integration slack notify --channel "#acme-alerts" --text "Deploy OK" \
  --confirm "CONFIRM NOTIFY" --json

# Read-only platform probes
warpmetal integration stripe balance-get --json
warpmetal integration sentry issue-list --org acme --project web --json
warpmetal integration vercel deployment-list --json
```

### Declared capabilities

Capabilities are a closed enum: `dns.record.list`, `dns.record.upsert`, `repo.view`,
`notify.send`, `deployment.read`, `issue.read`, `billing.read`. An
adapter **implements** the catalog; it never widens it on its own. `scripts/verify.mjs`
reads the same catalog, so a skill cannot declare an integration the engine does not
actually have.

---

## 5. Credentials: where a secret is allowed to live

A secret value exists in **exactly two places**:

1. The encrypted vault at rest — the local AES-256-GCM file, or the OS keychain, or
   the server's ciphertext when the remote backend is in use.
2. The stream produced by `warpmetal env secret NAME --stdout`.

Nowhere else. It must not appear in:

- `argv`, ever. `env store set` refuses positional values: it reads `--stdin` or
  `--from-env`, and rejects an interactive terminal.
- `--json` output. Every document is passed through a redactor that strips both keys
  that look like credentials **and** any registered secret value.
- Plans, `status`, `doctor` or the journal. Those report **names and outcomes**.
- Error messages. Provider failures are projected onto a prepared `errorMap`, never
  reproduced from the response body.

`env secret NAME --stdout --json` is a **usage error**, not a convenience: a JSON
serializer is exactly how a secret ends up in a log aggregator.

### Backends

| Backend | When | What it protects |
|---------|------|------------------|
| `remote` | `WARPMETAL_VAULT_URL` is set | Everything, centrally. The value never touches local disk; the server holds the ciphertext and enforces compare-and-set per name. |
| `keychain` | `@napi-rs/keyring` present | Everything. No key material is written to the config directory. |
| `file` | everywhere else (default) | The vault at rest: backups, copied dotfiles, a stray commit. **Not** a local attacker who can read the config directory. |

The `file` backend is AES-256-GCM with a scrypt-derived key (`N=2^15, r=8, p=1`). The key
comes from `WARPMETAL_VAULT_PASSPHRASE`, or from `env/vault.key` created `0600` on first
use. Write-then-rename means an interrupted write cannot leave a half vault behind.

Location: `$WARPMETAL_CONFIG_DIR`, else `$XDG_CONFIG_HOME/warpmetal`, else
`~/.config/warpmetal`, in `env/`.

#### The remote backend

`WARPMETAL_VAULT_URL` (a customer-facing endpoint that fronts WarpMetal Identity's
`/internal/customer/cli/credentials*` routes) makes the server the vault. It wins over
every local backend, and the session is the customer CLI device token sent as
`X-Warpmetal-Customer-Authorization`; `WARPMETAL_VAULT_TOKEN` overrides it for CI, and
otherwise a session is read from `<config>/session.json`.

| Env var | Meaning |
|---------|---------|
| `WARPMETAL_VAULT_URL` | Base URL of the vault endpoint. Setting it selects this backend. |
| `WARPMETAL_VAULT_TOKEN` | Device session bearer. Takes precedence over the session file. |

Four consequences worth knowing before you switch:

- **It fails closed.** No session, or an expired one, is `NEEDS_AUTH` (exit 4) on every
  operation. It never falls back to the local file, so a rejected session cannot put a
  credential somewhere you did not choose.
- **It is per-key.** A write sends the one value you gave it; `has` is answered from the
  list metadata, so `env plan` and `env doctor` never fetch a value.
- **Nothing is cached.** `generation` is the version the server reports, so another
  client's write is visible immediately and can invalidate your next write.
- **Two commands are refused.** `env store rotate` and `env store destroy` return
  `unsupported` against a server vault: the version is the server's, and destroying a
  tenant vault is not a local act. Use `env revoke`, which removes a namespace one name
  at a time.

### Managing credentials

```bash
warpmetal env store set cloudflare.token --stdin      # reads the value from stdin
warpmetal env store set slack.token --from-env SLACK_TOKEN
warpmetal env list --json                             # names, never values
warpmetal env status --json                           # backend, generation, secret count
warpmetal env plan --json                             # which provider secrets exist and which are missing
warpmetal env doctor --json                           # diagnoses; never prints a secret
warpmetal env store remove cloudflare.token
warpmetal env store rotate  --confirm ROTATE          # bump the generation without touching values
warpmetal env store destroy --confirm DESTROY
warpmetal env revoke --service cloudflare --confirm REVOKE
```

`env revoke` reports `unsupported` or `uncertain` rather than pretending a local delete is
a revocation.

---

## 6. The bash library API

| Function | Contract |
|----------|----------|
| `integration_available <provider>` | Pure predicate. 0 when the integration can be used right now. **Emits no warnings**, so it is safe before `result_init`. |
| `integration_ready <provider>` | Stricter: asks the engine to **probe** the provider, so it is false when the credential is missing or rejected. |
| `integration_require_tools <provider> [purpose]` | Call **after** `result_init`. Records one `check_skipped` warning per missing prerequisite. 1 when something is missing. |
| `integration_require_ready <provider> [purpose]` | The common case: records the honest reason a path was skipped and says whether the caller may take it. |
| `integration_run <provider> <verb> [flags…]` | Read-only or already-gated call. Always adds `--json`. Returns the engine's exit code. |
| `integration_run_mutating <provider> <verb> <gate> [flags…]` | Same, but **refuses** unless `<gate>` was approved in this run, and forwards `--confirm <gate>`. Exit 11 on refusal. |
| `integration_secret_file <name>` | 0600 file holding one secret; echoes the path. Registered for cleanup. |
| `integration_emit_secret <name>` | The raw value on stdout. **The only way to read a credential.** |
| `integration_tmp_cleanup` | Removes every file the library created. |
| `integration_journal <phase> <action> <detail> [code]` | Journal entry with no command line and no value. |
| `integration_denied <provider> <verb> <gate> [code]` | Records a refusal **with its reason**, then returns the code. |
| `integration_declared <provider>` | 0 when the manifest has an `[integrations.<provider>]` section. |
| `integration_ref <provider> <key> [default]` | A manifest reference (zone id, account label). **Never a value.** |
| `integration_secret_name <provider> [default]` | The vault name to read. Default `<provider>.token`. |
| `integration_json_string` / `integration_status_of` | Read **one** top-level field of the engine envelope. Use `jq` for a real document. |

### `available` versus `ready`: the distinction that matters

`integration_available` answers *"can this engine do this provider at all?"*.
`integration_ready` answers *"can I do it **right now**?"*. They are not the same
question, and using the first before a mutation would let a cutover fail halfway through
on a token that was missing from the start.

```bash
# False when the engine does not support cloudflare, even if the token exists:
integration_available cloudflare

# Additionally false when the credential is missing or the provider rejected it:
integration_ready cloudflare
```

`integration_ready` returns 0 for both `OK` and `DEGRADED`: a `DEGRADED` probe ran and
reported honestly, and the caller reads the detail from `integration_run status`.

### Materialising a secret on disk

Some tools (certbot, restic) insist on a credentials file. That is what
`integration_secret_file` is for:

```bash
creds="$(integration_secret_file cloudflare.token)" || fail_with 5 STOPPED "No cloudflare.token in the store"
printf 'dns_cloudflare_api_token = %s\n' "$(cat "${creds}")" >"${CERTBOT_INI}"
integration_tmp_cleanup
```

The file is created under `umask 077` **before** the value is written, so there is no
window in which it is readable by anyone else. The path is recorded in a per-process
registry keyed by `$$`, which is stable across subshells, so cleanup works even when the
function was called inside `$( )`.

> **Careful:** `integration_tmp_cleanup` installs an `EXIT` trap only when the script does
> not already own one — clobbering a script's trap would be a silent regression. **If your
> script sets its own `EXIT` trap, you must call `integration_tmp_cleanup` yourself.**

---

## 7. Gates: the double check

**There is no bypass.** `integration_run_mutating` requires the gate string to have been
approved in this run and **re-checks it** before calling the engine, because a helper
reachable from a loop must not drift away from the gate that guards it. The engine checks
the **same literal** again: defense in depth, not redundancy.

Gate strings come from the engine's catalog, not from this document:

```bash
warpmetal integration list --json | jq -r '.providers[] | select(.name=="cloudflare") | .gates["dns-upsert"]'
```

`integration_run` (the read-only form) **never invents** a `--confirm`.

---

## 8. Honest degradation

A skipped check **must be visible**. `warnings: []` next to an unverified claim is a
**false OK**, and a false OK is the worst outcome for an autonomous consumer.

| Engine status | Exit | Meaning |
|---------------|------|---------|
| `OK` | 0 | The provider confirmed it |
| `DEGRADED` | 0 | The probe ran and reported honestly; the detail is in `data`/`warnings` |
| `NEEDS_AUTH` | 4 | A credential is missing or rejected |
| `ERROR` | 5 | The provider rejected the action |

`DEGRADED` deliberately exits 0: the command succeeded at answering the question. Read
`status` from the JSON, never guess from the exit code. **A Slack webhook is the canonical
`DEGRADED`**: it cannot be verified without sending a message, so no message is sent and
the result says so.

### `check_skipped` warnings

`integration_require_tools` reports, in this order:

| Situation | Warning |
|-----------|---------|
| No `warpmetal` on `PATH` | `check_skipped: the warpmetal CLI is not installed, so <purpose> was not verified` |
| `warpmetal` present but without `env`/`integration` (the published upstream CLI) | `check_skipped: '<path>' has no env/integration support (install @warpmetal/cli), so <purpose> was not verified` |
| Provider not offered by the installed engine | `check_skipped: the '<provider>' integration is not offered by '<path>', so <purpose> was not verified` |
| A tool the provider prefers is missing | `check_skipped: '<tool>' is not installed, so <purpose> was not verified` |
| The tool list could not be read at all | `check_skipped: could not read the tool requirements for '<provider>', so <purpose> was not verified` |

### Exit code mapping

The engine and a skill script answer different questions, so the engine's codes are
**mapped** rather than passed through. A missing credential is not "git failure"; it is a
missing prerequisite, and the skill's own table (`outputs.md`) has the word for it.

| Engine exit | Meaning | Skill action |
|-------------|---------|--------------|
| `0` | Reported (including `DEGRADED`) | Continue; read `status` from the JSON if the distinction matters |
| `2` | Usage or configuration error, including a mutating verb without its `--confirm` | Fix the invocation; nothing was sent |
| `4` | `NEEDS_AUTH` | `fail_with 5 STOPPED` — prerequisite missing |
| `5` | `ERROR` (provider rejected it) | `fail_with 1 FAILED` |
| `127` | The engine is not installed or vanished | `fail_with 127 STOPPED` |

A script must **never** emit an engine status as its own result (`NEEDS_AUTH`, and so on);
`outputs.md` allows only the shared set plus the skill's own row.

> **On exit `11`.** The engine never returns it: a missing or wrong `--confirm` is
> `usage_error` (exit **2**), and the engine sends nothing. The `11` is produced by
> **the bash layer** (`integration_run_mutating` / `integration_denied`), which is what a
> script actually sees, before the engine is ever called.
> `conventions/integrations.md` lists both codes and attributes each to the layer that
> returns it.

---

## 9. How the skills actually use it

### `migrate-site` → `cutover.sh`: choosing how the DNS change is applied

The mode is resolved **before** the plan is printed, so the plan never promises an
automatic change the run cannot deliver:

```bash
DNS_MODE="manual"
if [[ -n "${DNS_COMMAND}" ]]; then
    DNS_MODE="command"
elif [[ -n "${CF_ZONE_ID}" ]] && integration_ready cloudflare; then
    DNS_MODE="integration"
fi
```

With a Cloudflare declared but no usable credential, it degrades to printing the record
(with a visible warning) instead of **failing halfway through the cutover**. Each flag is
passed as its own argv entry and the engine re-checks the gate literal.

### `deploy-site` → `deploy.sh`: the GitHub preflight is a warning

```bash
REPO_SLUG="$(integration_ref github repo)"
if integration_require_ready github "the GitHub repository access check"; then
    REPO_OUT="$(integration_run github repo-view --repo "${REPO_SLUG}" 2>&1)"
```

It is a **warning, not a stop**: the server's own deploy key is what pulls the code, so a
missing `gh` degrades the preflight and the deploy continues.

### `ssl-dns-fix` → `fix-cert.sh`: the DNS-01 challenge

When the chosen challenge is DNS-01, the token is materialised into a local `0600` file,
copied to the server over **stdin** under the remote `umask 077`, and removed by a trap
whatever the outcome:

```bash
CF_SECRET="$(integration_secret_name cloudflare)"
CREDS_LOCAL="$(integration_secret_file "${CF_SECRET}")" || fail_with 5 STOPPED "..."
```

The value travels on stdin, never in `argv`: `cat > file` under the remote `umask 077` is
stricter than `scp`, which would leave the file readable for as long as the copy takes.

It also supports `--skip-dns-preflight` for the case where the record **does exist but
this host cannot see it** (no `dig`, a split-horizon view, still propagating). The skip is
recorded as a warning and reported as `dns_preflight: "skipped"`, never silently.

### `server-monitoring` → `test-alert.sh`: notifying through Slack

```bash
SLACK_CHANNEL="$(integration_ref slack channel)"
if ! integration_require_ready slack "the Slack test notification"; then ...
NOTIFY_OUT="$(integration_run_mutating slack notify "CONFIRM NOTIFY" ...)"
```

---

## 10. Configuration: the client manifest

Location: `~/.config/agency/clients/<client>.toml` (override with `AGENCY_MANIFEST_DIR`).
The integration tables hold **references only**:

```toml
[integrations.cloudflare]
zone_id = "023e105f4ecef8ad9ca31a8372d0c353"
account = "acme"                # a label for the journal; never used to authenticate
secret  = "cloudflare.token"    # the *name*; the value lives in the vault
ttl     = 60                    # default 1 (Cloudflare "auto")

[integrations.github]
repo    = "org/acme"
secret  = "github.token"

[integrations.slack]
channel = "#acme-alerts"
secret  = "slack.token"         # or slack.webhook for an incoming hook
```

| Reference | Provider | Required for | Description |
|-----------|----------|--------------|-------------|
| `zone_id` | cloudflare | the `cutover.sh` DNS change | Without it, the cutover **prints** the change instead of applying it |
| `account` | cloudflare | optional | Label for the journal and the report |
| `ttl` | cloudflare | optional | TTL for the A record. Default `1` (auto) |
| `secret` | any | optional | Vault name to read. Default `<provider>.token` |
| `repo` | github | the `deploy.sh` preflight | `owner/name`, access-verified before the deploy |
| `channel` | slack | `notify` | Destination channel for the notification |

> **A token in the manifest is a bug, not a configuration.** The validator rejects it.

---

## 11. Getting started

```bash
# 1. Install the engine
npm install            # inside packages/warpmetal-cli

# 2. See what is on offer
warpmetal integration list
warpmetal env doctor --json

# 3. Store the credential (never as an argument)
printf '%s' "$CLOUDFLARE_API_TOKEN" | warpmetal env store set cloudflare.token --stdin

# 4. Verify the provider answers
warpmetal integration status cloudflare --json     # read "status", not the exit code

# 5. Declare the reference in the client manifest
#    ~/.config/agency/clients/acme.toml -> [integrations.cloudflare]

# 6. Rehearse without mutating (the skills honour --dry-run)
skills/migrate-site/scripts/cutover.sh --client acme --dry-run
```

---

## 12. What it cannot do

These limits are deliberate and declared in the catalog; you can read them back with
`warpmetal integration list --json`.

- **Cloudflare: DNS only.** `dns-list` and `dns-upsert`. WAF and firewall rules are a
  later phase.
- **Platform providers are read-only.** `vercel` (`deployment-list`), `sentry`
  (`issue-list`) and `stripe` (`balance-get`) expose no
  mutating verb, so there is nothing to gate. No deploy is
  promoted, no issue is triaged and no money moves.
- **A Discord webhook can only report `DEGRADED`.** It cannot
  be proven without sending a message, and a status probe must not
  post to a channel, so it says so instead of claiming `OK`.
- **Scope is set in the provider's dashboard.** This toolkit **cannot tighten it**, and
  `integration status` reports at most whether the token is valid, **never** which zones
  it can reach. A classic GitHub PAT cannot be narrowed from here; a fine-grained one can,
  in GitHub's own dashboard.
- **A Slack or Discord incoming webhook is bound to one channel forever** and cannot be
  re-targeted.
- **GitHub and Sentry are read-only in this release** (`repo.view`, `issue.read`): there
  is no mutating verb to gate. GitHub also claims no scopes, because the GitHub API does
  not expose classic PAT scopes, so `status` reports identity and nothing more.
- **Revocation is honest, not magic.** `unsupported` (revoke in the provider's dashboard)
  for `cloudflare`, `slack`, `email` and `discord`;
  `uncertain` (confirm in the dashboard) for `github`, `vercel`,
  `sentry` and `stripe`. `env revoke` removes local material and says so.
- **`env secret` does not accept `--json`.** That is a usage error.

---

## 13. How it is tested

```bash
bash tools/check-all.sh     # policy validator + bash -n + integration-selftest.sh
npm run verify              # registry, conventions mirrors, catalog
npm test                    # inside packages/warpmetal-cli
```

`tools/integration-selftest.sh` drives the library against a stub CLI and **asserts** the
degradation warnings, the 0600 secret file, and that an ungated mutation **sends nothing**
and exits 11. The engine suite is **network-free by construction**: the fetch function,
the process runner and the credential backend are all injected. A secret-canary test
proves a stored value **never** appears in any diagnostic, plan, list, error or `--json`
document, and that it **does** appear on the one sanctioned stream.

Every provider is covered by the same matrix: an empty store yields `NEEDS_AUTH` with
**zero** network calls, an unknown verb is a usage error **before** the store is opened,
a mutating verb without its literal sends nothing, and a stubbed happy path asserts the
exact request the adapter makes.

Live lab evidence for vault → adapter → provider (Identity remote store, no bridges) was produced
for the baseline providers and for the extended smoke that walks all eight — a provider with a
credential must answer its probe, and one without records `SKIP (no credential)` rather than a pass.
The lab constraint that shaped the script: the fixture's device session lives ~60 s and every mint
creates a new principal (a new tenant, so an empty vault), so the smoke runs one session per group
instead of trying to refresh one.

---

## 14. Adding a provider

1. Add a `ProviderSpec` to `PROVIDERS` in
   `packages/warpmetal-cli/src/integration/registry.ts`: capabilities, secrets,
   `requiresTools`, honest scoping, `filesWritten`, `verifyCommand`, a redacted
   `errorMap`, and `revoke`.
2. Implement the adapter in `src/integration/adapters/<provider>.ts`. `status` **never**
   mutates and **never** prints a success it cannot verify.
3. Declare the gate for each mutating verb in the `gates` map.
   **Validate the verb, the flags and the gate before reading the credential** — a missing
   gate is `usage_error` (exit 2), not `NEEDS_AUTH` (exit 4). A forgotten `--confirm` and
   a forgotten token are different diagnoses and must not be confused.
4. Register the adapter in `adapters/index.ts`.
5. Add the provider to the `integrations` array in the `skill.json` of every skill that
   uses it; `verify.mjs` rejects a declared provider that is not in the catalog.
6. Add the row to `conventions/integrations.md` and run the build: it synchronises
   `conventions/` into the seven skills and regenerates `catalog/` and `plugins/`.

---

## See also

- [`conventions/integrations.md`](conventions/integrations.md) — the normative contract
  the skills follow, and the provider catalog.
- [`conventions/client-manifest.md`](conventions/client-manifest.md) — the full manifest
  schema, including the integration tables.
- [`packages/warpmetal-cli/README.md`](packages/warpmetal-cli/README.md) — the engine
  itself: superset dispatch, credential model, exit codes.
- [`docs/coding-env-skill-plan.md`](docs/coding-env-skill-plan.md) — where the exit code
  contract is frozen.
