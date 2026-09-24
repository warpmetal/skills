# Netdata Setup

## What Is Netdata

Per-host real-time monitoring agent. Installed on each client server, provides:
- CPU, memory, disk, network metrics at 1s resolution
- Per-process monitoring
- Built-in alarm system
- Integrates with external notification channels

Netdata is the complement to Uptime Kuma: Kuma does external checks (is the site up?),
Netdata does internal host detail (why is it slow?).

## Installation (Per Client Host)

```bash
# Official install script
wget -O /tmp/netdata-kickstart.sh https://my-netdata.io/kickstart.sh
sh /tmp/netdata-kickstart.sh --non-interactive --stable-channel

# Verify
systemctl status netdata
curl -s http://localhost:19999/api/v1/info | jq '.version'
```

Netdata listens on `localhost:19999` by default. Do not expose it publicly.
Access via SSH tunnel when needed:
```bash
ssh -L 19999:localhost:19999 "$CLIENT_HOST"
# Then open http://localhost:19999 in browser
```

## Key Alarms to Enable

Netdata ships with hundreds of alarms. For the agency profile, focus on:

### Disk Usage

```yaml
# /etc/netdata/health.d/disk.conf (customize thresholds)
template: disk_space_usage
on: disk.space
units: %
every: 1m
warn: $this > 80
crit: $this > 90
```

### Inodes

```yaml
template: disk_inode_usage
on: disk.inodes
units: %
every: 1m
warn: $this > 80
crit: $this > 90
```

### OOM Killer Events

```yaml
alarm: oom_kill
on: mem.oom_kill
every: 1m
warn: $this > 0
```

### Service Liveness

```yaml
# Check that nginx is running
alarm: nginx_last_collected
on: nginx.requests
every: 1m
crit: $last_collected_t > 300
```

Equivalent alarms for php-fpm, mysql, workers.

## Notification Integration

Configure Netdata to send to Slack:

```bash
# /etc/netdata/health_alarm_notify.conf
SEND_SLACK="YES"
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
DEFAULT_RECIPIENT_SLACK="#acme-alerts"
```

Or to PagerDuty:
```bash
SEND_PAGERDUTY="YES"
PAGERDUTY_SERVICE_KEY="..."
```

## Silence Noisy Alarms

Disable alarms that are irrelevant or produce false positives:

```bash
# /etc/netdata/health.d/local.conf — overrides
alarm: cpu_iowait
on: cpu.cpu
lookup: average -1m unaligned
warn: 0  # disable — alert on slow site, not CPU

alarm: load_average_15
on: system.load
lookup: average -1m unaligned
warn: 0  # disable — alert on symptoms, not load
```

See `anti-goals.md` for rationale.

## Disk Space Projection Alert

One of the most valuable alerts: how long until this disk is full?

```yaml
alarm: disk_fill_projection
on: disk.space
every: 1h
warn: $this > 70 AND predict_linear($this, 48*3600) > 90
```

This fires 48 hours before the disk is projected full at the current fill rate —
time to act before it becomes an incident.
