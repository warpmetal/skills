---
name: deploy-site
disable-model-invocation: true
description: >-
  Deploy a client site to production via zero-downtime Git-based workflow.
  Loads the client manifest, validates configuration, creates an isolated release,
  runs migrations, and activates atomically with automatic rollback on health failure.
  Use when deploying code to production, rolling back a broken release, or
  pushing a branch to a client's server.
---

# Deploy Site

## Purpose

Controlled, zero-downtime Git-based production deployment for PHP/Laravel, WordPress, Node.js, and static sites.

Every deployment creates an isolated release directory and activates atomically via symlink swap. Previous releases remain available for rollback.

## Trigger

Use this skill when the user says:

- "deploy [client]"
- "push [branch] to production for [client]"
- "roll back [client]"
- "deploy [client] to [server]"

## Inputs

### Required

| Input | Description |
|-------|-------------|
| `--client <name>` | Client identifier. Loads `~/.config/agency/clients/<name>.toml` |

### Optional

| Input | Default | Description |
|-------|---------|-------------|
| `--commit <sha>` | Manifest `branch` HEAD | Exact Git commit to deploy |
| `--ref <ref>` | Manifest `branch` | Git ref (branch, tag, SHA) |
| `--dry-run` | `false` | Show plan only, no mutations |
| `--no-migrations` | `false` | Skip migration step |

### Required Client Configuration

See `conventions/client-manifest.md`. Minimum required fields: `host`, `site_root`, `domain`, `stack`, `health_url`.

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

None beyond `python3` above. The `git`, dependency-install, `flock`, and health
probes all run **on the host**, inside the deployment payload, so what matters is
that they exist there. Note that `inspect.sh` and `deploy.sh --dry-run` still open
an SSH connection: `ssh` is required even for the read-only steps.

### Platform

`bash` 4+ and an OpenSSH client are required. On Windows, run these through WSL or
Git Bash; there is no native PowerShell runner for the skill scripts.

## Rules

### Invocation

This skill is opt-in (`disable-model-invocation: true`). Load it only when the
operator names it. It changes production, so an ambient trigger — the conversation
merely mentioning a deploy — would amount to an unrequested change.

### Mandatory Safety Rules

1. **Read-only first** — Observe, then propose, then apply on explicit confirmation.
2. **Explicit approval required** — Type `CONFIRM DEPLOY` before any mutation.
3. **Exact commit required** — Never deploy a branch name alone; resolve to SHA.
4. **Deployment lock enforced** — `flock` on `/tmp/deploy-<client>.lock`.
5. **No dirty/unpushed refs** — Validate clean working tree and pushed commit.
6. **Never sync `.env` from local** — Shared config lives on server in `shared/`.
7. **Migration safety** — Expand/contract discipline enforced. If migrations ran, auto-rollback is refused.
8. **Health gate required** — Poll `health_url` N times. Auto-rollback on failure.
9. **No READY without verification** — State `READY` only after health gate passes.
10. **Journal every operation** — All commands logged to `~/.local/state/agency/<client>/<date>-deploy-site.md`.

### Never Do

- Never deploy directly into `current` — always create new release
- Never copy `.env` into Git — server-side `shared/.env` only
- Never print secrets
- Never guess production paths
- Never bypass host verification
- Never run unknown destructive commands
- Never silently bypass migration warnings
- Never report `READY` without health verification

## Workflow

```
LOAD CLIENT → VALIDATE MANIFEST → PREFLIGHT (read-only) → RESOLVE TARGET COMMIT
    → INSPECT CURRENT RELEASE → GENERATE DEPLOYMENT PLAN → REQUEST EXPLICIT CONFIRMATION
    → ACQUIRE DEPLOYMENT LOCK → CREATE NEW RELEASE
    → FETCH EXACT COMMIT → INSTALL DEPENDENCIES → CONNECT SHARED RESOURCES
    → BUILD → MIGRATION SAFETY GATE → PREPARE RUNTIME
    → ACTIVATE RELEASE ATOMICALLY → RELOAD RUNTIME → UPDATE WORKERS
    → HEALTH CHECK → VERIFY → READY

FAILURE → PRESERVE EVIDENCE → DETERMINE RELEASE STATE → ROLLBACK WHEN SAFE → HEALTH CHECK → ROLLED_BACK / FAILED / STOPPED
```

### Detailed Steps

#### Phase 1: Load & Validate

```
1. Load ~/.config/agency/clients/<client>.toml
2. Validate all required fields present
3. Verify SSH host exists in ~/.ssh/config
4. Verify health_url uses HTTPS
5. Validate stack is one of: laravel, wordpress, node, static
```

#### Phase 2: Preflight (Read-Only)

```
1. SSH to host, capture current state:
   - Active release and commit
   - Disk usage (df -h, df -i)
   - Runtime status (php-fpm, nginx, node processes)
   - Git status on server bare mirror
   - Migration status (pending migrations)
2. Check deployment lock is not held
3. Verify target commit exists on remote
4. Check for uncommitted changes in repo
5. Verify target commit is pushed
```

#### Phase 3: Generate Plan

```
1. Compute new release ID: <YYYYMMDD>-<HHMMSS>-<short-sha>
2. Determine shared paths to symlink
3. Determine stack-specific steps
4. Estimate duration
5. List rollback availability
6. Present plan with risks
```

#### Phase 4: Confirmation

Display plan and require `CONFIRM DEPLOY` typed exactly.

#### Phase 5: Execute Deployment

```bash
# 1. Acquire lock
flock -n /tmp/deploy-<client>.lock

# 2. Create release dir
mkdir -p "$RELEASES_DIR/$RELEASE_ID"

# 3. Fetch exact commit into bare mirror, checkout
git --git-dir="$MIRROR_DIR" fetch origin "$TARGET_COMMIT"
git --work-tree="$RELEASE_DIR" checkout "$TARGET_COMMIT" -- .

# 4. Symlink shared paths
ln -sf "$SHARED_DIR/.env" "$RELEASE_DIR/.env"
ln -sf "$SHARED_DIR/storage" "$RELEASE_DIR/storage"
ln -sf "$SHARED_DIR/public/uploads" "$RELEASE_DIR/public/uploads"

# 5. Install dependencies (in new release dir)
#    Laravel: composer install --no-dev -o
#    Node: npm ci --omit=dev
#    WordPress: none (PHP deps via composer)

# 6. Build assets
#    Laravel: npm run build
#    Node: npm run build
#    Static: build step

# 7. Run migrations (if --no-migrations not set)
#    php artisan migrate --force
#    Expand/contract safety checked

# 8. Warm caches
#    php artisan config:cache route:cache view:cache
#    Or framework equivalent

# 9. Atomic swap
ln -sfn "$RELEASE_DIR" "$SITE_ROOT/current.tmp" && mv -Tf "$SITE_ROOT/current.tmp" "$SITE_ROOT/current"

# 10. Reload runtime
#    systemctl reload php8.x-fpm
#    nginx reload or upstream swap

# 11. Restart queue workers
#    systemctl restart acme-worker@1

# 12. Health gate
#    Poll health_url 5 times, 3s interval
#    Auto-rollback on failure

# 13. Prune to last 5 releases
```

#### Phase 6: Failure Handling

On any failure:
1. Preserve evidence (log command, output, state)
2. Determine release state (was swap completed?)
3. If swap completed and health failed → auto-rollback
4. If migrations ran → refuse auto-rollback, report blocking migration
5. If swap not completed → clean up orphan release, old `current` untouched
6. Always release deployment lock
7. Report final state: `ROLLED_BACK`, `FAILED`, or `STOPPED`

## How to Run


The scripts resolve the shared library from their own path and read no file relative
to your working directory, so they can be launched from anywhere. The examples below
`cd` into the skill directory first; calling a script by absolute path works
identically.
The scripts are non-interactive. Every mutating script refuses to touch anything
until it receives the exact `--confirm` string for each gate it needs. When a gate
is missing it prints `status: "CONFIRMATION_REQUIRED"`, lists the missing strings in
`confirm_strings`, mutates nothing, and exits `11`.

`inspect.sh`, `verify.sh`, and `health-check.sh` are read-only and take no gate.

### Step 1 — Preflight (read-only)

```bash
cd ~/.cursor/skills/deploy-site   # or wherever the skill is installed
bash scripts/inspect.sh --client acme
```

`status: "OBSERVED"`, exit 0. Read `lock_state` (must be `free`), `runtime_status`,
`disk_used_percent`, and `migration_status` before continuing.

### Step 2 — Plan

```bash
bash scripts/deploy.sh --client acme --ref main --dry-run
```

`status: "PLANNED"`, exit 0. Read `current_release_id`, `target_ref`, and
`gates_required` — the last field is the exact list of approvals this deploy needs.

### Step 3 — Deploy

```bash
bash scripts/deploy.sh --client acme --commit 4f2a1c9 \
    --confirm "CONFIRM DEPLOY" \
    --confirm "CONFIRM MIGRATIONS" \
    --confirm "CONFIRM ACTIVATE" \
    --confirm "CONFIRM RELOAD" \
    --confirm "CONFIRM RESTART WORKERS" \
    --confirm "CONFIRM PRUNE"
```

Pass `--no-migrations` when the commit contains no migrations; then
`CONFIRM MIGRATIONS` is not required and is not requested.

### Step 4 — Verify

```bash
bash scripts/verify.sh --client acme --release-id 20260921-140322-4f2a1c9
```

### Rollback (only when Step 4 or a health gate fails)

```bash
bash scripts/rollback.sh --client acme --confirm "CONFIRM ROLLBACK"
```

### Reading the result

The JSON is the last line of stdout; progress goes to stderr.

| `status` | Exit | Next action |
|----------|------|-------------|
| `CONFIRMATION_REQUIRED` | 11 | Ask the operator in the chat, then re-run the same command adding one `--confirm` flag per value in `confirm_strings` |
| `PLANNED` | 0 | Dry run only. Re-run without `--dry-run` to apply |
| `OBSERVED` | 0 | Read-only step finished. `inspect`/`verify`/`health-check` report their findings in the skill-specific fields |
| `READY` | 0 | Done. Report `release_id`, `git_commit`, and `health_checks` |
| `NO_OP` | 0 | The requested commit is already live. Nothing to do |
| `ROLLED_BACK` | 9 | The deploy failed and was reverted. Read `errors`, then `rolled_back_to` |
| `FAILED` | 1, 6–8, 14 | Read `errors` and `rollback_performed`. When migrations were attempted, `rollback_performed` is `false` **by design** — resolve the migration manually |
| `STOPPED` | 2, 3, 5, 12, 13 | A precondition failed: manifest, SSH, lock, or disk. Read `errors` |

## State Model

Internal phases (`INITIALIZING`, `DEPLOYING`, `HEALTH_CHECKING`, `ROLLING_BACK`,
`PRUNING`) appear in the journal and on stderr, but are never emitted as `status`.
`status` only ever takes the values below, all of them from the shared set in
`conventions/outputs.md`.

```
INITIALIZING → INVALIDATED
             → PLANNED (dry run)
             → CONFIRMATION_REQUIRED (a gate is missing)
             → DEPLOYING → HEALTH_CHECKING → READY
                                         → ROLLED_BACK
             → NO_OP (requested commit already live)
             → FAILED
             → STOPPED
```

| Status | Meaning | Terminal? |
|--------|---------|-----------|
| `PLANNED` | Dry run or plan produced; nothing mutated | **Yes** |
| `CONFIRMATION_REQUIRED` | A gate is missing; nothing mutated | **Yes** |
| `OBSERVED` | A read-only script (`inspect`, `verify`, `health-check`) reported | **Yes** |
| `READY` | Deployment complete, health gate passed | **Yes** |
| `FAILED` | Unrecoverable error | **Yes** |
| `ROLLED_BACK` | Reverted to the previous release | **Yes** |
| `NO_OP` | Requested commit is already live | **Yes** |
| `STOPPED` | Validation failed, a precondition is missing, or approval was refused | **Yes** |

## Output

The envelope is defined in `conventions/outputs.md`. `deploy-site` adds:

| Field | Emitted by | Type | Description |
|-------|-----------|------|-------------|
| `action` | all | string | `deploy`, `rollback`, `inspect`, or `verify` |
| `step` | `verify.sh` | string | `verify`; distinguishes scripts that share an action |
| `release_id` | `deploy`, `verify` | string | New release, `<UTC timestamp>-<short sha>` |
| `previous_release_id` | `deploy` | string\|null | Release live before this run |
| `current_release_id` | `deploy`, `inspect`, `rollback` | string\|null | Release live at the time of the run |
| `rollback_target_id` | `inspect`, `rollback` | string\|null | Release a rollback would return to |
| `git_commit` | `deploy` | string\|null | Full SHA that was deployed |
| `target_ref` | `deploy` | string | The ref that was requested |
| `health_checks{attempts,passed,url}` | `deploy` | object | Health gate result |
| `health_url`, `attempts`, `passed`, `failed`, `response_times_ms` | `health-check.sh` | — | Per-attempt detail |
| `rollback_performed` | `deploy`, `rollback` | boolean | Whether the rollback actually ran |
| `migrations_attempted` | `deploy` | boolean | Whether migrations were run in this deployment |
| `migrations_were_run` | `rollback` | boolean | Whether migrations block the rollback |
| `rolled_back_to` | `deploy` | string | Present only on `ROLLED_BACK` |
| `lock_state` | `inspect` | string | `free` or `held` |
| `runtime_status` | `inspect`, `verify` | string | Output of `systemctl is-active` |
| `migration_status` | `inspect` | string | Latest migration batch or status |
| `disk_used_percent` | `inspect` | number\|null | Filesystem usage |
| `git_mirror_head` | `inspect`, `verify` | string\|null | SHA in the bare mirror on the host |
| `checks[]`, `checks_passed`, `checks_failed` | `verify.sh` | — | Per-check outcome |
| `gates_required[]` | `deploy --dry-run` | array | The exact `--confirm` strings this deploy needs |
| `plan` | `deploy --dry-run` | string | Human-readable step list |

```json
{
  "skill": "deploy-site",
  "client": "acme",
  "status": "READY",
  "timestamp": "2026-09-21T14:05:33Z",
  "duration_seconds": 142,
  "warnings": [],
  "errors": [],
  "action": "deploy",
  "git_commit": "4f2a1c9e7b3d0a5c8f1e2d3b4a5968776655443322110ffee",
  "release_id": "20260921-140322-4f2a1c9",
  "previous_release_id": "20260920-100000-bbbbbbb",
  "health_checks": { "attempts": 5, "passed": 5, "url": "https://acme.com/health" },
  "rollback_performed": false,
  "migrations_attempted": true
}
```

## Safety Gates

| Gate | Enforcement |
|------|-------------|
| Deployment Lock | `flock` on `/tmp/deploy-<client>.lock`, fails if another deploy in progress |
| Dirty Tree Check | `git status --porcelain` must be empty |
| Unpushed Ref Check | Target commit must exist on remote `origin` |
| Migration Safety | If migrations ran in this deploy, auto-rollback refused |
| Disk Space | `df -h $SITE_ROOT` must have > 10% free |
| Health Gate | 5 attempts, 3s interval; auto-rollback on failure |
| Secret Protection | No secrets in logs, manifests, or output |

## References

See `references/` directory for detailed operational documentation:

- [Deployment Model](references/deployment-model.md) — Release lifecycle, symlink mechanics
- [Client Manifest](references/client-manifest.md) — Full field documentation and examples
- [Health Checks](references/health-checks.md) — Health gate implementation, polling strategy
- [Migrations](references/migrations.md) — Expand/contract safety, migration safety gate
- [Queues & Workers](references/queues-workers.md) — Worker restart semantics, stale-code bug
- [Rollback](references/rollback.md) — Rollback procedure, migration blocking behavior
- [Security](references/security.md) — SSH behavior, secret handling, host verification
- [Troubleshooting](references/troubleshooting.md) — Common failure modes and diagnostics

## Scripts

All scripts use `set -euo pipefail`, validate arguments, and produce JSON output per `conventions/outputs.md`.

| Script | Responsibility |
|--------|----------------|
| `inspect.sh` | Read-only preflight: manifest, SSH, disk, git, runtime state |
| `deploy.sh` | Full deployment workflow: lock, fetch, symlink, build, migrate, activate |
| `health-check.sh` | Poll health_url N times; return exit code 0/9 |
| `rollback.sh` | Repoint `current` symlink to previous release; reload runtime |
| `verify.sh` | Post-deploy verification: health, git status, release structure |

## Completion Criteria

A deployment is complete when the last stdout line reports `status: "READY"` and
all of the following hold. Anything else means the work is not finished.

1. `deploy.sh` returned `READY` with exit `0`, not `ROLLED_BACK`.
2. `health_checks.passed` equals `health_checks.attempts` and points at the
   manifest's `health_url`.
3. `release_id` is a new value, different from the `previous_release_id`.
4. `rollback_performed` is `false`.
5. `verify.sh --release-id <release_id>` returned `OBSERVED` with
   `checks_failed == 0`.
6. `artisan queue:restart` (or the stack equivalent) ran, so no worker is still
   on the previous release — confirm with
   `../queue-cron-setup/scripts/verify-workers.sh --client <name>`.
7. The journal at `~/.local/state/agency/<client>/<date>-deploy-site.md` contains
   the gate evaluations and every remote command with its exit code.
8. Any `warnings[]` entry has been read and either resolved or reported to the
   operator.

If `status` is `ROLLED_BACK` or `FAILED`, the deployment is not complete: read
`errors[]`, resolve the cause, and report `rollback_performed` and
`rolled_back_to` explicitly. A deploy that failed after migrations ran is
deliberately left un-rolled-back and needs a human decision.
