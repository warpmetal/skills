# Output Format Convention

## Purpose

All skills produce structured, machine-parseable output alongside human-readable logs.
This enables scripting, chaining, and programmatic consumption by an agent.

---

## Output Channels

| Channel | Purpose | Format |
|---------|---------|--------|
| **stdout** | Structured result | Exactly one JSON object, on the final line |
| **stderr** | Human-readable progress, warnings, errors | Plain text, prefixed (`[PHASE] message`) |
| **Journal** | Complete audit trail | Markdown (see `logging.md`) |

There are no interactive prompts. Approval is expressed with the `--confirm <STRING>`
flag; see `approvals.md`.

---

## The Universal Envelope

Every skill - read-only or mutating - emits the same envelope. It is produced by
`emit_result` in `conventions/lib/output.sh`; do not hand-roll it.

```json
{
  "skill": "deploy-site",
  "client": "acme",
  "status": "READY",
  "timestamp": "2026-09-16T14:05:33Z",
  "duration_seconds": 142,
  "warnings": [],
  "errors": [],
  "release_id": "20260916-140322-a1b2c3d",
  "previous_release_id": "20260916-100000-bbbbbbb",
  "git_commit": "a1b2c3d4e5f67890",
  "health_checks": { "attempts": 5, "passed": 5, "url": "https://acme.com/health" }
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `skill` | string | Skill identifier, e.g. `deploy-site` |
| `client` | string | Client identifier |
| `status` | enum | Final state (see Status Values) |
| `timestamp` | string | ISO 8601 UTC completion time |
| `duration_seconds` | integer | Total wall-clock time |
| `warnings` | array&lt;string&gt; | Non-fatal issues encountered |
| `errors` | array&lt;string&gt; | Fatal errors (empty on success) |

Everything after `errors` is skill-specific.

---

## Status Values

Two disjoint sets. A skill may only emit statuses from the shared set or from its own
row - never from another skill's row, and never an invented value.

### Shared Statuses

| Status | Meaning | Terminal? |
|--------|---------|-----------|
| `PLANNED` | Plan or dry-run produced; no mutations performed | Yes |
| `CONFIRMATION_REQUIRED` | A gate needs an explicit `--confirm` string; nothing was mutated | Yes |
| `OBSERVED` | A read-only action completed and reported | Yes |
| `READY` | Success, all gates passed | Yes |
| `FAILED` | Unrecoverable error | Yes |
| `ROLLED_BACK` | Reverted to the previous state | Yes |
| `NO_OP` | Nothing to do; already in the desired state | Yes |
| `STOPPED` | Validation failed, prerequisite missing, or the caller declined | Yes |
| `INCONCLUSIVE` | Completed, but no determination could be made | Yes |

### Skill Statuses

| Skill | Additional statuses |
|-------|---------------------|
| `deploy-site` | (shared only) |
| `site-down-triage` | `DIAGNOSED` |
| `ssl-dns-fix` | `FIXED` |
| `backup-restore` | `CONFIGURED`, `DRILLED`, `RESTORED` |
| `migrate-site` | `INVENTORIED`, `PREPARED`, `SYNCED`, `FROZEN`, `CUTOVER`, `VERIFIED`, `DECOMMISSIONED` |
| `queue-cron-setup` | `CONFIGURED`, `VERIFIED`, `ISSUES_FOUND`, `RESTARTED` |
| `server-monitoring` | `CONFIGURED`, `ALERT_TESTED` |

For `migrate-site`, each phase run ends in its own status: running `--action freeze`
ends in `FROZEN`, running `--action verify` ends in `VERIFIED`, and so on.

### The Approval Cycle

A mutating script invoked without a valid `--confirm` value performs no mutation and
returns:

```json
{
  "skill": "deploy-site",
  "client": "acme",
  "status": "CONFIRMATION_REQUIRED",
  "timestamp": "2026-09-16T14:03:12Z",
  "duration_seconds": 1,
  "warnings": [],
  "errors": [],
  "gate": "DEPLOY",
  "confirm_string": "CONFIRM DEPLOY",
  "reason": "approval_required"
}
```

`reason` is `approval_required` when no flag was passed, and `approval_mismatch` when
the flag did not match. Exit code is `11`. Re-run with
`--confirm "<confirm_string>"` to perform the mutation.

---

## Exit Codes

| Code | Meaning | Typical statuses |
|------|---------|------------------|
| `0` | Success | `READY`, `OBSERVED`, `NO_OP`, `ROLLED_BACK`, `INCONCLUSIVE`, `DIAGNOSED`, `FIXED`, `CONFIGURED`, `DRILLED`, `RESTORED`, `VERIFIED`, `ISSUES_FOUND`, `RESTARTED`, `ALERT_TESTED`, `INVENTORIED`, `PREPARED`, `SYNCED`, `FROZEN`, `CUTOVER`, `DECOMMISSIONED`, `PLANNED` |
| `1` | General failure | `FAILED` |
| `2` | Invalid arguments / missing manifest | `STOPPED` |
| `3` | SSH connection failure | `STOPPED` |
| `4` | Git / repository failure | `FAILED` |
| `5` | Validation failure (manifest, commit, target) | `STOPPED` |
| `6` | Build / dependency failure | `FAILED` |
| `7` | Migration failure | `FAILED` |
| `8` | Runtime reload failure | `FAILED` |
| `9` | Health check failure (auto-rollback attempted) | `ROLLED_BACK` / `FAILED` |
| `10` | Rollback failure | `FAILED` |
| `11` | Approval not granted / stopped by the caller | `CONFIRMATION_REQUIRED` / `STOPPED` |
| `12` | Lock acquisition failure | `STOPPED` |
| `13` | Disk space / inode exhaustion | `STOPPED` |
| `14` | Permission error | `FAILED` |
| `127` | Command not found / environment error | `STOPPED` |

This table is authoritative. Individual scripts must not redefine exit codes in their
headers; they reference this document.

---

## Skill-Specific Fields

| Skill | Fields |
|-------|--------|
| `deploy-site` | `release_id`, `previous_release_id`, `git_commit`, `health_checks{attempts,passed,url}`, `rollback_performed` |
| `site-down-triage` | `layer`, `layer_name`, `diagnosis`, `evidence[]`, `proposed_fix`, `root_cause_note`, `handoff` |
| `ssl-dns-fix` | `layer`, `domain`, `cause`, `fix_applied`, `cert_expiry`, `cert_expiry_days`, `dns_changes_proposed[]` |
| `backup-restore` | `action`, `snapshot_id`, `snapshot_time`, `checks{row_counts,app_boot,file_checksums,newest_record_age}`, `scratch_destroyed`, `escrow_location` |
| `migrate-site` | `action`, `source_host`, `target_host`, `maintenance_mode`, `source_cron_disabled`, `source_workers_stopped`, `final_sync_completed`, `final_db_dump_completed` |
| `queue-cron-setup` | `action`, `workers_configured`, `cron_entries`, `issues[]{check,severity,detail,fix}`, `checks{}` |
| `server-monitoring` | `action`, `checks_added[]{name,type,severity}`, `test_alert_delivered` |

---

## Human-Readable Output (stderr)

Progress output uses consistent phase prefixes:

```
[OBSERVING] Loading client manifest: acme
[OBSERVING] Validating manifest... OK
[OBSERVING] Current release: 20260916-100000-bbbbbbb (commit abc123)
[PLANNING] Target commit: a1b2c3d (main branch)
[PLANNING] New release will be: 20260916-140322-a1b2c3d
[CONFIRMING] Approval gate DEPLOY satisfied
[EXECUTING] Acquiring deployment lock...
[EXECUTING] Fetching commit a1b2c3d...
[EXECUTING] Installing dependencies (composer)... OK
[EXECUTING] Running migrations... OK (3 migrations)
[EXECUTING] Atomic swap... OK
[VERIFYING] Health check (1/5)... OK
[READY] Deployment complete. Release: 20260916-140322-a1b2c3d
```

### Prefix Format

```
[PHASE] message
```

Phases: `OBSERVING`, `PLANNING`, `CONFIRMING`, `EXECUTING`, `VERIFYING`, `ROLLING_BACK`,
`READY`, `FAILED`, `ROLLED_BACK`, `STOPPED`, `WARNING`, `ERROR`.

---

## Machine Consumption

### Parsing JSON Output

```bash
# Capture the result; progress goes to stderr
result=$(bash scripts/deploy.sh --client acme --commit a1b2c3d --confirm "CONFIRM DEPLOY" 2>progress.log)
json_line=$(printf '%s\n' "$result" | tail -1)
status=$(printf '%s\n' "$json_line" | jq -r '.status')
```

For an agent, the loop is:

1. Run the script for the read-only step.
2. If `status == "CONFIRMATION_REQUIRED"`, read `confirm_string` and `gate`, ask the
   operator in the chat, then re-run the same command with `--confirm "<confirm_string>"`.
3. If `status == "READY"` (or another success status for that skill), read the
   skill-specific fields.
4. Otherwise read `errors` and stop.

### Chaining Skills

```bash
bash scripts/deploy.sh --client acme --confirm "CONFIRM DEPLOY"
if [[ $? -eq 0 ]]; then
    bash ../server-monitoring/scripts/status-monitoring.sh --client acme
fi
```

---

## Error Output Format

On failure the same envelope is emitted, with `errors` populated:

```json
{
  "skill": "deploy-site",
  "client": "acme",
  "status": "FAILED",
  "timestamp": "2026-09-16T14:05:33Z",
  "duration_seconds": 45,
  "warnings": ["Disk usage at 85%"],
  "errors": [
    "Migration failed: SQLSTATE[42S02]: Base table or view not found: 1146 Table 'acme.migrations' doesn't exist"
  ],
  "release_id": "20260916-140322-a1b2c3d",
  "previous_release_id": "20260916-100000-bbbbbbb",
  "rollback_performed": false
}
```

---

## Progress Streaming (Optional)

For long-running operations, skills may emit periodic progress JSON to **stderr** (never
stdout):

```json
{"phase": "EXECUTING", "step": 3, "total": 7, "description": "Installing dependencies", "elapsed_seconds": 32}
{"phase": "EXECUTING", "step": 4, "total": 7, "description": "Running migrations", "elapsed_seconds": 45}
```

Not required. The stdout JSON is mandatory.

---

## Summary

| Requirement | Implementation |
|-------------|----------------|
| Machine-readable result | Single JSON object on the last stdout line |
| Human-readable progress | Prefixed lines on stderr |
| Audit trail | Markdown journal (`logging.md`) |
| Envelope | Built by `emit_result` in `conventions/lib/output.sh` |
| Approvals | `--confirm <STRING>`; `CONFIRMATION_REQUIRED` + exit 11 when absent |
| Statuses | Shared set plus the skill's own, per the tables above |
| Exit codes | The single table above |
