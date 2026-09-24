# Monitoring Queues

## What to Monitor

### Wrong: Queue Depth

Queue depth (number of pending jobs) is a misleading metric. A queue with 10,000 fast
jobs processing at 5,000/minute is fine. A queue with 1 job that's been stuck for 40
minutes is an incident.

Alert on **oldest-job age**, not queue depth.

### Right: Oldest-Job Age

```sql
-- Laravel database queue driver
-- Oldest pending job in seconds
SELECT UNIX_TIMESTAMP(NOW()) - MIN(available_at) AS oldest_job_age
FROM jobs
WHERE queue = 'default';
```

| Threshold | Action |
|-----------|--------|
| > 5 minutes | Digest alert (slower than expected but not critical) |
| > 30 minutes | Page immediately (something is stuck) |

### Failed Jobs Count

```sql
-- Count failed jobs in the last hour
SELECT COUNT(*) FROM failed_jobs
WHERE failed_at > DATE_SUB(NOW(), INTERVAL 1 HOUR);
```

Alert if count grows. Alert threshold depends on the app:
- A site that normally has 0 failed jobs per hour: alert at 1
- A site that normally retries 5 jobs/hour: alert at 10 (3× baseline)

### Dead-Man's Switch Per Critical Job

For jobs that **must** run (invoices, reminders, reports):

```php
// In the job's handle() method:
Http::get(config('services.healthchecks.invoice_url'));
```

Or in the scheduled task:
```php
$schedule->job(new ProcessInvoices)
    ->daily()
    ->pingOnSuccess(config('services.healthchecks.invoice_url'));
```

Configure a healthchecks.io check with the job's schedule and a short grace period.

## Alerting Implementation

### Using Netdata

Netdata has a MySQL module that can alert on query results:

```yaml
# /etc/netdata/python.d/mysql.conf
# Custom alarm in /etc/netdata/health.d/mysql_queue.conf
alarm: oldest_queue_job
on: mysql.queries
lookup: max -1m unaligned
every: 1m
warn: $this > 300   # 5 minutes
crit: $this > 1800  # 30 minutes
```

### Using a Monitoring Script

If Netdata is not in use, a cron-based approach:

```bash
#!/bin/bash
# /usr/local/bin/check-queue-acme.sh
OLDEST=$(mysql -sN acme -e \
    "SELECT COALESCE(UNIX_TIMESTAMP(NOW()) - MIN(available_at), 0)
     FROM jobs WHERE queue='default';")

if [ "$OLDEST" -gt 1800 ]; then
    curl -fsS "https://alerts.example.com/queue-stuck?client=acme&age=${OLDEST}"
fi
```

## Checking Failed Jobs

Set up a digest report:

```bash
# In run every morning via cron
FAILED_LAST_24H=$(mysql -sN acme -e \
    "SELECT COUNT(*) FROM failed_jobs
     WHERE failed_at > DATE_SUB(NOW(), INTERVAL 24 HOUR);")

echo "Failed jobs last 24h: $FAILED_LAST_24H" >> /var/log/acme/queue-digest.log
```

For Laravel, `artisan queue:failed` gives a formatted list.

## Log Rotation

See `log-rotation.md`. Unrotated worker logs fill `/var` over time, which triggers a
`site-down-triage` incident. Wire logrotate during queue setup, not after.
