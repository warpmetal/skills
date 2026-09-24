# Safety Conventions

These rules apply to **all seven skills**. They are non-negotiable.

---

## Read-Only First

**Every skill that touches production runs in three phases:**

1. **Observe** — Collect state, capture current configuration, run read-only probes.
2. **Propose** — Present a diff, plan, or diagnosis. No mutations.
3. **Apply** — Execute only on **explicit user confirmation**.

**Never** restart a service, write a file, or run a destructive command before capturing state.

---

## Explicit Approval Gates

Every mutating action is gated. The authoritative list of gates and their exact
confirmation strings lives in **[approvals.md](approvals.md)**; this document does not
duplicate it, because duplicated gate tables drift.

**Approval format:** an exact, case-sensitive string passed as a flag:

```bash
bash scripts/deploy.sh --client acme --confirm "CONFIRM DEPLOY"
```

There is no prompt, no `y/N`, no environment-variable bypass, and no `--force`. An
invocation that cannot be approved performs no mutation and exits `11` with status
`CONFIRMATION_REQUIRED`.

The read-only half of each skill ships as its own script (for example
`deploy-site/scripts/inspect.sh`, `ssl-dns-fix/scripts/diagnose-ssl.sh`) so the
observation step can be run on its own, with no gate and no risk.

---

## Migration Safety (Expand/Contract)

**The skill enforces expand/contract discipline:**

| Phase | Action | Example |
|-------|--------|---------|
| 1. Expand | Add new columns/tables, backfill data | `ALTER TABLE ADD COLUMN new_col` |
| 2. Migrate code | Stop writing to old column, read from both | Application code change |
| 3. Contract | Drop old column/table | `ALTER TABLE DROP COLUMN old_col` |

**Rules:**
- Never drop a column in the same deploy that stops writing to it.
- Never rename a column — add new, migrate, drop old.
- If a migration ran, **automatic rollback is refused**. The skill must report exactly which migration blocks rollback and require manual resolution.
- Migrations run **before** atomic swap, in the new release directory.

---

## Deployment Lock

**Concurrent deploys are forbidden.** Every mutating operation must acquire an exclusive lock:

```bash
LOCKFILE="/tmp/deploy-<client>.lock"
exec 9>"$LOCKFILE"
flock -n 9 || { echo "ERROR: Another deployment in progress"; exit 1; }
```

- Lock file lives in `/tmp` (cleared on reboot).
- Lock held from **plan generation** through **health gate completion**.
- Lock released on success, rollback, or explicit stop.

---

## Secret Protection

| Rule | Enforcement |
|------|-------------|
| No secrets in client manifest | Validated on load |
| No secrets in Git | `.env` never committed; lives in `shared/` on server |
| No secrets in logs | Run journal records commands only; output sanitized |
| No secrets printed to stdout/stderr | Scripts use `set +x` around sensitive ops |
| No secret interpolation in shell | Use `printf '%s' "$VAR"` not `echo "$VAR"` |

---

## SSH Behavior

- **No `ssh-keyscan`** — Use `StrictHostKeyChecking=yes` with known_hosts.
- **No host key auto-accept** — Stop on host key mismatch.
- **No agent forwarding** — `ForwardAgent no`.
- **No password/keyboard-interactive** — Key-only auth.
- **Dedicated deploy key per client** — Not the developer's personal key.
- **Connection timeout** — `ConnectTimeout=10`, `ServerAliveInterval=30`.

---

## Git Behavior

- **Exact commit required** — Never deploy a branch name or a ref on its own. Resolve
  to a full 40-character SHA **before** the plan is presented and before any mutation:

  ```bash
  TARGET_SHA="$(git --git-dir="$MIRROR" rev-parse --verify "${TARGET_REF}^{commit}")"
  [[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || stop_with "Could not resolve ${TARGET_REF} to a SHA"
  ```

  The release ID and the journal record the resolved SHA, not the ref the operator typed.
- **No dirty working tree** — Refuse if `git status --porcelain` is non-empty.
- **No unpushed refs** — The resolved SHA must exist on `origin`.
- **Bare mirror on server** — Fetch into bare repo, then checkout to release dir.
- **No force-push** — Skills never push to remote.

---

## Atomic Activation

**The only correct symlink swap:**

```bash
ln -sfn "$NEW_RELEASE" "$SITE_ROOT/current.tmp" && mv -Tf "$SITE_ROOT/current.tmp" "$SITE_ROOT/current"
```

- `ln -sfn` creates/updates the temp symlink.
- `mv -Tf` atomically replaces `current` (the `-T` flag prevents creating symlink *inside* directory).
- If `mv` fails, `current` still points to old release.

---

## Health Gate

- **Poll `health_url` N times** (default: 5 attempts, 3s interval).
- **Auto-rollback on failure** — If health checks fail, immediately revert `current` symlink and reload runtime.
- **No READY without verification** — State `READY` only after health gate passes.

---

## Rollback Availability

- **Previous release always preserved** — Minimum 2 releases retained (current + previous).
- **Rollback = repoint symlink + reload** — Two-second operation if no migration ran.
- **If migration ran → NO AUTO ROLLBACK** — Skill stops, reports blocking migration, requires manual decision.

---

## Journal Logging

Every command that mutates or probes production is logged:

```
~/.local/state/agency/<client>/<YYYYMMDD>-<skill>.md
```

Format: timestamp, command, exit code, sanitized output.

---

## Failure State Discipline

**Failure must not leave production in undefined state.**

| Failure Point | Required Behavior |
|---------------|-------------------|
| Git fetch/clone failure | Clean up partial release dir; old `current` untouched |
| Dependency install failure | Clean up partial release dir; old `current` untouched |
| Build failure | Clean up partial release dir; old `current` untouched |
| Migration failure | Stop; report migration error; old `current` untouched |
| Atomic swap failure | `mv -T` is atomic; if it fails, `current` unchanged |
| Runtime reload failure | Attempt rollback; report if rollback fails |
| Health check failure | Auto-rollback; report final state |
| SSH disconnect mid-deploy | Lock held; on reconnect, detect orphan release; offer cleanup |

---

## Disk Space Protection

- **Prune to last 5 releases** after successful deploy.
- **Check disk before deploy** — `df -h $SITE_ROOT`; refuse if < 10% free.
- **Monitor inodes** — `df -i $SITE_ROOT`; refuse if < 10% free.

---

## Permission Consistency

- **Deploy as `deploy_user`** (from manifest, default `www-data`).
- **Shared paths owned by `deploy_user`** — `.env`, `storage/`, `public/uploads/`.
- **Releases owned by `deploy_user`** — Created during deploy.
- **Never mix users** — CI and human deploys must use same user.

---

## Client Names Are Never Hardcoded

A skill operates on whichever client the operator names. No script may embed a client
name, service unit name, or path from a specific client.

- Service units come from the manifest: `worker_unit`, `app_unit`.
- Paths come from the manifest: `site_root`, `domain`.
- If a value the skill needs is missing, the skill stops and reports the missing
  manifest field. It does not fall back to a guessed or example name.

## Shared Library

These rules are implemented once, in `conventions/lib/`, and loaded by every script via
`bootstrap.sh`:

| Library | Enforces |
|---------|----------|
| `manifest.sh` | Manifest parsing, required-field validation, no hardcoded client values |
| `output.sh` | The canonical result envelope from `outputs.md` |
| `journal.sh` | The run journal, with secret sanitization |
| `confirm.sh` | The gate table from `approvals.md` |
| `ssh.sh` | `StrictHostKeyChecking=yes`, `BatchMode=yes`, `ForwardAgent=no` |

A script that re-implements any of these is a bug. Skills must source
`conventions/lib/bootstrap.sh` and fail loudly if it is missing.

---

## Missing Dependencies Must Be Visible

A check that did not run is **not** a check that passed. When an optional tool is
absent, the affected probe degrades — and that degradation must be reported, never
omitted.

- Scripts call `agency_require_tools "dig:the DNS propagation check" ...` right after
  `result_init`. It records one `check_skipped: '<tool>' is not installed, so ...`
  entry per missing tool.
- The order matters: `result_init` resets the warning list, so a preflight registered
  before it would be discarded without a trace.
- `manifest_parser_report` reports which TOML parser handled the manifest and warns
  when the `awk` fallback was used, because it is the least exercised path and a
  parse error there is expensive (client name, host, service unit).
- A probe guarded by `command -v <tool> || return 0` must be paired with a
  declaration. Returning success without checking anything is precisely the failure
  mode this rule exists to prevent.

An agent that reads `warnings: []` must be able to conclude that every check ran. If a
tool was missing, the entry has to be in that array — see the `## Prerequisites`
section of each `SKILL.md` for the per-skill list.

---

## Summary: Never Do These

| Never | Instead |
|-------|---------|
| Deploy without explicit confirmation | Pass the exact `--confirm` string from `approvals.md` |
| Prompt the operator with `read` | Take the gate string from `--confirm`; emit `CONFIRMATION_REQUIRED` |
| Guess missing manifest values | STOP and report missing field |
| Hardcode a client name or unit name | Read it from the manifest |
| Deploy a branch or ref | Resolve to a full SHA first |
| Deploy dirty/unpushed ref | Validate clean tree + pushed commit |
| Skip deployment lock | `flock` from plan through health gate |
| Use `ln -sfn` alone for swap | Use `ln -sfn ...tmp && mv -Tf ...tmp ...` |
| Run migrations after swap | Run migrations before swap |
| Auto-rollback after migration | Refuse; report blocking migration |
| Print or interpolate secrets | Read from env/stdin; sanitize before logging |
| Accept host key changes | Stop on mismatch |
| Run without health gate | Poll health_url; auto-rollback on fail |
| Leave orphan releases on failure | Clean up in trap handlers |
| Re-implement `conventions/lib/` | Source `bootstrap.sh` |
| Return success from a probe whose tool is missing | Declare it in `agency_require_tools`; never report an un-run check as a pass |
| Depend on the caller's working directory | Derive paths from `BASH_SOURCE` / `SCRIPT_DIR` |
| Let an agent auto-invoke a mutating skill | `disable-model-invocation: true`; load only when the operator names it |