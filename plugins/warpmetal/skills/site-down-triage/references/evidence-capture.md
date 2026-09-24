# Evidence Capture

## Purpose

Restarting before capturing evidence destroys the chance to learn why the incident happened.

## Capture Before Any Restart Proposal

| If you suspect… | Capture first |
|-----------------|---------------|
| Database saturation | `SHOW PROCESSLIST`, `SHOW STATUS LIKE 'Threads_%'`, `max_connections` |
| php-fpm 502 | `systemctl status php*-fpm`, journal excerpt with `max_children`, pool config path |
| Disk full | `df -h`, `df -i`, top consumers via `du -sh` on known paths only (`/var/log`, site logs, releases) |
| OOM | `dmesg` / journal OOM lines, `free -m` |
| Bad deploy | `readlink -f current`, recent `releases/` names, local deploy journal |
| TLS | `openssl s_client` summary, `certbot certificates` if present |
| nginx | `nginx -t`, `systemctl status nginx`, error log tail |

## Read-Only Capture Rules

1. Prefer status/list/show over mutate.
2. Truncate output (last N lines).
3. Sanitize secrets before journal write.
4. Store evidence in the run journal and in JSON `evidence[]`.
5. Only **after** evidence is recorded may the report *propose* a restart — and never execute it in this skill.

## Anti-Patterns

| Anti-pattern | Why it fails |
|--------------|--------------|
| Restart MySQL then check PROCESSLIST | Evidence gone; incident repeats |
| `rm` logs to free disk during triage | Destroys root-cause data |
| Reload nginx before saving `nginx -t` output | Config error lost |
| Multiple operators restarting “to see if it helps” | Masks race conditions |

## Minimal Evidence Packet

Every DIAGNOSED run should include at least:

1. Layer number and name
2. One primary probe result
3. One supporting log or status excerpt (sanitized)
4. Timestamp UTC
5. Whether remote collection ran or was skipped

## Proposal Language

Use:

```text
PROPOSED (not executed): systemctl restart php8.3-fpm
Prerequisite: evidence packet captured in journal at …
Approval: required via human / appropriate skill
```

Never:

```text
Restarting php-fpm now…
```