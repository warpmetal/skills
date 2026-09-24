# Rollback

## Purpose

Rollback restores a site to a previous known-good release when a deployment fails or introduces issues.

## Rollback Procedure

```bash
# 1. Acquire deployment lock
flock -n /tmp/deploy-<client>.lock

# 2. Identify previous release
ls -1t "$SITE_ROOT/releases/" | head -2
# current points to: <current_release>
# previous (for rollback): <previous_release>

# 3. Verify previous release exists and is valid
if [[ ! -d "$SITE_ROOT/releases/$PREVIOUS_RELEASE" ]]; then
    echo "ERROR: No previous release available for rollback"
    exit 10
fi

# 4. Repoint current symlink
ln -sfn "$SITE_ROOT/releases/$PREVIOUS_RELEASE" "$SITE_ROOT/current.tmp"
mv -Tf "$SITE_ROOT/current.tmp" "$SITE_ROOT/current"

# 5. Reload runtime
systemctl reload php8.3-fpm  # or nginx, or PM2/systemd reload

# 6. Restart queue workers
systemctl restart acme-worker@1

# 7. Health check
curl -sf "$HEALTH_URL" && echo "ROLLBACK_OK" || echo "ROLLBACK_FAILED"
```

## Rollback Conditions

### Auto-Rollback (No Migration)

If the deployment did **not** run migrations:
1. Health check fails → automatically rollback
2. Repoint `current` to previous release
3. Reload runtime and workers
4. Report `ROLLED_BACK`
5. This is a 2-second operation

### Manual Rollback Required (Migration Ran)

If the deployment **did** run migrations:
1. **Auto-rollback is REFUSED**
2. Report: "Migrations were executed: [list]. Manual resolution required."
3. Previous release remains available but may not match current database schema
4. Operator must manually align database and code
5. Report `FAILED` (not `ROLLED_BACK`)

```
Migration ran → Health check fails → NO AUTO ROLLBACK
                                     ↓
                        "Migrations executed: 2026_09_15_add_featured
                        Manual resolution required"
                                     ↓
                        Previous release preserved for manual action
```

## Rollback Safety Rules

| Rule | Enforcement |
|------|-------------|
| Previous release must exist | Verify directory exists before rollback |
| Previous release must be valid | Check it has `vendor/` or `node_modules/` |
| Lock must be acquired | `flock` before any rollback |
| Runtime must be reloaded | After symlink repoint |
| Workers must be restarted | After symlink repoint |
| Health check must pass | After rollback, verify |
| Migration blocking | If migrations ran, refuse auto-rollback |

## Rollback States

```
ROLLED_BACK — Rollback completed successfully
FAILED — Rollback failed or was blocked by migration
```

## Rollback After Health Check Failure

```
DEPLOYING → Health check fails → Determine state
    → Was swap completed?
        → YES: Rollback (if no migrations) OR FAILED (if migrations)
        → NO: Clean up orphan release, old current untouched → STOPPED
```

## Rollback During Interrupted Deployment

If the connection drops mid-deploy:
1. Deployment lock remains held
2. Orphan release directory exists (partial)
3. `current` symlink unchanged (old release still serving)
4. On reconnect:
   - Acquire lock
   - Detect orphan release
   - Clean up orphan
   - Report `STOPPED` with evidence

## Rollback Verification

After rollback, verify:
1. `current` symlink points to previous release
2. Runtime reports correct version
3. Health endpoint returns 200
4. Workers running new (old) code

```json
{
  "status": "ROLLED_BACK",
  "previous_release_id": "20260916-100000-bbbbbbb",
  "rollback_release_id": "20260916-100000-bbbbbbb",
  "health_checks": { "status": "healthy" },
  "migrations_were_run": false
}
```

## Rollback Limitations

1. **Database migrations are NOT rolled back.** If migrations ran, rollback only reverts code and release pointer.
2. **Asset builds are not rolled back.** Build artifacts in previous release are as-is.
3. **Cache is not cleared.** `config:cache`, `route:cache`, `view:cache` in previous release may be stale. Manual cache clear may be needed.
4. **Sessions may be invalidated.** PHP sessions are stored in `shared/storage/`. The framework may invalidate sessions on schema change.

## Testing Rollback

### Test Scenario

1. Deploy known-good version
2. Deploy broken version
3. Health check fails
4. Auto-rollback triggers
5. Verify health returns to normal
6. Verify `current` points to previous release

### Expected Outcome

- Site available throughout (old release served)
- `current` symlink points to previous release
- Health check passes after rollback
- Journal contains full rollback record
- No data corruption