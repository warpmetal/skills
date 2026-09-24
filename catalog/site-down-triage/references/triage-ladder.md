# Triage Ladder

## Purpose

Ordered diagnostic layers. Stop at the first broken layer. Do not run the rest.

## Stop Rules

1. A layer is **BROKEN** when its pass criteria fail with clear evidence.
2. A layer is **OK** when probes succeed within rate limits.
3. A layer is **SKIPPED** when `--from-layer` / `--stop-after-layer` exclude it, or when a prior local layer failed (remote not collected).
4. After first BROKEN → emit DIAGNOSED and exit the ladder.
5. If all layers OK → INCONCLUSIVE (user may still report slowness).

## Layers

### 0 — Scope

**Goal:** Is it just you, just this site, or the whole server?

**Probes:**
- `curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$HEALTH_URL"`
- For other manifests with the same `host`: curl their `health_url` (lightweight; max 3 siblings)

**Pass:** This client's health returns 200 (or expected success).  
**Broken:** This client fails while siblings on same host succeed → site-scoped.  
**Broken:** Client and siblings fail → host-scoped (continue ladder for cause).  
**Broken:** Only operator network fails intermittently → note in warnings; continue if remote reachable.

### 1 — Reachability

**Probes:**
- Resolve SSH hostname via `ssh -G "$HOST"`
- `nc -vz "$REMOTE_IP" 443` or `nc -vz "$REMOTE_HOST" 443` (timeout 5s)
- Optional: one ping (may be blocked; non-fatal)

**Pass:** TCP 443 accepts connection.  
**Broken:** Connection refused / timed out → provider, firewall, or box off.

### 2 — DNS

**Probes:**
- `dig +short A "$DOMAIN"`
- `dig +short NS "$DOMAIN"`
- Optional: `whois "$DOMAIN"` for expiry (skip if `whois` missing)

**Pass:** A record points at expected server IP (from SSH config / known host).  
**Broken:** No A record, wrong A, or domain expired / near-expiry with NXDOMAIN symptoms.

### 3 — TLS

**Probes:**
- `echo | openssl s_client -servername "$DOMAIN" -connect "${REMOTE_HOST}:443" 2>/dev/null`

**Pass:** Certificate valid for `domain`, chain complete, not expired.  
**Broken:** Expired cert, missing intermediate, SNI hits default vhost, handshake fail.

### 4 — Web server

**Probes (remote):**
- `systemctl is-active nginx` / `systemctl status nginx --no-pager -l`
- `nginx -t`
- `ss -lntp | grep -E ':80|:443'`

**Pass:** nginx active; config test OK; 80/443 listening.  
**Broken:** inactive, config error, ports not bound.

### 5 — App runtime

**Probes (remote, stack-aware):**
- Laravel/WordPress: `systemctl is-active php${PHP}-fpm` or `php*-fpm`; pool status / recent journal for `max_children`
- Node: process for app unit or `pgrep -af node` under `site_root`
- Static: skip (OK if web layer OK)

**Pass:** Runtime process active; no max_children / crash storm in recent logs.  
**Broken:** FPM down, max_children, Node process missing.

### 6 — Resources

**Probes (remote):**
- `df -h "$SITE_ROOT"` and `df -h /`
- `df -i "$SITE_ROOT"` and `df -i /`
- `free -m`
- `dmesg 2>/dev/null | grep -i oom | tail -20` (or journalctl equivalent)

**Pass:** Disk and inodes > 10% free; no recent OOM.  
**Broken:** Disk/inode exhaustion or OOM killer events.  
**On disk-full:** Propose reclaimable paths only (see signatures). Never delete.

### 7 — Database

**Probes (remote, read-only):**
- MySQL: `mysql --defaults-file=...` or socket as deploy user when available; prefer `SHOW PROCESSLIST` and `SHOW VARIABLES LIKE 'max_connections'`
- If credentials unavailable: check socket listening + recent DB errors in logs (do not invent passwords)

**Pass:** DB accepts connection; processlist not saturated.  
**Broken:** Cannot connect, max_connections hit, long-running blockers.

### 8 — Logs

**Probes (remote):**
- Tail nginx error log (last 50 lines)
- App log under `$SITE_ROOT/current/storage/logs/` or WP/Node equivalent
- `journalctl --since "$SINCE" -u nginx -u php*-fpm --no-pager | tail -80`

**Pass:** No fatal/stack errors correlating with outage window.  
**Broken:** Clear error signature matching [signatures.md](signatures.md).

### 9 — Recent change

**Probes:**
- Remote: `ls -lt "$SITE_ROOT/releases" | head`, apt history, certbot renew logs, crontab
- Local: latest `~/.local/state/agency/<client>/*-deploy-site.md`

**Pass:** No recent change correlating with failure time.  
**Broken / note:** Deploy, apt, cert renewal, or cron change coincides with incident (often root_cause_note even if another layer was primary).

## Pass/Fail Evidence Format

Each layer records:

```text
LAYER <n> <name>: OK|BROKEN|SKIPPED
EVIDENCE: <one or more lines>
```

First BROKEN wins.