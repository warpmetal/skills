# Alert Thresholds

## Design Principle

Every threshold should answer: "At this level, action is required."
If an alert fires without requiring action, the threshold is wrong.

## Full Threshold Table

| Signal | Warn (digest) | Page (immediate) | Notes |
|--------|---------------|------------------|-------|
| HTTP from outside | 1 failed check | 3 consecutive fails | Kuma: maxretries=2 |
| Disk usage | 80% | 90% | Also: projected full in 48h |
| Disk inodes | 80% | 90% | Often forgotten until too late |
| Memory / swap | Sustained swap-in (>10min) | OOM kill event | |
| Cert expiry | 14 days | 7 days | See rationale below |
| Service liveness | — | nginx/php-fpm/mysql/workers down | No warn — page on first miss |
| HTTP 5xx rate | >5% of requests for 5min | >5% for 15min | Relative to baseline |
| Queue oldest-job age | 5 minutes | 30 minutes | |
| Backup dead-man | 1 missed | 2 consecutive missed | |
| Domain expiry | 30 days | 14 days | Whois check weekly |

## Threshold Rationale

### Cert Expiry: Warn at 14 Days

Let's Encrypt renews at 30 days before expiry. If you're seeing a 14-day warning,
the renewal has **already failed at least once** (the 30-day renewal ran, failed,
and a second attempt at ~20 days also failed).

Alerting at 30 days creates noise — most renewals succeed. Alerting at 14 days
means something is actually broken.

### HTTP: 3 Consecutive Fails Before Page

A single failed HTTP check can be a transient network blip. Three consecutive fails
(180 seconds at 60s interval) is a real outage. Adjust `maxretries` in Uptime Kuma.

### Disk: Warn at 80%, Page at 90%

10% of disk is approximately:
- 20GB on a 200GB disk → plenty of time to act
- 2GB on a 20GB disk → less comfortable but usually enough for a log cleanup

The 48h projection alert is often more actionable than percentage alone.

### OOM: Page on First Event

An OOM kill means the kernel killed a process to reclaim memory. This is never benign.
Page immediately; `site-down-triage` from there.

### Domain Expiry: Warn at 30 Days

30 days is enough time to renew deliberately without panic. Some registrars have
multi-day propagation after renewal.

At 14 days, page — the registrar's grace period for expired domains varies and recovery
can take days.

## Tuning for a Specific Client

| Client characteristic | Adjustment |
|----------------------|------------|
| High-traffic site with known traffic spikes | Raise 5xx warn threshold to 10% |
| Site with large file uploads (disk fills faster) | Add 48h disk projection; lower warn to 70% |
| Client with historically unreliable DNS provider | Add domain expiry page at 21 days |
| Site with long-running queue jobs (> 30 min normal) | Raise queue oldest-job page to 60 min |

Document any threshold overrides in the client manifest:
```toml
[monitoring.overrides]
disk_warn_pct     = 70    # fills faster than usual
queue_page_min    = 60    # jobs normally take up to 45 min
```
