# Signature Table

Maps common error strings and symptoms to likely causes and proposed fixes.

Triage matches these against collected evidence (case-insensitive substring unless noted).

| Signature / Symptom | Likely Layer | Diagnosis | Minimal Fix (propose only) | Root Cause Later | Handoff |
|---------------------|--------------|-----------|----------------------------|------------------|---------|
| `pm.max_children` / `server reached pm.max_children` | 5 | php-fpm pool exhausted | Capture pool status; propose reload/restart php-fpm after approval; raise `pm.max_children` or fix slow requests | Capacity or slow PHP/DB | `queue-cron-setup` if workers related |
| `Connection refused` on :443 | 1 | Port closed / host unreachable | Check provider status, firewall, power | Network/provider | none |
| `NXDOMAIN` / empty `dig A` | 2 | DNS not resolving | Fix A/AAAA at registrar; verify NS | Misconfigured DNS | `ssl-dns-fix` |
| `Registrar` / `Expiry Date` past / domain expired | 2 | Domain expired | Renew domain at registrar | Calendar/process failure | `ssl-dns-fix` |
| `certificate has expired` | 3 | TLS cert expired | Propose certbot renew + nginx reload after approval | Renewal timer broken | `ssl-dns-fix` |
| `unable to get local issuer certificate` | 3 | Missing intermediate | Use `fullchain.pem` not `cert.pem` | Wrong nginx ssl_certificate | `ssl-dns-fix` |
| `no peer certificate available` / wrong cert CN | 3 | SNI hitting default vhost | Fix server_name / default_server | Vhost drift | `ssl-dns-fix` |
| `nginx: configuration file test failed` | 4 | Bad nginx config | Propose revert last edit; do not reload until `nginx -t` passes | Unreviewed config change | none |
| `inactive` / `failed` for nginx | 4 | Web server down | Propose `systemctl start nginx` after approval | Crash or OOM | none |
| `No space left on device` | 6 | Disk full | Propose reclaim: `/var/log`, old releases beyond 5, journal vacuum — never auto-delete | Log rotation missing | `server-monitoring` |
| `df -i` 100% / no free inodes | 6 | Inode exhaustion | Propose clear small-file caches, old sessions | Cache/session pileup | `server-monitoring` |
| `Out of memory` / `oom-killer` | 6 | OOM kill | Identify killed process from dmesg; propose capacity or leak fix | Memory leak / undersized VPS | `server-monitoring` |
| `Too many connections` / `max_connections` | 7 | DB connection pool exhausted | Capture PROCESSLIST first; propose kill long queries / raise limit after approval | Connection leak / traffic | none |
| `Table is marked as crashed` | 7 | Crashed MyISAM/InnoDB table | Propose repair offline; do not restart blindly | Disk/corruption | `backup-restore` |
| `SQLSTATE[` / Laravel exception in log | 8 | Application error | Identify stack frame; propose code fix / rollback | Bad deploy | `deploy-site` |
| `502 Bad Gateway` without max_children | 5/4 | Upstream dead | Check php-fpm/Node upstream | Runtime crash | none |
| `504 Gateway Time-out` | 5/7 | Upstream slow | Check slow queries / PHP timeouts | Perf regression | none |
| Recent `releases/` timestamp matches outage | 9 | Bad deploy | Propose `deploy-site` rollback | Missing health gate | `deploy-site` |
| `/var/log/apt/history.log` recent upgrade | 9 | Package change | Correlate with service failure | Unplanned upgrade | none |
| `certbot renew` / letsencrypt recent fail | 9/3 | Cert renewal failed | Hand off TLS diagnosis | Timer/ACME path | `ssl-dns-fix` |
| Mixed content / `ERR_SSL` after HTTPS | 3 | TLS/serving issue | Hand off ssl-dns-fix | Incomplete HTTPS cutover | `ssl-dns-fix` |

## Matching Rules

1. Prefer more specific signatures over generic (`pm.max_children` before bare `502`).
2. Layer number from ladder takes precedence for stop-at-first; signatures refine diagnosis text.
3. Multiple matches → primary diagnosis + extras in `warnings[]`.
4. No match → use layer default diagnosis from evidence summary.
5. Never invent a cause without a matching probe result.

## Disk-Full Reclaim Candidates (propose only)

```text
/var/log/*.log and rotated archives
/var/log/journal (journalctl --vacuum-time=7d) — propose, do not run
$SITE_ROOT/releases/ older than keep-5 policy
$SITE_ROOT/shared/storage/logs/
/tmp old deploy-* artifacts
```

Never include `shared/.env`, live `current`, or databases in reclaim proposals as delete targets.