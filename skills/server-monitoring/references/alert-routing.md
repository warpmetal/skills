# Alert Routing

## Two Severities Only

**Page** — fires immediately, wakes someone up if needed.
**Digest** — batches into one daily summary. No action required tonight.

A third tier ("warning") always gets ignored. It doesn't exist.

## Routing Rules

| Alert | Severity | Channel |
|-------|----------|---------|
| Site down (3 consecutive fails) | Page | `page_channel` |
| OOM kill event | Page | `page_channel` |
| Disk > 90% | Page | `page_channel` |
| Inodes > 90% | Page | `page_channel` |
| Service down (nginx, php-fpm, mysql) | Page | `page_channel` |
| Cert expiry < 7 days | Page | `page_channel` |
| Domain expiry < 14 days | Page | `page_channel` |
| Queue oldest-job > 30 min | Page | `page_channel` |
| Backup dead-man: 2 missed | Page | `page_channel` |
| Disk > 80% | Digest | `digest_channel` |
| Cert expiry < 14 days | Digest | `digest_channel` |
| Domain expiry < 30 days | Digest | `digest_channel` |
| Queue oldest-job > 5 min | Digest | `digest_channel` |
| Backup dead-man: 1 missed | Digest | `digest_channel` |
| HTTP 5xx rate above threshold | Page | `page_channel` |

## Channels

Configured in client manifest:
```toml
alert_to         = "slack:#acme-alerts"   # backward compat
[monitoring]
page_channel   = "slack:#acme-alerts"
digest_channel = "slack:#acme-digest"
```

Supported channel prefixes: `slack:`, `telegram:`, `pagerduty:`, `email:`.

## Flap Suppression

An alert that fires, resolves, fires, resolves repeatedly in a short window is a flap.
Flaps generate noise and train people to ignore alerts.

Configure in Uptime Kuma:
- **Min consecutive failures before alerting**: 2–3 (already tuned via maxretries)
- **Recovery alert**: enabled (so you know when it recovers)
- **Heartbeat interval**: 60s default

In Netdata:
```yaml
# Require condition true for 2 consecutive checks before alerting
warn: $this > 80 for 2m
```

## Quiet Hours

For digest-tier alerts, configure a quiet window (e.g., 10pm–7am):
- Uptime Kuma: Settings → Notifications → [channel] → Quiet Hours
- Netdata: `health_alarm_notify.conf` time conditions

Page-tier alerts bypass quiet hours.

## Alert Message Format

Every alert should include:
```
[CLIENT] [SIGNAL] — [VALUE]
Site: acme.com
Server: acme-prod
Time: 2026-09-21 14:32 UTC
Action: site-down-triage --client acme
```

The `Action` line is what makes the alert actionable — the recipient knows exactly
what skill to run, with which args.

## Recovery Notifications

Always send recovery notifications for page-tier alerts.
Not knowing whether an incident is resolved is worse than not alerting at all.

Configure Uptime Kuma to send on both DOWN and UP transitions.
