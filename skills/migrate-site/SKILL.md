---
name: migrate-site
disable-model-invocation: true
description: >-
  Move a client site between hosts in eight controlled phases: inventory, prepare target,
  lower TTL, first sync, freeze, cutover, verify, and decommission. Handles PHP/Laravel,
  WordPress, Node, and static sites. Use when moving a client off cPanel, consolidating
  sites onto a new server, or migrating between hosting providers.
---

# Migrate Site

## Purpose

Moving a client site between hosts. Agencies do this constantly and improvise it every
single time. This skill makes it systematic, phased, and reversible — with the source
server staying live until the cutover is verified.

## Trigger

Use this skill when the user says:

- "move [client] to the new server"
- "get [client] off cPanel"
- "consolidate these three sites onto one box"
- "migrate [client] between hosts"
- "copy [client] to the new VPS"
- "move [client] from [host-a] to [host-b]"

## Inputs

### Required

| Input | Description |
|-------|-------------|
| `--client <name>` | Client identifier. Loads `~/.config/agency/clients/<name>.toml` |
| `--source <alias>` | SSH alias of source host |
| `--target <alias>` | SSH alias of target host |

### Optional

| Input | Default | Description |
|-------|---------|-------------|
| `--action <inventory\|prepare\|sync\|freeze\|cutover\|verify\|decommission>` | `inventory` | Phase to run |
| `--dry-run` | `false` | Show plan only; no mutations |
| `--delta` | `false` | On sync: run fast delta only (use after bulk sync) |

### Required Client Configuration

See `conventions/client-manifest.md`. Required: `host`, `site_root`, `domain`,
`stack`, `db`. Migration adds target fields:

```toml
[migration]
source_host  = "acme-old"
target_host  = "acme-new"
target_root  = "/var/www/acme"
ttl_lowered  = "2026-09-20"    # date TTL was dropped to 300s
mail_relay   = "smtp.mailgun.org"  # if routing outbound through relay
```

## Prerequisites

Nothing here is interactive: every script runs non-interactively and either
succeeds, fails with an actionable message, or reports a degraded check. A
degraded check is **always** surfaced in `warnings[]` as a `check_skipped` entry —
never silently treated as a pass.

| Requirement | Needed for | If it is missing |
|-------------|-----------|------------------|
| `bash` 4+ | every script (`set -euo pipefail`, arrays, `BASH_SOURCE`) | nothing runs |
| `ssh` (OpenSSH client) | every step that touches a host | only manifest reading works; remote steps fail |
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
| `dig` | A-record and TTL reads, propagation polling | DNS facts come back empty and `cutover.sh` cannot confirm propagation, so it reports `INCONCLUSIVE` instead of `CUTOVER` |
| `curl` | checking that the domain answers over HTTPS | the live check is skipped |
| `openssl` | reading the certificate as served | the certificate check is skipped |

`restic` is used on the source host for the pre-decommission snapshot, not on the
operator's machine.

### Platform

`bash` 4+ and an OpenSSH client are required. On Windows, run these through WSL or
Git Bash; there is no native PowerShell runner for the skill scripts.

## Rules

### Invocation

This skill is opt-in (`disable-model-invocation: true`). Load it only when the
operator names it. It rewrites DNS, cuts traffic to a new host, and decommissions
the old one; an ambient trigger would be an unrequested production change.

### Mandatory Safety Rules

1. **Inventory before anything** — The migrations that go badly are the ones where the
   inventory phase was skipped. Never skip it.
2. **Lower TTL 24–48h before cutover** — Miss this and the "5-minute cutover window"
   is actually the old TTL (often 3600s or 86400s), with traffic split across two servers
   writing to two databases. Warn loudly if TTL was not lowered.
3. **Disable cron on source at freeze** — Not before. Not at cutover. At freeze.
   Two servers running the same scheduler means double invoices, double emails,
   double webhooks. See `references/cron-deduplication.md`.
4. **Source stays live after cutover** — Do not power off or decommission the source
   on the same day as cutover. It must serve traffic for at least the old TTL.
5. **Validate on target before touching DNS** — Use a local hosts-file override or
   temporary subdomain. Never change DNS before confirming the target works.
6. **No `sed` on SQL dumps** — WordPress URL changes require `wp search-replace`.
   Plain `sed` corrupts serialized PHP byte-length prefixes.
7. **Each mutating phase requires explicit confirmation** — `CONFIRM PREPARE`,
   `CONFIRM SYNC`, `CONFIRM FREEZE`, `CONFIRM DISABLE CRON`, `CONFIRM CUTOVER`,
   `CONFIRM DNS CHANGE`, `CONFIRM DECOMMISSION`, `CONFIRM PRUNE`. The read-only phases
   (`inventory`, `verify`) take no gate and mutate nothing.
8. **Journal every run** — `~/.local/state/agency/<client>/<date>-migrate-site.md`
9. **Secrets sanitized** — Follow `conventions/logging.md`.

### Never Do

- Never skip the inventory phase
- Never use `sed` on a SQL dump for URL replacement
- Never disable cron on the source before the freeze phase
- Never power off the source on cutover day
- Never change DNS before validating the target
- Never run the same scheduler on source and target simultaneously
- Never mix collations in a MySQL migration without awareness (5.7 → 8 gotcha)

## Workflow

```
INVENTORY (source) → PREPARE TARGET → LOWER TTL (advisory)
  → FIRST SYNC (bulk rsync + DB dump, validate on target)
  → FREEZE (maintenance mode, disable source cron, final delta sync)
  → CUTOVER (DNS change, source stays live)
  → VERIFY (real checklist)
  → DECOMMISSION (after ≥ 1 week)
```

Each phase is idempotent and can be re-run.

### Phase 1: Inventory (Source)

Collect everything that could bite you later:

```bash
# Runtime
php --version; php -m                       # version + extensions
node --version; npm --version               # if Node
composer --version

# Database
mysql --version
mysql -u root -e "SHOW DATABASES;"
mysqldump --version

# Disk
df -h; df -i
du -sh "$SITE_ROOT"

# Vhosts and certs
nginx -T 2>/dev/null | grep -E "server_name|ssl_certificate|root"
certbot certificates

# DNS (run locally, not on server)
dig +short A "$DOMAIN"
dig +short MX "$DOMAIN"
dig +short TXT "$DOMAIN"   # SPF, DKIM, etc.
whois "$DOMAIN" | grep -iE "expir|TTL"

# Cron
crontab -l -u www-data

# Systemd units
ls /etc/systemd/system/"$CLIENT"-*.service

# Mail configuration
grep -rE "MAIL_HOST|MAIL_FROM|SMTP" "$SITE_ROOT/shared/.env" | sed 's/=.*/=REDACTED/'

# External webhooks (best effort from .env)
grep -iE "webhook|callback|endpoint" "$SITE_ROOT/shared/.env" | sed 's/=.*/=REDACTED/'
```

Output: a structured inventory document saved to the journal.

TTL advisory (run immediately after inventory):

> "Current A record TTL is X seconds. To achieve a 5-minute cutover window, lower it
> to 300 NOW and proceed with other phases after at least 24–48 hours."

#### Phase 2: Lower TTL (Advisory)

This phase has no mutation: it is a registrar change made by the operator, and the
skill can only check it. `inventory.sh` reports the current TTL and warns, and you
record the date in the manifest once it is done:

```toml
[migration]
ttl_lowered = "2026-09-21"
```

`cutover.sh` re-reads the TTL and repeats the warning if the record is still above
300 seconds. Nothing blocks on it, because blocking would leave the migration half
done; the warning is the whole enforcement.

Wait at least 24–48 hours before Phase 6. Cutover with an unlifted TTL means traffic
keeps reaching the source for up to the old TTL, with both hosts serving the same
domain and writing to two databases. See `references/ttl-strategy.md`.

#### Phase 3: Prepare Target

```bash
# Matching runtime
apt-get install php8.3-fpm php8.3-{cli,mbstring,xml,curl,mysql,zip,gd,bcmath}

# Database
mysql -e "CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';"
mysql -e "GRANT ALL ON $DB_NAME.* TO '$DB_USER'@'localhost';"

# Directory structure
mkdir -p "$TARGET_ROOT/shared/{.env,storage,public/uploads}"
chown -R www-data:www-data "$TARGET_ROOT"

# Vhost
# (use deploy-site nginx template, adapted for target)

# Pre-issue TLS via DNS-01 (before DNS cutover)
certbot certonly --dns-<provider> -d "$DOMAIN"
```

#### Phase 4: First Sync (Source Still Live)

```bash
# Files
rsync -aHAXz --exclude=vendor --exclude=node_modules \
  --exclude=releases --exclude=".git" \
  "$SOURCE_HOST:$SITE_ROOT/shared/" "$TARGET_ROOT/shared/"

# Database
ssh "$SOURCE_HOST" "mysqldump --single-transaction --databases $DB_NAME | gzip" \
  | ssh "$TARGET_HOST" "zcat | mysql $DB_NAME"
```

Validate on target BEFORE touching DNS:
- Set local `/etc/hosts` override
- Check key pages render, login works, uploads accessible
- WordPress: run `wp search-replace` dry-run for new domain

#### Phase 5: Freeze

```bash
# Maintenance mode on source
ssh "$SOURCE_HOST" "cd $SITE_ROOT/current && php artisan down"

# Disable source cron (THE critical step)
ssh "$SOURCE_HOST" "crontab -r -u www-data"
ssh "$SOURCE_HOST" "systemctl stop '$CLIENT-worker@*'"

# Final delta sync
rsync -aHAXz --checksum "$SOURCE_HOST:$SITE_ROOT/shared/" "$TARGET_ROOT/shared/"

# Final DB dump
ssh "$SOURCE_HOST" "mysqldump --single-transaction $DB_NAME | gzip" \
  | ssh "$TARGET_HOST" "zcat | mysql $DB_NAME"
```

Maintenance mode window starts here. It must be short.

#### Phase 6: Cutover

DNS change proposed as diff:
```
acme.com.  300  IN  A  <old-ip>  →  acme.com.  300  IN  A  <new-ip>
```

Requires `CONFIRM CUTOVER`.

Source server continues running for at least the OLD TTL (before it was lowered to 300).
Do not power it off.

#### Phase 7: Verify

Full checklist. See `references/cutover-checklist.md`:

- Pages render (home, key landing pages)
- Forms submit successfully
- Login works
- File upload writes to correct location
- Scheduled tasks fire on target
- Queue workers drain on target
- Outbound mail arrives (check spam folder)
- Payment webhooks reach new host
- Redirects unchanged
- `robots.txt` unchanged
- No mixed content warnings
- SSL valid from external probe

#### Phase 8: Decommission (≥ 1 week later)

```bash
# Final snapshot before decommission
restic -r "$BACKUP_REPO" backup "$SOURCE_HOST:$SITE_ROOT"

# Remove vhost (propose before executing)
# Remove DB user (propose before executing)
# Tag snapshot with "pre-decommission-acme-<date>"
```

## How to Run


The scripts resolve the shared library from their own path and read no file relative
to your working directory, so they can be launched from anywhere. The examples below
`cd` into the skill directory first; calling a script by absolute path works
identically.
Each phase is its own script and its own command. The phases are ordered and the
state ledger enforces it: a later phase refuses to run until the earlier ones are
recorded. The ledger lives at
`~/.local/state/agency/<client>/migration-state.tsv` (append-only) and the inventory
document at `~/.local/state/agency/<client>/migration/inventory.json`.

Mutating phases take an exact `--confirm` string; without it they mutate nothing,
print `status: "CONFIRMATION_REQUIRED"` with `confirm_strings`, and exit `11`.
`inventory.sh` and `verify.sh` are read-only and take no gate.

### Phase 1 — Inventory (read-only)

```bash
cd ~/.cursor/skills/migrate-site   # or wherever the skill is installed
bash scripts/inventory.sh --client acme --source acme-old --target acme-new
```

`status: "INVENTORIED"`, exit 0. Read `php_version`, `mysql_version`,
`dominant_collation`, `site_size`, `a_record_ip`, and `a_record_ttl`. Act on any
`warnings[]` about MySQL 5.7 or an unusual collation before continuing.

### Phase 2 — Lower the TTL (operator action)

Lower the A record TTL to 300 at the registrar, then set `migration.ttl_lowered` in
the manifest. Nothing to run. Wait 24–48 hours.

### Phase 3 — Prepare the target

```bash
bash scripts/prepare-target.sh --client acme --dry-run
bash scripts/prepare-target.sh --client acme --confirm "CONFIRM PREPARE"
```

Reads `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` from the **source** `.env` so
the application configuration stays valid after cutover. `status: "PREPARED"`.

### Phase 4 — First sync

```bash
bash scripts/sync.sh --client acme --confirm "CONFIRM SYNC"
```

Then exercise the target directly, without touching DNS:

```bash
ssh acme-new "curl -sI -H 'Host: acme.com' https://127.0.0.1/ | head -1"
```

### Phase 5 — Freeze the source

```bash
bash scripts/freeze.sh --client acme --confirm "CONFIRM FREEZE" --confirm "CONFIRM DISABLE CRON"
bash scripts/sync.sh --client acme --delta --confirm "CONFIRM SYNC"
```

Cron is disabled here, never later. The source keeps serving a maintenance page, so
the migration is still reversible.

### Phase 6 — Cut over

```bash
bash scripts/cutover.sh --client acme --dry-run
bash scripts/cutover.sh --client acme --confirm "CONFIRM CUTOVER"
```

Add `--dns-command '<command>'` to let the script apply the record change itself;
that also requires `--confirm "CONFIRM DNS CHANGE"`. Without it the required record
diff is printed for the operator to apply. The source is never touched.

### Phase 7 — Verify (read-only)

```bash
bash scripts/verify.sh --client acme
```

Runs `references/cutover-checklist.md`. Every automated item is reported in
`verification_results[]`; items needing a human (form submissions, email arrival,
payment webhooks) are listed in `manual_checks[]`.

### Phase 8 — Decommission

```bash
bash scripts/decommission.sh --client acme --dry-run
bash scripts/decommission.sh --client acme --confirm "CONFIRM DECOMMISSION"
```

Refuses to run until at least 7 days have passed since cutover, unless
`--force-early` is passed. Add `--prune-site-root` to also delete the site root,
which additionally requires `--confirm "CONFIRM PRUNE"`.

### Reading the result

| `status` | Exit | Next action |
|----------|------|-------------|
| `CONFIRMATION_REQUIRED` | 11 | Ask the operator in the chat, then re-run the same command with one `--confirm` per value in `confirm_strings` |
| `PLANNED` | 0 | Dry run only. Re-run without `--dry-run` and with the gate to apply |
| `INVENTORIED` | 0 | Read the inventory fields and warnings, then continue to Phase 2 |
| `PREPARED` | 0 | Continue to Phase 4 once the TTL has settled |
| `SYNCED` | 0 | Check `users_row_delta`; a positive delta means the source moved on, so re-run the delta just before freezing |
| `FROZEN` | 0 | Run `sync.sh --delta` before Phase 6 |
| `CUTOVER` | 0 | Continue to Phase 7 |
| `INCONCLUSIVE` | 0 | DNS has not switched yet. Re-run `verify.sh` once it has |
| `VERIFIED` | 0 | All automated checks passed. Work through `manual_checks[]` with the operator before Phase 8 |
| `DECOMMISSIONED` | 0 | The migration is finished. Confirm the target is being backed up |
| `FAILED` | 1, 4, 6–8, 14 | Read `errors`. For `verify`, each failing item carries its own `detail` |
| `STOPPED` | 2, 3, 5, 11–13 | A phase prerequisite is missing (check the state ledger), validation failed, or approval was refused |

## State Model

```
IDLE
  → INVENTORIED
  → PREPARED
  → SYNCED
  → FROZEN
  → CUTOVER
  → VERIFIED
  → DECOMMISSIONED
  → FAILED (any phase)
  → STOPPED (user declined or validation failed)
```

| State | Meaning | Terminal? |
|-------|---------|-----------|
| `PLANNED` | A `--dry-run` phase produced a plan | **Yes** |
| `CONFIRMATION_REQUIRED` | A phase needs a `--confirm` string; nothing mutated | **Yes** |
| `INVENTORIED` | Source inventory complete (Phase 1) | **Yes (per phase)** |
| `PREPARED` | Target ready (Phase 3) | **Yes (per phase)** |
| `SYNCED` | Files and database copied to the target (Phase 4) | **Yes (per phase)** |
| `FROZEN` | Source in maintenance, cron disabled, delta ready to run (Phase 5) | **Yes (per phase)** |
| `CUTOVER` | DNS now resolves to the target; the source is still live (Phase 6) | **Yes (per phase)** |
| `INCONCLUSIVE` | The cutover ran but DNS has not switched yet | **Yes (per phase)** |
| `VERIFIED` | Every automated checklist item passed (Phase 7) | **Yes (per phase)** |
| `DECOMMISSIONED` | Source retired (Phase 8) | **Yes** |
| `FAILED` | Phase failed | **Yes** |
| `STOPPED` | A phase prerequisite is missing, validation failed, or approval was refused | **Yes** |

Each phase is terminal in its own right: the run ends there and the next phase is a
separate command. The state ledger, not the exit status of an earlier run, is what
records overall progress.

## Output

The envelope is defined in `conventions/outputs.md`. `migrate-site` adds the
fields below; `status` is always one of the phase statuses in the table above.

| Field | Emitted by | Type | Description |
|-------|-----------|------|-------------|
| `action` | all | string | The phase: `inventory`, `prepare`, `sync`, `freeze`, `cutover`, `verify`, `decommission` |
| `source_host`, `target_host` | all | string | The two hosts involved |
| `target_root` | `prepare`, `sync` | string | Site root on the target |
| `mode` | `sync` | string | `bulk` or `delta` |
| `files_synced`, `database_synced` | `sync` | boolean | What this run copied |
| `users_row_delta` | `sync` | number | Source minus target `users` rows; positive means the source moved on |
| `php_version`, `mysql_version`, `dominant_collation`, `site_size` | `inventory` | string | Runtime facts from the source |
| `a_record_ip`, `a_record_ttl` | `inventory` | string/number | DNS facts at inventory time |
| `cron_entries`, `systemd_units` | `inventory` | number | Counts of scheduled work on the source |
| `inventory_file` | `inventory` | string | Path of the saved inventory document |
| `db_name`, `database_created`, `packages_installed` | `prepare` | string/boolean | What was created on the target |
| `method` | `freeze` | string | `artisan`, `wp`, `nginx`, or `none` |
| `cron_disabled` | `freeze` | boolean | Whether the source cron was disabled |
| `active_writers` | `freeze` | number | Non-sleep database connections seen after freezing |
| `next_step` | `freeze` | string | The command to run next |
| `previous_ip`, `target_ip` | `cutover` | string | The A record before and after |
| `dns_change_needed`, `dns_applied`, `propagated` | `cutover` | boolean | DNS outcome |
| `live_status` | `cutover` | number | HTTP status of the domain from this machine |
| `verification_results[]` | `verify` | array | `{id, description, status, detail}` per automated checklist item |
| `manual_checks[]` | `verify` | array | `{id, description, verified}` items a human must confirm |
| `passed`, `failed`, `manual_pending` | `verify` | number | Checklist totals |
| `cert_expiry_days` | `verify` | number | Days until the certificate expires |
| `checklist` | `verify` | string | Path of the checklist that was executed |
| `snapshot_id` | `decommission` | string | Pre-decommission snapshot |
| `days_since_cutover` | `decommission` | number | Age gate result |
| `database_user_dropped`, `site_root_removed` | `decommission` | boolean | What was torn down |

```json
{
  "skill": "migrate-site",
  "client": "acme",
  "status": "FROZEN",
  "timestamp": "2026-09-21T14:05:33Z",
  "duration_seconds": 96,
  "warnings": ["A record TTL for acme.com is 3600s and was never lowered"],
  "errors": [],
  "action": "freeze",
  "source_host": "acme-old",
  "target_host": "acme-new",
  "method": "artisan",
  "cron_disabled": true,
  "active_writers": 0,
  "next_step": "bash scripts/sync.sh --client acme --delta"
}
```

## Safety Gates

| Gate | Enforcement |
|------|-------------|
| Inventory first | Refuses to run other phases without inventory document |
| TTL warning | Warns loudly if TTL not lowered before freeze/cutover |
| Cron deduplication | Disables source cron at freeze, not cutover |
| Source preservation | Refuses to decommission on cutover day |
| DNS diff gate | Cutover shows DNS change as diff before applying |
| No sed on SQL | wp search-replace enforced for WordPress URL changes |
| Per-phase approval | Typed confirmation required before each phase |

## References

- [Inventory](references/inventory.md) — What to collect and document from source
- [TTL Strategy](references/ttl-strategy.md) — Why 24–48h matters, split-brain consequence
- [rsync Strategy](references/rsync-strategy.md) — Flags, ownership, bulk vs delta
- [WordPress Migration](references/wordpress-migration.md) — wp search-replace, serialized PHP
- [Mail Deliverability](references/mail-deliverability.md) — SPF, DKIM, new IP reputation, relay
- [MySQL Version Gotchas](references/mysql-version-gotchas.md) — 5.7→8, collation changes
- [Cutover Checklist](references/cutover-checklist.md) — Full verification checklist
- [Cron Deduplication](references/cron-deduplication.md) — When to disable source cron

Shared:
- [Client Manifest](conventions/client-manifest.md)
- [Safety](conventions/safety.md)
- [Logging](conventions/logging.md)
- [Outputs](conventions/outputs.md)
- [Approvals](conventions/approvals.md)

## Scripts

| Script | Responsibility |
|--------|----------------|
| `scripts/inventory.sh` | Read-only: runtime, DB, disk, cron, vhosts, DNS, mail from the source |
| `scripts/prepare-target.sh` | Install matching runtime, create DB+user, seed `.env`, create the tree |
| `scripts/sync.sh` | Bulk tar stream or `--delta` rsync; database stream; row-count sanity check |
| `scripts/freeze.sh` | Maintenance mode, disable source cron, report active writers |
| `scripts/cutover.sh` | DNS diff, optional apply with confirmation, keep the source live |
| `scripts/verify.sh` | Execute `references/cutover-checklist.md`, item by item |
| `scripts/decommission.sh` | Age gate, final snapshot, remove vhost, units, DB user, optional prune |

## Completion Criteria

Each phase completes on its own status. The **migration** is complete only when all
of the following hold.

1. `inventory.sh` ended `INVENTORIED` and every `warnings[]` entry was acted on or
   reported — particularly MySQL 5.7 and unusual collations.
2. `a_record_ttl` was 300 or lower for at least 24 hours before the cutover, or the
   operator accepted the longer window in writing.
3. `prepare-target.sh` ended `PREPARED`, and the target's PHP and database versions
   match the source (compare against the inventory document).
4. `sync.sh` ended `SYNCED` with `users_row_delta` at or near `0`.
5. `freeze.sh` ended `FROZEN` with `cron_disabled: true` and `active_writers` at `0`,
   followed by a `--delta` sync that also ended `SYNCED`.
6. `cutover.sh` ended `CUTOVER` (not `INCONCLUSIVE`) with `propagated: true` and a
   `live_status` of 200, 301, or 302.
7. `verify.sh` ended `VERIFIED`: `failed == 0`, every `manual_checks[]` entry has been
   walked through with the operator, and `cert_expiry_days` is greater than 14.
8. The source is still running and reachable. It is decommissioned only after the
   age gate, with a pre-decommission snapshot recorded in `snapshot_id`.
9. `decommission.sh` ended `DECOMMISSIONED`, and the **target** now has working
   backups: run `../backup-restore/scripts/setup-backup.sh` or
   `drill-restore.sh` against it. A migration that ends without backups on the new
   host is not finished.
10. The journal at `~/.local/state/agency/<client>/` contains one file per phase, and
    the state ledger at `~/.local/state/agency/<client>/migration-state.tsv` shows
    all eight phases.

If `verify.sh` reports `FAILED`, the migration is not complete. Either fix the target
and re-run `verify.sh`, or revert DNS — the source is still live precisely so that
this remains possible while the TTL is low.
