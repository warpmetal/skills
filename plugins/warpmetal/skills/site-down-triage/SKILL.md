---
name: site-down-triage
disable-model-invocation: true
description: >-
  Diagnose a downed or slow client site with a read-only layered ladder
  (scope → reachability → DNS → TLS → web → runtime → resources → database → logs → recent change).
  Stops at the first broken layer, preserves evidence, and proposes a minimal fix without restarting anything.
  Use when a site is down, returning 502, timing out, or the client reports slowness.
---

# Site Down Triage

## Purpose

The 2am runbook for agency client sites. Systematic, read-only diagnosis ordered cheapest and most likely first. Refuses to guess. Stops at the first broken layer.

## Trigger

Use this skill when the user says:

- "[client] is down"
- "site returning 502"
- "client says the site is slow"
- "health check failing for [client]"
- "can't reach [client]"

## Inputs

### Required

| Input | Description |
|-------|-------------|
| `--client <name>` | Client identifier. Loads `~/.config/agency/clients/<name>.toml` |

### Optional

| Input | Default | Description |
|-------|---------|-------------|
| `--from-layer <0-9>` | `0` | Start ladder at this layer |
| `--stop-after-layer <0-9>` | `9` | Do not probe beyond this layer |
| `--since <duration>` | `1h` | Log window for journalctl / app logs |
| `--json` | `false` | Emit structured JSON on stdout (always emits final JSON line) |

### Required Client Configuration

See [conventions/client-manifest.md](conventions/client-manifest.md). Minimum: `host`, `site_root`, `domain`, `stack`, `health_url`. Optional `php` and `db` improve layers 5 and 7.

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

`triage.sh` probes each fault layer from the operator's machine. A missing tool
does not fail the triage: that layer's probe is skipped and a warning is recorded.

| Tool | Layer it probes | If it is missing |
|------|-----------------|------------------|
| `nc` | 1 — reachability | the probe is skipped; a warning is recorded |
| `dig` | 2 — DNS | the probe is skipped; a warning is recorded |
| `whois` | 2 — domain expiry | the registrar expiry lines are not collected |
| `openssl` | 3 — TLS | the probe is skipped; a warning is recorded |

`format-report.sh` only needs `bash`. `collect-remote.sh` is marked
`@standalone-remote`: it is piped to the host and runs there, so its dependencies
are the host's, not the operator's.

### Platform

`bash` 4+ and an OpenSSH client are required. On Windows, run these through WSL or
Git Bash; there is no native PowerShell runner for the skill scripts.

## Rules

### Invocation

This skill is opt-in (`disable-model-invocation: true`). Load it only when the
operator names it. It is read-only, but it is installed as part of a set whose other
members mutate production; keeping the invocation rule uniform keeps the boundary
predictable.

### Mandatory Safety Rules

1. **Read-only by default** — Diagnose and propose. Do not restart, reload, write configs, or delete files.
2. **Stop at the first broken layer** — Do not run remaining ladder steps after a clear failure.
3. **Preserve evidence** — Capture process lists, logs, and statuses *before* proposing any restart.
4. **Rate-limit probes** — Do not hammer a struggling box. Prefer one SSH round trip for remote layers.
5. **Never `rm -rf`** — On disk-full, propose specific reclaimable paths only.
6. **Never guess** — Missing or ambiguous data → STOPPED or INCONCLUSIVE with explanation.
7. **Journal every run** — `~/.local/state/agency/<client>/<date>-site-down-triage.md`
8. **Secrets sanitized** — Follow [conventions/logging.md](conventions/logging.md).

### Never Do

- Never restart nginx, php-fpm, MySQL, Node, or workers during triage
- Never run `SHOW PROCESSLIST` after restarting MySQL
- Never delete logs or release directories
- Never apply DNS, TLS, or deploy fixes — propose and hand off
- Never accept unknown SSH host keys (`StrictHostKeyChecking=yes`)

## Workflow

```
LOAD CLIENT → VALIDATE MANIFEST → OBSERVE (local layers 0–3)
  → if broken: STOP AT LAYER → REPORT
  → else: ONE SSH COLLECT (layers 4–9) → WALK REMOTE LADDER → STOP AT FIRST BROKEN
  → MATCH SIGNATURES → EMIT DIAGNOSIS + MINIMAL FIX + ROOT-CAUSE NOTE
```

### The Ladder

| # | Layer | Probe | Common cause |
|---|-------|-------|--------------|
| 0 | Scope | curl `health_url`; sibling sites on same host | Just you / just this site / whole server |
| 1 | Reachability | ping, `nc -vz host 443` | Provider incident, firewall, box off |
| 2 | DNS | `dig +short A domain`, NS, whois expiry | Expired domain |
| 3 | TLS | `openssl s_client -servername` | Expired cert, missing intermediate, wrong SNI |
| 4 | Web server | `systemctl status nginx`, `nginx -t`, `ss -lntp` | Bad config, port not bound |
| 5 | App runtime | php-fpm pool / Node process | `pm.max_children` (classic 502) |
| 6 | Resources | `df -h`, `df -i`, `free -m`, OOM in dmesg | Disk full, inodes, OOM |
| 7 | Database | connect, `SHOW PROCESSLIST`, max_connections | Pool exhausted, crashed table |
| 8 | Logs | nginx error, app log, `journalctl --since` | Stack trace |
| 9 | Recent change | last deploy, apt history, cert renewal, cron | "Nothing changed" is always false |

Remote layers 4–9 are collected in **one SSH session** via `scripts/collect-remote.sh`. Local layers 0–3 run first; if they fail, skip remote collection.

## How to Run


The scripts resolve the shared library from their own path and read no file relative
to your working directory, so they can be launched from anywhere. The examples below
`cd` into the skill directory first; calling a script by absolute path works
identically.
This skill is entirely read-only, so **no approval gate is required and no
`--confirm` flag exists**. Never follow a `DIAGNOSED` result with an unapproved
mutation: hand off through `proposed_fix` and `handoff` instead.

### Step 1 — Diagnose

```bash
cd ~/.cursor/skills/site-down-triage   # or wherever the skill is installed
bash scripts/triage.sh --client acme
```

Narrow the walk when the operator already knows part of the story:

```bash
bash scripts/triage.sh --client acme --from-layer 4        # skip the local probes
bash scripts/triage.sh --client acme --stop-after-layer 6   # stop before the database
bash scripts/triage.sh --client acme --since 30m            # widen the log window
```

### Step 2 — Produce the human report

```bash
bash scripts/triage.sh --client acme > /tmp/triage.json
bash scripts/format-report.sh --client acme --input /tmp/triage.json --write-journal
```

### Reading the result

| `status` | Exit | Next action |
|----------|------|-------------|
| `DIAGNOSED` | 0 | Read `layer`, `layer_name`, `diagnosis`, and `evidence[]`. Present `proposed_fix` to the operator and ask before running it |
| `INCONCLUSIVE` | 0 | The ladder completed without a clear break. Report `evidence[]` and say so plainly; do not invent a cause |
| `STOPPED` | 2, 3, 5 | Manifest invalid, SSH failed, or arguments were rejected. Read `errors` |
| `FAILED` | 1 | The collector or a probe crashed unexpectedly. Read `errors` |

### Handoff

When `handoff` is not `"none"`, name the follow-up skill in the answer to the
operator, with the exact command:

| `handoff` | Command to propose |
|-----------|--------------------|
| `ssl-dns-fix` | `bash ../ssl-dns-fix/scripts/diagnose-ssl.sh --client <client>` |
| `backup-restore` | `bash ../backup-restore/scripts/drill-restore.sh --client <client>` |
| `queue-cron-setup` | `bash ../queue-cron-setup/scripts/verify-workers.sh --client <client>` |
| `deploy-site` | `bash ../deploy-site/scripts/inspect.sh --client <client>` |

## State Model

```
OBSERVING → DIAGNOSING → DIAGNOSED
                      → INCONCLUSIVE
                      → STOPPED
```

| State | Meaning | Terminal? |
|-------|---------|-----------|
| `OBSERVING` | Manifest load, local preflight | No |
| `DIAGNOSING` | Walking the ladder | No |
| `DIAGNOSED` | First broken layer found | **Yes** |
| `INCONCLUSIVE` | Ladder complete; no clear break (slow/intermittent) | **Yes** |
| `STOPPED` | Missing client, SSH failure, invalid args | **Yes** |

## Output

Stderr: prefixed progress (`[OBSERVING]`, `[DIAGNOSING]`, etc.).

Stdout final line: JSON per [conventions/outputs.md](conventions/outputs.md):

```json
{
  "skill": "site-down-triage",
  "client": "acme",
  "status": "DIAGNOSED",
  "layer": 5,
  "layer_name": "app_runtime",
  "diagnosis": "php-fpm reached pm.max_children",
  "evidence": ["..."],
  "proposed_fix": "Capture evidence; then restart php-fpm only after explicit approval",
  "root_cause_note": "Recurring max_children → capacity or slow queries",
  "handoff": "none",
  "warnings": []
}
```

Human report and post-incident note: `scripts/format-report.sh`.

## Safety Gates

| Gate | Enforcement |
|------|-------------|
| Read-only | Scripts contain no restart/reload/write/delete |
| Stop-at-first | Ladder exits on first `BROKEN` |
| Rate limit | Sleeps between local probes; single remote SSH |
| Evidence first | DB/log capture before any restart proposal |
| Disk-full | Reclaim paths proposed only |

## References

- [Triage Ladder](references/triage-ladder.md)
- [Signatures](references/signatures.md)
- [Post-Incident Note](references/post-incident.md)
- [Rate Limiting](references/rate-limiting.md)
- [Evidence Capture](references/evidence-capture.md)
- [Handoffs](references/handoffs.md)

Shared:

- [Client Manifest](conventions/client-manifest.md)
- [Safety](conventions/safety.md)
- [Logging](conventions/logging.md)
- [Outputs](conventions/outputs.md)

## Scripts

| Script | Responsibility |
|--------|----------------|
| `scripts/triage.sh` | CLI, local layers 0–3, invoke remote collector, match signatures, emit JSON |
| `scripts/collect-remote.sh` | Single remote payload for layers 4–9 |
| `scripts/format-report.sh` | Human report + post-incident note from JSON |

## Completion Criteria

1. First broken layer identified (or INCONCLUSIVE)
2. Evidence inline in journal and JSON
3. Minimal fix proposed (not executed)
4. Separate root-cause / fix-later note
5. Handoff skill named when applicable
6. No mutations performed
