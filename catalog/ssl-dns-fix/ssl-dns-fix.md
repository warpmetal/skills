---
name: ssl-dns-fix
disable-model-invocation: true
description: >-
  Diagnose and fix TLS certificate and DNS problems for a client site.
  Localizes the failure to one of three layers (resolution → issuance → serving)
  before attempting any fix. Always runs certbot --dry-run before a real attempt.
  Use when a cert didn't renew, the site shows "not secure", DNS changes haven't
  propagated, or the site has mixed content warnings.
---

# SSL / DNS Fix

## Purpose

Certificate and DNS problems are frequent, fiddly, and almost entirely rules-based.
This skill localizes the failure layer before touching anything, runs dry-runs before
every real attempt, and refuses to enable HSTS or make zone changes without explicit
confirmation.

## Trigger

Use this skill when the user says:

- "cert didn't renew for [client]"
- "site says not secure"
- "[client] has mixed content warnings"
- "DNS change hasn't propagated"
- "HTTPS not working for [client]"
- "Let's Encrypt renewal failed"

## Inputs

### Required

| Input | Description |
|-------|-------------|
| `--client <name>` | Client identifier. Loads `~/.config/agency/clients/<name>.toml` |

### Optional

| Input | Default | Description |
|-------|---------|-------------|
| `--domain <domain>` | Manifest `domain` | Override domain (e.g. subdomain) |
| `--dry-run` | `false` | Diagnose only; no mutations |
| `--issue-only` | `false` | Skip DNS and serving checks; go straight to cert issuance |
| `--dns-only` | `false` | Diagnose DNS layer only |
| `--layer <dns\|issuance\|serving\|mixed>` | auto | Force diagnosis to a specific layer |

### Required Client Configuration

See `conventions/client-manifest.md`. Minimum: `host`, `domain`. Optional `php`
improves the serving check.

## Prerequisites

Nothing here is interactive: every script runs non-interactively and either
succeeds, fails with an actionable message, or reports a degraded check. A
degraded check is **always** surfaced in `warnings[]` as a `check_skipped` entry —
never silently treated as a pass.

| Requirement | Needed for | If it is missing |
|-------------|-----------|------------------|
| `bash` 4+ | every script (`set -euo pipefail`, arrays, `BASH_SOURCE`) | nothing runs |
| `ssh` (OpenSSH client) | every step that touches the host | only manifest reading works; remote steps fail |
| `conventions/lib` | the shared library every script sources | `exit 127` before any work, listing the paths tried |
| `python3` | exact client-manifest TOML parsing | the `awk` fallback runs; the result reports `manifest_parser: "awk"` and adds a `check_skipped` warning |

### Library resolution

Scripts never depend on the caller's working directory. The library is located by
trying, in order:

1. `$AGENCY_LIB` — the override for any layout the list below does not cover
2. `<skill-dir>/conventions/lib` — this repository's layout
3. `<skill-dir>/conventions/lib` — `conventions/` installed beside the skills
4. `~/.cursor/skills/conventions/lib`, `~/.claude/skills/conventions/lib`, `~/.agents/skills/conventions/lib`

If none match, the script exits `127` and prints every path it tried plus both ways
to fix it. See the install section of `../../README.md`.

### Optional tools

| Tool | Used by | If it is missing |
|------|---------|------------------|
| `dig` | the DNS resolution layer | the layer is skipped and a warning is recorded |
| `whois` | the domain-expiry check | the registrar expiry lines are not collected at all — `diagnose-ssl.sh` has no fallback here, so the `check_skipped` warning is the only signal |

`fix-cert.sh` prefers `dig` for its pre-flight A-record lookup and falls back to
`getent hosts`. That fallback is recorded in `warnings[]` rather than being treated
as equivalent: `getent` reflects a single resolver, not the authoritative view.

Issuance consumes Let's Encrypt rate limit, which is why `fix-cert.sh` runs a
staging dry run first and never retries blindly.

### Platform

`bash` 4+ and an OpenSSH client are required. On Windows, run these through WSL or
Git Bash; there is no native PowerShell runner for the skill scripts.

## Rules

### Invocation

This skill is opt-in (`disable-model-invocation: true`). Load it only when the
operator names it. Renewal consumes a shared, rate-limited external quota, so an
ambient trigger could burn a client's allowance for the week on a false positive.

### Mandatory Safety Rules

1. **Localize before fixing** — Identify the broken layer (DNS → issuance → serving)
   before attempting any fix. Fixing the wrong layer wastes time and may make diagnosis
   harder.
2. **Always `--dry-run` first** — Every `certbot` invocation runs `--dry-run` before
   the real attempt. No exceptions.
3. **Never reissue until DNS is confirmed** — Do not attempt cert issuance if the
   domain does not resolve to this server.
4. **Propose DNS as diff** — Never edit zone records unattended. Present proposed
   record changes as a diff for confirmation.
5. **HSTS warning required** — Before enabling HSTS with max-age > 86400 or `preload`,
   warn explicitly that browsers cache it and a mistake cannot be undone from the server.
6. **Read-only first** — Observe and propose; require `CONFIRM FIX` before applying.
7. **Journal every run** — `~/.local/state/agency/<client>/<date>-ssl-dns-fix.md`
8. **Secrets sanitized** — Follow `conventions/logging.md`.

### Never Do

- Never reissue a cert before confirming DNS resolves to this server
- Never apply DNS changes without showing the proposed diff first
- Never enable HSTS preload without explicit HSTS warning acknowledgment
- Never `certbot` without `--dry-run` first
- Never bypass Let's Encrypt rate limits by trying multiple times quickly
- Never print private keys or ACME credentials
- Never use `sed` on a SQL dump with serialized PHP (use `wp search-replace`)

## Workflow

```
LOAD CLIENT → VALIDATE MANIFEST → LOCALIZE FAILURE LAYER
  → DNS: dig A, dig @authoritative-ns, TTL vs age
      → broken? → REPORT + propose fix
  → ISSUANCE: certbot certificates, renewal timer, /var/log/letsencrypt/
      → broken? → identify cause → dry-run → CONFIRM CERT ISSUE → apply
  → SERVING: openssl s_client, nginx -T, SNI check
      → broken? → identify cause → propose diff → CONFIRM NGINX CHANGE → apply
  → MIXED CONTENT: grep DB / wp search-replace proposal
      → FIXED / STOPPED / FAILED
```

### Detailed Steps

#### Phase 1: Load & Validate

```
1. Load ~/.config/agency/clients/<client>.toml
2. Validate host, domain present
3. Verify SSH host exists in ~/.ssh/config
4. Set target domain (--domain override or manifest domain)
```

#### Phase 2: DNS Layer (always first)

```bash
# Local resolution
dig +short A "$DOMAIN"
dig +short AAAA "$DOMAIN"

# Authoritative check (bypasses resolver cache)
NS=$(dig +short NS "$DOMAIN" | head -1)
dig +short A "$DOMAIN" "@$NS"

# TTL and expiry
dig +short A "$DOMAIN" | grep -E 'TTL|IN'
whois "$DOMAIN" | grep -iE 'expir|renew'
```

Broken if: domain does not resolve to server IP, or domain expired.

#### Phase 3: Issuance Layer

```bash
# On server via SSH
certbot certificates
systemctl status certbot.timer snap.certbot.renew.timer 2>/dev/null
tail -50 /var/log/letsencrypt/letsencrypt.log
# Check acme-challenge accessibility
curl -sI "http://$DOMAIN/.well-known/acme-challenge/test"
```

Common causes (check in order):
1. `.well-known/acme-challenge` blocked — catch-all redirect, WAF, framework router
2. Webroot vs nginx plugin mismatch
3. CAA record naming a different CA
4. Rate limit hit (see `references/rate-limits.md`)
5. Wildcard/internal host needing DNS-01

**Always dry-run first:**
```bash
certbot renew --dry-run --cert-name "$DOMAIN"
# Only on success:
certbot renew --cert-name "$DOMAIN"
systemctl reload nginx
```

#### Phase 4: Serving Layer

```bash
# On local machine
openssl s_client -connect "$HOST:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName

# On server
nginx -T | grep -A5 "server_name.*$DOMAIN"
nginx -T | grep "ssl_certificate"
```

Common causes:
- `cert.pem` where `fullchain.pem` needed
- `default_server` catching wrong SNI
- Renewed cert on disk, nginx not reloaded

Fix: propose nginx vhost diff → `CONFIRM NGINX CHANGE` → apply → `nginx -t` → `systemctl reload nginx`

#### Phase 5: Mixed Content (if requested or detected)

For WordPress:
```bash
# Propose only — do not run without confirmation
wp search-replace 'http://$DOMAIN' 'https://$DOMAIN' --dry-run --all-tables
```

Require the `CONFIRM NGINX CHANGE` or `CONFIRM CERT ISSUE` gate before the real run,
depending on which script performs it. Warn that this cannot use `sed` on SQL dumps.

#### Phase 6: Failure Handling

On any unexpected error:
1. Preserve evidence (log output, error messages)
2. Do not retry certbot more than once per run (rate limits)
3. Report state: `FIXED`, `FAILED`, or `STOPPED`

## How to Run


The scripts resolve the shared library from their own path and read no file relative
to your working directory, so they can be launched from anywhere. The examples below
`cd` into the skill directory first; calling a script by absolute path works
identically.
The diagnosis script is read-only and takes no gate. The two fix scripts are
mutating and each requires its own exact `--confirm` string. Without it they mutate
nothing, print `status: "CONFIRMATION_REQUIRED"` with `confirm_strings`, and exit `11`.

### Step 1 — Diagnose (read-only)

```bash
cd ~/.cursor/skills/ssl-dns-fix   # or wherever the skill is installed
bash scripts/diagnose-ssl.sh --client acme
```

Restrict the probe when the layer is already suspected:

```bash
bash scripts/diagnose-ssl.sh --client acme --layer dns
bash scripts/diagnose-ssl.sh --client acme --layer issuance
bash scripts/diagnose-ssl.sh --client acme --layer serving
bash scripts/diagnose-ssl.sh --client acme --domain www.acme.com
```

### Step 2 — Fix the certificate (only when `layer` is `issuance`)

```bash
bash scripts/fix-cert.sh --client acme
```

This is always a plan first: the script runs `certbot renew --dry-run`, and if the
dry run fails it emits `FAILED` with `reason` set and issues nothing. When the dry
run succeeds it stops at `status: "PLANNED"` so the operator can review. Then:

```bash
bash scripts/fix-cert.sh --client acme --confirm "CONFIRM CERT ISSUE"
```

### Step 3 — Fix the vhost (only when `layer` is `serving` or `mixed_content`)

```bash
bash scripts/fix-nginx.sh --client acme
bash scripts/fix-nginx.sh --client acme --confirm "CONFIRM NGINX CHANGE"
```

### Reading the result

| `status` | Exit | Next action |
|----------|------|-------------|
| `CONFIRMATION_REQUIRED` | 11 | Ask the operator in the chat, then re-run with the `confirm_strings` values as `--confirm` flags |
| `OBSERVED` | 0 | No broken layer found. Report `findings[]` — the cause may be intermittent |
| `DIAGNOSED` | 0 | A layer is broken. Read `layer`, `cause`, and `findings[]`, then choose Step 2 or Step 3 |
| `PLANNED` | 0 | Dry run or proposal only. Re-run without `--dry-run` and with the gate to apply |
| `FIXED` | 0 | Confirmed working. Report `cert_expiry` / `cert_expiry_days` and `fixes_applied[]` |
| `INCONCLUSIVE` | 0 | `fix-nginx.sh` found nothing it could safely change. Report `issues[]` to the operator |
| `FAILED` | 1, 3–6, 8, 14 | Read `errors` and `reason`. Do **not** retry certbot more than once per run: Let's Encrypt rate limits are the real risk |
| `STOPPED` | 2, 3, 5, 11 | Manifest invalid, SSH failed, or DNS is not pointed here yet. Read `errors` |

## State Model

Internal phases (`DIAGNOSING`, `LOCALIZED`, `FIXING`) appear in the journal and on
stderr, but are never emitted as `status`.

```
DIAGNOSING → LOCALIZED → CONFIRMATION_REQUIRED → FIXING → FIXED
                                                       → FAILED
                                            → STOPPED
           → OBSERVED (no broken layer)
           → INCONCLUSIVE
           → FAILED
           → STOPPED
```

| Status | Meaning | Terminal? |
|--------|---------|-----------|
| `OBSERVED` | Diagnosis ran; no broken layer found | **Yes** |
| `DIAGNOSED` | Diagnosis ran; a broken layer was identified | **Yes** |
| `PLANNED` | Dry run or fix proposal; nothing mutated | **Yes** |
| `CONFIRMATION_REQUIRED` | A gate is missing; nothing mutated | **Yes** |
| `FIXED` | Fix applied and verified from outside | **Yes** |
| `INCONCLUSIVE` | Ran to completion; nothing safe to change was found | **Yes** |
| `FAILED` | The fix failed; the previous state is preserved | **Yes** |
| `STOPPED` | Validation failed, a precondition is missing, or approval was refused | **Yes** |

## Output

The envelope is defined in `conventions/outputs.md`. `ssl-dns-fix` adds:

| Field | Emitted by | Type | Description |
|-------|-----------|------|-------------|
| `action` | all | string | `diagnose`, `issue-cert`, or `fix-nginx` |
| `domain` | all | string | Domain that was probed or fixed |
| `layer` | `diagnose` | string | `dns`, `issuance`, `serving`, `mixed_content`, or `none` |
| `cause` | `diagnose` | string | Human-readable cause for the broken layer |
| `findings[]` | `diagnose` | array | Every probe that returned something notable |
| `dns_local`, `dns_authoritative` | `diagnose` | string | What each resolver returned |
| `cert_serving` | `diagnose` | string | Subject/issuer of the certificate actually served |
| `cert_expiry_days` | `diagnose`, `issue-cert` | number | Days until expiry |
| `cert_expiry` | `issue-cert` | string | New expiry date |
| `challenge_accessible` | `diagnose` | string | Result of the `.well-known/acme-challenge` probe |
| `certbot_timer` | `diagnose` | string | Renewal timer state |
| `reason` | `issue-cert` | string | Set on failure: `no_dns_record`, `dry_run_failed`, `renewal_failed`, `nginx_test_failed`, `nginx_reload_failed` |
| `vhost` | `fix-nginx` | string | Path of the vhost that was inspected or changed |
| `backup_path` | `fix-nginx` | string | Where the original vhost was copied before editing |
| `issues[]` | `fix-nginx` | array | Problems found in the vhost |
| `proposed_changes[]` | `fix-nginx` | array | The diff that would be applied |
| `fixes_applied[]` | `fix-nginx` | array | What was actually changed |
| `nginx_reloaded` | `fix-nginx`, `issue-cert` | boolean | Whether nginx was reloaded |
| `tls_verify` | `fix-nginx` | string | Post-fix external verification of the chain |

```json
{
  "skill": "ssl-dns-fix",
  "client": "acme",
  "status": "FIXED",
  "timestamp": "2026-09-21T14:05:33Z",
  "duration_seconds": 48,
  "warnings": [],
  "errors": [],
  "action": "issue-cert",
  "domain": "acme.com",
  "cert_expiry": "2026-12-20T09:11:00Z",
  "cert_expiry_days": 89,
  "fix_applied": true,
  "nginx_reloaded": true
}
```

## Safety Gates

| Gate | Enforcement |
|------|-------------|
| DNS before issuance | `fix-cert.sh` refuses when the domain does not resolve to this host (`reason: "no_dns_record"`) |
| Dry-run gate | `certbot renew --dry-run` always precedes the real run; a failed dry run stops the script |
| DNS diff gate | Zone changes are presented as a diff, never applied unattended |
| HSTS warning | Explicit warning before any `max-age` above 86400 or a preload submission |
| Rate limit guard | One certbot attempt per run, plus a warning if recent attempts appear in the LE logs |
| Vhost backup | `fix-nginx.sh` copies the vhost before editing and rolls the file back if `nginx -t` fails |
| Approval gate | `CONFIRM CERT ISSUE` for `fix-cert.sh`, `CONFIRM NGINX CHANGE` for `fix-nginx.sh` |

## References

- [DNS Resolution](references/dns-resolution.md) — dig commands, authoritative NS, TTL diagnosis
- [Cert Issuance](references/cert-issuance.md) — Let's Encrypt flow, common failures, DNS-01
- [Cert Serving](references/cert-serving.md) — SNI, cert.pem vs fullchain.pem, nginx reload
- [Mixed Content](references/mixed-content.md) — wp search-replace, serialized PHP, detection
- [HSTS & Preload](references/hsts-preload.md) — Risks, browser cache, irreversibility
- [Rate Limits](references/rate-limits.md) — LE limits, how to avoid burning them

Shared:
- [Client Manifest](conventions/client-manifest.md)
- [Safety](conventions/safety.md)
- [Logging](conventions/logging.md)
- [Outputs](conventions/outputs.md)
- [Approvals](conventions/approvals.md)

## Scripts

| Script | Responsibility |
|--------|----------------|
| `scripts/diagnose-ssl.sh` | Read-only: dig, openssl, certbot certificates, nginx -T |
| `scripts/fix-cert.sh` | certbot dry-run then apply with confirmation |
| `scripts/fix-nginx.sh` | Propose nginx vhost diff, apply with confirmation, test+reload |

## Completion Criteria

The work is complete when the last stdout line reports `status: "OBSERVED"` (nothing
was broken) or `status: "FIXED"`, and all of the following hold.

1. The certificate is valid as seen from **outside** this machine — `openssl s_client`
   with an explicit `-servername`, not a local file read.
2. `cert_expiry_days` is greater than 14.
3. `nginx -t` passed and nginx was reloaded after the change
   (`nginx_reloaded: true`).
4. HTTP still redirects to HTTPS and the previously working pages still return 200.
5. No new entries appeared in `/var/log/letsencrypt/letsencrypt.log` indicating a
   rate limit, and certbot was invoked at most once in this run.
6. The journal at `~/.local/state/agency/<client>/<date>-ssl-dns-fix.md` records the
   broken layer, the probes, the diff or dry run, and the applied change.
7. Anything the scripts could only diagnose (a DNS zone change at the registrar, an
   HSTS change) has been handed back to the operator as a concrete instruction, not
   left implicit.

If `status` is `INCONCLUSIVE`, the work is complete but unanswered: say so explicitly
and list `issues[]` rather than declaring success.
