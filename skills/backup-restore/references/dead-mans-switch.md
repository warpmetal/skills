# Dead-Man's Switch for Backups

## The Problem

A cron job that silently stops firing sends no failure email.
The most common way people discover their backups died: four months later when
they need one.

A dead-man's switch inverts the alert: instead of alerting on failure, the system
alerts on *absence of a success signal*. If the backup runs, it pings a URL.
If the URL isn't pinged within the expected window, the monitoring service alerts.

## How It Works

```
run-backup.sh
  → backup runs successfully
  → curl "https://hc-ping.com/<uuid>"   ← success ping
  → monitoring service receives ping, resets countdown
  
If ping not received within (period + grace):
  → monitoring service sends alert
```

## Recommended Services

| Service | Free tier | Notes |
|---------|-----------|-------|
| healthchecks.io | 20 checks | Self-hostable; good UI |
| Better Uptime | 5 monitors free | Integrates with Slack/PagerDuty |
| Cronitor | 5 monitors | Has schedule-aware alerting |
| UptimeRobot | — | HTTP monitors but not cron-native |

healthchecks.io is recommended for this use case. Simple, reliable, free tier covers
most small agency needs.

## Setup (healthchecks.io)

1. Create a check with:
   - Schedule: `0 3 * * *` (matching the backup cron)
   - Grace period: 30 minutes
   - Alert on: first miss

2. Copy the ping URL: `https://hc-ping.com/<uuid>`

3. Add to `run-backup.sh` at the end (after successful backup + prune):
   ```bash
   curl -fsS --retry 3 --retry-delay 5 "$HEALTHCHECK_URL" \
     -d "backup completed: $(date -u)" > /dev/null 2>&1 || true
   ```

4. Add the URL to the client manifest:
   ```toml
   [backup]
   healthcheck = "https://hc-ping.com/uuid-here"
   ```

5. Add to escrow (the healthcheck URL itself is not secret, but document it).

## Alert Routing

Dead-man alerts should route to the same place as other critical alerts.
Configure in the healthcheck service to send to `page_channel` (Slack, PagerDuty, etc.)

## Testing the Dead-Man's Switch

After setup:
```bash
# Simulate a missed backup by not pinging for longer than the grace period
# OR: temporarily change the schedule on the healthcheck service to 1 minute,
# let it fire, verify the alert arrives, then change it back.
```

Always test before declaring the backup setup complete.

## Two Missed = Page

The threshold in `server-monitoring`:
- 1 missed: digest alert (backup might have a transient issue)
- 2 missed: page immediately (backup has been broken for 48+ hours)

Configure accordingly on the healthcheck service:
- Alert on first miss for the digest
- Escalate on second miss for the page channel
