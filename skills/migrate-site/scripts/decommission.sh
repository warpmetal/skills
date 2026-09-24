#!/usr/bin/env bash
# decommission.sh — Phase 8 of migrate-site: retire the source host
#
# Usage:
#   decommission.sh --client <name> [--source <alias>] [--min-days <n>]
#                   [--force-early] [--prune-site-root] [--keep-database]
#                   [--dry-run]
#                   [--confirm "CONFIRM DECOMMISSION"] [--confirm "CONFIRM PRUNE"]
#
# Refuses to run until at least --min-days (default 7) have passed since the
# cutover phase was recorded, because the old TTL can keep sending traffic to the
# source long after the DNS change. --force-early overrides this and is reported
# as a warning.
#
# Approval (see conventions/approvals.md):
#   CONFIRM DECOMMISSION      take the final snapshot and tear down the source
#   CONFIRM PRUNE             delete the site root on the source
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
MIN_DAYS=7
FORCE_EARLY=false
PRUNE_SITE_ROOT=false
KEEP_DATABASE=false
ACTION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)          CLIENT="${2:-}"; shift 2 ;;
        --source)          SOURCE_OVERRIDE="${2:-}"; shift 2 ;;
        --min-days)        MIN_DAYS="${2:-}"; shift 2 ;;
        --force-early)     FORCE_EARLY=true; shift ;;
        --prune-site-root) PRUNE_SITE_ROOT=true; shift ;;
        --keep-database)   KEEP_DATABASE=true; shift ;;
        --action)          ACTION="${2:-}"; shift 2 ;;
        --dry-run)         DRY_RUN=true; shift ;;
        --confirm)         confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
[[ "${MIN_DAYS}" =~ ^[0-9]+$ ]] || { printf 'ERROR: --min-days must be an integer\n' >&2; exit 2; }
if [[ -n "${ACTION}" && "${ACTION}" != "decommission" ]]; then
    printf 'ERROR: --action %s does not match this script (decommission)\n' "${ACTION}" >&2
    exit 2
fi

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "migrate-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root domain

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
migration_require_phase "${CLIENT}" "freeze" "The freeze phase" 12
migration_require_phase "${CLIENT}" "cutover" "The cutover phase" 12
migration_require_phase "${CLIENT}" "verify" "The verify phase" 12

# ── Age check ─────────────────────────────────────────────────────────────────
CUTOVER_AT="$(migration_state_get "${CLIENT}" "cutover")"
DAYS_SINCE=""
set +e
CUTOVER_EPOCH="$(date -d "${CUTOVER_AT}" +%s 2>/dev/null)"
set -e
if [[ -n "${CUTOVER_EPOCH}" ]]; then
    DAYS_SINCE=$(( ( $(date +%s) - CUTOVER_EPOCH ) / 86400 ))
fi

step OBSERVING "Decommission ${CLIENT} on ${SOURCE_HOST} (cutover ${CUTOVER_AT:-unknown}${DAYS_SINCE:+, ${DAYS_SINCE} day(s) ago})"

if [[ -n "${DAYS_SINCE}" && "${DAYS_SINCE}" -lt "${MIN_DAYS}" ]] && [[ "${FORCE_EARLY}" == "false" ]]; then
    fail_with 11 STOPPED "Only ${DAYS_SINCE} day(s) have passed since cutover and --min-days is ${MIN_DAYS}. Traffic with the old TTL may still reach ${SOURCE_HOST}. Wait, or pass --force-early to accept the risk."
fi
if [[ -n "${DAYS_SINCE}" && "${DAYS_SINCE}" -lt "${MIN_DAYS}" ]]; then
    result_warn "Decommissioning only ${DAYS_SINCE} day(s) after cutover (--force-early)"
fi

{
    printf '\nDecommission plan for %s\n' "${SOURCE_HOST}"
    printf '  Final restic snapshot: %s\n' "${BACKUP_REPO:-<no backup.repo configured>}"
    printf '  Remove:                nginx vhost and maintenance drop-in\n'
    printf '  Remove:                systemd units for this client\n'
    printf '  Database:              %s\n' "$([[ "${KEEP_DATABASE}" == "true" ]] && printf 'kept' || printf 'user dropped')"
    printf '  Site root:             %s\n' "$([[ "${PRUNE_SITE_ROOT}" == "true" ]] && printf 'DELETED (%s)' "${SITE_ROOT}" || printf 'kept')"
    printf '  Target %s is never touched.\n' "${TARGET_HOST:-<unset>}"
    printf '  Gates required:        CONFIRM DECOMMISSION'
    [[ "${PRUNE_SITE_ROOT}" == "true" ]] && printf ', CONFIRM PRUNE'
    printf '\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no mutations performed"
    result_add_string "action" "decommission"
    result_add_string "source_host" "${SOURCE_HOST}"
    result_add_string "target_host" "${TARGET_HOST}"
    result_add_raw "days_since_cutover" "${DAYS_SINCE:-null}"
    emit_result "PLANNED"
    exit 0
fi

step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM DECOMMISSION" "DECOMMISSION" "Tear down the vhost and services for ${CLIENT} on ${SOURCE_HOST}."

# ── Final snapshot ────────────────────────────────────────────────────────────
SNAPSHOT_ID=""
if [[ -n "${BACKUP_REPO}" ]]; then
    step EXECUTING "Taking a final snapshot of the source before decommissioning"
    set +e
    SNAP_OUT="$(ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "
        set -e
        export RESTIC_REPOSITORY='${BACKUP_REPO}'
        command -v restic >/dev/null 2>&1 || { echo 'restic is not installed'; exit 1; }
        restic backup '${SITE_ROOT}' --tag 'pre-decommission-${CLIENT}-$(date +%Y%m%d)' --json 2>&1 | tail -1
    " 2>&1)"
    SNAP_RC=$?
    set -e
    journal_log "EXECUTING" "Pre-decommission snapshot" "restic backup ${SITE_ROOT}" "${SNAP_RC}" 0 \
        "$(printf '%s' "${SNAP_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

    if [[ "${SNAP_RC}" -ne 0 ]]; then
        fail_with 6 FAILED "The pre-decommission snapshot failed on ${SOURCE_HOST}: $(printf '%s' "${SNAP_OUT}" | tail -3 | tr '\n' ' '). Decommissioning without a snapshot is not allowed."
    fi
    SNAPSHOT_ID="$(printf '%s' "${SNAP_OUT}" | sed -n 's/.*"snapshot_id":"\([^"]*\)".*/\1/p' | head -1)"
    step EXECUTING "Snapshot taken${SNAPSHOT_ID:+: ${SNAPSHOT_ID}}"
else
    result_warn "No backup.repo in the manifest; decommissioning without taking a final snapshot"
fi

# ── Tear down ─────────────────────────────────────────────────────────────────
step EXECUTING "Removing the vhost, drop-in, and units on ${SOURCE_HOST}"
set +e
TEARDOWN_OUT="$(ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "
    set +e
    had_error=0

    for f in '/etc/nginx/sites-enabled/${DOMAIN}' '/etc/nginx/sites-enabled/${CLIENT}' '/etc/nginx/conf.d/agency-maintenance-${DOMAIN}.conf'; do
        if [ -e \"\$f\" ]; then
            echo \"removing \$f\"
            sudo rm -f \"\$f\" || had_error=1
        fi
    done
    sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx || had_error=1

    units=\$(systemctl list-unit-files --no-pager 2>/dev/null | awk -v c='${CLIENT}' '\$1 ~ \"^\" c \"-\" {print \$1}')
    for u in \$units; do
        echo \"disabling \$u\"
        sudo systemctl disable --now \"\$u\" 2>/dev/null || true
    done

    exit \$had_error
" 2>&1)"
TEARDOWN_RC=$?
set -e
printf '%s\n' "${TEARDOWN_OUT}" >&2
journal_log "EXECUTING" "Remove vhost and units" "nginx + systemctl teardown" "${TEARDOWN_RC}" 0 \
    "$(printf '%s' "${TEARDOWN_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

if [[ "${TEARDOWN_RC}" -ne 0 ]]; then
    result_warn "Some teardown steps reported errors on ${SOURCE_HOST}; review the output above"
fi

# ── Database user ─────────────────────────────────────────────────────────────
DB_USER_DROPPED=false
if [[ "${KEEP_DATABASE}" == "false" ]]; then
    step EXECUTING "Dropping the database user on ${SOURCE_HOST}"
    set +e
    DBUSER_OUT="$(ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "
        set -a; . '${SITE_ROOT}/shared/.env' 2>/dev/null; set +a
        printf 'DROP USER IF EXISTS \x27%s\x27@\x27localhost\x27;\n' \"\$DB_USERNAME\" | sudo mysql --protocol=socket
    " 2>&1)"
    DBUSER_RC=$?
    set -e
    journal_log "EXECUTING" "Drop database user" "DROP USER on the source" "${DBUSER_RC}" 0 \
        "$(printf '%s' "${DBUSER_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

    if [[ "${DBUSER_RC}" -ne 0 ]]; then
        result_warn "Could not drop the database user on ${SOURCE_HOST}: $(printf '%s' "${DBUSER_OUT}" | tail -3 | tr '\n' ' ')"
    else
        DB_USER_DROPPED=true
    fi
fi

# ── Site root ─────────────────────────────────────────────────────────────────
SITE_ROOT_REMOVED=false
if [[ "${PRUNE_SITE_ROOT}" == "true" ]]; then
    step CONFIRMING "Checking approval gate for site root deletion"
    require_confirm "CONFIRM PRUNE" "PRUNE" "Permanently delete ${SITE_ROOT} on ${SOURCE_HOST}."

    step EXECUTING "Deleting ${SITE_ROOT} on ${SOURCE_HOST}"
    set +e
    PRUNE_OUT="$(ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "sudo rm -rf '${SITE_ROOT}' && echo removed" 2>&1)"
    PRUNE_RC=$?
    set -e
    journal_log "EXECUTING" "Delete the site root" "rm -rf ${SITE_ROOT}" "${PRUNE_RC}" 0 \
        "$(printf '%s' "${PRUNE_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"
    if [[ "${PRUNE_RC}" -ne 0 ]]; then
        fail_with 6 FAILED "Could not delete ${SITE_ROOT} on ${SOURCE_HOST}: $(printf '%s' "${PRUNE_OUT}" | tail -3 | tr '\n' ' ')"
    fi
    SITE_ROOT_REMOVED=true
fi

migration_state_set "${CLIENT}" "decommission" "snapshot=${SNAPSHOT_ID:-none} site_root_removed=${SITE_ROOT_REMOVED}"

step DECOMMISSIONED "Source ${SOURCE_HOST} retired"

result_add_string "action" "decommission"
result_add_string "source_host" "${SOURCE_HOST}"
result_add_string "target_host" "${TARGET_HOST}"
if [[ -n "${SNAPSHOT_ID}" ]]; then result_add_string "snapshot_id" "${SNAPSHOT_ID}"; fi
result_add_raw "days_since_cutover" "${DAYS_SINCE:-null}"
result_add_raw "database_user_dropped" "${DB_USER_DROPPED}"
result_add_raw "site_root_removed" "${SITE_ROOT_REMOVED}"
result_add_string "journal" "$(journal_path)"

emit_result "DECOMMISSIONED"
exit 0
