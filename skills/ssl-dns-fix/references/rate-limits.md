# Let's Encrypt Rate Limits

Rate limits exist to prevent abuse. They are per registered domain (eTLD+1), not per
subdomain. If you burn a limit, you wait. There is no appeal.

## Current Limits (as of 2024)

| Limit | Value | Reset |
|-------|-------|-------|
| Certificates per registered domain | 50/week | Rolling 7 days |
| Duplicate certificate | 5/week | Rolling 7 days |
| Failed validations per domain | 5/hour | 1 hour |
| New orders per account | 300/3 hours | Rolling |
| Accounts per IP | 10/3 hours | Rolling |

**Registered domain** means `acme.com` — all subdomains share the quota.
Issuing for `api.acme.com`, `www.acme.com`, and `acme.com` separately counts as 3.

**Duplicate certificate**: same set of names. If you issue the same cert 5 times in
a week (e.g., by running certbot multiple times after a failure), you hit this limit.

## How to Check if You've Hit a Limit

```bash
# Look for "rateLimited" in the LE logs
grep -i "rate" /var/log/letsencrypt/letsencrypt.log | tail -20

# Check existing certs (they don't count against quota once issued)
certbot certificates

# Check LE's certificate transparency log
# https://crt.sh/?q=%.acme.com — shows all issued certs
```

## What to Do When Rate-Limited

1. **Do not retry.** Every failed attempt on a validation-failed domain counts.
2. Check the exact error in `/var/log/letsencrypt/letsencrypt.log`.
3. Fix the underlying cause (challenge path, DNS, CAA record).
4. Use `--dry-run` to test the fix WITHOUT consuming quota.
5. Wait for the limit window to reset (check timestamp of first failed attempt).
6. If urgent: check if a cert from a different CA (ZeroSSL, Buypass) can be used temporarily.

## Dry-Run is Quota-Free

```bash
# This uses LE staging — no quota consumed
certbot renew --dry-run --cert-name "$DOMAIN"
certbot certonly --nginx -d "$DOMAIN" --dry-run
```

Always dry-run until you're confident the fix works.

## Combining Domains to Save Quota

Instead of separate certs for `www` and root domain, use a SAN cert:
```bash
certbot certonly --nginx -d "acme.com" -d "www.acme.com" --dry-run
```
This counts as ONE certificate against the limit.

## The 50 New Certs / Week Limit

This catches agencies that script certbot carelessly. If your setup process creates a
new cert every time it runs (instead of reusing the existing one), you'll burn through
the limit in days on a busy client roster.

Check before issuing:
```bash
certbot certificates | grep -A2 "$DOMAIN"
# If cert exists and has > 30 days remaining, do NOT reissue — just use it
```
