# WordPress Migration

## The Serialized Data Problem

WordPress stores many values as serialized PHP in the database:

```php
// Serialized PHP example
a:2:{s:3:"url";s:22:"http://acme.com/image";s:4:"name";s:5:"photo";}
//                     ^^-- byte count of the string
```

If you use `sed` to replace `http://acme.com` (16 chars) with `https://acme.com` (17 chars),
the byte count `s:22:` is now wrong — the actual string is 23 characters.
PHP cannot unserialize this and throws errors. These often appear as:
- Broken widget settings
- Plugin configurations silently reset
- Theme customizer settings lost

**Never use `sed` on a WordPress SQL dump for URL replacement.**

## The Right Way: `wp search-replace`

WP-CLI's `search-replace` understands serialized PHP and updates byte counts:

```bash
# 1. Run with --dry-run first to see what will change
wp search-replace 'http://acme.com' 'https://acme.com' \
    --dry-run \
    --all-tables \
    --report-changed-only

# 2. Review the table list and row counts
# 3. Run for real
wp search-replace 'http://acme.com' 'https://acme.com' \
    --all-tables \
    --report-changed-only

# 4. Also handle www variant if used
wp search-replace 'http://www.acme.com' 'https://www.acme.com' \
    --dry-run --all-tables
```

## When to Run wp search-replace

### HTTP → HTTPS switch

If migrating to HTTPS at the same time: run on target AFTER restoring the database.

### Domain change (old-host.com → acme.com)

If the target server has a different domain (e.g., during host migration):

```bash
# Replace old IP-based or staging URL with final domain
wp search-replace 'https://staging.acme.com' 'https://acme.com' \
    --dry-run --all-tables
```

### Using a Hosts File Override for Pre-Cutover Testing

To test on the target before changing DNS, add to your local `/etc/hosts`:
```
<target-ip>  acme.com www.acme.com
```

Then browse to `https://acme.com` — your machine will connect to the target.
Remove this override after DNS has propagated.

## wp-config.php Paths

WordPress may have hardcoded paths in `wp-config.php`. Check:

```php
define('WP_HOME', 'http://acme.com');
define('WP_SITEURL', 'http://acme.com');
```

These should be set dynamically or updated to match the new environment.

## File Paths in the Database

WordPress also stores absolute file system paths in the database
(e.g., `ABSPATH`, upload directory). After a migration where the site root changes:

```bash
# Check for old paths
wp search-replace '/var/www/old-acme' '/var/www/acme' \
    --dry-run --all-tables
```

## Plugins That Hardcode URLs

Some plugins cache the site URL in their own option tables. After `search-replace`,
flush all caches:

```bash
wp cache flush
wp rewrite flush
# For object cache (Redis):
wp cache flush  # or delete cache keys in Redis
```

## Checklist After Migration

- [ ] `wp option get siteurl` returns correct HTTPS URL
- [ ] `wp option get home` returns correct HTTPS URL
- [ ] No `http://` in any uploaded image URLs
- [ ] Plugin settings preserved (verify key plugins)
- [ ] Theme customizer settings preserved
- [ ] No serialization errors in debug.log
