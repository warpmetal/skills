#!/usr/bin/env bash
# inspect.sh — Read-only preflight inspection for deploy-site
#
# Usage:
#   inspect.sh --client <name> [--json]
#
# Performs only read-only checks: manifest validation, SSH reachability, disk
# usage, current release, rollback target, runtime status, migration status, and
# whether the deployment lock is held.
#
# No approval gate: this script never mutates anything.
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
while [[ $# -gt 0 ]]; do
    case "$1" in
        --client) CLIENT="${2:-}"; shift 2 ;;
        --confirm) confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "deploy-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root domain stack health_url

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
manifest_validate_ssh

journal_init "deploy-site" "${CLIENT}" "${MANIFEST}"

RELEASES_DIR="${SITE_ROOT}/releases"
MIRROR_DIR="${SITE_ROOT}/.git"
LOCKFILE="/tmp/deploy-${CLIENT}.lock"
SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"

REMOTE_OUT=""
REMOTE_RC=0
try_rsh() {
    set +e
    REMOTE_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "$1" 2>&1)"
    REMOTE_RC=$?
    set -e
    return 0
}

step OBSERVING "Preflight for ${CLIENT} (${HOST})"

# 1. SSH reachability
step OBSERVING "Checking SSH connectivity"
try_rsh 'printf ok'
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    fail_with 3 STOPPED "SSH to ${SSH_DEST} failed: ${REMOTE_OUT}"
fi
step OBSERVING "SSH connectivity: OK"

# 2. Disk
step OBSERVING "Checking disk usage"
try_rsh "df -h '${SITE_ROOT}' 2>/dev/null; echo ---; df -i '${SITE_ROOT}' 2>/dev/null"
DISK_REPORT="$(printf '%s' "${REMOTE_OUT}")"
printf '%s\n' "${DISK_REPORT}" >&2

DISK_PCT="$(printf '%s' "${DISK_REPORT}" | awk '/^\/|^[A-Za-z]:/ {print $5}' | head -1 | tr -d '%')"
if [[ "${DISK_PCT}" =~ ^[0-9]+$ ]] && (( DISK_PCT > 90 )); then
    result_warn "Disk usage is ${DISK_PCT}% on ${HOST}"
fi

# 3. Current release and rollback target
step OBSERVING "Inspecting releases"
try_rsh "readlink -f '${SITE_ROOT}/current' 2>/dev/null || true"
CURRENT_RELEASE="$(basename "${REMOTE_OUT}" 2>/dev/null || true)"

try_rsh "
    cd '${RELEASES_DIR}' 2>/dev/null || exit 0
    for d in \$(ls -1t); do
        [ \"\$d\" = '${CURRENT_RELEASE}' ] && continue
        echo \"\$d\"
        break
    done
"
PREVIOUS_RELEASE="$(printf '%s' "${REMOTE_OUT}" | head -1 | tr -d '[:space:]')"

# 4. Shared resources
step OBSERVING "Checking shared resources"
try_rsh "[ -f '${SITE_ROOT}/shared/.env' ] && echo present || echo missing"
SHARED_ENV="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"
if [[ "${SHARED_ENV}" != "present" ]]; then
    result_warn "Missing ${SITE_ROOT}/shared/.env"
fi

# 5. Runtime status
step OBSERVING "Checking runtime status"
case "${STACK}" in
    laravel|wordpress) try_rsh "systemctl is-active php*-fpm 2>/dev/null || echo unknown" ;;
    node)              try_rsh "systemctl is-active '${APP_UNIT}' 2>/dev/null || echo unknown" ;;
    static)            try_rsh "systemctl is-active nginx 2>/dev/null || echo unknown" ;;
esac
RUNTIME_STATUS="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"

# 6. Migration status
MIGRATION_STATUS="n/a"
if [[ "${STACK}" == "laravel" ]]; then
    step OBSERVING "Checking pending migrations"
    try_rsh "cd '${SITE_ROOT}/current' 2>/dev/null && php artisan migrate:status 2>&1 | tail -5 || echo unavailable"
    MIGRATION_STATUS="$(printf '%s' "${REMOTE_OUT}" | tr '\n' ' ')"
fi

# 7. Deployment lock
step OBSERVING "Checking deployment lock"
try_rsh "flock -n '${LOCKFILE}' true 2>/dev/null && echo free || echo held"
LOCK_STATE="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"
if [[ "${LOCK_STATE}" == "held" ]]; then
    result_warn "The deployment lock ${LOCKFILE} is currently held"
fi

# 8. Git mirror
try_rsh "git --git-dir='${MIRROR_DIR}' rev-parse --short HEAD 2>/dev/null || echo none"
MIRROR_HEAD="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"

step OBSERVING "Preflight complete"

journal_log "OBSERVING" "Preflight inspection" "multiple read-only probes" 0 0 \
    "current=${CURRENT_RELEASE} previous=${PREVIOUS_RELEASE} runtime=${RUNTIME_STATUS} lock=${LOCK_STATE}" \
    "PLANNED" "OBSERVED"

result_add_string "action" "inspect"
result_add_string "host" "${HOST}"
result_add_string "stack" "${STACK}"
result_add_string "site_root" "${SITE_ROOT}"
result_add_string "current_release_id" "${CURRENT_RELEASE}"
result_add_string "rollback_target_id" "${PREVIOUS_RELEASE}"
result_add_string "runtime_status" "${RUNTIME_STATUS}"
result_add_string "lock_state" "${LOCK_STATE}"
result_add_string "git_mirror_head" "${MIRROR_HEAD}"
result_add_string "migration_status" "${MIGRATION_STATUS}"
result_add_raw "disk_used_percent" "${DISK_PCT:-null}"
result_add_string "journal" "$(journal_path)"

emit_result "OBSERVED"
exit 0
