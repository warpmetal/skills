---
name: queue-cron-setup
disable-model-invocation: true
description: >-
  Configure and verify queue workers and scheduled tasks for a client site.
  Sets up Laravel/Node workers under systemd with proper restart semantics,
  wires exactly one cron entry for the scheduler, and alerts on silent failures.
  Use when queue jobs aren't running, setting up workers for a new site, or
  scheduled tasks have stopped firing.
---

# Queue & Cron Setup

## Purpose

The silent-failure category. Jobs stop running, nothing errors, and nobody notices for a
week. This skill sets up workers correctly, wires dead-man's switches, and verifies the
stale-code bug is handled on every deploy.

## Trigger

Use this skill when the user says:

- "queue jobs aren't running for [client]"
- "set up workers for [client]"
- "scheduled emails stopped for [client]"
- "cron isn't firing for [client]"
- "jobs stuck in queue"
- "set up BullMQ workers"

## Inputs

### Required

| Input | Description |
|-------|-------------|
| `--client <name>` | Client identifier. Loads `~/.config/agency/clients/<name>.toml` |

### Optional

| Input | Default | Description |
|-------|---------|-------------|
| `--action <setup\|verify\|restart\|status>` | `status` | What to do |
| `--workers <n>` | `1` | Number of worker instances (systemd template count) |
| `--dry-run` | `false` | Show plan only; no mutations |

### Required Client Configuration

See `conventions/client-manifest.md`. Required: `host`, `site_root`, `stack`.
Queue-specific manifest fields:

```toml
[queue]
driver       = "redis"          # redis | database | sqs
connection   = "default"
workers      = 2                # desired worker count
max_time     = 3600             # --max-time seconds
critical_jobs = ["SendInvoice"] # jobs requiring dead-man's switch
healthcheck  = "https://hc-ping.com/uuid"  # per-job healthcheck
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

None locally. `php`, `node`, and `systemctl` are probed **on the target host**
inside the setup payload; `setup-workers.sh` records which binary it found. A
missing runtime there fails the setup step outright rather than degrading a check.

### Platform

`bash` 4+ and an OpenSSH client are required. On Windows, run these through WSL or
Git Bash; there is no native PowerShell runner for the skill scripts.

## Rules

### Invocation

This skill is opt-in (`disable-model-invocation: true`). Load it only when the
operator names it. It restarts workers and rewrites supervisor units on production
hosts; an ambient trigger would be an unrequested change.

### Mandatory Safety Rules

1. **Never SIGKILL workers mid-job** — Use `artisan queue:restart` (graceful) for
   Laravel. Workers finish the current job and exit; systemd brings them back on new code.
2. **Stale-code check on every verify** — `queue:work` boots the framework once and
   keeps it in memory. After a deploy, workers must be restarted or they keep running the
   old code. This skill verifies it's wired.
3. **One cron entry only** — For Laravel: a single `* * * * *` entry running
   `artisan schedule:run`. The scheduler handles the rest.
4. **Absolute paths in cron** — Cron runs with a minimal PATH. Never rely on the user's
   shell PATH or profile.
5. **Redirect cron output** — Unredirected output goes to local mail (nobody configured).
   Always redirect to a log file.
6. **Read-only status and verify** — Only `setup` and `restart` mutate. Both require
   explicit approval.
7. **Journal every run** — `~/.local/state/agency/<client>/<date>-queue-cron-setup.md`
8. **Secrets sanitized** — Follow `conventions/logging.md`.

### Never Do

- Never `kill -9` a queue worker process directly
- Never add multiple cron entries for `schedule:run`
- Never use `nohup` to run workers (use systemd)
- Never rely on bare `php` in cron without absolute path
- Never leave worker logs unrotated

## Workflow

### Action: `status`

```
LOAD CLIENT → SSH: systemd worker units status, failed_jobs count,
  oldest pending job age, cron entry, log sizes → REPORT
```

### Action: `setup`

```
LOAD CLIENT → VALIDATE MANIFEST → PREFLIGHT (read-only)
  → GENERATE SYSTEMD TEMPLATE UNIT
  → PROPOSE UNIT CONTENT + CRON ENTRY → CONFIRM SETUP
  → INSTALL UNIT → ENABLE + START → VERIFY RUNNING
  → ADD CRON ENTRY → VERIFY FIRES
  → WIRE LOG ROTATION
  → WIRE DEAD-MAN'S SWITCH (per critical job)
  → WIRE FAILED_JOBS ALERT
  → WIRE OLDEST-JOB-AGE ALERT
  → REPORT CONFIGURED
```

### Action: `verify`

```
LOAD CLIENT → SSH COLLECT:
  - Worker processes running?
  - Workers running current release code? (stale-code check)
  - Cron entry correct?
  - Last schedule:run fired within 2 minutes?
  - failed_jobs count within threshold?
  - Oldest job age within threshold?
  - Log rotation configured?
→ REPORT VERIFIED / ISSUES FOUND
```

### Action: `restart`

```
LOAD CLIENT → SHOW CURRENT STATE → CONFIRM RESTART
  → artisan queue:restart (graceful signal)
  → wait for workers to cycle (up to TimeoutStopSec)
  → verify workers back up on new code
  → REPORT RESTARTED
```

### Detailed Steps — Setup

#### Systemd Template Unit (Laravel)

```ini
# /etc/systemd/system/<client>-worker@.service
[Unit]
Description=<client> queue worker %i
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/<client>/current
ExecStart=/usr/bin/php artisan queue:work \
  --sleep=3 --tries=3 --max-time=3600 --queue=default,high
Restart=always
RestartSec=5
TimeoutStopSec=90
StandardOutput=append:/var/log/<client>/worker-%i.log
StandardError=append:/var/log/<client>/worker-%i.log

[Install]
WantedBy=multi-user.target
```

**Key semantics:**
- `--max-time=3600` — recycles the process hourly; bounds memory leaks
- `TimeoutStopSec=90` — gives in-flight jobs time to finish on SIGTERM
- `Restart=always` — turns a crash into a blip

Enable N instances:
```bash
systemctl enable --now "<client>-worker@"{1..$WORKERS}
```

#### Cron Entry (Laravel)

```cron
* * * * * www-data cd /var/www/<client>/current && /usr/bin/php artisan schedule:run >> /var/log/<client>/scheduler.log 2>&1
```

**Not** `>> /dev/null 2>&1` — log the output so failures are visible.

#### Stale-Code Verification

After a deploy, workers must be restarted. `deploy-site` handles it via
`artisan queue:restart`. This skill verifies that signal is wired:

```bash
# Check worker PIDs match current release symlink
worker_pid=$(systemctl show -p MainPID "<client>-worker@1" | cut -d= -f2)
worker_cwd=$(readlink /proc/$worker_pid/cwd)
current=$(readlink /var/www/<client>/current)
[ "$worker_cwd" = "$current" ] || echo "STALE: workers on old release"
```

#### Log Rotation

```
# /etc/logrotate.d/<client>-workers
/var/log/<client>/worker-*.log /var/log/<client>/scheduler.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        systemctl kill --signal=USR1 "<client>-worker@*.service" 2>/dev/null || true
    endscript
}
```

## How to Run


The scripts resolve the shared library from their own path and read no file relative
to your working directory, so they can be launched from anywhere. The examples below
`cd` into the skill directory first; calling a script by absolute path works
identically.
The scripts are non-interactive. `inspect-queues.sh` and `verify-workers.sh` are
read-only and take no gate. `setup-workers.sh` and `restart-workers.sh` mutate and
require their exact `--confirm` string; without it they mutate nothing, print
`status: "CONFIRMATION_REQUIRED"` with `confirm_strings`, and exit `11`.

### Step 1 — Inspect (read-only)

```bash
cd ~/.cursor/skills/queue-cron-setup   # or wherever the skill is installed
bash scripts/inspect-queues.sh --client acme
```

`status: "OBSERVED"`, exit 0. Read `worker_units_active` against `workers_desired`,
`stale_code`, `cron_schedule_entries`, and `failed_jobs`.

### Step 2 — Configure (only when Step 1 or Step 3 shows problems)

```bash
bash scripts/setup-workers.sh --client acme --dry-run
```

The dry run prints the exact unit, cron line, logrotate drop-in, and watchdog script
it would write, in `unit_content` and on stderr. Review them, then:

```bash
bash scripts/setup-workers.sh --client acme --workers 2 \
    --confirm "CONFIRM SETUP"
```

`setup-workers.sh` is idempotent: existing units and files are overwritten, and the
crontab is rewritten with exactly one scheduler entry for this site.

### Step 3 — Verify (read-only)

```bash
bash scripts/verify-workers.sh --client acme
```

`status: "VERIFIED"` when the matrix is clean, `status: "ISSUES_FOUND"` (still exit
`0`) when it is not. Finding problems is a successful verification, not a failure of
the script — read `issues[]`, each of which carries a `severity` and a concrete `fix`.

### Step 4 — Restart after a deploy

```bash
bash scripts/restart-workers.sh --client acme --confirm "CONFIRM RESTART"
```

Laravel sends `artisan queue:restart`, which lets each worker finish its in-flight
job before exiting. Nothing is ever `kill -9`-ed. Add `--systemd-restart` to cycle
the units with SIGTERM instead, which is what Node/BullMQ clients use.

### Reading the result

| `status` | Exit | Next action |
|----------|------|-------------|
| `CONFIRMATION_REQUIRED` | 11 | Ask the operator in the chat, then re-run with the `confirm_strings` values as `--confirm` flags |
| `PLANNED` | 0 | Dry run only. Re-run without `--dry-run` and with the gate to apply |
| `OBSERVED` | 0 | Status reported. Act on any `warnings[]` |
| `CONFIGURED` | 0 | Units, cron, rotation, and watchdog are installed and the workers are active |
| `RESTARTED` | 0 | Read `cycled`. When it is `false`, the workers did not reach the current release within the wait window — check `stale_code_after` |
| `VERIFIED` | 0 | The whole matrix is clean |
| `ISSUES_FOUND` | 0 | Work through `issues[]`; each entry names the check, the severity, and the fix |
| `FAILED` | 1, 6–8, 14 | Read `errors`. For a worker unit, check `journalctl -u '<unit>@*'` |
| `STOPPED` | 2, 3, 5, 11 | Manifest invalid, SSH failed, or approval was refused |

### Fixing what `issues[]` reports

| `check` | Meaning | Recommended action |
|---------|---------|--------------------|
| `worker_units_installed` / `workers_running` | Fewer workers than the manifest asks for | `setup-workers.sh --workers <n> --confirm "CONFIRM SETUP"` |
| `stale_code` | Workers hold the old release in memory after a deploy | `restart-workers.sh --confirm "CONFIRM RESTART"` |
| `cache_functional` | `CACHE_STORE=null`, so `queue:restart` silently does nothing | Fix `.env`, then restart with `--systemd-restart` |
| `cron_entries` | Zero or more than one scheduler entry | `setup-workers.sh --confirm "CONFIRM SETUP"` rewrites exactly one |
| `cron_redirect` / `scheduler_fired` | Scheduler output is lost or the scheduler stopped firing | Check `systemctl status cron` and the log path in `QUEUE_LOG_DIR` |
| `oldest_job_age` | The queue is not draining | Read worker logs, then `redis-cli ping` |
| `log_rotation` | Logs will eventually fill the disk | `setup-workers.sh --confirm "CONFIRM SETUP"` |
| `dead_mans_switch` | Critical jobs have no heartbeat | Set `queue.healthcheck` and re-run setup |

## State Model

Internal phases (`OBSERVING`, `INITIALIZING`, `ENABLING`, `RESTARTING`, `WAITING`)
appear in the journal and on stderr, but are never emitted as `status`.

```
OBSERVING → OBSERVED (status action)
          → CONFIGURED (setup action)
          → VERIFIED (verify action, clean matrix)
          → ISSUES_FOUND (verify action, problems found)
          → RESTARTED (restart action)
          → FAILED
          → STOPPED
```

| Status | Meaning | Terminal? |
|--------|---------|-----------|
| `PLANNED` | Dry run; nothing written | **Yes** |
| `CONFIRMATION_REQUIRED` | A gate is missing; nothing mutated | **Yes** |
| `OBSERVED` | `inspect-queues.sh` reported the current state | **Yes** |
| `CONFIGURED` | Units, cron, rotation, and watchdog installed; workers active | **Yes** |
| `VERIFIED` | Every check in the matrix passed | **Yes** |
| `ISSUES_FOUND` | Problems found and listed with proposed fixes | **Yes** |
| `RESTARTED` | The restart signal was sent and the cycle was observed | **Yes** |
| `FAILED` | Setup or restart failed | **Yes** |
| `STOPPED` | Validation failed or approval was refused | **Yes** |

## Output

The envelope is defined in `conventions/outputs.md`. `queue-cron-setup` adds:

| Field | Emitted by | Type | Description |
|-------|-----------|------|-------------|
| `action` | all | string | `status`, `setup`, `verify`, or `restart` |
| `host` | all | string | SSH alias that was acted on |
| `worker_unit` | `status`, `setup` | string | Unit prefix from the manifest (`worker_unit`), never hardcoded |
| `stack` | `status` | string | Manifest stack |
| `queue_driver` | `status` | string | Manifest queue driver |
| `worker_units_total`, `worker_units_active` | `status` | number | Units matching the prefix, and how many are active |
| `workers_desired` | `status` | number | `queue.workers` from the manifest |
| `worker_pids` | `status` | array | Active worker PIDs |
| `stale_code` | `status` | string | `ok`, `stale`, or `unknown`; `stale_code_detail` explains it |
| `cron_schedule_entries`, `cron_total_entries` | `status` | number | Scheduler entries, and all non-comment entries |
| `failed_jobs`, `pending_jobs`, `oldest_pending_minutes` | `status` | number | Queue depth facts |
| `cache_ok`, `cache_driver` | `status` | string | Whether `queue:restart` can work at all |
| `logrotate_configured`, `healthcheck_configured` | `status` | string | `yes` or `no` |
| `critical_jobs` | `status` | string | Raw `queue.critical_jobs` from the manifest |
| `checks` | `verify` | object | `{check: {check, result, detail}}` per matrix item |
| `issues[]` | `verify` | array | `{check, severity, detail, fix}` per problem |
| `issue_count` | `verify` | number | Number of problems found |
| `workers_requested` | `setup` | number | `--workers`, or `queue.workers` |
| `workers_configured` | `setup` | number | Instances actually active after the run |
| `files_written[]` | `setup` | array | Every path written on the host |
| `cron_entry` | `setup` | string | The exact scheduler line installed |
| `logrotate_path` | `setup` | string | Drop-in path, or `skipped` |
| `watchdog_installed` | `setup` | boolean | Whether the queue watchdog and its cron entry were installed |
| `dead_mans_switch` | `setup` | boolean | Whether the scheduler cron line pings `queue.healthcheck` |
| `unit_content` | `setup --dry-run` | string | Full proposed unit file |
| `method` | `restart` | string | `artisan` or `systemd` |
| `workers_active_before` | `restart` | number | Workers active before the signal |
| `worker_pids_before[]`, `worker_pids_after[]` | `restart` | array | PIDs either side of the cycle |
| `cycled` | `restart` | boolean | Whether the workers reached `stale_code: ok` |
| `stale_code_before`, `stale_code_after` | `restart` | string | Stale-code state either side of the restart |

```json
{
  "skill": "queue-cron-setup",
  "client": "acme",
  "status": "ISSUES_FOUND",
  "timestamp": "2026-09-21T14:05:33Z",
  "duration_seconds": 12,
  "warnings": [],
  "errors": ["stale_code: pid 4210 runs /var/www/acme/releases/20260920-120000-abc1234 but current is /var/www/acme/releases/20260921-090000-def5678"],
  "action": "verify",
  "host": "acme-prod",
  "checks": {
    "worker_units_installed": { "check": "worker_units_installed", "result": "PASS", "detail": "2 unit(s), desired 2" },
    "stale_code": { "check": "stale_code", "result": "FAIL", "detail": "pid 4210 runs /var/www/acme/releases/20260920-120000-abc1234 but current is /var/www/acme/releases/20260921-090000-def5678" }
  },
  "issues": [
    {
      "check": "stale_code",
      "severity": "high",
      "detail": "pid 4210 runs the previous release",
      "fix": "bash scripts/restart-workers.sh --client acme --confirm \"CONFIRM RESTART\""
    }
  ],
  "issue_count": 1
}
```

## Safety Gates

| Gate | Enforcement |
|------|-------------|
| Graceful restart only | Uses `queue:restart` signal, never SIGKILL |
| Stale-code check | Every verify confirms workers are on current release |
| Approval gate | `CONFIRM SETUP` required before any mutation |
| Log rotation | Setup incomplete without logrotate configured |
| Dead-man's switch | Required for any job listed in `critical_jobs` |

## References

- [Systemd Template](references/systemd-template.md) — Unit file, --max-time, TimeoutStopSec, Restart
- [Cron Gotchas](references/cron-gotchas.md) — PATH, .env, mail, overlapping, timezone
- [Stale-Code Bug](references/stale-code-bug.md) — Why queue:work keeps old code in memory
- [Monitoring Queues](references/monitoring-queues.md) — Dead-man's switch, failed_jobs, oldest-job-age
- [Node / BullMQ](references/node-bullmq.md) — BullMQ workers under systemd, SIGTERM handler
- [Log Rotation](references/log-rotation.md) — logrotate config, preventing /var fill

Shared:
- [Client Manifest](conventions/client-manifest.md)
- [Safety](conventions/safety.md)
- [Logging](conventions/logging.md)
- [Outputs](conventions/outputs.md)
- [Approvals](conventions/approvals.md)

## Scripts

| Script | Responsibility |
|--------|----------------|
| `scripts/inspect-queues.sh` | Read-only: worker status, failed_jobs, oldest job, log sizes |
| `scripts/setup-workers.sh` | Generate and install systemd unit, cron, log rotation |
| `scripts/verify-workers.sh` | Confirm workers running on current code, all checks |
| `scripts/restart-workers.sh` | Graceful restart via queue:restart with confirmation |

## Completion Criteria

The work is complete when `verify-workers.sh` reports `status: "VERIFIED"` — not
`ISSUES_FOUND` — and all of the following hold.

1. `worker_units_installed` and `workers_running` are `PASS`: the number of active
   units matches `queue.workers`.
2. `stale_code` is `PASS`: every worker's working directory resolves to the same
   release as `current`.
3. `cache_functional` is `PASS`. Without a working cache driver, `queue:restart` is a
   silent no-op and every future deploy will leave workers on old code.
4. `cron_entries` is `PASS`: exactly one scheduler entry exists for this site.
5. `cron_redirect` is `PASS` and `scheduler_fired` is `PASS`: output goes to
   `${QUEUE_LOG_DIR}/scheduler.log` and the log was written within the last 3 minutes.
6. `failed_jobs` is at or below `queue.failed_jobs_max`, and `oldest_job_age` is at or
   below `queue.oldest_job_max_minutes`.
7. `log_rotation` is `PASS`.
8. `dead_mans_switch` is `PASS`: when `queue.critical_jobs` is set, a healthcheck URL
   is wired, so a silent stop is noticed.
9. After a restart, `cycled` is `true`, or the reason it is not has been reported.
10. The journal at `~/.local/state/agency/<client>/<date>-queue-cron-setup.md` records
    every file written, the exact cron line, and the check matrix.

If `status` is `ISSUES_FOUND`, the work is not complete. Never report a client's
queues as healthy while `issues[]` is non-empty; each entry already contains the fix
to propose to the operator.
