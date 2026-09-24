---
name: backup-restore
disable-model-invocation: true
description: >-
  Set up restic-based backups for a client site and verify they actually work
  via a restore drill. Covers database dumps, user uploads, configs, and cron/systemd units.
  Enforces key escrow, offsite storage, and a dead-man's switch before declaring setup complete.
  Use when setting up backups, testing restores, or recovering from data loss.
---

# Backup & Restore

## Purpose

Configures and verifies backups for client sites. The restore drill is the reason this
skill exists — a backup that has never been restored is a hypothesis, not a backup.

## Trigger

Use this skill when the user says:

- "set up backups for [client]"
- "can we restore last Tuesday for [client]"
- "test the backups for [client]"
- "restore [client] from [date]"
- "backup isn't running for [client]"
- "verify the backups"

## Inputs

### Required

| Input | Description |
|-------|-------------|
| `--client <name>` | Client identifier. Loads `~/.config/agency/clients/<name>.toml` |

### Optional

| Input | Default | Description |
|-------|---------|-------------|
| `--action <setup\|drill\|restore\|status>` | `status` | What to do |
| `--snapshot <id>` | `latest` | Restic snapshot ID for restore/drill |
| `--dry-run` | `false` | Show plan only; no mutations |
| `--target-dir <path>` | `/tmp/restore-<client>-<ts>` | Restore destination (drill always uses scratch) |

### Required Client Configuration

See `conventions/client-manifest.md`. Required fields: `host`, `site_root`, `db`.
Backup-specific manifest fields:

```toml
[backup]
repo        = "s3:s3.amazonaws.com/mybucket/acme"  # or b2:, sftp:, etc.
healthcheck = "https://hc-ping.com/uuid"           # dead-man's switch URL
offsite_confirmed = "2026-09-01"                    # date key escrow was confirmed
```

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

None locally. `restic`, the MySQL client, and `php` are invoked **on the host**:
`setup-backup.sh` and `drill-restore.sh` send their checks inside the remote
payload, so what matters is that those tools exist on the server.

`drill-restore.sh` reports its remote outcomes explicitly. When the server has no
MySQL client it records `RESULT row_counts SKIP` instead of a pass, and the drill
is reported as inconclusive rather than successful.

### Platform

`bash` 4+ and an OpenSSH client are required. On Windows, run these through WSL or
Git Bash; there is no native PowerShell runner for the skill scripts.

## Rules

### Invocation

This skill is opt-in (`disable-model-invocation: true`). Load it only when the
operator names it. `restore.sh` overwrites live data, so an ambient trigger would
be an unrequested destructive change.

### Mandatory Safety Rules

1. **Key escrow before setup completes** — Refuses to declare setup `READY` until the
   restic repository key is documented off-host. See `references/key-escrow.md`.
2. **Offsite means off-provider** — The backup repo must be in a different account and
   preferably a different provider than the server. Warns if both appear to be the same.
3. **Dead-man's switch required** — Setup must wire a healthcheck ping on success and
   alert on absence. Silent cron failures are the most common way people discover their
   backups died months ago.
4. **Restore always to scratch** — `--action restore` defaults to a temporary directory.
   Overwriting live data requires typing the client name as confirmation.
5. **Never print the restic password** — Pass it via environment variable or password
   file. Never log it or emit it in output.
6. **Read-only first** — `status` and `drill` only read/restore to scratch. Mutations
   (setup, live restore) require `CONFIRM BACKUP SETUP` or `CONFIRM RESTORE <client>`.
7. **Journal every run** — `~/.local/state/agency/<client>/<date>-backup-restore.md`
8. **Secrets sanitized** — Follow `conventions/logging.md`.

### Never Do

- Never print the restic password, repo credentials, or S3 keys
- Never restore over live data without the client-name confirmation string
- Never skip key escrow step during setup
- Never assume a backup works without a restore drill
- Never back up `vendor/`, `node_modules/`, or old releases (regenerable + expensive)

## Workflow

### Action: `status`

```
LOAD CLIENT → READ MANIFEST → SSH: last snapshot, last ping, repo stats → REPORT
```

### Action: `setup`

```
LOAD CLIENT → VALIDATE MANIFEST → PREFLIGHT (read-only)
  → CHECK RESTIC INSTALLED → CHECK REPO EXISTS OR INIT REPO
  → CONFIGURE WHAT TO BACK UP
  → INSTALL CRON JOB (run-backup.sh)
  → WIRE DEAD-MAN'S SWITCH
  → VERIFY FIRST BACKUP RUNS
  → KEY ESCROW GATE (refuses READY until confirmed)
  → REPORT READY
```

### Action: `drill`

```
LOAD CLIENT → VALIDATE MANIFEST → FETCH SNAPSHOT LIST
  → SELECT SNAPSHOT (latest or --snapshot)
  → RESTORE TO SCRATCH DIR + TEMP DB
  → VERIFY:
      row counts per table vs production (within 5% tolerance)
      app boots against restored DB
      sample uploaded files match by checksum
      newest record timestamp vs snapshot timestamp
  → TEAR DOWN SCRATCH
  → REPORT pass/fail per check
```

### Action: `restore`

```
LOAD CLIENT → SELECT SNAPSHOT → SHOW PLAN (what will be restored, where)
  → IF TARGET IS LIVE DATA: require "CONFIRM RESTORE <client>"
  → ELSE: require "CONFIRM RESTORE"
  → RESTORE FILES → RESTORE DB → VERIFY → REPORT
```

### Detailed Steps — Setup

#### Phase 1: Preflight

```bash
# Check restic is installed on server
ssh "$HOST" 'restic version'

# Check repo accessibility
ssh "$HOST" "RESTIC_PASSWORD_FILE=$PASS_FILE restic -r $REPO snapshots --last 1"
```

#### Phase 2: Configure Backup

What to back up (see `references/what-to-backup.md`):
- `mysqldump --single-transaction --databases $DB_NAME`
- `$SITE_ROOT/shared/` (uploads, .env)
- `/etc/nginx/sites-available/$CLIENT`
- Crontab: `crontab -l`
- Systemd units: `/etc/systemd/system/$CLIENT-*.service`

What NOT to back up:
- `vendor/`, `node_modules/`, `releases/` (except current symlink target)

#### Phase 3: Install Cron

```cron
0 3 * * * /usr/local/bin/run-backup-acme.sh
```

#### Phase 4: Dead-Man's Switch

Success ping added to `run-backup.sh`:
```bash
curl -fsS --retry 3 "$HEALTHCHECK_URL" > /dev/null
```

Alert on absence configured on healthcheck provider.

#### Phase 5: Key Escrow Gate

The escrow location is an input, not a prompt. Pass it with `--escrow-location`:

```bash
--escrow-location "1Password: Agency vault / acme-restic"
```

`setup-backup.sh` refuses to report `CONFIGURED` when it is empty or whitespace, and
records it in the journal and in the `escrow_location` output field. The operator is
asked for it in the chat, by the agent, before the script is re-run — never by the
script itself.

## How to Run


The scripts resolve the shared library from their own path and read no file relative
to your working directory, so they can be launched from anywhere. The examples below
`cd` into the skill directory first; calling a script by absolute path works
identically.
The scripts are non-interactive. Mutating scripts require exact `--confirm` strings;
without them they mutate nothing, print `status: "CONFIRMATION_REQUIRED"` with
`confirm_strings`, and exit `11`.

The restic password is **never prompted for and never passed on the command line**. It
is read from `$RESTIC_PASSWORD`, then `--password-file <path>`, then stdin. Pipe it in
when it is not already exported:

```bash
cd ~/.cursor/skills/backup-restore   # or wherever the skill is installed
printf '%s' "$RESTIC_PASSWORD" | bash scripts/setup-backup.sh --client acme ...
```

### Initialise backups

```bash
bash scripts/setup-backup.sh --client acme --dry-run
```

```bash
RESTIC_PASSWORD=... bash scripts/setup-backup.sh --client acme \
    --escrow-location "1Password: Agency vault / acme-restic" \
    --confirm "CONFIRM BACKUP SETUP" \
    --confirm "CONFIRM PRUNE"
```

### Prove the backups (run this on a schedule, not just once)

```bash
bash scripts/drill-restore.sh --client acme
```

Read-only in effect: it restores into a scratch directory on the client host, runs four
checks, and destroys the scratch paths. It takes no gate.

### Restore

```bash
# Into a scratch directory (safe, no gate needed beyond this one)
bash scripts/restore.sh --client acme --snapshot latest --target /tmp/restore-acme \
    --confirm "CONFIRM RESTORE"

# Over live data (destructive; the gate string names the client)
bash scripts/restore.sh --client acme --target /var/www/acme/shared \
    --confirm "CONFIRM RESTORE acme"
```

### Reading the result

| `status` | Exit | Next action |
|----------|------|-------------|
| `CONFIRMATION_REQUIRED` | 11 | Ask the operator in the chat, then re-run with the `confirm_strings` values as `--confirm` flags |
| `PLANNED` | 0 | Dry run only. Re-run without `--dry-run` to apply |
| `OBSERVED` | 0 | A read-only step finished |
| `CONFIGURED` | 0 | Repo initialised, cron installed, escrow recorded. Report `snapshot_id` and `escrow_location` |
| `DRILLED` | 0 | All four checks in `checks` returned `PASS`. The backups are proven |
| `RESTORED` | 0 | Restore finished. Confirm `live_restore` matches what the operator asked for |
| `FAILED` | 1, 3–6, 13, 14 | Read `errors`. Do not report the backups as healthy |
| `STOPPED` | 2, 3, 5, 11, 13 | Validation failed, the repo is unreachable, disk is full, or approval was refused |

### Interpreting `checks`

`drill-restore.sh` reports four independent checks. A `DRILLED` status requires all
four to be `PASS`:

| Check | What it proves |
|-------|----------------|
| `row_counts` | The database dump loads and has rows |
| `app_boot` | The restored files can boot the application |
| `file_checksums` | Restored files match the snapshot |
| `newest_record_age` | The snapshot is recent enough to be useful |

## State Model

Internal phases (`OBSERVING`, `INITIALIZING`, `DRILLING`, `RESTORING`) appear in the
journal and on stderr, but are never emitted as `status`.

```
OBSERVING → CONFIGURED
          → DRILLED
          → RESTORED
          → FAILED
          → STOPPED
```

| Status | Meaning | Terminal? |
|--------|---------|-----------|
| `OBSERVED` | A read-only step (status or repo probe) reported | **Yes** |
| `PLANNED` | Dry run; nothing mutated | **Yes** |
| `CONFIRMATION_REQUIRED` | A gate is missing; nothing mutated | **Yes** |
| `CONFIGURED` | Repository initialised, cron installed, escrow recorded, first backup taken | **Yes** |
| `DRILLED` | Restore drill completed with all four checks passing | **Yes** |
| `RESTORED` | Restore completed | **Yes** |
| `FAILED` | Setup, drill, or restore failed | **Yes** |
| `STOPPED` | Validation failed, escrow missing, or approval was refused | **Yes** |

## Output

The envelope is defined in `conventions/outputs.md`. `backup-restore` adds:

| Field | Emitted by | Type | Description |
|-------|-----------|------|-------------|
| `action` | all | string | `setup`, `drill`, or `restore` |
| `repo` | `setup` | string | restic repository that was initialised |
| `repo_state` | `setup --dry-run` | string | `absent` or `present` |
| `schedule` | `setup` | string | Cron expression installed |
| `backup_script` | `setup` | string | Path of the installed `run-backup.sh` |
| `cron_file` | `setup` | string | Path of the installed cron file |
| `snapshot_id` | `setup`, `drill`, `restore` | string | Newest snapshot used |
| `escrow_location` | `setup` | string | Where the restic password is documented |
| `retention_prune` | `setup` | boolean | Whether the nightly prune was enabled |
| `dead_mans_switch_wired` | `setup` | boolean | Whether a success ping runs after each backup |
| `first_backup_exit_code` | `setup` | number | Exit code of the verification backup |
| `checks{row_counts,app_boot,file_checksums,newest_record_age}` | `drill` | object | `PASS` or `FAIL` per check |
| `scratch_destroyed` | `drill` | boolean | Whether the scratch paths were removed |
| `target` | `restore` | string | Destination directory |
| `live_restore` | `restore` | boolean | `true` when live data was overwritten |
| `restored_entries` | `restore` | number | Files restored |

```json
{
  "skill": "backup-restore",
  "client": "acme",
  "status": "DRILLED",
  "timestamp": "2026-09-21T14:05:33Z",
  "duration_seconds": 317,
  "warnings": [],
  "errors": [],
  "action": "drill",
  "snapshot_id": "abc12345",
  "checks": {
    "row_counts": "PASS",
    "app_boot": "PASS",
    "file_checksums": "PASS",
    "newest_record_age": "PASS"
  },
  "scratch_destroyed": true
}
```

## Safety Gates

| Gate | Enforcement |
|------|-------------|
| Key escrow | `setup-backup.sh` refuses `CONFIGURED` while `--escrow-location` is empty |
| Offsite check | Warns when the repository and the server appear to be on the same account |
| Dead-man's switch | `setup` is incomplete without a healthcheck URL wired |
| Scratch by default | A live restore additionally requires `CONFIRM RESTORE <client>` |
| No secrets in output | The restic password is read from the environment, a file, or stdin — never from argv, and never logged |
| Approval gate | `CONFIRM BACKUP SETUP` and `CONFIRM PRUNE` for setup, `CONFIRM RESTORE` (scratch) or `CONFIRM RESTORE <client>` (live) for restore |
| Template safety | `run-backup.sh` aborts if unsubstituted `{{...}}` placeholders remain |

## References

- [Restic Setup](references/restic-setup.md) — Installation, repo init, S3/B2/Spaces config
- [What to Back Up](references/what-to-backup.md) — What to include and explicitly exclude
- [Retention Policy](references/retention-policy.md) — 7 daily / 4 weekly / 6 monthly, forget --prune
- [Restore Drill](references/restore-drill.md) — Full drill procedure and verification checks
- [Key Escrow](references/key-escrow.md) — Why on-server key = no backup; escrow requirements
- [Dead-Man's Switch](references/dead-mans-switch.md) — Healthcheck setup, alert on absence
- [Offsite Requirements](references/offsite-requirements.md) — Off-provider rationale and options

Shared:
- [Client Manifest](conventions/client-manifest.md)
- [Safety](conventions/safety.md)
- [Logging](conventions/logging.md)
- [Outputs](conventions/outputs.md)
- [Approvals](conventions/approvals.md)

## Scripts

| Script | Responsibility |
|--------|----------------|
| `scripts/setup-backup.sh` | Init repo, configure cron, verify escrow, wire healthcheck |
| `scripts/run-backup.sh` | Incremental backup, prune retention, ping dead-man's switch |
| `scripts/drill-restore.sh` | Restore to scratch, run verification checks, destroy scratch |
| `scripts/restore.sh` | Configurable restore with confirmation gate |

`run-backup.sh` is a **template**, not a CLI. `setup-backup.sh` substitutes its
`{{PLACEHOLDER}}` values and installs the result on the host. Running it directly from
the repository aborts with an error, by design.

## Completion Criteria

Backups are only real once a restore has been proved. The work is complete when the
last stdout line reports `status: "CONFIGURED"` or `status: "DRILLED"`, and all of the
following hold.

For `setup-backup.sh`:

1. `status` is `CONFIGURED`, not `FAILED` or `STOPPED`.
2. `snapshot_id` is non-empty: a real snapshot exists in the repository.
3. `escrow_location` is non-empty and has been shown to the operator.
4. `dead_mans_switch_wired` is `true`, or the operator has been told plainly that
   nobody will notice a silent backup failure.
5. `retention_prune` matches what the operator approved, and `CONFIRM PRUNE` was
   required for it.
6. The nightly cron entry exists on the host and `run-backup.sh` contains no
   unsubstituted `{{...}}` placeholders.

For `drill-restore.sh`:

7. `status` is `DRILLED` and every value in `checks` is `PASS`. Any `FAIL` means the
   backups are not proven, however healthy the repository looks.
8. `scratch_destroyed` is `true` unless `--keep-scratch` was passed deliberately.
9. `newest_record_age` is `PASS`, confirming the snapshot is recent enough to be worth
   restoring.

For `restore.sh`:

10. `status` is `RESTORED` and `live_restore` matches the operator's intent. If a live
    restore was requested, `CONFIRM RESTORE <client>` was required.
11. The restored application boots and its data is readable.

In all cases, the journal at `~/.local/state/agency/<client>/<date>-backup-restore.md`
records the repository, the snapshot, and the gate evaluations, and no secret value
appears anywhere in it.
