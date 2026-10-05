# Handoff Signals

## Purpose

An alert is only useful if it leads to action. Each alert from `server-monitoring`
should hand off to the skill that can resolve it, with the signal evidence already
attached.

## Handoff Table

| Alert | Skill | Suggested invocation |
|-------|-------|---------------------|
| Site down / 502 / timeout | `site-down-triage` | `site-down-triage --client <name>` |
| HTTP 5xx rate elevated | `site-down-triage` | `site-down-triage --client <name> --from-layer 4` |
| Cert expiry < 14 days | `ssl-dns-fix` | `ssl-dns-fix --client <name> --issue-only` |
| Cert expiry < 7 days | `ssl-dns-fix` | `ssl-dns-fix --client <name> --issue-only` (URGENT) |
| Domain expiry < 30 days | `ssl-dns-fix` | `ssl-dns-fix --client <name> --dns-only` |
| Backup dead-man: 1 missed | `backup-restore` | `backup-restore --client <name> --action status` |
| Backup dead-man: 2 missed | `backup-restore` | `backup-restore --client <name> --action status` (PAGE) |
| Queue oldest-job > 5 min | `queue-cron-setup` | `queue-cron-setup --client <name> --action verify` |
| Queue oldest-job > 30 min | `queue-cron-setup` | `queue-cron-setup --client <name> --action verify` (PAGE) |
| Disk > 80% | `site-down-triage` | `site-down-triage --client <name> --from-layer 6` |
| Disk > 90% | `site-down-triage` | `site-down-triage --client <name> --from-layer 6` (PAGE) |
| OOM kill event | `site-down-triage` | `site-down-triage --client <name> --from-layer 6` |
| Service down (nginx/php-fpm) | `site-down-triage` | `site-down-triage --client <name> --from-layer 4` |

## Alert Message Template

Include the handoff command in every alert notification:

```
🔴 [PAGE] acme.com — Site Down
Health check failing (3 consecutive)
Server: acme-prod
Time: 2026-09-21 14:32 UTC

▶ site-down-triage --client acme
```

```
🟡 [DIGEST] acme.com — Cert Expiry in 13 days
Certificate: acme.com (expires 2026-10-04)
Server: acme-prod

▶ ssl-dns-fix --client acme --issue-only
```

## Configuring Handoffs in Alert Messages

### Uptime Kuma Custom Message

In the notification template:
```
{{STATUS}} {{NAME}}
Monitor: {{NAME}}
Time: {{TIME}}
URL: {{URL}}

Action: site-down-triage --client {{TAGS}}
```

Tag each monitor with the client name so `{{TAGS}}` resolves correctly.

### Netdata Alert Body

In `/etc/netdata/health_alarm_notify.conf`:
```bash
# Add to the message body template
custom_sender() {
    local ACTION="$1"
    local MESSAGE="$4"
    local CLIENT_TAG=$(echo "$NETDATA_ALARM_CHART" | grep -o 'client:[^ ]*')
    # Append handoff command
    echo "$MESSAGE\nAction: site-down-triage --client ${CLIENT_TAG#client:}"
}
```

## Closing the Loop

`server-monitoring` closes the loop:
- Domain expiry → `ssl-dns-fix`
- Backup dead-man → `backup-restore`
- Queue age → `queue-cron-setup`
- Everything that pages → `site-down-triage`

This is the design. An alert that doesn't tell the responder what to do is noise.
