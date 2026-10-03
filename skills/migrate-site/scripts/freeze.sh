#!/usr/bin/env bash
# freeze.sh — Phase 5 of migrate-site: freeze writes on the source
#
# Usage:
#   freeze.sh --client <name> [--source <alias>] [--method artisan|wp|nginx|none]
#             [--no-disable-cron] [--dry-run]
#             [--confirm "CONFIRM FREEZE"] [--confirm "CONFIRM DISABLE CRON"]
#
# Puts the source into maintenance mode and disables its cron, so that nothing
# writes to the source after the final delta sync. The source keeps serving a
# maintenance page: the migration stays reversible until decommissioning.
#
# Cron is disabled here, not at cutover, so no scheduled work starts once the
# final copy has been taken.
#
# Approval (see conventions/approvals.md):
#   CONFIRM FREEZE            enable maintenance mode on the source
#   CONFIRM DISABLE CRON      disable cron on the source
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
METHOD=""
DISABLE_CRON=true
ACTION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)           CLIENT="${2:-}"; shift 2 ;;
        --source)           SOURCE_OVERRIDE="${2:-}"; shift 2 ;;
        --method)           METHOD="${2:-}"; shift 2 ;;
        --no-disable-cron)  DISABLE_CRON=false; shift ;;
        --action)           ACTION="${2:-}"; shift 2 ;;
        --dry-run)          DRY_RUN=true; shift ;;
        --confirm)          confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
if [[ -n "${ACTION}" && "${ACTION}" != "freeze" ]]; then
    printf 'ERROR: --action %s does not match this script (freeze)\n' "${ACTION}" >&2
    exit 2
fi

case "${METHOD}" in
    ""|artisan|wp|nginx|none) ;;
    *) printf 'ERROR: --method must be one of artisan, wp, nginx, none\n' >&2; exit 2 ;;
esac

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "migrate-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root domain stack

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report

SOURCE_HOST="${SOURCE_OVERRIDE:-${MIGRATION_SOURCE_HOST:-${HOST}}}"
TARGET_HOST="${MIGRATION_TARGET_HOST}"

migration_require_alias "${SOURCE_HOST}" "source"

journal_init "migrate-site" "${CLIENT}" "${MANIFEST}"

SOURCE_SSH="$(ssh_target "${SOURCE_HOST}" "${DEPLOY_USER}")"

migration_require_phase "${CLIENT}" "inventory" "The inventory phase" 12
migration_require_phase "${CLIENT}" "prepare" "The prepare phase" 12
migration_require_phase "${CLIENT}" "sync" "The sync phase" 12

# Derive the maintenance method from the stack when not given.
if [[ -z "${METHOD}" ]]; then
    case "${STACK}" in
        laravel)            METHOD="artisan" ;;
        wordpress)          METHOD="wp" ;;
        node|static|other)  METHOD="nginx" ;;
        *)                  METHOD="nginx" ;;
    esac
fi

MAINTENANCE_MARKER="/etc/nginx/conf.d/agency-maintenance-${DOMAIN}.conf"

step OBSERVING "Freeze ${CLIENT} on ${SOURCE_HOST} (maintenance method: ${METHOD})"

{
    printf '\nFreeze plan\n'
    printf '  Source:             %s (%s)\n' "${SOURCE_HOST}" "${SITE_ROOT}"
    printf '  Maintenance method: %s\n' "${METHOD}"
    printf '  Will also do:       %s\n' "$([[ "${DISABLE_CRON}" == "true" ]] && printf 'disable cron on the source' || printf 'leave cron running')"
    printf '  Gates required:     CONFIRM FREEZE'
    [[ "${DISABLE_CRON}" == "true" ]] && printf ', CONFIRM DISABLE CRON'
    printf '\n  Next step after this: scripts/sync.sh --client %s --delta\n\n' "${CLIENT}"
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no mutations performed"
    result_add_string "action" "freeze"
    result_add_string "source_host" "${SOURCE_HOST}"
    result_add_string "method" "${METHOD}"
    emit_result "PLANNED"
    exit 0
fi

# ── Gates ─────────────────────────────────────────────────────────────────────
step CONFIRMING "Checking approval gates"
require_confirm "CONFIRM FREEZE" "FREEZE" "Enable ${METHOD} maintenance mode on ${SOURCE_HOST}; the source stops serving live traffic."

# ── Maintenance mode ──────────────────────────────────────────────────────────
step EXECUTING "Enabling maintenance mode on ${SOURCE_HOST}"

build_maintenance_cmd() {
    case "${METHOD}" in
        artisan)
            printf 'cd %s/current && php artisan down --render=errors::503 --retry=60' "${SITE_ROOT}"
            ;;
        wp)
            printf 'cd %s/current && (wp maintenance-mode activate || (echo "wp-cli unavailable" >&2; exit 1))' "${SITE_ROOT}"
            ;;
        nginx)
            printf 'printf %%s\\\\n "server { listen 80; listen 443 ssl; server_name %s; return 503; }" > /tmp/agency-maint.conf && sudo cp /tmp/agency-maint.conf %s && sudo nginx -t && sudo systemctl reload nginx' \
                "${DOMAIN}" "${MAINTENANCE_MARKER}"
            ;;
        none)
            printf 'true'
            ;;
    esac
}

MAINT_CMD="$(build_maintenance_cmd)"

set +e
MAINT_OUT="$(ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "${MAINT_CMD}" 2>&1)"
MAINT_RC=$?
set -e

journal_log "EXECUTING" "Enable maintenance mode" "method=${METHOD}" "${MAINT_RC}" 0 \
    "$(printf '%s' "${MAINT_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

if [[ "${MAINT_RC}" -ne 0 ]]; then
    fail_with 6 FAILED "Could not enable maintenance mode on ${SOURCE_HOST} (method ${METHOD}): $(printf '%s' "${MAINT_OUT}" | tail -5 | tr '\n' ' ')"
fi
step EXECUTING "Maintenance mode enabled"

# ── Cron ──────────────────────────────────────────────────────────────────────
CRON_DISABLED=false
if [[ "${DISABLE_CRON}" == "true" ]]; then
    step CONFIRMING "Checking approval gate for cron"
    require_confirm "CONFIRM DISABLE CRON" "DISABLE CRON" "Disable cron on ${SOURCE_HOST} so no scheduled work starts after the final sync."

    step EXECUTING "Disabling cron on ${SOURCE_HOST}"
    set +e
    CRON_OUT="$(ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "
        set -e
        sudo systemctl disable --now cron 2>/dev/null || sudo systemctl disable --now crond 2>/dev/null || true
        mkdir -p '${SITE_ROOT}/.migration'
        for u in root www-data nginx; do
            crontab -l -u \"\$u\" 2>/dev/null > '${SITE_ROOT}/.migration/cron-\$u.bak' || true
        done
        sudo systemctl list-timers --no-pager 2>/dev/null | head -5 || true
        systemctl is-active cron 2>/dev/null || systemctl is-active crond 2>/dev/null || echo inactive
    " 2>&1)"
    CRON_RC=$?
    set -e

    journal_log "EXECUTING" "Disable cron" "systemctl disable --now cron" "${CRON_RC}" 0 \
        "$(printf '%s' "${CRON_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

    if [[ "${CRON_RC}" -ne 0 ]]; then
        fail_with 6 FAILED "Could not disable cron on ${SOURCE_HOST}: $(printf '%s' "${CRON_OUT}" | tail -5 | tr '\n' ' ')"
    fi
    CRON_DISABLED=true
    step EXECUTING "Cron disabled (backups of the crontabs are in ${SITE_ROOT}/.migration)"
else
    result_warn "Cron was left running on ${SOURCE_HOST}; scheduled work may still write to the source"
fi

# ── Verify no active writers ──────────────────────────────────────────────────
step VERIFYING "Checking the source for active database writers"
set +e
WRITERS="$(ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "set -a; . '${SITE_ROOT}/shared/.env' 2>/dev/null; set +a; export MYSQL_PWD=\"\$DB_PASSWORD\"; mysql -N -B -u \"\$DB_USERNAME\" \"\$DB_DATABASE\" -e \"SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE COMMAND <> 'Sleep' AND USER <> 'system user';\" 2>/dev/null" 2>/dev/null | tail -1 | tr -d '[:space:]')"
set -e

if [[ "${WRITERS}" =~ ^[0-9]+$ ]]; then
    step VERIFYING "Active non-sleep database connections on the source: ${WRITERS}"
    if [[ "${WRITERS}" -gt 0 ]]; then
        result_warn "${WRITERS} database connections are still active on ${SOURCE_HOST}. Wait a few seconds and re-check before the final delta."
    fi
else
    step VERIFYING "Could not determine the active writer count"
fi

# ── Reachability of the maintenance page ──────────────────────────────────────
if [[ "${METHOD}" != "none" ]]; then
    step VERIFYING "Confirming the source now serves the maintenance page"
    set +e
    MAINT_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://${DOMAIN}/" 2>/dev/null)"
    set -e
    step VERIFYING "https://${DOMAIN}/ -> ${MAINT_STATUS}"
    if [[ "${MAINT_STATUS}" != "503" && "${MAINT_STATUS}" != "502" && "${MAINT_STATUS}" != "200" ]]; then
        result_warn "Unexpected status ${MAINT_STATUS} from ${DOMAIN} after enabling maintenance mode"
    fi
fi

migration_state_set "${CLIENT}" "freeze" "method=${METHOD} cron_disabled=${CRON_DISABLED}"

step FROZEN "Source frozen"

result_add_string "action" "freeze"
result_add_string "source_host" "${SOURCE_HOST}"
result_add_string "target_host" "${TARGET_HOST}"
result_add_string "method" "${METHOD}"
result_add_raw "cron_disabled" "${CRON_DISABLED}"
if [[ -n "${WRITERS:-}" ]]; then
    result_add_raw "active_writers" "${WRITERS}"
fi
result_add_string "next_step" "bash scripts/sync.sh --client ${CLIENT} --delta"
result_add_string "journal" "$(journal_path)"

emit_result "FROZEN"
exit 0
