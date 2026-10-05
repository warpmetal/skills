# Mixed Content

Mixed content occurs when an HTTPS page loads resources over HTTP. Browsers block
active mixed content (scripts, iframes) and warn on passive (images, audio).

## Detection

```bash
# In browser: open DevTools → Console → look for "Mixed Content" warnings
# Or: Security tab → shows which resources are insecure

# From the database (WordPress):
wp option get siteurl
wp option get home
# Both should be https://

# Search for hardcoded http:// in the database (dry-run first)
wp search-replace 'http://acme.com' 'https://acme.com' --dry-run --all-tables --report-changed-only
```

## Why You Cannot Use `sed` on a SQL Dump

WordPress stores serialized PHP in the database. Serialized strings include byte-length
prefixes:

```
s:22:"http://acme.com/image";
     ^^-- byte count
```

If you use `sed` to replace `http://acme.com` (16 bytes) with `https://acme.com` (17 bytes),
the byte count is now wrong. PHP cannot unserialize the string and throws an error.

**Use `wp search-replace` instead.** It understands serialized PHP and updates the
byte counts correctly.

## The Fix (WordPress)

```bash
# 1. Always dry-run first
wp search-replace 'http://acme.com' 'https://acme.com' \
  --dry-run \
  --all-tables \
  --report-changed-only

# 2. Check what will change — look for unexpected tables
# 3. Apply with confirmation
wp search-replace 'http://acme.com' 'https://acme.com' \
  --all-tables \
  --report-changed-only

# 4. Also replace www variant if used
wp search-replace 'http://www.acme.com' 'https://www.acme.com' \
  --dry-run --all-tables
```

## The Fix (Laravel / Generic PHP)

Laravel stores few URLs in the database. Check:
- `APP_URL` in `.env` — must be `https://`
- Any hardcoded URLs in config files
- Asset helpers: use `asset()` not hardcoded URLs

If `ASSET_URL` is set, ensure it uses HTTPS.

## The Fix (Static Site / Other)

Search the source code and build output:
```bash
grep -r 'http://acme.com' "$SITE_ROOT/current/public" | grep -v '.git'
```

## Common Sources of Mixed Content

| Source | Fix |
|--------|-----|
| Hardcoded `<img src="http://...">` in posts | wp search-replace or content edit |
| Plugin assets served over HTTP | Update plugin; check plugin settings for CDN URL |
| External embeds (YouTube, social) | Usually HTTPS already; check embed code |
| `APP_URL=http://` in .env | Change to https, clear Laravel caches |
| CDN/upload URL not updated | Update CDN domain config to https |

## Verification After Fix

```bash
# Check key pages with a mixed content scanner
# Or use: https://www.whynopadlock.com/
curl -s "https://acme.com" | grep -o 'src="http://' | wc -l
# Should return 0
```
