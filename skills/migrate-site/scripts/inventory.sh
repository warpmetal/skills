#!/usr/bin/env bash
# inventory.sh — Phase 1 of migrate-site: inventory the source host
#
# Usage:
#   inventory.sh --client <name> [--source <alias>] [--target <alias>] [--dry-run]
#
# Read-only. Collects runtime versions, database facts, disk usage, vhosts and
# certificates, DNS records and TTL, cron, systemd units, and redacted mail and
# webhook configuration. Writes the inventory to
# ~/.local/state/agency/<client>/migration/inventory.json and records the phase.
#
# No approval gate: this script never mutates anything, on either host.
#
# Exit codes: see conventions/outputs.md

set -euo pipefail

# ── Shared library ────────────────────────────────────────────────────────────
# >>> agency-lib-resolver
# Resolve the shared library from several locations so that a skill directory
# copied on its own still works. AGENCY_LIB wins; the sibling layout is next;
# then the usual skill install roots.
_agency_skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_SKILL_LIB=""
for _agency_candidate in \
    "${AGENCY_LIB:-}" \
    "${_agency_skill_dir}/../../conventions/lib/bootstrap.sh" \
    "${_agency_skill_dir}/../conventions/lib/bootstrap.sh" \
    "${HOME}/.cursor/skills/conventions/lib/bootstrap.sh" \
    "${HOME}/.claude/skills/conventions/lib/bootstrap.sh" \
    "${HOME}/.agents/skills/conventions/lib/bootstrap.sh"
do
    if [[ -n "${_agency_candidate}" && -r "${_agency_candidate}" ]]; then
        _SKILL_LIB="${_agency_candidate}"
        break
    fi
done
if [[ -z "${_SKILL_LIB}" ]]; then
    printf 'ERROR: agency-skills shared library not found. Tried:\n' >&2
    printf '  $AGENCY_LIB, <skill>/../../conventions/lib, <skill>/../conventions/lib,\n' >&2
    printf '  ~/.cursor/skills/conventions/lib, ~/.claude/skills/conventions/lib,\n' >&2
    printf '  ~/.agents/skills/conventions/lib\n' >&2
    printf 'Fix: export AGENCY_LIB=/path/to/agency-skills/conventions/lib/bootstrap.sh\n' >&2
    printf 'Or install conventions/ alongside the skill directories.\n' >&2
    exit 127
fi
# shellcheck source=/dev/null
source "${_SKILL_LIB}"
# <<< agency-lib-resolver

CLIENT=""
SOURCE_OVERRIDE=""
TARGET_OVERRIDE=""
ACTION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)  CLIENT="${2:-}"; shift 2 ;;
        --source)  SOURCE_OVERRIDE="${2:-}"; shift 2 ;;
        --target)  TARGET_OVERRIDE="${2:-}"; shift 2 ;;
        --action)  ACTION="${2:-}"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --confirm) confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
if [[ -n "${ACTION}" && "${ACTION}" != "inventory" ]]; then
    printf 'ERROR: --action %s does not match this script (inventory)\n' "${ACTION}" >&2
    exit 2
fi

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "migrate-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root domain stack

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
agency_require_tools "dig:recording the A record and TTL"

SOURCE_HOST="${SOURCE_OVERRIDE:-${MIGRATION_SOURCE_HOST:-${HOST}}}"
TARGET_HOST="${TARGET_OVERRIDE:-${MIGRATION_TARGET_HOST}}"

[[ -n "${SOURCE_HOST}" ]] || fail_with 5 STOPPED "No source host: pass --source or set migration.source_host"
[[ -n "${TARGET_HOST}" ]] || fail_with 5 STOPPED "No target host: pass --target or set migration.target_host"

migration_require_alias "${SOURCE_HOST}" "source"
migration_require_alias "${TARGET_HOST}" "target"

journal_init "migrate-site" "${CLIENT}" "${MANIFEST}"

SOURCE_SSH="$(ssh_target "${SOURCE_HOST}" "${DEPLOY_USER}")"
REMOTE_OUT=""
REMOTE_RC=0
try_source() {
    set +e
    REMOTE_OUT="$(ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "$1" 2>&1)"
    REMOTE_RC=$?
    set -e
    return 0
}

step OBSERVING "Inventory of ${CLIENT}: source=${SOURCE_HOST} target=${TARGET_HOST}"

{
    printf '\nInventory plan\n'
    printf '  Source:      %s\n' "${SOURCE_HOST}"
    printf '  Target:      %s\n' "${TARGET_HOST}"
    printf '  Site root:   %s\n' "${SITE_ROOT}"
    printf '  Domain:      %s\n' "${DOMAIN}"
    printf '  Stack:       %s\n' "${STACK}"
    printf '  Read-only; no gate required.\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no collection performed"
    result_add_string "action" "inventory"
    result_add_string "source_host" "${SOURCE_HOST}"
    result_add_string "target_host" "${TARGET_HOST}"
    emit_result "PLANNED"
    exit 0
fi

# ── Local DNS probes ──────────────────────────────────────────────────────────
A_RECORD_IP=""
A_RECORD_TTL=""
MX_RECORDS=""
TXT_RECORDS=""
if command -v dig >/dev/null 2>&1; then
    A_RECORD_IP="$(migration_a_record_ip "${DOMAIN}" || true)"
    A_RECORD_TTL="$(migration_a_record_ttl "${DOMAIN}" || true)"
    MX_RECORDS="$(dig +short MX "${DOMAIN}" 2>/dev/null | tr '\n' ' ' || true)"
    TXT_RECORDS="$(dig +short TXT "${DOMAIN}" 2>/dev/null | head -5 | tr '\n' ' ' || true)"
    step OBSERVING "DNS: ${DOMAIN} -> ${A_RECORD_IP:-none} (TTL ${A_RECORD_TTL:-unknown})"
else
    result_warn "dig is not available; DNS facts were not collected"
fi

TTL_WARNING="$(migration_ttl_warning "${CLIENT}" "${DOMAIN}" || true)"
if [[ -n "${TTL_WARNING}" ]]; then
    result_warn "${TTL_WARNING}"
    step WARNING "${TTL_WARNING}"
fi

# ── Remote collection (single SSH session) ────────────────────────────────────
REMOTE_SCRIPT="$(cat <<'REMOTE'
set -uo pipefail
section() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

section VERSIONS
have php && php -v 2>/dev/null | head -1
have php && php -m 2>/dev/null | tr '\n' ' '
printf '\n'
have node && node --version 2>/dev/null
have npm && npm --version 2>/dev/null
have composer && composer --version 2>/dev/null | head -1
have mysql && mysql --version 2>/dev/null
have mysqldump && mysqldump --version 2>/dev/null

section DATABASES
if have mysql; then
    mysql -N -B -e 'SELECT table_schema, table_collation FROM information_schema.tables WHERE table_schema NOT IN ("mysql","information_schema","performance_schema","sys") LIMIT 20;' 2>&1 | head -20
    mysql -N -B -e 'SELECT VERSION();' 2>&1 | head -1
fi

section DISK
df -h "$SITE_ROOT" 2>/dev/null || df -h /
df -i "$SITE_ROOT" 2>/dev/null || df -i /
du -sh "$SITE_ROOT" 2>/dev/null || true
du -sh "$SITE_ROOT/shared" 2>/dev/null || true

section SERVICES
systemctl list-units --type=service --state=running --no-pager 2>/dev/null | grep -iE 'php|nginx|mysql|mariadb|node|redis' || true
nginx -v 2>&1 | head -1 || true
nginx -T 2>/dev/null | grep -E 'server_name|ssl_certificate |root ' | head -40 || true

section CERTS
certbot certificates 2>/dev/null | head -40 || echo 'certbot not present'
systemctl is-active certbot.timer 2>/dev/null || echo 'no certbot timer'

section CRON
for u in root www-data nginx; do
    echo "--- $u ---"
    crontab -l -u "$u" 2>/dev/null | head -30 || echo '(none or denied)'
done
ls -1 /etc/cron.d/ 2>/dev/null | head -20 || true

section SYSTEMD_UNITS
ls -1 /etc/systemd/system/ 2>/dev/null | head -60 || true

section ENV_KEYS
if [ -f "$SITE_ROOT/shared/.env" ]; then
    sed -E 's/=.*/=<redacted>/' "$SITE_ROOT/shared/.env" 2>/dev/null | grep -iE 'MAIL_|SMTP|WEBHOOK|CALLBACK|QUEUE_|REDIS_|DB_CONNECTION|DB_DATABASE|APP_URL|APP_ENV' | head -40 || true
else
    echo '(no shared/.env)'
fi

section MAIL
have postfix && postconf -n 2>/dev/null | head -20
grep -rE '^MAIL_HOST|^MAIL_FROM|^MAIL_MAILER' "$SITE_ROOT/shared/.env" 2>/dev/null | sed -E 's/=.*/=<redacted>/' || true

section PHP_FPM
for d in /etc/php/*/fpm/pool.d/*.conf; do
    [ -f "$d" ] || continue
    echo "--- $d ---"
    grep -E '^\s*(pm|pm\.max_children|listen|user)\s*=' "$d" 2>/dev/null | head -10
done

section GHOSTS
echo "firewall:"
(ufw status 2>/dev/null || iptables -L -n 2>/dev/null | head -20) || echo '(unavailable)'
echo "extra vhosts:"
ls -1 /etc/nginx/sites-enabled/ 2>/dev/null || true
echo "ssl dirs:"
ls -1 /etc/letsencrypt/live/ 2>/dev/null || true

section INVENTORY_DONE
REMOTE
)"

step OBSERVING "Collecting from ${SOURCE_HOST} over a single SSH session"
set +e
COLLECT_OUT="$(printf '%s' "${REMOTE_SCRIPT}" | ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" \
    "SITE_ROOT='${SITE_ROOT}' bash -s" 2>&1)"
COLLECT_RC=$?
set -e

if [[ "${COLLECT_RC}" -ne 0 ]]; then
    fail_with 3 STOPPED "Inventory collection failed on ${SOURCE_HOST} (exit ${COLLECT_RC}): $(printf '%s' "${COLLECT_OUT}" | tail -5 | tr '\n' ' ')"
fi

journal_log "OBSERVING" "Source inventory" "ssh ${SOURCE_SSH} bash -s < inventory" "${COLLECT_RC}" 0 \
    "$(printf '%s' "${COLLECT_OUT}" | journal_sanitize)" "OBSERVING" "OBSERVED"

# ── Summarise ─────────────────────────────────────────────────────────────────
PHP_VERSION="$(printf '%s' "${COLLECT_OUT}" | sed -n '/===== VERSIONS =====/,/^$/p' | grep -oE '^PHP [0-9]+\.[0-9]+' | head -1 | awk '{print $2}')"
MYSQL_VERSION="$(printf '%s' "${COLLECT_OUT}" | sed -n '/===== DATABASES =====/,/===== DISK/p' | grep -oE 'mysql  Ver [0-9]+\.[0-9]+\.[0-9]+' | head -1 | awk '{print $3}')"
COLLATION="$(printf '%s' "${COLLECT_OUT}" | sed -n '/===== DATABASES =====/,/===== DISK/p' | grep -oE 'utf8mb4_[a-z0-9_]+|utf8_[a-z0-9_]+' | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')"
SITE_SIZE="$(printf '%s' "${COLLECT_OUT}" | sed -n '/===== DISK =====/,/===== SERVICES/p' | awk '/^\S+\s+\S+$/ {print $1; exit}')"
CRON_COUNT="$(printf '%s' "${COLLECT_OUT}" | sed -n '/===== CRON =====/,/===== SYSTEMD_UNITS/p' | grep -cE '^[0-9*]' || true)"
UNIT_COUNT="$(printf '%s' "${COLLECT_OUT}" | sed -n '/===== SYSTEMD_UNITS =====/,/===== ENV_KEYS/p' | grep -cE '\.(service|timer)$' || true)"

# Version-mismatch hints that the MySQL reference warns about.
if [[ -n "${MYSQL_VERSION}" && "${MYSQL_VERSION%%.*}" == "5" ]]; then
    result_warn "Source MySQL is ${MYSQL_VERSION}. Check references/mysql-version-gotchas.md before migrating to MySQL 8 (authentication plugin and collation changes)."
fi
if [[ -n "${COLLATION}" && "${COLLATION}" != "utf8mb4_unicode_ci" && "${COLLATION}" != "utf8mb4_0900_ai_ci" ]]; then
    result_warn "Dominant collation on the source is ${COLLATION}; confirm the target uses the same one."
fi

# ── Persist the inventory ─────────────────────────────────────────────────────
INVENTORY_FILE="$(migration_inventory_file "${CLIENT}")"
mkdir -p "$(migration_state_dir "${CLIENT}")"

{
    printf '{\n'
    printf '  "client": %s,\n' "$(json_string "${CLIENT}")"
    printf '  "collected_at": %s,\n' "$(json_string "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
    printf '  "source_host": %s,\n' "$(json_string "${SOURCE_HOST}")"
    printf '  "target_host": %s,\n' "$(json_string "${TARGET_HOST}")"
    printf '  "site_root": %s,\n' "$(json_string "${SITE_ROOT}")"
    printf '  "domain": %s,\n' "$(json_string "${DOMAIN}")"
    printf '  "stack": %s,\n' "$(json_string "${STACK}")"
    printf '  "php_version": %s,\n' "$(json_string "${PHP_VERSION}")"
    printf '  "mysql_version": %s,\n' "$(json_string "${MYSQL_VERSION}")"
    printf '  "dominant_collation": %s,\n' "$(json_string "${COLLATION}")"
    printf '  "site_size": %s,\n' "$(json_string "${SITE_SIZE}")"
    printf '  "cron_entries": %s,\n' "${CRON_COUNT:-0}"
    printf '  "systemd_units": %s,\n' "${UNIT_COUNT:-0}"
    printf '  "a_record_ip": %s,\n' "$(json_string "${A_RECORD_IP}")"
    printf '  "a_record_ttl": %s,\n' "${A_RECORD_TTL:-null}"
    printf '  "mx_records": %s,\n' "$(json_string "${MX_RECORDS}")"
    printf '  "ttl_lowered": %s,\n' "$(json_string "${MIGRATION_TTL_LOWERED}")"
    printf '  "mail_relay": %s\n' "$(json_string "${MIGRATION_MAIL_RELAY}")"
    printf '}\n'
} > "${INVENTORY_FILE}"

migration_state_set "${CLIENT}" "inventory" "file=${INVENTORY_FILE} a_record=${A_RECORD_IP:-none} ttl=${A_RECORD_TTL:-unknown}"

step INVENTORIED "Inventory written to ${INVENTORY_FILE}"

result_add_string "action" "inventory"
result_add_string "source_host" "${SOURCE_HOST}"
result_add_string "target_host" "${TARGET_HOST}"
result_add_string "php_version" "${PHP_VERSION}"
result_add_string "mysql_version" "${MYSQL_VERSION}"
result_add_string "dominant_collation" "${COLLATION}"
result_add_string "site_size" "${SITE_SIZE}"
result_add_string "a_record_ip" "${A_RECORD_IP}"
result_add_raw "a_record_ttl" "${A_RECORD_TTL:-null}"
result_add_raw "cron_entries" "${CRON_COUNT:-0}"
result_add_raw "systemd_units" "${UNIT_COUNT:-0}"
result_add_string "inventory_file" "${INVENTORY_FILE}"
result_add_string "journal" "$(journal_path)"

emit_result "INVENTORIED"
exit 0
