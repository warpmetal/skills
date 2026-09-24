# Rate Limiting

## Purpose

Triage must not become a self-DoS against an already struggling server.

## Budgets

| Phase | Budget |
|-------|--------|
| Local layers 0–3 | Max 1 curl per health_url; max 3 sibling curls; sleep 200–500ms between probes |
| Reachability | One `nc` with 5s timeout; at most one ping |
| DNS | One A query, one NS query; whois optional and skipped if missing |
| TLS | One `openssl s_client` connect |
| Remote layers 4–9 | **Exactly one SSH session** via `collect-remote.sh` |
| Log tails | Last 50–80 lines only; no `tail -f` |
| DB | One PROCESSLIST; no repeated polling loops |

## SSH Batching

```bash
ssh -o StrictHostKeyChecking=yes -o ConnectTimeout=10 \
  "${DEPLOY_USER}@${HOST}" 'bash -s' < collect-remote.sh
```

Pass context as environment variables prefixed on the remote command when needed:

```bash
ssh ... "CLIENT='$CLIENT' SITE_ROOT='$SITE_ROOT' STACK='$STACK' SINCE='$SINCE' bash -s" < collect-remote.sh
```

Do not open a new SSH connection per layer.

## What Not To Run Under Load

- Continuous curl loops against `health_url`
- `find /` or unbounded directory walks
- Full table scans / `mysqldump`
- `strace` on production workers
- Concurrent triage from multiple operators against the same host (coordinate via journal)

## Backoff

If a probe times out:

1. Record timeout as evidence
2. Do not retry more than once for that probe
3. Prefer marking layer BROKEN or SKIPPED with explanation over aggressive retries

## Sibling Scope Cap

When checking sibling sites on the same host (layer 0), cap at **3** siblings to avoid fan-out.