# Log Rotation for Queue Workers

## Why This Matters

Queue workers log every job. On a busy site, worker logs can grow at hundreds of MB
per day. An unrotated `/var/log/<client>/worker-1.log` filling `/var` is a direct path
to `site-down-triage` — disk full → php-fpm can't write → 502.

Wire logrotate during queue setup, not after a disk alert.

## logrotate Configuration

```
# /etc/logrotate.d/<client>-workers
/var/log/<client>/worker-*.log
/var/log/<client>/scheduler.log
/var/log/<client>/cleanup.log
{
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        # Signal workers to reopen log files
        # For systemd services, USR1 or SIGHUP triggers log reopen
        # (only if your app handles it; otherwise use copytruncate)
        systemctl kill --signal=USR1 "<client>-worker@*.service" 2>/dev/null || true
    endscript
}
```

## Configuration Options Explained

| Option | Purpose |
|--------|---------|
| `daily` | Rotate every day |
| `rotate 14` | Keep 14 rotated files (2 weeks) |
| `compress` | Gzip rotated files (saves ~90% space) |
| `delaycompress` | Compress the previous rotation, not the current (avoids compressing a file still being written) |
| `missingok` | No error if log file doesn't exist |
| `notifempty` | Skip rotation if file is empty |
| `create 0640 www-data www-data` | Create new log file with correct ownership |
| `sharedscripts` | Run postrotate once for all matched files |

## If the App Doesn't Handle USR1

Some applications don't reopen log files on USR1. In that case, use `copytruncate`:

```
/var/log/<client>/worker-*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate   # copy the log, then truncate original in place
}
```

**Trade-off:** `copytruncate` can lose a few log lines written between the copy and
truncate. For audit-critical logs, prefer the USR1 approach.

## Testing the Configuration

```bash
# Dry-run (shows what would happen)
logrotate -d /etc/logrotate.d/<client>-workers

# Force immediate rotation (for testing)
logrotate -f /etc/logrotate.d/<client>-workers

# Verify compressed files exist
ls -lh /var/log/<client>/
```

## Setting Up the Log Directory

```bash
mkdir -p /var/log/<client>
chown www-data:www-data /var/log/<client>
chmod 755 /var/log/<client>

# Systemd unit writes to this directory
# StandardOutput=append:/var/log/<client>/worker-%i.log
```

## Checking Current Log Sizes

```bash
du -sh /var/log/<client>/
ls -lh /var/log/<client>/

# Total size of all client logs
du -sh /var/log/<client>/ /var/log/nginx/ /var/log/mysql/
```

Checking log sizes is part of the `inspect-queues.sh` read-only output.
