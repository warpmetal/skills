#!/usr/bin/env bash
# sync.sh — Phase 3/4 of migrate-site: copy files and the database to the target
#
# Usage:
#   sync.sh --client <name> [--source <alias>] [--target <alias>]
#           [--target-root <path>] [--delta] [--staging-dir <path>] [--dry-run]
#           [--confirm "CONFIRM SYNC"]
#
# Two modes:
#   bulk (default)  Streams a tar archive from source to target over SSH. Uses no
#                   local disk and always copies everything.
#   --delta         Pulls into a local staging directory with rsync, then pushes.
#                   Transfers only differences, but needs local disk roughly the
#                   size of shared/.
#
# Database credentials are read from each host's own shared/.env, so the password
# never crosses the wire inside a command string.
#
# Approval (see conventions/approvals.md):
#   CONFIRM SYNC              before writing anything on the target
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
TARGET_ROOT_OVERRIDE=""
STAGING_DIR=""
DELTA=false
SKIP_FILES=false
SKIP_DATABASE=false
ACTION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)      CLIENT="${2:-}"; shift 2 ;;
        --source)      SOURCE_OVERRIDE="${2:-}"; shift 2 ;;
        --target)      TARGET_OVERRIDE="${2:-}"; shift 2 ;;
        --target-root) TARGET_ROOT_OVERRIDE="${2:-}"; shift 2 ;;
        --staging-dir) STAGING_DIR="${2:-}"; shift 2 ;;
        --delta)       DELTA=true; shift ;;
        --skip-files)  SKIP_FILES=true; shift ;;
        --skip-database) SKIP_DATABASE=true; shift ;;
        --action)      ACTION="${2:-}"; shift 2 ;;
        --dry-run)     DRY_RUN=true; shift ;;
        --confirm)     confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
if [[ -n "${ACTION}" && "${ACTION}" != "sync" ]]; then
    printf 'ERROR: --action %s does not match this script (sync)\n' "${ACTION}" >&2
    exit 2
fi

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "migrate-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report

SOURCE_HOST="${SOURCE_OVERRIDE:-${MIGRATION_SOURCE_HOST:-${HOST}}}"
TARGET_HOST="${TARGET_OVERRIDE:-${MIGRATION_TARGET_HOST}}"
TARGET_ROOT="${TARGET_ROOT_OVERRIDE:-${MIGRATION_TARGET_ROOT:-${SITE_ROOT}}}"

[[ -n "${TARGET_HOST}" ]] || fail_with 5 STOPPED "No target host: pass --target or set migration.target_host"
migration_require_alias "${SOURCE_HOST}" "source"
migration_require_alias "${TARGET_HOST}" "target"

journal_init "migrate-site" "${CLIENT}" "${MANIFEST}"

SOURCE_SSH="$(ssh_target "${SOURCE_HOST}" "${DEPLOY_USER}")"
TARGET_SSH="$(ssh_target "${TARGET_HOST}" "${DEPLOY_USER}")"

migration_require_phase "${CLIENT}" "inventory" "The inventory phase" 12
migration_require_phase "${CLIENT}" "prepare" "The prepare phase" 12

SSH_E_OPTS="-o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=10 -o ForwardAgent=no"

MODE="bulk"
[[ "${DELTA}" == "true" ]] && MODE="delta"

step OBSERVING "Sync (${MODE}) ${CLIENT}: ${SOURCE_HOST} -> ${TARGET_HOST}"

{
    printf '\nSync plan\n'
    printf '  Mode:          %s\n' "${MODE}"
    printf '  Source:        %s:%s/shared/\n' "${SOURCE_HOST}" "${SITE_ROOT}"
    printf '  Target:        %s:%s/shared/\n' "${TARGET_HOST}" "${TARGET_ROOT}"
    printf '  Files:         %s\n' "$([[ "${SKIP_FILES}" == "true" ]] && printf 'skipped' || printf 'will sync')"
    printf '  Database:      %s\n' "$([[ "${SKIP_DATABASE}" == "true" ]] && printf 'skipped' || printf 'will sync')"
    [[ "${DELTA}" == "true" ]] && printf '  Staging dir:   %s\n' "${STAGING_DIR:-<temporary directory>}"
    printf '  Gate required: CONFIRM SYNC\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no mutations performed"
    result_add_string "action" "sync"
    result_add_string "source_host" "${SOURCE_HOST}"
    result_add_string "target_host" "${TARGET_HOST}"
    result_add_string "mode" "${MODE}"
    emit_result "PLANNED"
    exit 0
fi

# ── Gate ──────────────────────────────────────────────────────────────────────
step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM SYNC" "SYNC" "Write files and database data onto ${TARGET_HOST}."

FILES_RC=0
DB_RC=0

# ── Files ─────────────────────────────────────────────────────────────────────
if [[ "${SKIP_FILES}" == "false" ]]; then
    if [[ "${DELTA}" == "true" ]]; then
        step EXECUTING "Delta file sync via a local staging directory"

        OWN_STAGING=false
        if [[ -z "${STAGING_DIR}" ]]; then
            STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/migrate-${CLIENT}-XXXXXX")"
            OWN_STAGING=true
        else
            mkdir -p "${STAGING_DIR}"
        fi

        cleanup_staging() {
            [[ "${OWN_STAGING}" == "true" ]] && rm -rf "${STAGING_DIR}"
        }
        trap cleanup_staging EXIT

        step EXECUTING "Pulling the source into ${STAGING_DIR}"
        set +e
        PULL_OUT="$(rsync -aHAXz --delete -e "ssh ${SSH_E_OPTS}" \
            "${SOURCE_SSH}:${SITE_ROOT}/shared/" "${STAGING_DIR}/" 2>&1)"
        FILES_RC=$?
        set -e
        journal_log "EXECUTING" "rsync pull (delta)" "rsync ${SOURCE_SSH}:${SITE_ROOT}/shared/ -> staging" "${FILES_RC}" 0 \
            "$(printf '%s' "${PULL_OUT}" | tail -20 | journal_sanitize)" "EXECUTING" "EXECUTING"
        if [[ "${FILES_RC}" -ne 0 ]]; then
            fail_with 4 FAILED "rsync pull from ${SOURCE_HOST} failed: $(printf '%s' "${PULL_OUT}" | tail -5 | tr '\n' ' ')"
        fi

        step EXECUTING "Pushing the staged tree to the target"
        set +e
        PUSH_OUT="$(rsync -aHAXz --delete -e "ssh ${SSH_E_OPTS}" \
            "${STAGING_DIR}/" "${TARGET_SSH}:${TARGET_ROOT}/shared/" 2>&1)"
        FILES_RC=$?
        set -e
        journal_log "EXECUTING" "rsync push (delta)" "rsync staging -> ${TARGET_SSH}:${TARGET_ROOT}/shared/" "${FILES_RC}" 0 \
            "$(printf '%s' "${PUSH_OUT}" | tail -20 | journal_sanitize)" "EXECUTING" "EXECUTING"
        if [[ "${FILES_RC}" -ne 0 ]]; then
            fail_with 4 FAILED "rsync push to ${TARGET_HOST} failed: $(printf '%s' "${PUSH_OUT}" | tail -5 | tr '\n' ' ')"
        fi

        cleanup_staging
        trap - EXIT
    else
        step EXECUTING "Bulk file sync (tar stream over SSH)"
        set +e
        ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "tar -C '${SITE_ROOT}/shared' -czf - ." 2>/dev/null \
            | ssh "${SSH_OPTS[@]}" "${TARGET_SSH}" "mkdir -p '${TARGET_ROOT}/shared' && tar --no-same-owner -C '${TARGET_ROOT}/shared' -xzf -" 2>&1
        FILES_RC=$?
        set -e
        journal_log "EXECUTING" "Bulk tar stream" "ssh source tar -czf - | ssh target tar -xzf -" "${FILES_RC}" 0 "" "EXECUTING" "EXECUTING"
        if [[ "${FILES_RC}" -ne 0 ]]; then
            fail_with 4 FAILED "The bulk file stream failed (exit ${FILES_RC}). Check that ${TARGET_ROOT}/shared exists and is writable on ${TARGET_HOST}."
        fi
    fi

    step EXECUTING "Files synced"
    migration_state_set "${CLIENT}" "synced_files" "mode=${MODE}"
fi

# ── Database ──────────────────────────────────────────────────────────────────
if [[ "${SKIP_DATABASE}" == "false" ]]; then
    step EXECUTING "Streaming the database dump"

    DUMP_SCRIPT="set -a; . '${SITE_ROOT}/shared/.env'; set +a
export MYSQL_PWD=\"\$DB_PASSWORD\"
exec mysqldump --single-transaction --routines --triggers --events --quick -u \"\$DB_USERNAME\" \"\$DB_DATABASE\""

    LOAD_SCRIPT="set -a; . '${TARGET_ROOT}/shared/.env'; set +a
export MYSQL_PWD=\"\$DB_PASSWORD\"
exec mysql -u \"\$DB_USERNAME\" \"\$DB_DATABASE\""

    set +e
    ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "${DUMP_SCRIPT}" 2>/dev/null \
        | ssh "${SSH_OPTS[@]}" "${TARGET_SSH}" "${LOAD_SCRIPT}" 2>&1
    DB_RC=$?
    set -e

    journal_log "EXECUTING" "Database stream" "mysqldump | mysql" "${DB_RC}" 0 "" "EXECUTING" "EXECUTING"

    if [[ "${DB_RC}" -ne 0 ]]; then
        fail_with 4 FAILED "The database stream failed (exit ${DB_RC}). Confirm that ${TARGET_ROOT}/shared/.env exists on ${TARGET_HOST} and its credentials work."
    fi
    step EXECUTING "Database synced"
    migration_state_set "${CLIENT}" "synced_db" "mode=${MODE}"
fi

migration_state_set "${CLIENT}" "sync" "mode=${MODE}"

# ── Row-count sanity check ────────────────────────────────────────────────────
ROW_DELTA=""
if [[ "${SKIP_DATABASE}" == "false" ]]; then
    step VERIFYING "Comparing the users table row count between hosts"
    set +e
    SOURCE_ROWS="$(ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "set -a; . '${SITE_ROOT}/shared/.env'; set +a; export MYSQL_PWD=\"\$DB_PASSWORD\"; mysql -N -B -u \"\$DB_USERNAME\" \"\$DB_DATABASE\" -e 'SELECT COUNT(*) FROM users;' 2>/dev/null" 2>/dev/null | tail -1 | tr -d '[:space:]')"
    TARGET_ROWS="$(ssh "${SSH_OPTS[@]}" "${TARGET_SSH}" "set -a; . '${TARGET_ROOT}/shared/.env'; set +a; export MYSQL_PWD=\"\$DB_PASSWORD\"; mysql -N -B -u \"\$DB_USERNAME\" \"\$DB_DATABASE\" -e 'SELECT COUNT(*) FROM users;' 2>/dev/null" 2>/dev/null | tail -1 | tr -d '[:space:]')"
    set -e

    if [[ "${SOURCE_ROWS}" =~ ^[0-9]+$ && "${TARGET_ROWS}" =~ ^[0-9]+$ ]]; then
        ROW_DELTA=$(( SOURCE_ROWS - TARGET_ROWS ))
        step VERIFYING "users rows: source=${SOURCE_ROWS} target=${TARGET_ROWS} delta=${ROW_DELTA}"
        if [[ "${ROW_DELTA}" -gt 0 ]]; then
            result_warn "The target has ${ROW_DELTA} fewer users rows than the source; rerun the sync just before freezing"
        fi
    else
        step VERIFYING "users row comparison not available"
    fi
fi

step SYNCED "Sync complete (${MODE})"

result_add_string "action" "sync"
result_add_string "source_host" "${SOURCE_HOST}"
result_add_string "target_host" "${TARGET_HOST}"
result_add_string "mode" "${MODE}"
result_add_raw "files_synced" "$([[ "${SKIP_FILES}" == "true" ]] && printf 'false' || printf 'true')"
result_add_raw "database_synced" "$([[ "${SKIP_DATABASE}" == "true" ]] && printf 'false' || printf 'true')"
if [[ -n "${ROW_DELTA}" ]]; then
    result_add_raw "users_row_delta" "${ROW_DELTA}"
fi
result_add_string "journal" "$(journal_path)"

emit_result "SYNCED"
exit 0
