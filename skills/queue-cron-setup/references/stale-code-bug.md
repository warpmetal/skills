# The Stale-Code Bug

## What Happens

`php artisan queue:work` boots the Laravel framework **once** when it starts, then keeps
the application in memory. It processes jobs in a loop without rebooting.

When you deploy new code and swap the `current` symlink, the worker is still running
with the **old code path** loaded in memory. It continues processing jobs using the
previous release until it is restarted.

This causes the "it works on my machine but the job does the old thing" report.
It is the most common queue-related complaint after a deploy.

## How to Detect It

```bash
# Get the PID of the running worker
WORKER_PID=$(systemctl show -p MainPID "acme-worker@1.service" | cut -d= -f2)

# Where is the worker's working directory pointing?
WORKER_CWD=$(readlink -f "/proc/$WORKER_PID/cwd")

# Where does current point?
CURRENT=$(readlink -f "/var/www/acme/current")

if [ "$WORKER_CWD" = "$CURRENT" ]; then
    echo "PASS: worker is on current release"
else
    echo "STALE: worker is on $WORKER_CWD, current is $CURRENT"
fi
```

## The Fix: `artisan queue:restart`

```bash
php artisan queue:restart
```

This writes a timestamp to the cache. Each worker checks this timestamp between jobs.
When it detects the timestamp has changed, it finishes its current job and exits.
systemd's `Restart=always` brings it back fresh on the new code.

**Requirements:**
- The cache driver must be functional (Redis, Memcached, or file — not `null`)
- Workers must be actively running (they check the cache between jobs)
- `TimeoutStopSec` must be long enough for in-flight jobs to finish

## Integration with deploy-site

`deploy-site` handles this automatically. In its workflow:
```
→ ACTIVATE RELEASE ATOMICALLY
→ RELOAD RUNTIME
→ UPDATE WORKERS (artisan queue:restart)
→ HEALTH CHECK
```

`queue-cron-setup` verifies this is wired. If `deploy-site` is not in use, add
`queue:restart` to whatever deploy script is being used.

## Verifying Workers Cycled After Restart

After sending `queue:restart`, workers take up to `TimeoutStopSec` (90s) to cycle.
Verify:

```bash
# Wait for workers to cycle
sleep 10

# Check PID changed (new process = new code)
NEW_PID=$(systemctl show -p MainPID "acme-worker@1.service" | cut -d= -f2)
NEW_CWD=$(readlink -f "/proc/$NEW_PID/cwd")
CURRENT=$(readlink -f "/var/www/acme/current")

[ "$NEW_CWD" = "$CURRENT" ] && echo "PASS: workers on new release" \
                             || echo "FAIL: workers still on old release"
```

## Why `--max-time` Doesn't Fully Solve This

`--max-time=3600` recycles workers hourly, which bounds how long stale code can run
after a deploy (at most 1 hour). But "at most 1 hour of jobs running old code" is
often unacceptable.

`queue:restart` is the correct mechanism. `--max-time` is defense in depth.

## Edge Cases

### Workers Down When Restart Signal is Sent

If workers are not running when `queue:restart` is called, the restart signal is stored
in the cache. When workers start again, they immediately check the cache, see the stale
signal, and... restart again (net effect: they're already on new code). Not a problem.

### Cache is Down

If the cache driver is unavailable, `queue:restart` silently does nothing. Workers
continue on old code. Ensure cache is functional before deploying.

```bash
php artisan cache:get queue:restart  # should return a timestamp after queue:restart
```
