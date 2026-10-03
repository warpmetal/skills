#!/usr/bin/env bash
# restore.sh — Restore a restic snapshot for backup-restore
#
# Usage:
#   restore.sh --client <name> [--snapshot <id>] [--target <dir>] [--repo <url>] [--dry-run]
#              [--confirm "CONFIRM RESTORE"]                    # scratch target
#              [--confirm "CONFIRM RESTORE <client>"]           # live target
#
# Restoring into the site root overwrites live data and requires the
# client-specific gate string. Any other target is a scratch restore.
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
SNAPSHOT="latest"
TARGET_DIR=""
REPO_OVERRIDE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)   CLIENT="${2:-}"; shift 2 ;;
        --snapshot) SNAPSHOT="${2:-}"; shift 2 ;;
        --target)   TARGET_DIR="${2:-}"; shift 2 ;;
        --repo)     REPO_OVERRIDE="${2:-}"; shift 2 ;;
        --dry-run)  DRY_RUN=true; shift ;;
        --confirm)  confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "backup-restore" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
manifest_validate_ssh

journal_init "backup-restore" "${CLIENT}" "${MANIFEST}"

REPO="${REPO_OVERRIDE:-${BACKUP_REPO}}"
SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"
PASS_FILE="/etc/restic/${CLIENT}.password"
ENV_FILE="/etc/restic/${CLIENT}.env"

if [[ -z "${REPO}" ]]; then
    fail_with 5 STOPPED "backup.repo is required in the manifest (or pass --repo)"
fi

IS_LIVE=false
if [[ -z "${TARGET_DIR}" ]]; then
    TARGET_DIR="/tmp/restore-${CLIENT}-$(date -u +%Y%m%d-%H%M%S)"
elif [[ "${TARGET_DIR}" == "${SITE_ROOT}" || "${TARGET_DIR}" == "${SITE_ROOT}/"* ]]; then
    IS_LIVE=true
fi

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
step OBSERVING "Listing recent snapshots for ${CLIENT}"
try_rsh "set -a; [ -f '${ENV_FILE}' ] && . '${ENV_FILE}'; set +a; restic --password-file '${PASS_FILE}' -r '${REPO}' snapshots --last 10 2>&1"
SNAPSHOT_LIST="${REMOTE_OUT}"
printf '%s\n' "${SNAPSHOT_LIST}" >&2
journal_log "OBSERVING" "Snapshot list" "restic snapshots --last 10" "${REMOTE_RC}" 0 \
    "$(printf '%s' "${SNAPSHOT_LIST}" | journal_sanitize)" "OBSERVING" "OBSERVING"

if [[ "${REMOTE_RC}" -ne 0 ]]; then
    fail_with 4 FAILED "Could not list snapshots on ${HOST}: ${SNAPSHOT_LIST}"
fi

{
    printf '\nRestore plan for %s (%s)\n' "${CLIENT}" "${HOST}"
    printf '  Repository:  %s\n' "${REPO}"
    printf '  Snapshot:    %s\n' "${SNAPSHOT}"
    printf '  Target:      %s\n' "${TARGET_DIR}"
    printf '  Live data:   %s\n' "${IS_LIVE}"
    if [[ "${IS_LIVE}" == "true" ]]; then
        printf '  WARNING: this overwrites live data under %s\n' "${SITE_ROOT}"
        printf '  Gate:    CONFIRM RESTORE %s\n' "${CLIENT}"
    else
        printf '  Gate:    CONFIRM RESTORE\n'
    fi
    printf '\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no mutations performed"
    result_add_string "action" "restore"
    result_add_string "snapshot_id" "${SNAPSHOT}"
    result_add_string "target" "${TARGET_DIR}"
    result_add_raw "live_restore" "${IS_LIVE}"
    emit_result "PLANNED"
    exit 0
fi

# ── Gate ──────────────────────────────────────────────────────────────────────
if [[ "${IS_LIVE}" == "true" ]]; then
    step CONFIRMING "Checking approval gate (live restore)"
    require_confirm "CONFIRM RESTORE ${CLIENT}" "RESTORE ${CLIENT}" "This overwrites live data under ${SITE_ROOT} on ${HOST} with snapshot ${SNAPSHOT}."
else
    step CONFIRMING "Checking approval gate (scratch restore)"
    require_confirm "CONFIRM RESTORE" "RESTORE" "Restore snapshot ${SNAPSHOT} into the scratch directory ${TARGET_DIR} on ${HOST}."
fi

# ── Restore ───────────────────────────────────────────────────────────────────
step EXECUTING "Restoring ${SNAPSHOT} into ${TARGET_DIR}"
set +e
RESTORE_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "
    set -a; [ -f '${ENV_FILE}' ] && . '${ENV_FILE}'; set +a
    mkdir -p '${TARGET_DIR}'
    restic --password-file '${PASS_FILE}' -r '${REPO}' restore '${SNAPSHOT}' --target '${TARGET_DIR}' 2>&1
")"
RESTORE_RC=$?
set -e

journal_log "EXECUTING" "restic restore" "restic restore ${SNAPSHOT} --target ${TARGET_DIR}" "${RESTORE_RC}" 0 \
    "$(printf '%s' "${RESTORE_OUT}" | tail -40 | journal_sanitize)" "EXECUTING" "VERIFYING"

if [[ "${RESTORE_RC}" -ne 0 ]]; then
    result_add_string "action" "restore"
    result_add_string "snapshot_id" "${SNAPSHOT}"
    result_add_string "target" "${TARGET_DIR}"
    result_add_raw "live_restore" "${IS_LIVE}"
    fail_with 4 FAILED "Restore failed: $(printf '%s' "${RESTORE_OUT}" | tr '\n' ' ' | tail -c 400)"
fi

# ── Verify the restore landed ─────────────────────────────────────────────────
step VERIFYING "Verifying the restored tree"
try_rsh "find '${TARGET_DIR}' -mindepth 1 -maxdepth 2 2>/dev/null | head -20"
RESTORED_ENTRIES="$(printf '%s' "${REMOTE_OUT}" | grep -c . || true)"

if [[ "${RESTORED_ENTRIES}" -eq 0 ]]; then
    fail_with 4 FAILED "The restore reported success but ${TARGET_DIR} is empty on ${HOST}"
fi

if [[ "${IS_LIVE}" == "false" ]]; then
    result_warn "This is a scratch restore at ${TARGET_DIR}. Review it before promoting anything to live."
fi

step RESTORED "Restored ${SNAPSHOT} to ${TARGET_DIR}"

result_add_string "action" "restore"
result_add_string "snapshot_id" "${SNAPSHOT}"
result_add_string "target" "${TARGET_DIR}"
result_add_raw "live_restore" "${IS_LIVE}"
result_add_raw "restored_entries" "${RESTORED_ENTRIES}"
result_add_string "journal" "$(journal_path)"

emit_result "RESTORED"
exit 0
