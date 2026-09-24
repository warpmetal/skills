# Systemd Worker Template

## Why systemd Instead of nohup/screen/supervisor

- **Automatic restart on crash** — `Restart=always` turns a segfault into a 5-second blip
- **Proper process lifecycle** — SIGTERM → grace period → SIGKILL (not immediate kill)
- **Log management** — journald or file append, both with rotation support
- **Boot survival** — workers come back after server reboot without intervention
- **Multiple instances** — template units (`@`) allow N workers with one file

## Template Unit File

```ini
# /etc/systemd/system/<client>-worker@.service

[Unit]
Description=<client> queue worker instance %i
After=network.target mysql.service redis.service
Wants=mysql.service redis.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/<client>/current

# PHP / Laravel
ExecStart=/usr/bin/php artisan queue:work \
    --sleep=3 \
    --tries=3 \
    --max-time=3600 \
    --queue=high,default

# Alternative: Node / BullMQ
# ExecStart=/usr/bin/node /var/www/<client>/current/workers/queue.js

Restart=always
RestartSec=5
TimeoutStopSec=90

# Logging — file append (logrotate handles rotation)
StandardOutput=append:/var/log/<client>/worker-%i.log
StandardError=append:/var/log/<client>/worker-%i.log

# Optional: environment file
EnvironmentFile=/var/www/<client>/shared/.env

[Install]
WantedBy=multi-user.target
```

## Key Parameters Explained

### `--max-time=3600`

Queue workers boot the PHP framework once and keep it in memory. Memory leaks in
long-lived PHP processes are common. `--max-time=3600` recycles the process hourly,
bounding the leak to at most 1 hour of accumulation.

The process finishes its current job before exiting. systemd immediately starts a fresh one.

### `TimeoutStopSec=90`

When systemd sends SIGTERM (on stop, restart, or reboot), it waits `TimeoutStopSec`
seconds before sending SIGKILL. 90 seconds gives in-flight jobs time to complete.

If a job takes longer than 90 seconds, it will be killed mid-execution. Increase this
to match your longest expected job duration, or ensure long jobs are idempotent.

### `Restart=always` + `RestartSec=5`

`Restart=always` means restart on any exit (normal or error). `RestartSec=5` adds a
brief delay before restart to prevent tight crash loops from hammering the database.

### `After=mysql.service redis.service`

Workers that start before the database is ready will crash immediately. `After` ensures
systemd waits for dependencies. Add `Wants` to make the dependency soft (don't fail if
the target is absent on this server).

## Enabling N Instances

```bash
# Enable and start 2 worker instances
systemctl enable --now "<client>-worker@"{1,2}

# Check status
systemctl status "<client>-worker@*"

# Or with a loop
for i in $(seq 1 "$WORKER_COUNT"); do
    systemctl enable --now "<client>-worker@$i"
done
```

## High-Priority Queue Separation

For jobs that must not wait behind slow jobs, use separate workers per queue:

```ini
# High priority worker
ExecStart=/usr/bin/php artisan queue:work --queue=critical,high --max-time=3600

# Default worker
ExecStart=/usr/bin/php artisan queue:work --queue=default,low --max-time=3600
```

Create two template units: `<client>-worker-hi@.service` and `<client>-worker@.service`.

## Reload After Deploy

Reloading workers after deploy (to pick up new code):

```bash
# Graceful: signal workers to finish current job and exit
# systemd brings them back on new code
php artisan queue:restart

# This sets a cache key that workers check between jobs
# Workers that are mid-job will finish, then exit
# Requires a functional cache driver (Redis, Memcached, file)
```

Verify they cycled:
```bash
systemctl status "<client>-worker@*"
# Check timestamps — they should show recent restart
```
