# Logging Convention (Run Journal)

## Purpose

Every skill invocation that touches a client's infrastructure produces a **run journal** — a chronological, tamper-evident record of what was done, when, and with what result.

When a client asks "what did you change on Tuesday?", the answer exists in the journal.

---

## Journal Location

```
~/.local/state/agency/<client>/<YYYYMMDD>-<skill>.md
```

Examples:
- `~/.local/state/agency/acme/20260916-deploy-site.md`
- `~/.local/state/agency/acme/20260916-site-down-triage.md`
- `~/.local/state/agency/acme/20260916-backup-restore.md`

---

## Journal Format

Each journal is a Markdown file with structured entries.

### Header

```markdown
# Run Journal: <skill> for <client>

**Date:** 2026-09-16
**Skill:** deploy-site
**Client:** acme
**Operator:** <username>@<hostname>
**Manifest:** ~/.config/agency/clients/acme.toml
**Git Commit:** a1b2c3d4e5f6... (if applicable)
```

### Entry Structure

Each operation adds an entry:

```markdown
## [2026-09-16 14:03:22 UTC] <phase>: <description>

**Command:**
```bash
ssh acme-prod 'ls -la /var/www/acme/releases/'
```

**Exit Code:** 0
**Duration:** 1.2s

**Output (sanitized):**
```
releases/
├── 20260915-120000-aaaaaaa/
├── 20260916-100000-bbbbbbb/
└── current -> releases/20260916-100000-bbbbbbb
```

**State Transition:** OBSERVING → PLANNING
```

### Required Fields per Entry

| Field | Required | Description |
|-------|----------|-------------|
| Timestamp | Yes | ISO 8601 UTC: `2026-09-16T14:03:22Z` |
| Phase | Yes | One of: `OBSERVING`, `PLANNING`, `CONFIRMING`, `EXECUTING`, `VERIFYING`, `ROLLING_BACK`, `READY`, `FAILED`, `ROLLED_BACK`, `STOPPED` |
| Description | Yes | Human-readable operation name |
| Command | Yes* | Exact command executed (sanitized) |
| Exit Code | Yes | Numeric exit code |
| Duration | Yes | Wall-clock time in seconds |
| Output | No | Sanitized stdout/stderr (see Sanitization) |
| State Transition | Yes | From → To |

*Commands that are purely local (e.g., manifest parsing) may omit remote command but must note "local operation".

---

## Sanitization Rules

**Never log secrets.** Apply these transformations to all output before writing:

| Pattern | Replacement |
|---------|-------------|
| `password=...` | `password=***REDACTED***` |
| `token=...` | `token=***REDACTED***` |
| `key=...` | `key=***REDACTED***` |
| `secret=...` | `secret=***REDACTED***` |
| `Authorization: Bearer ...` | `Authorization: Bearer ***REDACTED***` |
| `ssh-rsa AAAA...` | `ssh-rsa ***REDACTED***` |
| `-----BEGIN ... PRIVATE KEY-----` | `***PRIVATE KEY REDACTED***` |
| `.env` file contents | `***ENV FILE REDACTED***` |

**Commands themselves are logged verbatim** (they typically don't contain secrets if written correctly).

---

## Phases (State Machine)

```
OBSERVING → PLANNING → CONFIRMING → EXECUTING → VERIFYING → READY
                ↓            ↓            ↓           ↓
              STOPPED    STOPPED      FAILED     ROLLING_BACK → ROLLED_BACK
```

| Phase | Description |
|-------|-------------|
| `OBSERVING` | Read-only probes, manifest loading, preflight checks |
| `PLANNING` | Generating deployment plan, diff, or diagnosis |
| `CONFIRMING` | Checking the `--confirm` approval flag |
| `EXECUTING` | Mutating operations (deploy, migrate, config change) |
| `VERIFYING` | Health checks, post-deploy validation |
| `ROLLING_BACK` | Reverting to previous state |
| `READY` | Success — terminal state |
| `FAILED` | Unrecoverable error — terminal state |
| `STOPPED` | User cancelled or skill stopped — terminal state |

---

## Implementation

### Shell Helper Functions

The helpers live in `conventions/lib/journal.sh` and are loaded by
`conventions/lib/bootstrap.sh`. Do not re-implement them in a skill script.

```bash
# In any agency-skills/<skill>/scripts/*.sh:
source "$_SKILL_LIB"          # conventions/lib/bootstrap.sh

journal_init "deploy-site" "$CLIENT" "$MANIFEST"
journal_log "EXECUTING" "Installing dependencies" "ssh acme-prod 'composer install'" 0 12 "" "PLANNING" "EXECUTING"
```

| Function | Purpose |
|----------|---------|
| `journal_init <skill> <client> [manifest]` | Creates the per-day journal with its header. |
| `journal_log <phase> <desc> [command] [exit] [duration] [output] [from] [to]` | Appends one entry. |
| `journal_run <phase> <desc> <from> <to> -- <cmd...>` | Runs a command, times it, logs it sanitized, echoes its output. |
| `journal_sanitize` | stdin to stdout; strips secrets using the rules above. |
| `journal_path` | Prints the current journal path. |

Never interpolate a secret into a command string: it lands in `argv` and defeats
sanitization. Read secrets from the environment or stdin and pipe them.

---

## Journal Rotation

- **No automatic rotation** — Journals are small (text), keep indefinitely.
- **One file per skill per day per client** — Multiple invocations append.
- **Manual cleanup** — Operator decides retention.

---

## Cross-Skill Correlation

All skills for a client on the same day write to separate files but same directory:

```
~/.local/state/agency/acme/
├── 20260916-deploy-site.md
├── 20260916-site-down-triage.md
└── 20260916-backup-restore.md
```

This allows reconstructing the full timeline of a day's operations.

---

## Verification

On skill completion, the journal must contain:
1. Header with client, skill, date, operator
2. At least one entry per phase transition
3. Final state: `READY`, `FAILED`, `ROLLED_BACK`, or `STOPPED`
4. No unredacted secrets (spot-check with `grep -i "password\|token\|secret\|key" journal.md`)