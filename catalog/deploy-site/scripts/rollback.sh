#!/usr/bin/env bash
# rollback.sh — Roll back deploy-site to a previous release
#
# Usage:
#   rollback.sh --client <name> [--release-id <id>] [--dry-run] [--confirm "CONFIRM ROLLBACK"]
#
# Approval (see conventions/approvals.md):
#   CONFIRM ROLLBACK          always
#
# Refuses to run when the active release carries a `.migrations-ran` marker,
# because rolling back the code without rolling back the schema is unsafe.
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
TARGET_RELEASE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)     CLIENT="${2:-}"; shift 2 ;;
        --release-id) TARGET_RELEASE="${2:-}"; shift 2 ;;
        --dry-run)    DRY_RUN=true; shift ;;
        --confirm)    confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "deploy-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root stack

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
manifest_validate_ssh

journal_init "deploy-site" "${CLIENT}" "${MANIFEST}"

RELEASES_DIR="${SITE_ROOT}/releases"
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

# ── Read-only preflight ───────────────────────────────────────────────────────
step OBSERVING "Inspecting the active release"

try_rsh "readlink -f '${SITE_ROOT}/current' 2>/dev/null || true"
CURRENT_TARGET="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"
CURRENT_ID="$(basename "${CURRENT_TARGET}" 2>/dev/null || true)"

if [[ -z "${CURRENT_ID}" || "${CURRENT_TARGET}" != "${RELEASES_DIR}/"* ]]; then
    fail_with 10 FAILED "The 'current' symlink does not resolve to a release under ${RELEASES_DIR}"
fi

# Migration marker travels with the release, so it survives reboots and host changes.
try_rsh "[ -f '${SITE_ROOT}/current/.migrations-ran' ] && echo yes || echo no"
MIGRATIONS_RAN=false
[[ "$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')" == "yes" ]] && MIGRATIONS_RAN=true

if [[ "${MIGRATIONS_RAN}" == "true" ]]; then
    step FAILED "Release ${CURRENT_ID} ran migrations"
    result_add_string "action" "rollback"
    result_add_string "current_release_id" "${CURRENT_ID}"
    result_add_raw "migrations_were_run" "true"
    result_add_raw "rollback_performed" "false"
    fail_with 7 STOPPED "Automatic rollback is refused: ${CURRENT_ID} ran migrations. Rolling the code back without a matching schema rollback is unsafe. Resolve manually, then clear ${SITE_ROOT}/current/.migrations-ran if you accept the risk."
fi

# Pick the target release.
if [[ -n "${TARGET_RELEASE}" ]]; then
    try_rsh "[ -d '${RELEASES_DIR}/${TARGET_RELEASE}' ] && echo yes || echo no"
    if [[ "$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')" != "yes" ]]; then
        fail_with 10 FAILED "Release ${TARGET_RELEASE} does not exist under ${RELEASES_DIR}"
    fi
    PREVIOUS_ID="${TARGET_RELEASE}"
else
    try_rsh "
        cd '${RELEASES_DIR}' 2>/dev/null || exit 0
        for d in \$(ls -1t); do
            [ \"\$d\" = '${CURRENT_ID}' ] && continue
            echo \"\$d\"
            break
        done
    "
    PREVIOUS_ID="$(printf '%s' "${REMOTE_OUT}" | head -1 | tr -d '[:space:]')"
fi

if [[ -z "${PREVIOUS_ID}" ]]; then
    fail_with 10 FAILED "No previous release is available to roll back to (current: ${CURRENT_ID})"
fi

step OBSERVING "Current release: ${CURRENT_ID}"
step OBSERVING "Rollback target: ${PREVIOUS_ID}"

{
    printf '\nRollback plan for %s (%s)\n' "${CLIENT}" "${HOST}"
    printf '  Current release: %s\n' "${CURRENT_ID}"
    printf '  Target release:  %s\n' "${PREVIOUS_ID}"
    printf '  Stack:           %s\n' "${STACK}"
    printf '  Migrations ran:  %s\n' "${MIGRATIONS_RAN}"
    printf '  Gate required:   CONFIRM ROLLBACK\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no mutations performed"
    result_add_string "action" "rollback"
    result_add_string "current_release_id" "${CURRENT_ID}"
    result_add_string "target_release_id" "${PREVIOUS_ID}"
    result_add_raw "migrations_were_run" "${MIGRATIONS_RAN}"
    emit_result "PLANNED"
    exit 0
fi

# ── Gate ──────────────────────────────────────────────────────────────────────
step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM ROLLBACK" "ROLLBACK" "Repointing 'current' from ${CURRENT_ID} to ${PREVIOUS_ID}"

# ── Lock ──────────────────────────────────────────────────────────────────────
step EXECUTING "Acquiring deployment lock"
exec 9>"${LOCKFILE}"
if ! flock -n 9; then
    fail_with 12 STOPPED "Another deployment holds ${LOCKFILE}"
fi

release_lock() {
    flock -u 9 2>/dev/null || true
    exec 9>&- 2>/dev/null || true
}
trap release_lock EXIT

# ── Swap ──────────────────────────────────────────────────────────────────────
step EXECUTING "Repointing 'current' to ${PREVIOUS_ID}"
try_rsh "
    set -e
    ln -sfn '${RELEASES_DIR}/${PREVIOUS_ID}' '${SITE_ROOT}/current.tmp'
    mv -Tf '${SITE_ROOT}/current.tmp' '${SITE_ROOT}/current'
"
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    result_add_string "action" "rollback"
    result_add_string "current_release_id" "${CURRENT_ID}"
    result_add_string "target_release_id" "${PREVIOUS_ID}"
    result_add_raw "rollback_performed" "false"
    fail_with 10 FAILED "Could not repoint the symlink; 'current' still points at ${CURRENT_ID}: ${REMOTE_OUT}"
fi
journal_log "ROLLING_BACK" "Symlink swap" "ln -sfn ... && mv -Tf" 0 0 "${PREVIOUS_ID}" "ROLLING_BACK" "VERIFYING"

# ── Reload runtime ────────────────────────────────────────────────────────────
step EXECUTING "Reloading runtime (${STACK})"
case "${STACK}" in
    laravel|wordpress)
        try_rsh "systemctl reload php*-fpm 2>&1 || systemctl reload php-fpm 2>&1"
        [[ "${REMOTE_RC}" -eq 0 ]] || result_warn "PHP-FPM reload reported an error: ${REMOTE_OUT}"
        ;;
    node)
        try_rsh "systemctl reload nginx 2>&1; systemctl restart '${APP_UNIT}' 2>&1"
        [[ "${REMOTE_RC}" -eq 0 ]] || result_warn "Node runtime restart reported an error: ${REMOTE_OUT}"
        ;;
    static)
        try_rsh "systemctl reload nginx 2>&1"
        [[ "${REMOTE_RC}" -eq 0 ]] || result_warn "nginx reload reported an error: ${REMOTE_OUT}"
        ;;
esac

# ── Restart workers ───────────────────────────────────────────────────────────
step EXECUTING "Restarting queue workers"
if [[ -n "${WORKER_UNIT}" ]]; then
    try_rsh "systemctl restart '${WORKER_UNIT}'1 2>&1"
    [[ "${REMOTE_RC}" -eq 0 ]] || result_warn "Worker restart reported an error for ${WORKER_UNIT}1: ${REMOTE_OUT}"
fi
if [[ "${STACK}" == "laravel" ]]; then
    try_rsh "cd '${SITE_ROOT}/current' && php artisan queue:restart 2>&1"
    [[ "${REMOTE_RC}" -eq 0 ]] || result_warn "queue:restart reported an error: ${REMOTE_OUT}"
fi

# ── Health check ──────────────────────────────────────────────────────────────
step VERIFYING "Polling ${HEALTH_URL}"
health_ok=false
for _ in 1 2 3; do
    http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${HEALTH_URL}" 2>/dev/null || printf '000')"
    if [[ "${http_code}" == "200" ]]; then
        health_ok=true
        break
    fi
    sleep 3
done

result_add_string "action" "rollback"
result_add_string "current_release_id" "${CURRENT_ID}"
result_add_string "target_release_id" "${PREVIOUS_ID}"
result_add_raw "migrations_were_run" "false"
result_add_raw "rollback_performed" "true"
result_add_raw "health_check_passed" "${health_ok}"
result_add_string "journal" "$(journal_path)"

if [[ "${health_ok}" != "true" ]]; then
    result_warn "Health check did not pass after the rollback"
    step FAILED "Rollback completed but ${HEALTH_URL} is not returning 200"
    emit_result "ROLLED_BACK"
    exit 9
fi

step READY "Rolled back to ${PREVIOUS_ID}"
emit_result "ROLLED_BACK"
exit 0
