# Certificate Issuance Failures

## Let's Encrypt Flow (HTTP-01)

```
ACME client → LE: "I want a cert for acme.com"
LE → HTTP GET http://acme.com/.well-known/acme-challenge/<token>
Server returns the token → LE issues cert
```

Any failure in step 2 or 3 causes issuance to fail.

## Diagnosing Issuance

```bash
# What certs exist and when they expire
certbot certificates

# Timer status (systemd)
systemctl status certbot.timer
systemctl status snap.certbot.renew.timer  # snap installs

# Recent failures
sudo tail -80 /var/log/letsencrypt/letsencrypt.log

# Test the challenge endpoint manually
curl -sI "http://$DOMAIN/.well-known/acme-challenge/test"
# Expect: 404 (path doesn't exist yet) — NOT a redirect to HTTPS, NOT a 403
```

## Failure Causes (Frequency Order)

### 1. `.well-known/acme-challenge` blocked

**Catch-all HTTP→HTTPS redirect:**
```nginx
# WRONG: this redirects the challenge
server {
    listen 80;
    return 301 https://$host$request_uri;
}

# CORRECT: let the challenge through
server {
    listen 80;
    server_name acme.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/acme/current/public;
        default_type "text/plain";
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

**Framework router swallowing the path** (Laravel, WordPress):
Same fix — add `location ^~ /.well-known/` before the catch-all `try_files`.

**WAF or Cloudflare blocking:** Check if Cloudflare is in front. If so, either pause
Cloudflare proxying or use DNS-01 instead.

### 2. Webroot vs nginx plugin mismatch

If someone changed the vhost webroot but certbot was installed with `--nginx`, certbot
may be looking in the wrong place.

```bash
certbot certificates  # shows configured domains and plugin
# Re-run with correct plugin:
certbot --nginx -d "$DOMAIN" --dry-run
```

### 3. CAA Record

```bash
dig CAA "$DOMAIN"
# If a CAA record exists, it must include letsencrypt.org
# acme.com. 300 IN CAA 0 issue "letsencrypt.org"
```

If the CAA names only another CA, LE cannot issue. Add or update the CAA record.

### 4. Rate Limits — Read Before Retrying

See `rate-limits.md`. **Do not retry after a limit is hit.**

### 5. Wildcards and Internal Hosts

HTTP-01 cannot validate `*.acme.com` or `internal.acme.com` (not publicly reachable).
Must use DNS-01:

```bash
# Requires DNS provider credential
certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d "*.acme.com" -d "acme.com"
```

## Always Dry-Run First

```bash
# ALWAYS run this first
certbot renew --dry-run --cert-name "$DOMAIN"

# Only proceed to real run if dry-run succeeds
certbot renew --cert-name "$DOMAIN"
systemctl reload nginx
```

The dry-run uses LE's staging environment. It does not consume rate limit quota.
