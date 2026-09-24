#!/usr/bin/env bash
# restart-workers.sh — Gracefully restart queue workers onto the current release
#
# Usage:
#   restart-workers.sh --client <name> [--wait <seconds>] [--systemd-restart]
#                      [--dry-run]
#                      [--confirm "CONFIRM RESTART"]
#
# Laravel: writes the restart signal with `artisan queue:restart`. Each worker
# finishes its in-flight job, exits, and systemd's Restart=always brings it back
# on the new code. Nothing is killed mid-job.
#
# Node/BullMQ: sends SIGTERM through systemd, which the worker's signal handler
# is expected to drain. SIGKILL is never sent directly by this script; systemd
# only escalates if TimeoutStopSec expires.
#
# Approval (see conventions/approvals.md):
#   CONFIRM RESTART           send the restart signal
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
WAIT=""
SYSTEMD_RESTART=false
ACTION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)          CLIENT="${2:-}"; shift 2 ;;
        --wait)            WAIT="${2:-}"; shift 2 ;;
        --systemd-restart) SYSTEMD_RESTART=true; shift ;;
        --action)          ACTION="${2:-}"; shift 2 ;;
        --dry-run)         DRY_RUN=true; shift ;;
        --confirm)         confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
case "${ACTION}" in
    ""|restart) ;;
    *) printf 'ERROR: --action %s does not match this script (restart)\n' "${ACTION}" >&2; exit 2 ;;
esac

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "queue-cron-setup" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root stack

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
manifest_validate_ssh

WAIT="${WAIT:-$(( QUEUE_TIMEOUT + 30 ))}"
if ! [[ "${WAIT}" =~ ^[1-9][0-9]*$ ]]; then
    printf 'ERROR: --wait must be a positive integer number of seconds\n' >&2
    exit 2
fi

journal_init "queue-cron-setup" "${CLIENT}" "${MANIFEST}"

SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"

# ── Pre-state ─────────────────────────────────────────────────────────────────
step OBSERVING "Collecting the pre-restart state on ${HOST}"
BEFORE="$(queue_collect_facts "${SSH_DEST}" "${SITE_ROOT}" "${STACK}" "${WORKER_UNIT}" "${QUEUE_LOG_DIR}")"
BEFORE_PIDS="$(queue_fact "${BEFORE}" worker_pids)"
BEFORE_ACTIVE="$(queue_fact "${BEFORE}" worker_units_active)"
BEFORE_STALE="$(queue_fact "${BEFORE}" stale_state)"
BEFORE_CACHE="$(queue_fact "${BEFORE}" cache_ok)"

CURRENT_DIR="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "readlink -f '${SITE_ROOT}/current' 2>/dev/null || true" 2>/dev/null | head -1)"

step OBSERVING "Workers active: ${BEFORE_ACTIVE:-0}; PIDs: ${BEFORE_PIDS:-none}"
step OBSERVING "Stale-code before restart: ${BEFORE_STALE}"
if [[ -n "${CURRENT_DIR}" ]]; then
    step OBSERVING "Current release: ${CURRENT_DIR}"
fi

if [[ "${BEFORE_CACHE}" == "no" ]]; then
    result_warn "The cache driver is null, so 'queue:restart' will have no effect. Use --systemd-restart for this client."
fi

METHOD="artisan"
if [[ "${STACK}" != "laravel" ]] || [[ "${SYSTEMD_RESTART}" == "true" ]]; then
    METHOD="systemd"
fi

{
    printf '\nRestart plan for %s\n' "${HOST}"
    printf '  Worker unit:     %s\n' "${WORKER_UNIT}"
    printf '  Method:          %s\n' "$([[ "${METHOD}" == "artisan" ]] && printf 'artisan queue:restart (graceful, no job interrupted)' || printf 'systemctl restart (SIGTERM, then TimeoutStopSec=%ss)' "${QUEUE_TIMEOUT}")"
    printf '  Wait for cycle:  %ss\n' "${WAIT}"
    printf '  Gate required:   CONFIRM RESTART\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no restart performed"
    result_add_string "action" "restart"
    result_add_string "host" "${HOST}"
    result_add_string "method" "${METHOD}"
    result_add_raw "workers_active_before" "${BEFORE_ACTIVE:-0}"
    emit_result "PLANNED"
    exit 0
fi

step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM RESTART" "RESTART" "Send the restart signal to the queue workers on ${HOST}."

# ── Send the signal ───────────────────────────────────────────────────────────
SIGNAL=""
if [[ "${METHOD}" == "artisan" ]]; then
    step EXECUTING "Sending artisan queue:restart (graceful; in-flight jobs finish)"
    SIGNAL="cd '${SITE_ROOT}/current' && php artisan queue:restart"
else
    step EXECUTING "Restarting worker units through systemd (SIGTERM)"
    SIGNAL="for u in \$(systemctl list-unit-files --no-pager 2>/dev/null | awk -v p='${WORKER_UNIT}' 'index(\$1, p) == 1 && \$1 ~ /\\.service\$/ {print \$1}'); do sudo systemctl restart \"\$u\"; done"
fi

set +e
SIGNAL_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "set -e; ${SIGNAL}" 2>&1)"
SIGNAL_RC=$?
set -e

journal_log "EXECUTING" "Restart signal" "${METHOD}" "${SIGNAL_RC}" 0 \
    "$(printf '%s' "${SIGNAL_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

if [[ "${SIGNAL_RC}" -ne 0 ]]; then
    fail_with 8 FAILED "The restart signal failed on ${HOST}: $(printf '%s' "${SIGNAL_OUT}" | tail -5 | tr '\n' ' ')"
fi
printf '%s\n' "${SIGNAL_OUT}" >&2

# ── Wait for the workers to come back on new code ─────────────────────────────
step VERIFYING "Waiting up to ${WAIT}s for workers to cycle onto the current release"
CYCLED=false
WAITED=0
AFTER_PIDS=""
AFTER_STALE=""
while [[ "${WAITED}" -lt "${WAIT}" ]]; do
    sleep 10
    WAITED=$((WAITED + 10))

    AFTER="$(queue_collect_facts "${SSH_DEST}" "${SITE_ROOT}" "${STACK}" "${WORKER_UNIT}" "${QUEUE_LOG_DIR}")"
    AFTER_PIDS="$(queue_fact "${AFTER}" worker_pids)"
    AFTER_STALE="$(queue_fact "${AFTER}" stale_state)"

    if [[ "${AFTER_STALE}" == "ok" ]]; then
        CYCLED=true
        break
    fi
    if (( WAITED % 30 == 0 )); then
        step VERIFYING "Still waiting (${WAITED}s elapsed, workers: ${AFTER_STALE:-unknown})"
    fi
done

step VERIFYING "PIDs before: ${BEFORE_PIDS:-none}"
step VERIFYING "PIDs after:  ${AFTER_PIDS:-none}"

if [[ "${CYCLED}" == "true" ]]; then
    step VERIFYING "Workers are running the current release"
else
    result_warn "Workers had not reached 'ok' on the stale-code check within ${WAIT}s (last state: ${AFTER_STALE:-unknown})"
fi

step RESTARTED "Workers restarted on ${HOST}"

result_add_string "action" "restart"
result_add_string "host" "${HOST}"
result_add_string "method" "${METHOD}"
result_add_raw "workers_active_before" "${BEFORE_ACTIVE:-0}"
result_add_string_array "worker_pids_before" ${BEFORE_PIDS:-}
result_add_string_array "worker_pids_after" ${AFTER_PIDS:-}
result_add_raw "cycled" "${CYCLED}"
result_add_string "stale_code_before" "${BEFORE_STALE}"
result_add_string "stale_code_after" "${AFTER_STALE}"
result_add_string "journal" "$(journal_path)"

emit_result "RESTARTED"
exit 0
