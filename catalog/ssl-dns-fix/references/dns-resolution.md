# DNS Resolution Diagnosis

## The Three Probes

Always run in this order. Each gives different information.

### 1. Local resolver (what browsers see)

```bash
dig +short A "$DOMAIN"
dig +short AAAA "$DOMAIN"
```

This hits your ISP/corporate resolver. It may have a cached answer from before a change.
Compare the TTL in the response to how long ago the change was made.

```bash
dig A "$DOMAIN"
# Look for: ANSWER SECTION, TTL value
```

### 2. Authoritative nameserver (what the zone actually says)

```bash
# Find the authoritative NS
NS=$(dig +short NS "$DOMAIN" | head -1)
echo "Authoritative NS: $NS"

# Query it directly (bypasses all caches)
dig +short A "$DOMAIN" "@$NS"
```

If local and authoritative differ → the change is propagating (wait for old TTL to expire).
If authoritative is wrong → the zone record itself is wrong.

### 3. Third-party resolver (what the world sees)

```bash
dig +short A "$DOMAIN" @8.8.8.8    # Google
dig +short A "$DOMAIN" @1.1.1.1    # Cloudflare
```

### Checking TTL

The TTL in the DNS response tells you the maximum propagation delay:

```bash
dig A "$DOMAIN" | grep -A2 "ANSWER SECTION"
# Output: acme.com. 3600 IN A 1.2.3.4
#                   ^^^^--- TTL in seconds
```

If the old TTL was 86400 (24h) and you just changed the record, traffic will split for
up to 24h. This is why TTL lowering 24–48h before cutover is mandatory.

## Domain Expiry Check

```bash
whois "$DOMAIN" | grep -iE "expir|renew|paid"
```

**Expired domain** is more common than anyone admits. Check this before anything else
if the domain is completely unreachable.

## Diagnosing "DNS Change Hasn't Propagated"

```
1. Confirm authoritative NS has the new record.
2. Check the OLD TTL (before the change) — that's the propagation window.
3. If old TTL was long (3600, 86400), wait. There is no way to speed it up.
4. Tell the client to flush their local cache:
   - macOS: sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
   - Windows: ipconfig /flushdns
   - Chrome: chrome://net-internals/#dns
```

## Common Failure Patterns

| Symptom | Likely Cause |
|---------|-------------|
| dig returns nothing | Domain doesn't exist or has no A record |
| dig returns old IP | Propagation in progress; check TTL |
| Authoritative returns correct, local doesn't | Cache; wait for TTL |
| SERVFAIL | NS servers unreachable or misconfigured |
| NXDOMAIN | Domain expired, or record deleted |
| Correct IP but wrong host on HTTPS | Multiple vhosts; TLS issue |
