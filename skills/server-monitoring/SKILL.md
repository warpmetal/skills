---
name: server-monitoring
disable-model-invocation: true
description: >-
  Set up and manage alerting for client servers using Uptime Kuma (external checks)
  and Netdata (per-host detail). Tuned thresholds to catch real problems without
  alert fatigue. Two severity tiers: immediate page and daily digest. Closes the loop
  by handing off to the right skill when an alert fires.
  Use when setting up monitoring for a new client or when alerts are miscalibrated.
---

# Server Monitoring

## Purpose

Alerting that catches real problems without training the owner to ignore it.
The rule that matters most: check from somewhere else — a monitor on the box it
watches reports nothing when the box dies.

## Trigger

Use this skill when the user says:

- "set up monitoring for [client]"
- "I want to know before the client does"
- "we ran out of disk again for [client]"
- "monitoring isn't alerting on [client]"
- "add [client] to monitoring"
- "cert expiry alerts aren't working"

## Inputs

### Required

| Input | Description |
|-------|-------------|
| `--client <name>` | Client identifier. Loads `~/.config/agency/clients/<name>.toml` |

### Optional

| Input | Default | Description |
|-------|---------|-------------|
| `--action <setup\|status\|test-alert>` | `status` | What to do |
| `--monitoring-host <alias>` | Manifest `monitoring_host` | SSH alias of Uptime Kuma host |
| `--dry-run` | `false` | Show plan only; no mutations |

### Required Client Configuration

See `conventions/client-manifest.md`. Required: `host`, `domain`, `health_url`.
Monitoring-specific manifest fields:

```toml
[monitoring]
monitoring_host   = "mon-vps"          # SSH alias of Uptime Kuma host
uptime_kuma_url   = "http://mon-vps:3001"
page_channel      = "slack:#alerts"    # immediate page channel
digest_channel    = "slack:#digest"    # daily summary channel
domain_expiry_check = true
backup_healthcheck  = "https://hc-ping.com/uuid"  # optional
```

## Prerequisites

Nothing here is interactive: every script runs non-interactively and either
succeeds, fails with an actionable message, or reports a degraded check. A
degraded check is **always** surfaced in `warnings[]` as a `check_skipped` entry —
never silently treated as a pass.

| Requirement | Needed for | If it is missing |
|-------------|-----------|------------------|
| `bash` 4+ | every script (`set -euo pipefail`, arrays, `BASH_SOURCE`) | nothing runs |
| `ssh` (OpenSSH client) | every step that touches the Kuma host | only manifest reading works; remote steps fail |
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
| `python3` | parsing the Uptime Kuma API responses | the fallback parser runs, reports `?` for each monitor's active flag, and a `check_skipped` warning is added |

Monitors are created over the Kuma HTTP API, so nothing else is needed locally.

### Platform

`bash` 4+ and an OpenSSH client are required. On Windows, run these through WSL or
Git Bash; there is no native PowerShell runner for the skill scripts.

## Rules

### Invocation

This skill is opt-in (`disable-model-invocation: true`). Load it only when the
operator names it. It creates monitors and sends real alert notifications, so an
ambient trigger would page real people.

### Mandatory Safety Rules

1. **External check host required** — Refuses to configure checks on the same host
   being monitored. Uptime Kuma must run on a separate instance.
2. **Alert on symptoms, not signals** — Never alert on CPU%, memory%, or load average
   in isolation. Alert on: site slow/down, queue backing up, disk about to fill, cert
   about to expire. See `references/anti-goals.md`.
3. **Two severities only** — `page` (immediate) and `digest` (daily batch). No middle
   tier — it always gets ignored.
4. **Read-only status** — `status` and `test-alert` do not mutate monitoring config.
5. **Propose before mutate** — Show proposed checks and thresholds before adding.
   Require `CONFIRM MONITORING SETUP`.
6. **Journal every run** — `~/.local/state/agency/<client>/<date>-server-monitoring.md`
7. **Secrets sanitized** — Follow `conventions/logging.md`.

### Never Do

- Never configure monitoring on the same host being monitored
- Never alert on CPU spikes, memory percentage, or load average alone
- Never create a third alert severity tier
- Never configure alerts that fire without requiring action
- Never store API tokens or webhook URLs in the client manifest plaintext — use env var refs

## Anti-Goals

This skill explicitly rejects:

- **Prometheus + Grafana + Alertmanager** for this profile. Over-engineering for six
  servers; it becomes an eighth thing to maintain.
- **CPU spike alerts** — not a user-facing symptom.
- **Memory percentage alerts** — a server at 90% memory can be perfectly healthy;
  an OOM event is what matters.
- **Load average alerts** — meaningless without CPU count context; alert on slowness instead.

See `references/anti-goals.md` for full rationale.

## Workflow

### Action: `status`

```
LOAD CLIENT → CHECK UPTIME KUMA API → LIST CHECKS FOR CLIENT
  → SHOW: check names, status, last downtime, configured thresholds
  → REPORT
```

### Action: `setup`

```
LOAD CLIENT → VALIDATE MANIFEST → CONFIRM MONITORING HOST IS EXTERNAL
  → INVENTORY EXISTING CHECKS (avoid duplicates)
  → GENERATE CHECK LIST WITH THRESHOLDS
  → SHOW PROPOSED CHECKS → CONFIRM MONITORING SETUP
  → ADD CHECKS VIA UPTIME KUMA API
  → INSTALL NETDATA ON CLIENT HOST (if not present)
  → WIRE NETDATA ALERTS (disk, inodes, OOM, service liveness)
  → CONFIGURE ALERT ROUTING (page vs digest)
  → TEST: trigger test-alert for one check
  → REPORT CONFIGURED
```

### Action: `test-alert`

```
LOAD CLIENT → IDENTIFY CHECK (--check <name> or prompt)
  → TRIGGER TEST NOTIFICATION VIA UPTIME KUMA API
  → CONFIRM ALERT ARRIVED ON PAGE CHANNEL
  → REPORT
```

### Thresholds (Non-Negotiable Defaults)

| Signal | Warn (digest) | Page |
|--------|---------------|------|
| HTTP from outside | 1 failed check | 3 consecutive fails |
| Disk usage | 80% | 90%, or projected full in 48h |
| Inodes | 80% | 90% |
| Memory / swap | Sustained swap-in | OOM kill event |
| Cert expiry | 14 days | 7 days |
| Service liveness | — | nginx, php-fpm, mysql, workers down |
| HTTP 5xx rate | Above baseline | Sustained 5xx (> 5% of requests) |
| Queue oldest-job age | 5 min | 30 min |
| Backup dead-man | 1 missed | 2 missed |
| Domain expiry | 30 days | 14 days |

**Cert expiry warns at 14 days deliberately.** Renewal is supposed to happen at 30 days.
An alert at 14 means renewal has already failed twice.

See `references/thresholds.md` for tuning rationale.

### Handoffs

When an alert fires, it should hand off with the signal already attached:

| Alert | Handoff |
|-------|---------|
| HTTP down / 502 | `site-down-triage --client <name>` |
| Cert expiry / DNS | `ssl-dns-fix --client <name>` |
| Backup dead-man | `backup-restore --client <name> --action status` |
| Queue age > 30min | `queue-cron-setup --client <name> --action verify` |
| Domain expiry | `ssl-dns-fix --client <name> --dns-only` |

See `references/handoff-signals.md`.

## How to Run


The scripts resolve the shared library from their own path and read no file relative
to your working directory, so they can be launched from anywhere. The examples below
`cd` into the skill directory first; calling a script by absolute path works
identically.
`status-monitoring.sh` and `test-alert.sh` do not change monitoring configuration, so
they take no gate. `setup-monitoring.sh` mutates and requires its exact `--confirm`
string; without it it mutates nothing, prints `status: "CONFIRMATION_REQUIRED"` with
`confirm_strings`, and exits `11`.

The API key is never passed inside a URL and never stored in the client manifest. Use
`--api-key`, or export the variable named by `monitoring.api_key_env` (default
`AGENCY_UPTIME_KUMA_KEY`).

### Step 1 — Status (read-only)

```bash
cd ~/.cursor/skills/server-monitoring   # or wherever the skill is installed
bash scripts/status-monitoring.sh --client acme
```

`status: "OBSERVED"`, exit 0. If `external_monitor` is `no`, the script reports
`FAILED` and exits `5`: the monitor is on the host it watches and would report nothing
when that host dies. Fix that before anything else.

### Step 2 — Setup

```bash
bash scripts/setup-monitoring.sh --client acme --dry-run
bash scripts/setup-monitoring.sh --client acme --confirm "CONFIRM MONITORING SETUP"
```

The dry run prints every proposed monitor, the Netdata health drop-in, and the routing
targets. Setup also fires a test notification as its last step; skip that with
`--skip-test-alert` only when the operator is standing by to confirm delivery another
way.

### Step 3 — Prove the routing

```bash
bash scripts/test-alert.sh --client acme
bash scripts/test-alert.sh --client acme --check acme-cert --notification-id 2
```

### Reading the result

| `status` | Exit | Next action |
|----------|------|-------------|
| `CONFIRMATION_REQUIRED` | 11 | Ask the operator in the chat, then re-run with the `confirm_strings` values as `--confirm` flags |
| `PLANNED` | 0 | Dry run only. Re-run without `--dry-run` and with the gate to apply |
| `OBSERVED` | 0 | Read `monitors[]`, `monitors_inactive`, and `netdata` |
| `CONFIGURED` | 0 | Read `checks_added[]` and `test_alert_delivered` |
| `ALERT_TESTED` | 0 | The API accepted the test. Ask the operator to confirm it arrived in `page_channel` |
| `FAILED` | 1, 3, 5, 14 | Read `errors`. Exit `5` with `external_monitor: "no"` means the external-host rule is violated |
| `STOPPED` | 2, 3, 5, 11 | Manifest invalid, the API key or URL is missing, or approval was refused |

### Rule the scripts enforce for you

Never configure a monitor where the monitoring host and the client host are the same.
`setup-monitoring.sh` refuses and exits `5`; `status-monitoring.sh` reports
`external_monitor: "no"` and exits `5`. Do not work around either.

## State Model

Internal phases (`OBSERVING`, `INVENTORYING`, `CREATING`, `TESTING`) appear in the
journal and on stderr, but are never emitted as `status`.

```
OBSERVING → OBSERVED (status action)
          → CONFIGURED (setup complete, test alert verified)
          → ALERT_TESTED (test-alert action)
          → FAILED
          → STOPPED
```

| Status | Meaning | Terminal? |
|--------|---------|-----------|
| `PLANNED` | Dry run; nothing created | **Yes** |
| `CONFIRMATION_REQUIRED` | A gate is missing; nothing mutated | **Yes** |
| `OBSERVED` | `status-monitoring.sh` reported the current state | **Yes** |
| `CONFIGURED` | Monitors, Netdata alerts, and routing are in place | **Yes** |
| `ALERT_TESTED` | A test notification was accepted by Uptime Kuma | **Yes** |
| `FAILED` | Setup or test failed, or a policy rule was violated | **Yes** |
| `STOPPED` | The monitoring host is missing, validation failed, or approval was refused | **Yes** |

## Output

The envelope is defined in `conventions/outputs.md`. `server-monitoring` adds:

| Field | Emitted by | Type | Description |
|-------|-----------|------|-------------|
| `action` | all | string | `setup`, `status`, or `test-alert` |
| `host` | `setup`, `status`, `test-alert` | string | The monitored client host |
| `monitoring_host` | all | string | The external monitoring host |
| `kuma_url` | `setup`, `status` | string | Uptime Kuma base URL |
| `monitors[]` | `status` | array | `{id, name, type, active, url}` per monitor belonging to this client |
| `monitor_count` | `status` | number | Monitors named `<client>-*` |
| `monitors_inactive` | `status` | number | Of those, how many are not active |
| `netdata` | `status`, `setup` | string | `active`, `installed`, `absent`, `yes`, `failed`, or `skipped` |
| `external_monitor` | `status` | string | `yes`, `no`, or `unknown` |
| `checks_added[]` | `setup` | array | `{name, type, severity}` per monitor created |
| `monitors_created`, `monitors_already_present` | `setup` | number | Duplicate prevention outcome |
| `netdata_dropin` | `setup` | string | Path of the Netdata health drop-in |
| `proposed_count` | `setup --dry-run` | number | Number of monitors that would be created |
| `test_alert_delivered` | `setup`, `test-alert` | boolean | Whether Uptime Kuma accepted the test |
| `check` | `test-alert` | string | Monitor name the test was aimed at |
| `check_exists` | `test-alert` | string | `yes`, `no`, or `unknown` |
| `notification_id` | `test-alert` | number | Channel that received the test |
| `page_channel`, `digest_channel` | `setup`, `status`, `test-alert` | string | Routing targets from the manifest |

```json
{
  "skill": "server-monitoring",
  "client": "acme",
  "status": "CONFIGURED",
  "timestamp": "2026-09-21T14:05:33Z",
  "duration_seconds": 214,
  "warnings": ["backup.healthcheck is not set in the manifest; the backup dead-man's switch monitor was skipped"],
  "errors": [],
  "action": "setup",
  "host": "acme-prod",
  "monitoring_host": "mon-vps",
  "kuma_url": "https://status.agency.com",
  "checks_added": [
    { "name": "acme-http", "type": "http", "severity": "page" },
    { "name": "acme-cert", "type": "certificate", "severity": "digest" },
    { "name": "acme-dns", "type": "dns", "severity": "page" },
    { "name": "acme-queue-age", "type": "push", "severity": "page" }
  ],
  "monitors_created": 4,
  "monitors_already_present": 0,
  "netdata": "yes",
  "test_alert_delivered": true,
  "page_channel": "slack:#acme-alerts",
  "digest_channel": "slack:#acme-digest"
}
```

## Safety Gates

| Gate | Enforcement |
|------|-------------|
| External host check | Refuses if monitoring_host == client host |
| No symptom-less alerts | CPU/memory/load alerts rejected by policy |
| Duplicate check prevention | Inventories existing checks before adding |
| Test alert required | Setup not CONFIGURED until test alert verified |
| Approval gate | `CONFIRM MONITORING SETUP` required |

## References

- [Uptime Kuma Setup](references/uptime-kuma-setup.md) — Installation, HTTP checks, multi-host, notifications
- [Netdata Setup](references/netdata-setup.md) — Installation per host, relevant native alerts
- [Thresholds](references/thresholds.md) — Full threshold table with tuning rationale
- [Alert Routing](references/alert-routing.md) — Page vs digest, flap suppression, quiet hours
- [Anti-Goals](references/anti-goals.md) — What NOT to alert on and why
- [Handoff Signals](references/handoff-signals.md) — Which alert maps to which skill

Shared:
- [Client Manifest](conventions/client-manifest.md)
- [Safety](conventions/safety.md)
- [Logging](conventions/logging.md)
- [Outputs](conventions/outputs.md)
- [Approvals](conventions/approvals.md)

## Scripts

| Script | Responsibility |
|--------|----------------|
| `scripts/setup-monitoring.sh` | Add Uptime Kuma checks via API, install Netdata, wire alerts |
| `scripts/status-monitoring.sh` | Read-only: list all checks and current status for client |
| `scripts/test-alert.sh` | Trigger test notification, verify delivery |

## Completion Criteria

Monitoring is complete when `setup-monitoring.sh` reports `status: "CONFIGURED"` and
`test-alert.sh` reports `status: "ALERT_TESTED"`, and all of the following hold.

1. `monitoring_host` is a different host from the client host. `status-monitoring.sh`
   reports `external_monitor: "yes"`, never `"no"`.
2. `status-monitoring.sh` lists at least an HTTP check, a certificate check, and a DNS
   check for the client, all with `active: true`.
3. `checks_added[]` contains no alert on CPU, memory percentage, or load average.
   Those are rejected by policy — see `references/anti-goals.md`.
4. Every check is tagged `page` or `digest`, and there is no third tier.
5. `test_alert_delivered` is `true`, and the operator has confirmed the notification
   arrived in `page_channel`. The API accepting the request is not the same as the
   message arriving.
6. `netdata` is `active` on the client host with the health drop-in installed, or the
   operator has been told Netdata was skipped and why.
7. Push monitors have a heartbeat source: for `queue-age`, `queue.healthcheck` is set
   and the queue watchdog on the client host pings it. A push monitor with nothing
   feeding it is a guaranteed false alert.
8. Recovery notifications are enabled, so an incident ending is as visible as one
   starting.
9. The journal at `~/.local/state/agency/<client>/<date>-server-monitoring.md` records
   the proposed checks, the created checks, the thresholds, and the routing.

If `status` is `FAILED` with exit `5`, the external-host rule was violated. That is not
a warning to be worked around: fixing it is the whole point of the skill.
