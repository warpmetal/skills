# What to Back Up

## Include

### Database

```bash
# InnoDB (most common) — non-locking dump
mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  --databases "$DB_NAME" \
  | gzip > "/tmp/backup-${DB_NAME}-$(date +%Y%m%d-%H%M%S).sql.gz"
```

- `--single-transaction`: consistent snapshot for InnoDB without locking tables
- `--routines`: includes stored procedures
- `--triggers`: includes triggers
- Per-database dumps (not one giant `--all-databases`) for faster selective restores

For PostgreSQL:
```bash
pg_dump -Fc -U "$DB_USER" "$DB_NAME" > "/tmp/backup-${DB_NAME}.dump"
```

### User Uploads and Media

```bash
# WordPress uploads
$SITE_ROOT/shared/public/uploads/
$SITE_ROOT/shared/storage/app/public/  # Laravel

# Or wherever the shared uploads dir is per client manifest
```

### Configuration

```bash
# .env (server-side, never from local)
$SITE_ROOT/shared/.env

# Nginx vhosts
/etc/nginx/sites-available/$CLIENT

# PHP-FPM pool
/etc/php/*/fpm/pool.d/$CLIENT.conf

# SSL certs (though LE can reissue)
/etc/letsencrypt/live/$DOMAIN/
/etc/letsencrypt/renewal/$DOMAIN.conf
```

### Cron and Systemd

```bash
# Crontabs
crontab -l -u www-data > /tmp/crontab-www-data.txt
crontab -l -u root > /tmp/crontab-root.txt

# Systemd units
/etc/systemd/system/$CLIENT-*.service
/etc/systemd/system/$CLIENT-*.timer
```

## Exclude (Regenerable — Do Not Back Up)

| Path | Reason |
|------|--------|
| `$SITE_ROOT/releases/` (except current) | Old releases — regenerable via deploy |
| `$SITE_ROOT/current/vendor/` | `composer install` regenerates it |
| `$SITE_ROOT/current/node_modules/` | `npm ci` regenerates it |
| `$SITE_ROOT/current/public/build/` | Build step regenerates it |
| `/var/log/` | Logs are not restorables — archive separately if needed |
| `/tmp/` | Temporary |

Backing up `vendor/` and `node_modules/` typically 3-5× the storage cost for no
recovery benefit. Every MiB stored unnecessarily is a MiB you pay for in perpetuity.

## Restic Exclude File

```
# /etc/restic/acme.excludes
releases/*/vendor
releases/*/node_modules
releases/*/public/build
*.log
*.tmp
.git
```

Use with: `restic backup --exclude-file /etc/restic/acme.excludes`

## What a Complete Backup Enables

With the above, a full site rebuild after catastrophic loss needs:
1. Fresh server with matching runtime
2. Restore `.env` and configs
3. Restore DB
4. Restore uploads
5. `git clone` the repo + `composer install` + `npm ci` + `npm run build`
6. Run `php artisan migrate`
7. Point DNS

This is a recovery, not a backup limitation. Document the recovery procedure
in the client journal.
