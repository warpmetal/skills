# Troubleshooting

## Purpose

Common deployment failures, their causes, and resolution procedures.

---

## Deployment Failures

### Lock Acquisition Failure

**Symptom**: `ERROR: Another deployment in progress`

**Cause**: Another deploy holds the flock lock.

**Resolution**:
1. Wait for the in-progress deploy to complete
2. If it's stuck (orphaned process), manually release:
   ```bash
   # Find the process holding the lock
   lsof /tmp/deploy-<client>.lock
   # Kill if orphaned
   kill -9 <pid>
   ```
3. Verify lock is released, then retry

### Dirty Working Tree

**Symptom**: `ERROR: Working tree has uncommitted changes`

**Cause**: Developer has uncommitted changes in the repo.

**Resolution**:
1. Commit or stash changes locally
2. Push to remote
3. Verify clean tree: `git status --porcelain` (must be empty)
4. Retry deploy

### Unpushed Ref

**Symptom**: `ERROR: Target commit not found on remote`

**Cause**: Developer committed locally but hasn't pushed.

**Resolution**:
1. `git push origin <branch>`
2. Verify commit exists: `git ls-remote origin <branch>`
3. Retry deploy

### SSH Connection Failure

**Symptom**: Connection timeout or refused.

**Causes**:
- Server offline
- Firewall blocking
- SSH service down
- Wrong host alias in `~/.ssh/config`

**Resolution**:
1. Verify host exists in SSH config: `ssh -G <host>`
2. Try manual SSH: `ssh <host> 'echo ok'`
3. Check server status with hosting provider
4. Check firewall rules

**Exit code**: 3

### Git Fetch Failure

**Symptom**: `git fetch` returns non-zero.

**Causes**:
- Server unreachable via Git protocol
- Repository doesn't exist
- Authentication failure
- Network issue

**Resolution**:
1. Verify repo URL in manifest
2. Check SSH connectivity to host
3. Verify repo exists on server
4. Check deploy key permissions

**Exit code**: 4

### Dependency Installation Failure

**Symptom**: `composer install` or `npm ci` fails.

**Causes**:
- Network issue (packagist/npm registry unreachable)
- Corrupted lock file
- PHP/Node version mismatch
- Missing extensions

**Resolution**:
1. Check if old release is still serving (it should be)
2. Fix dependency issue in repo
3. Commit and push
4. Retry deploy
5. Orphan release cleaned up automatically

**Exit code**: 6

### Build Failure

**Symptom**: `npm run build` or framework equivalent fails.

**Causes**:
- Compilation error
- Missing assets
- Configuration error
- Environment variable missing in new release

**Resolution**:
1. Old release still serving (isolated failure)
2. Fix build issue locally
3. Commit and push
4. Retry deploy
5. Orphan release cleaned up automatically

**Exit code**: 6

### Migration Failure

**Symptom**: `php artisan migrate --force` fails.

**Causes**:
- Schema conflict (column already exists)
- Foreign key violation
- Timeout on large table
- Collation mismatch
- Missing extension in PHP

**Resolution**:
1. Check migration error message
2. Run `php artisan migrate:status` to see what was applied
3. Manual resolution required if migrations partially applied
4. Previous release available for manual rollback
5. **Auto-rollback is refused**

**Exit code**: 7

### Runtime Reload Failure

**Symptom**: `systemctl reload php8.3-fpm` fails.

**Causes**:
- PHP-FPM not installed
- Config error in pool or service
- Service not found

**Resolution**:
1. Check `systemctl status php8.3-fpm`
2. Check PHP-FPM config: `php-fpm8.3 -t`
3. Try `systemctl restart` instead of reload
4. If restart fails, rollback may be needed

**Exit code**: 8

### Worker Restart Failure

**Symptom**: `systemctl restart acme-worker@1` fails.

**Causes**:
- Systemd unit not installed
- Worker config error
- Port already in use

**Resolution**:
1. Check `systemctl status acme-worker@1`
2. Check worker logs: `journalctl -u acme-worker@1`
3. Fix unit configuration
4. Retry

### Health Check Failure

**Symptom**: Health checks fail after deployment.

**Causes**:
- New code has a bug
- Configuration mismatch (`.env` missing variable)
- Database migration issue
- Cache not warmed
- OpCache serving stale code

**Resolution**:
1. Auto-rollback triggers (if no migrations)
2. Check logs in old release for clues
3. Fix issue locally, commit, push
4. Retry deploy
5. If migrations ran, manual resolution required

**Exit code**: 9

### Rollback Failure

**Symptom**: Rollback cannot restore site to previous state.

**Causes**:
- Previous release directory deleted or corrupted
- Runtime config points to wrong path
- Previous release has incompatible migration state
- Disk full

**Resolution**:
1. Check if previous release directory exists
2. Manually repoint symlink if needed
3. Reload runtime
4. If still failing, manual intervention required

**Exit code**: 10

---

## Disk Exhaustion

**Symptom**: `df -h` shows < 10% free space.

**Resolution**:
1. Identify large files: `du -sh /var/www/acme/releases/* | sort -rh`
2. Prune old releases manually if auto-prune failed
3. Check `shared/storage/` for log files
4. Clear application cache

**Exit code**: 13

### Inode Exhaustion

**Symptom**: `df -i` shows < 10% free inodes.

**Resolution**:
1. Find files with many small files: `find /var/www/acme -xdev -type f | wc -l`
2. Clear cache directories
3. Remove old log files
4. Prune releases

**Exit code**: 13

---

## Permission Drift

**Symptom**: Deploy fails with permission denied.

**Causes**:
- Deployed as different user than expected
- CI deploy used different user than manual deploy
- `rsync` changed ownership

**Resolution**:
1. Check file ownership: `ls -la /var/www/acme/`
2. Ensure all releases owned by `deploy_user`
3. Fix permissions: `chown -R deploy_user:www-data /var/www/acme/`

**Exit code**: 14

---

## OpCache Stale Code

**Symptom**: After deploy, site serves old code despite symlink swap.

**Cause**: PHP opcache caches compiled bytecode. Runtime reload (`systemctl reload`) should clear it.

**Resolution**:
1. Verify `systemctl reload php8.3-fpm` was executed
2. Check `opcache.validate_timestamps` in PHP config
3. If still stale, restart php-fpm: `systemctl restart php8.3-fpm`
4. Clear opcache: `php -r "opcache_get_status() && opcache_reset()"`

**Note**: This is why `deploy-site` requires runtime reload — it's not optional.

---

## Debug Mode

When troubleshooting, check these in order:

```bash
# 1. Is the server reachable?
ssh <host> 'echo ok'

# 2. Is the manifest valid?
cat ~/.config/agency/clients/<client>.toml

# 3. What's the current release?
ssh <host> 'ls -la /var/www/<client>/current'

# 4. What's the disk usage?
ssh <host> 'df -h /var/www/<client>'

# 5. Is the runtime running?
ssh <host> 'systemctl status php8.3-fpm nginx'

# 6. What's in the journal?
cat ~/.local/state/agency/<client>/$(date -u +%Y%m%d)-deploy-site.md

# 7. Check application logs
ssh <host> 'tail -50 /var/www/<client>/current/storage/logs/laravel.log'
```