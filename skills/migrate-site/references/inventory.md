# Inventory — What to Collect from Source

A thorough inventory before migration is the difference between a smooth cutover
and a weekend of firefighting. Every problem encountered during migration can be traced
to something that should have been in the inventory but wasn't.

## Runtime

```bash
# PHP
php --version
php -m  # All loaded extensions
php-fpm8.x -v
ls /etc/php/  # All installed versions

# Node
node --version
npm --version
ls ~/.nvm/versions/node/  # If using nvm

# Composer
composer --version

# Python (if any)
python3 --version
pip3 --version
```

Document not just the version but the **extension list**. A missing extension on the
target (e.g., `php8.3-imagick`, `php8.3-redis`) can break the app silently hours after
the migration completes.

## Database

```bash
mysql --version
mysql -e "SELECT VERSION();"
mysql -e "SHOW DATABASES;"
mysql -e "SELECT table_schema, COUNT(*) as tables,
           ROUND(SUM(data_length+index_length)/1024/1024,1) AS size_mb
           FROM information_schema.tables
           GROUP BY table_schema;"
mysql -e "SHOW VARIABLES LIKE 'character_set_database';"
mysql -e "SHOW VARIABLES LIKE 'collation_database';"
mysql -e "SELECT user, host FROM mysql.user WHERE user != '';"
```

For PostgreSQL:
```bash
psql --version
psql -l  # databases + encoding + collation
```

## Disk Footprint

```bash
df -h  # Filesystem usage
df -i  # Inode usage

du -sh "$SITE_ROOT"
du -sh "$SITE_ROOT/shared/public/uploads"
du -sh "$SITE_ROOT/shared/storage"

# Find largest directories
du -sh "$SITE_ROOT"/* | sort -hr | head -20
```

## Cron Jobs

```bash
# Per-user crontabs
crontab -l -u www-data 2>/dev/null
crontab -l -u root 2>/dev/null
crontab -l -u deploy 2>/dev/null

# System cron directories
ls /etc/cron.d/
cat /etc/cron.d/"$CLIENT" 2>/dev/null
```

## Vhosts and Web Server

```bash
# Nginx
nginx -T 2>/dev/null
ls /etc/nginx/sites-enabled/
cat "/etc/nginx/sites-available/$CLIENT"
```

## TLS Certificates

```bash
certbot certificates
ls /etc/letsencrypt/live/
openssl x509 -noout -subject -issuer -dates \
    -in "/etc/letsencrypt/live/$DOMAIN/cert.pem"
```

## DNS Records (Run Locally, Not on Server)

```bash
dig +short A "$DOMAIN"
dig +short AAAA "$DOMAIN"
dig +short MX "$DOMAIN"
dig +short TXT "$DOMAIN"      # SPF, DKIM, DMARC
dig +short NS "$DOMAIN"
dig A "$DOMAIN"               # includes TTL
whois "$DOMAIN" | grep -iE 'expir|renew'
```

## Mail Configuration

```bash
# From .env (redact values, document keys)
grep -iE 'MAIL_|SMTP_|SENDGRID|MAILGUN|POSTMARK' "$SITE_ROOT/shared/.env" \
    | sed 's/=.*/=REDACTED/'

# SPF / DKIM records
dig TXT "$DOMAIN" | grep -iE 'spf|v=spf'
dig TXT "mail._domainkey.$DOMAIN"     # DKIM
dig TXT "_dmarc.$DOMAIN"              # DMARC
```

## External Integrations and Webhooks

```bash
# Payment gateways, webhooks, API endpoints
grep -iE 'webhook|callback|STRIPE|PAYPAL|TWILIO|SENDGRID' \
    "$SITE_ROOT/shared/.env" | sed 's/=.*/=REDACTED/'
```

## Systemd Units

```bash
ls /etc/systemd/system/"$CLIENT"-*.service
systemctl cat "$CLIENT-worker@.service" 2>/dev/null
```

## Inventory Document

Save everything to the run journal in structured format.
Flag anything that requires action before migration:
- Non-standard extensions
- Custom mysql collation
- External mail service
- Active webhooks that will need updating
- Domains with long TTLs that need lowering NOW
