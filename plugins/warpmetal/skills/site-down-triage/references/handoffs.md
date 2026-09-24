# Handoffs

## Purpose

`site-down-triage` diagnoses and proposes. Other skills execute specialized fixes after approval.

## Layer → Skill Map

| Layer | When to hand off | Next skill | Signal to attach |
|-------|------------------|------------|------------------|
| 2 DNS / domain expiry | Resolution or registrar issues | `ssl-dns-fix` | domain, dig output, expiry |
| 3 TLS | Cert, chain, SNI, ACME | `ssl-dns-fix` | openssl summary, cert paths |
| 5/9 Bad deploy | Recent release correlates with outage | `deploy-site` (rollback) | release ids, health_url |
| 6 Disk / monitoring gap | Recurring resource pages | `server-monitoring` | df/inode/OOM evidence |
| 6/7 Data loss risk | Corruption or need restore proof | `backup-restore` | DB error, table names |
| 5 Workers / stale jobs | Queue backlog or stale workers | `queue-cron-setup` | worker unit status |
| 0–1 Provider outage | Entire host unreachable | none (provider ticket) | reachability evidence |
| 4 nginx config | Bad vhost edit | none (manual / future skill) | `nginx -t` output |
| 8 App bug | Code defect without bad deploy signal | none or `deploy-site` for rollback if release known | stack trace |

## Handoff JSON Field

```json
"handoff": "ssl-dns-fix"
```

Allowed values: `ssl-dns-fix`, `deploy-site`, `backup-restore`, `queue-cron-setup`, `server-monitoring`, `none`.

## Rules

1. Triage never invokes another skill automatically.
2. Report names the handoff and attaches evidence; operator decides.
3. Prefer one primary handoff; extra suggestions go in `warnings[]`.
4. If diagnosis is provider-level reachability, `handoff` is `none`.

## Example

```text
DIAGNOSED layer 3 TLS — certificate has expired
handoff: ssl-dns-fix
proposed_fix: Run ssl-dns-fix dry-run renew; confirm; reload nginx after approval
root_cause_note: Renewal timer failed twice; monitoring should page at 14 days
```