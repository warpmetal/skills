# Client Manifest Convention

## Location

```
~/.config/agency/clients/<client>.toml
```

## Schema

```toml
# Required fields
host        = "acme-prod"          # SSH alias (must exist in ~/.ssh/config)
site_root   = "/var/www/acme"      # Absolute path to site root on remote host
domain      = "acme.com"           # Primary domain
stack       = "laravel"            # laravel | wordpress | node | static

# Optional fields (stack-dependent)
php         = "8.3"                # PHP version (required for laravel/wordpress)
db          = { engine = "mysql", name = "acme", user = "acme" }
health_url  = "https://acme.com/health"  # Health check endpoint
alert_to    = "slack:#acme-alerts"       # Alert destination

# Deployment-specific (optional)
repo_url    = "git@github.com:org/acme.git"
branch      = "main"               # Default: main
deploy_user = "www-data"           # Default: www-data
worker_unit = "acme-worker@"       # systemd template unit for queue workers
app_unit    = "acme-app"           # systemd unit for a Node application
```

## Section Tables

Skills that need extra settings read them from section tables. All are optional;
the defaults below are what the scripts fall back to.

```toml
[backup]
repo              = "s3:s3.amazonaws.com/mybucket/acme"  # restic repository
healthcheck       = "https://hc-ping.com/uuid"           # dead-man's switch
offsite_confirmed = "2026-09-01"                         # date key escrow was confirmed

[queue]
driver        = "redis"            # redis | database | sqs
connection    = "default"
workers       = 2                  # desired worker count
max_time      = 3600               # --max-time seconds
critical_jobs = ["SendInvoice"]    # jobs requiring a dead-man's switch
healthcheck   = "https://hc-ping.com/uuid"

[monitoring]
monitoring_host     = "mon-vps"           # SSH alias of the Uptime Kuma host
uptime_kuma_url     = "http://mon-vps:3001"
page_channel        = "slack:#alerts"     # immediate page
digest_channel      = "slack:#digest"     # daily summary
domain_expiry_check = true
backup_healthcheck  = "https://hc-ping.com/uuid"

[migration]
source_host = "acme-old"
target_host = "acme-new"
target_root = "/var/www/acme"
ttl_lowered = "2026-09-20"                # date the A record TTL was dropped
mail_relay  = "smtp.mailgun.org"           # if routing outbound through a relay
```

## Field Definitions

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `host` | Yes | string | SSH host alias. Must resolve via `~/.ssh/config`. No raw hostnames/IPs. |
| `site_root` | Yes | string | Absolute path on remote server. Must not contain symlinks. |
| `domain` | Yes | string | Primary domain for TLS, health checks, DNS verification. |
| `stack` | Yes | enum | `laravel`, `wordpress`, `node`, `static`. Determines build/deploy steps. |
| `php` | Conditional | string | Required for `laravel` and `wordpress`. Format: `8.3`, `8.2`, etc. |
| `db` | Conditional | table | Required for `laravel` and `wordpress`. `engine` ∈ {mysql, pgsql}. |
| `health_url` | Yes | string | HTTPS URL returning 200 OK when healthy. Used by deploy-site health gate and server-monitoring. |
| `alert_to` | No | string | Alert routing. Format: `slack:#channel`, `telegram:@chat`, `email:addr`. |
| `repo_url` | No | string | Git remote URL. Defaults to origin remote on server. |
| `branch` | No | string | Git branch to deploy. Default: `main`. |
| `deploy_user` | No | string | Remote user for file operations. Default: `www-data`. |
| `worker_unit` | No | string | systemd template unit name for queue workers. Default: `<client>-worker@`. |
| `app_unit` | No | string | systemd unit name for a Node application. Default: `<client>-app`. |

### Section Fields

| Field | Required | Used by | Description |
|-------|----------|---------|-------------|
| `backup.repo` | For `backup-restore` | backup-restore | restic repository URL. |
| `backup.healthcheck` | For `backup-restore setup` | backup-restore | Dead-man's switch ping URL. Setup refuses to complete without it. |
| `backup.offsite_confirmed` | No | backup-restore | Date the key escrow was confirmed. |
| `queue.driver` | For `queue-cron-setup` | queue-cron-setup | `redis`, `database`, or `sqs`. |
| `queue.workers` | No | queue-cron-setup | Desired worker count. Default: `1`. |
| `queue.max_time` | No | queue-cron-setup | `--max-time` seconds. Default: `3600`. |
| `queue.critical_jobs` | No | queue-cron-setup | Jobs that require a per-job dead-man's switch. |
| `monitoring.monitoring_host` | For `server-monitoring` | server-monitoring | SSH alias of the Uptime Kuma host. Must differ from `host`. |
| `monitoring.page_channel` | For `server-monitoring` | server-monitoring | Immediate alert destination. |
| `migration.source_host` | For `migrate-site` | migrate-site | SSH alias of the source host. |
| `migration.target_host` | For `migrate-site` | migrate-site | SSH alias of the target host. |
| `migration.ttl_lowered` | No | migrate-site | Date the A record TTL was lowered; used for the cutover warning. |

## Validation Rules

1. **All required fields must be present** — STOP if missing, never guess.
2. **`host` must exist in SSH config** — verify with `ssh -G <host>` before any operation.
3. **`site_root` must be absolute path** — no relative paths, no `~`.
4. **`stack` must be one of four values** — case-sensitive.
5. **`health_url` must be HTTPS** — HTTP not permitted for production health checks.
6. **`db.engine` must match installed database** — validate during preflight.
7. **No secrets in manifest** — passwords, tokens, keys must never appear here. Use server-side `.env` in `shared/`.

## Example Manifests

### Laravel

```toml
host        = "acme-prod"
site_root   = "/var/www/acme"
domain      = "acme.com"
stack       = "laravel"
php         = "8.3"
db          = { engine = "mysql", name = "acme", user = "acme" }
health_url  = "https://acme.com/health"
alert_to    = "slack:#acme-alerts"
repo_url    = "git@github.com:org/acme.git"
branch      = "main"
```

### WordPress

```toml
host        = "acme-prod"
site_root   = "/var/www/acme"
domain      = "acme.com"
stack       = "wordpress"
php         = "8.2"
db          = { engine = "mysql", name = "acme_wp", user = "acme_wp" }
health_url  = "https://acme.com/wp-json/wp/v2/pages?per_page=1"
alert_to    = "slack:#acme-alerts"
```

### Node.js

```toml
host        = "acme-prod"
site_root   = "/var/www/acme"
domain      = "acme.com"
stack       = "node"
health_url  = "https://acme.com/health"
alert_to    = "slack:#acme-alerts"
repo_url    = "git@github.com:org/acme.git"
branch      = "main"
```

### Static

```toml
host        = "acme-prod"
site_root   = "/var/www/acme"
domain      = "acme.com"
stack       = "static"
health_url  = "https://acme.com/"
alert_to    = "slack:#acme-alerts"
```

## Usage

Every skill script receives `--client <name>` and loads the corresponding manifest
through the shared library.

```bash
# In any agency-skills/<skill>/scripts/*.sh:
# >>> agency-lib-resolver
# (canonical multi-path resolver — copy it verbatim between the markers;
#  see README.md § Install for the full block and the search order)
source "${_SKILL_LIB}"     # $AGENCY_LIB, sibling layouts, then the skill install roots
# <<< agency-lib-resolver

result_init "deploy-site" "$CLIENT"
manifest_load "$CLIENT"     # populates HOST, SITE_ROOT, DOMAIN, STACK, PHP, ...
manifest_validate
manifest_require host site_root domain stack
manifest_parser_report      # exposes python3 vs awk in the result; warns on awk
agency_require_tools "dig:recording the A record and TTL"
```

The resolver block is delimited by `# >>> agency-lib-resolver` / `# <<< agency-lib-resolver`
so it can be replaced mechanically; `tools/validate-skills.sh` fails a script whose
block is missing. It tries `$AGENCY_LIB`, `<skill>/../../conventions/lib`,
`<skill>/../conventions/lib`, then `~/.cursor/skills`, `~/.claude/skills` and
`~/.agents/skills`. If none match it exits `127` listing every path tried and the
`export AGENCY_LIB=...` fix.

`manifest_parser_report` and `agency_require_tools` must be called **after**
`result_init`, because that is what resets `warnings[]`.

`conventions/lib/manifest.sh` implements the parser. It handles quoted strings,
inline tables (`db = { ... }`), `[section]` tables, and trailing comments inside
quoted values. `python3` is used when available, with an `awk` fallback.

Changes to this schema are reflected in `MANIFEST_DIR` variables inside `manifest_load`.

## Error Handling

| Condition | Action |
|-----------|--------|
| Manifest file not found | `ERROR: Client manifest not found: ~/.config/agency/clients/<client>.toml` |
| Required field missing | `ERROR: Manifest field '<field>' is required for stack '<stack>'` |
| Invalid stack value | `ERROR: Invalid stack '<value>'. Must be: laravel, wordpress, node, static` |
| SSH host not configured | `ERROR: SSH host '<host>' not found in ~/.ssh/config` |
| health_url not HTTPS | `ERROR: health_url must use HTTPS` |