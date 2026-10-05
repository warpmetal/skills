#!/usr/bin/env bash
# inspect-queues.sh — Read-only queue and scheduler status
#
# Usage:
#   inspect-queues.sh --client <name> [--json]
#
# Reports worker units, stale-code state, cron entries, queue depth, cache health,
# and log sizes. Collects everything in one SSH session via
# conventions/lib/queue.sh, which verify-workers.sh also uses.
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
ACTION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)  CLIENT="${2:-}"; shift 2 ;;
        --action)  ACTION="${2:-}"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --confirm) confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
case "${ACTION}" in
    ""|status|inspect) ;;
    *) printf 'ERROR: --action %s does not match this script (status)\n' "${ACTION}" >&2; exit 2 ;;
esac

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "queue-cron-setup" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root stack

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
manifest_validate_ssh

journal_init "queue-cron-setup" "${CLIENT}" "${MANIFEST}"

SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"

step OBSERVING "Queue status for ${CLIENT} on ${HOST}"

{
    printf '\nQueue inspection\n'
    printf '  Host:            %s\n' "${HOST}"
    printf '  Stack:           %s\n' "${STACK}"
    printf '  Queue driver:    %s (connection %s)\n' "${QUEUE_DRIVER:-unset}" "${QUEUE_CONNECTION:-default}"
    printf '  Desired workers: %s\n' "${QUEUE_WORKERS}"
    printf '  Worker unit:     %s\n' "${WORKER_UNIT}"
    printf '  Read-only; no gate required.\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no collection performed"
    result_add_string "action" "status"
    emit_result "PLANNED"
    exit 0
fi

FACTS="$(queue_collect_facts "${SSH_DEST}" "${SITE_ROOT}" "${STACK}" "${WORKER_UNIT}" "${QUEUE_LOG_DIR}")"

if ! printf '%s' "${FACTS}" | grep -q 'QUEUE_FACTS_DONE'; then
    fail_with 3 STOPPED "Queue fact collection on ${HOST} did not complete. Last output: $(printf '%s' "${FACTS}" | tail -5 | tr '\n' ' ')"
fi

journal_log "OBSERVING" "Collect queue facts" "queue_collect_facts" 0 0 \
    "$(printf '%s' "${FACTS}" | journal_sanitize)" "OBSERVING" "OBSERVED"

fact() { queue_fact "${FACTS}" "$1"; }

UNITS_TOTAL="$(fact worker_units_total)"
UNITS_ACTIVE="$(fact worker_units_active)"
PIDS="$(fact worker_pids)"
STALE_STATE="$(fact stale_state)"
STALE_DETAIL="$(fact stale_detail)"
CRON_SCHED="$(fact cron_schedule_entries)"
CRON_WORKERS="$(fact cron_worker_entries)"
CRON_TOTAL="$(fact cron_total_entries)"
CRON_REDIRECT="$(fact cron_scheduler_log_redirect)"
FAILED_JOBS="$(fact failed_jobs)"
PENDING_JOBS="$(fact pending_jobs)"
OLDEST_MIN="$(fact oldest_pending_minutes)"
LOG_SIZE="$(fact log_dir_size_bytes)"
LOG_COUNT="$(fact log_file_count)"
LOGROTATE="$(fact logrotate_configured)"
HEALTHCHECK="$(fact healthcheck_configured)"
CACHE_OK="$(fact cache_ok)"
CACHE_DRIVER="$(fact cache_driver)"
REDIS_OK="$(fact redis_reachable)"
HEALTHCHECK_JOBS="$(manifest_get queue.critical_jobs)"

step OBSERVING "Worker units: ${UNITS_ACTIVE}/${UNITS_TOTAL} active (desired ${QUEUE_WORKERS})"
step OBSERVING "Worker PIDs: ${PIDS:-none}"
step OBSERVING "Stale-code: ${STALE_STATE}${STALE_DETAIL:+ (${STALE_DETAIL})}"
step OBSERVING "Cron: ${CRON_SCHED} schedule entr(ies), ${CRON_TOTAL} total"
if [[ -n "${FAILED_JOBS}" ]]; then
    step OBSERVING "failed_jobs: ${FAILED_JOBS}"
fi
if [[ -n "${PENDING_JOBS}" ]]; then
    step OBSERVING "pending jobs: ${PENDING_JOBS}"
fi
if [[ -n "${OLDEST_MIN}" ]]; then
    step OBSERVING "oldest pending job: ${OLDEST_MIN} minute(s)"
fi
if [[ -n "${LOG_SIZE}" ]]; then
    step OBSERVING "log directory: $(numfmt --to=iec "${LOG_SIZE}" 2>/dev/null || printf '%s bytes' "${LOG_SIZE}") across ${LOG_COUNT} file(s)"
fi

# ── Observations that the operator should act on ──────────────────────────────
if [[ "${UNITS_TOTAL}" =~ ^[0-9]+$ && "${UNITS_ACTIVE}" =~ ^[0-9]+$ ]]; then
    if [[ "${UNITS_TOTAL}" -lt "${QUEUE_WORKERS}" ]]; then
        result_warn "Only ${UNITS_TOTAL} worker unit(s) are installed but the manifest asks for ${QUEUE_WORKERS}"
    fi
    if [[ "${UNITS_ACTIVE}" -lt "${UNITS_TOTAL}" ]]; then
        result_warn "${UNITS_TOTAL} worker unit(s) installed but only ${UNITS_ACTIVE} active"
    fi
fi
if [[ "${STALE_STATE}" == "stale" ]]; then
    result_warn "STALE CODE: ${STALE_DETAIL}. Run restart-workers.sh."
fi
if [[ "${CACHE_OK}" == "no" ]]; then
    result_warn "The cache driver is '${CACHE_DRIVER:-null}'; queue:restart is a no-op with a null cache, so workers will keep running old code after every deploy"
fi
if [[ "${LOGROTATE}" == "no" ]]; then
    result_warn "No logrotate configuration found for ${QUEUE_LOG_DIR}"
fi
if [[ "${CRON_REDIRECT}" == "0" && "${CRON_SCHED}" != "0" ]]; then
    result_warn "The scheduler cron entry does not redirect stdout; output will go to local mail"
fi
if [[ "${CRON_WORKERS}" != "0" && "${CRON_WORKERS}" != "" ]]; then
    result_warn "${CRON_WORKERS} cron entry(ies) start queue workers; workers belong under systemd, not cron"
fi

result_add_string "action" "status"
result_add_string "host" "${HOST}"
result_add_string "stack" "${STACK}"
result_add_string "queue_driver" "${QUEUE_DRIVER}"
result_add_string "worker_unit" "${WORKER_UNIT}"
result_add_raw "worker_units_total" "${UNITS_TOTAL:-0}"
result_add_raw "worker_units_active" "${UNITS_ACTIVE:-0}"
result_add_raw "workers_desired" "${QUEUE_WORKERS}"
result_add_string_array "worker_pids" ${PIDS:-}
result_add_string "stale_code" "${STALE_STATE}"
if [[ -n "${STALE_DETAIL}" ]]; then result_add_string "stale_code_detail" "${STALE_DETAIL}"; fi
result_add_raw "cron_schedule_entries" "${CRON_SCHED:-0}"
result_add_raw "cron_total_entries" "${CRON_TOTAL:-0}"
if [[ -n "${FAILED_JOBS}" ]]; then result_add_raw "failed_jobs" "${FAILED_JOBS}"; fi
if [[ -n "${PENDING_JOBS}" ]]; then result_add_raw "pending_jobs" "${PENDING_JOBS}"; fi
if [[ -n "${OLDEST_MIN}" ]]; then result_add_raw "oldest_pending_minutes" "${OLDEST_MIN}"; fi
if [[ -n "${LOG_SIZE}" ]]; then result_add_raw "log_size_bytes" "${LOG_SIZE}"; fi
result_add_string "cache_ok" "${CACHE_OK}"
if [[ -n "${CACHE_DRIVER}" ]]; then result_add_string "cache_driver" "${CACHE_DRIVER}"; fi
result_add_string "logrotate_configured" "${LOGROTATE}"
result_add_string "healthcheck_configured" "${HEALTHCHECK}"
if [[ -n "${HEALTHCHECK_JOBS}" ]]; then
    result_add_string "critical_jobs" "${HEALTHCHECK_JOBS}"
fi
result_add_string "journal" "$(journal_path)"

step OBSERVED "Queue status reported"
emit_result "OBSERVED"
exit 0
