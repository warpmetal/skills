# Queues & Workers

## Purpose

Queue workers process background jobs (emails, notifications, data processing). This document covers worker lifecycle, restart semantics, and the stale-code bug.

## The Stale-Code Bug

**Problem**: `queue:work` boots the framework once and keeps it in memory. After a deploy, workers continue running the **previous** release's code until explicitly restarted.

```
Deploy creates new release → Atomic swap → Workers still serving old code
                                        ↑
                             "It works on my machine but the job does the old thing"
```

**Solution**: Workers must be restarted **after** the atomic swap, during deployment.

## Worker Restart Sequence

```bash
# AFTER atomic swap, NOT before
systemctl restart acme-worker@1
```

**Why after swap?** If workers restart before swap, they process jobs with old code on old data while new code is already deployed — causing data inconsistency.

**Why after swap?** If workers restart before swap, they process jobs with old code on old data while new code is already deployed — causing data inconsistency.

## Systemd Worker Template

```ini
# /etc/systemd/system/acme-worker@.service
[Unit]
Description=Acme Worker Instance %i
After=network.target php8.3-fpm.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/acme/current
ExecStart=/usr/bin/php artisan queue:work --sleep=3 --tries=3 --max-time=3600
Restart=always
RestartSec=5
TimeoutStopSec=90

[Install]
WantedBy=multi-user.target
```

### Key Parameters

| Parameter | Value | Reason |
|-----------|-------|--------|
| `--sleep=3` | 3 seconds | Poll interval between jobs |
| `--tries=3` | 3 attempts | Retry failed jobs before failing |
| `--max-time=3600` | 1 hour | Recycle process hourly to bound memory leaks |
| `Restart=always` | Always | Crash → immediate restart |
| `RestartSec=5` | 5 seconds | Brief pause before restart |
| `TimeoutStopSec=90` | 90 seconds | Give in-flight jobs time to finish on SIGTERM |

## Worker Restart Command

```bash
# Graceful restart — in-flight jobs finish, then new code starts
systemctl restart acme-worker@1

# Or signal individual workers
php artisan queue:restart  # Workers finish current job and exit
```

The `queue:restart` command writes a restart signal. Workers finish their current job and exit. Systemd brings them back on the new code.

## Deployment Integration

```bash
# In deploy workflow:
# 1. Atomic swap (old release still active)
# 2. Reload runtime (php-fpm picks up new code)
# 3. Restart workers (workers pick up new code)
systemctl restart acme-worker@1
```

**Order matters**: Swap → Runtime reload → Worker restart.

## Node.js Workers (BullMQ)

For Node.js stacks, workers run BullMQ under systemd:

```ini
# /etc/systemd/system/acme-bullmq@.service
[Unit]
Description=Acme BullMQ Worker %i
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/acme/current
ExecStart=/usr/bin/node worker.js --concurrency=10 --timeout=60000
Restart=always
RestartSec=5
TimeoutStopSec=90

[Install]
WantedBy=multi-user.target
```

Key differences from PHP:
- SIGTERM handler must drain in-flight jobs (not drop them)
- Concurrency settings explicit
- No PHP opcache concerns

## Worker Monitoring

Workers should be monitored by `server-monitoring`:

- **Alert on oldest-job age**, not queue depth
  - Queue of 10,000 fast jobs = fine
  - One job stuck for 40 minutes = incident
- **Alert on `failed_jobs` growth**
- **Log rotation on worker logs** (unrotated logs fill `/var`)

## Worker Scaling

Multiple worker instances via systemd template:

```bash
# Start 3 workers
systemctl start acme-worker@1
systemctl start acme-worker@2
systemctl start acme-worker@3
```

All instances share the same queue but process independently.

## Common Worker Issues

| Issue | Cause | Resolution |
|-------|-------|------------|
| Workers running old code | Forgot to restart after deploy | Restart workers after every deploy |
| Jobs timing out | `--max-time` too high or job stuck | Reduce `--max-time`, investigate stuck job |
| Memory growth | `--max-time` not set | Set `--max-time=3600` to recycle |
| Duplicate processing | Worker crash without `Restart=always` | Ensure `Restart=always` in systemd |
| Queue dead | Worker crashed, not restarting | Check systemd status, logs |
| Overlapping runs | `flock` not used for cron jobs | Wrap cron in `flock -n` or `withoutOverlapping` |

## Worker Restart After Rollback

If deployment is rolled back:
1. Rollback repoints `current` symlink
2. Workers must still be restarted (they have old code in memory)
3. `systemctl restart acme-worker@1` after rollback

## Connection to deploy-site

`deploy-site` handles the restart:
- After atomic swap
- After runtime reload
- Before health check

`queue-cron-setup` configures the workers:
- Systemd unit templates
- Cron entries
- Monitoring rules