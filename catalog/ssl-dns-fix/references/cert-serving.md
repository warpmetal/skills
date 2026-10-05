# Certificate Serving Failures

## What Can Go Wrong After Issuance

A cert can be issued successfully and still not serve correctly. These are separate problems.

## Diagnosing Serving

```bash
# What cert is nginx actually presenting for this SNI?
openssl s_client -connect "$HOST:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName

# What does nginx think it's serving?
ssh "$HOST" "nginx -T 2>/dev/null | grep -A3 'server_name.*$DOMAIN'"
ssh "$HOST" "nginx -T 2>/dev/null | grep ssl_certificate"

# Is the cert on disk the renewed one?
ssh "$HOST" "openssl x509 -noout -dates -in /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
```

## Common Causes

### 1. `cert.pem` Instead of `fullchain.pem`

```nginx
# WRONG — missing intermediate cert
ssl_certificate /etc/letsencrypt/live/acme.com/cert.pem;

# CORRECT
ssl_certificate /etc/letsencrypt/live/acme.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/acme.com/privkey.pem;
```

`cert.pem` works in most browsers (which have the intermediate cached) but fails
in curl, mobile apps, API clients, and newer browsers.

### 2. `default_server` Catching Wrong SNI

If multiple vhosts exist and a client connects with a domain that doesn't match any
`server_name`, nginx falls through to the `default_server`. If the default has a
different cert, the wrong cert is presented.

```nginx
# Check which vhost is default_server
nginx -T | grep default_server

# Fix: ensure the correct vhost is default_server, or add a catch-all vhost
# that returns 444 for unmatched SNI
server {
    listen 443 ssl default_server;
    ssl_certificate /etc/ssl/certs/ssl-cert-snakeoil.pem;
    ssl_certificate_key /etc/ssl/private/ssl-cert-snakeoil.key;
    return 444;
}
```

### 3. Renewed Cert on Disk, nginx Not Reloaded

Certbot renews the cert files but nginx keeps the old ones in memory until reloaded.

```bash
# Check if reload hook is configured
cat /etc/letsencrypt/renewal/acme.com.conf | grep deploy_hook
ls /etc/letsencrypt/renewal-hooks/deploy/

# Manual reload (safe, zero downtime)
systemctl reload nginx

# Add reload hook if missing
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

### 4. Cert Issued for Wrong Domain

The cert's SAN must include the domain being served. If the domain was added to the
vhost after the cert was issued:

```bash
openssl s_client -connect "$HOST:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -ext subjectAltName
# Should list: DNS:acme.com, DNS:www.acme.com

# If missing, expand the cert
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --expand --dry-run
```

## After Any Nginx Fix

Always test before reloading:
```bash
nginx -t  # must succeed before reload
systemctl reload nginx
```

Then verify externally:
```bash
openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -dates
```
