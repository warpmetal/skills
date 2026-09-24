#!/usr/bin/env bash
# verify-workers.sh — Read-only verification of workers, cron, and queues
#
# Usage:
#   verify-workers.sh --client <name> [--max-job-age <minutes>] [--json]
#
# Runs the check matrix from queue-cron-setup/SKILL.md and reports an issues[]
# array with a proposed fix per problem. Status is VERIFIED when the matrix is
# clean and ISSUES_FOUND (still exit 0) when it is not: finding problems is a
# successful verification, not a failure of this script.
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
MAX_JOB_AGE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)      CLIENT="${2:-}"; shift 2 ;;
        --max-job-age) MAX_JOB_AGE="${2:-}"; shift 2 ;;
        --action)      ACTION="${2:-}"; shift 2 ;;
        --dry-run)     DRY_RUN=true; shift ;;
        --confirm)     confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
case "${ACTION}" in
    ""|verify) ;;
    *) printf 'ERROR: --action %s does not match this script (verify)\n' "${ACTION}" >&2; exit 2 ;;
esac
if [[ -n "${MAX_JOB_AGE}" ]] && ! [[ "${MAX_JOB_AGE}" =~ ^[0-9]+$ ]]; then
    printf 'ERROR: --max-job-age must be an integer number of minutes\n' >&2
    exit 2
fi

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

MAX_AGE="${MAX_JOB_AGE:-${QUEUE_OLDEST_JOB_MAX_MINUTES}}"
MAX_FAILED="${QUEUE_FAILED_JOBS_MAX}"

step OBSERVING "Verifying queues and cron for ${CLIENT} on ${HOST}"

{
    printf '\nVerification matrix\n'
    printf '  Host:              %s\n' "${HOST}"
    printf '  Worker unit:       %s\n' "${WORKER_UNIT}"
    printf '  Workers desired:   %s\n' "${QUEUE_WORKERS}"
    printf '  Oldest job limit:  %s minute(s)\n' "${MAX_AGE}"
    printf '  failed_jobs limit: %s\n' "${MAX_FAILED}"
    printf '  Read-only; no gate required.\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no collection performed"
    result_add_string "action" "verify"
    emit_result "PLANNED"
    exit 0
fi

FACTS="$(queue_collect_facts "${SSH_DEST}" "${SITE_ROOT}" "${STACK}" "${WORKER_UNIT}" "${QUEUE_LOG_DIR}")"

if ! printf '%s' "${FACTS}" | grep -q 'QUEUE_FACTS_DONE'; then
    fail_with 3 STOPPED "Queue fact collection on ${HOST} did not complete. Last output: $(printf '%s' "${FACTS}" | tail -5 | tr '\n' ' ')"
fi

journal_log "OBSERVING" "Collect queue facts" "queue_collect_facts" 0 0 \
    "$(printf '%s' "${FACTS}" | journal_sanitize)" "OBSERVING" "VERIFIED"

fact() { queue_fact "${FACTS}" "$1"; }

# ── Check matrix ──────────────────────────────────────────────────────────────
ISSUES_JSON=""
CHECKS_JSON=""
ISSUE_COUNT=0

record() {  # <check> <PASS|FAIL|WARN> <severity> <detail> <fix>
    local check="$1" outcome="$2" severity="$3" detail="${4:-}" fix="${5:-}"

    case "${outcome}" in
        PASS) step VERIFYING "${check}: PASS" ;;
        WARN) step VERIFYING "${check}: WARN ${detail}" ;;
        *)    step VERIFYING "${check}: FAIL ${detail}" ;;
    esac

    local centry
    centry="$(printf '{"check":%s,"result":%s,"detail":%s}' \
        "$(json_string "${check}")" "$(json_string "${outcome}")" "$(json_string "${detail}")")"
    if [[ -z "${CHECKS_JSON}" ]]; then CHECKS_JSON="${centry}"; else CHECKS_JSON="${CHECKS_JSON},${centry}"; fi

    if [[ "${outcome}" != "PASS" ]]; then
        ISSUE_COUNT=$((ISSUE_COUNT + 1))
        local ientry
        ientry="$(printf '{"check":%s,"severity":%s,"detail":%s,"fix":%s}' \
            "$(json_string "${check}")" "$(json_string "${severity}")" \
            "$(json_string "${detail}")" "$(json_string "${fix}")")"
        if [[ -z "${ISSUES_JSON}" ]]; then ISSUES_JSON="${ientry}"; else ISSUES_JSON="${ISSUES_JSON},${ientry}"; fi
        [[ "${severity}" == "high" ]] && result_error "${check}: ${detail}"
    fi
}

# 1. Worker units installed
UNITS_TOTAL="$(fact worker_units_total)"
if [[ "${UNITS_TOTAL}" =~ ^[0-9]+$ && "${UNITS_TOTAL}" -ge "${QUEUE_WORKERS}" ]]; then
    record "worker_units_installed" "PASS" "info" "${UNITS_TOTAL} unit(s), desired ${QUEUE_WORKERS}"
else
    record "worker_units_installed" "FAIL" "high" \
        "${UNITS_TOTAL:-0} worker unit(s) match '${WORKER_UNIT}', the manifest asks for ${QUEUE_WORKERS}" \
        "bash scripts/setup-workers.sh --client ${CLIENT} --workers ${QUEUE_WORKERS} --confirm \"CONFIRM SETUP\""
fi

# 2. Workers running
UNITS_ACTIVE="$(fact worker_units_active)"
if [[ "${UNITS_ACTIVE}" =~ ^[0-9]+$ && "${UNITS_ACTIVE}" -ge "${QUEUE_WORKERS}" ]]; then
    record "workers_running" "PASS" "info" "${UNITS_ACTIVE} active"
else
    record "workers_running" "FAIL" "high" \
        "only ${UNITS_ACTIVE:-0} of ${QUEUE_WORKERS} worker(s) active" \
        "systemctl --failed; journalctl -u '${WORKER_UNIT}*' -n 50 --no-pager"
fi

# 3. Stale code
STALE_STATE="$(fact stale_state)"
STALE_DETAIL="$(fact stale_detail)"
if [[ "${STALE_STATE}" == "ok" ]]; then
    record "stale_code" "PASS" "info" "workers run the current release"
else
    record "stale_code" "FAIL" "high" \
        "${STALE_DETAIL:-stale-code state is ${STALE_STATE}}" \
        "bash scripts/restart-workers.sh --client ${CLIENT} --confirm \"CONFIRM RESTART\""
fi

# 4. Cache usable, since queue:restart is a no-op without it
CACHE_OK="$(fact cache_ok)"
CACHE_DRIVER="$(fact cache_driver)"
if [[ "${CACHE_OK}" == "yes" ]]; then
    record "cache_functional" "PASS" "info" "driver ${CACHE_DRIVER}"
elif [[ "${CACHE_OK}" == "unknown" ]]; then
    record "cache_functional" "WARN" "medium" "the cache driver could not be determined" \
        "Confirm CACHE_STORE in ${SITE_ROOT}/shared/.env is not 'null'"
else
    record "cache_functional" "FAIL" "high" \
        "CACHE_STORE is '${CACHE_DRIVER:-null}'; queue:restart will silently do nothing, so deploys leave workers on old code" \
        "Set CACHE_STORE=redis (or file) in ${SITE_ROOT}/shared/.env, then restart workers"
fi

# 5. Exactly one scheduler cron entry
CRON_SCHED="$(fact cron_schedule_entries)"
CRON_REDIRECT="$(fact cron_scheduler_log_redirect)"
CRON_WORKERS="$(fact cron_worker_entries)"
if [[ "${CRON_SCHED}" == "1" ]]; then
    record "cron_entries" "PASS" "info" "one scheduler entry"
elif [[ "${CRON_SCHED}" == "0" ]]; then
    record "cron_entries" "FAIL" "high" "no scheduler cron entry found" \
        "bash scripts/setup-workers.sh --client ${CLIENT} --confirm \"CONFIRM SETUP\""
else
    record "cron_entries" "FAIL" "high" \
        "${CRON_SCHED} scheduler cron entries; only one is allowed or tasks run twice" \
        "Remove the extra entries, keeping a single '* * * * *' schedule:run line"
fi

# 6. Scheduler output redirected
if [[ "${CRON_SCHED}" == "0" ]]; then
    record "cron_redirect" "WARN" "low" "not applicable without a scheduler entry"
elif [[ "${CRON_REDIRECT}" == "0" ]]; then
    record "cron_redirect" "FAIL" "medium" \
        "the scheduler entry does not redirect output, so it goes to local mail" \
        "Append >> ${QUEUE_LOG_DIR}/scheduler.log 2>&1 to the cron line"
else
    record "cron_redirect" "PASS" "info" "output redirected"
fi

# 7. Workers must not be started from cron
if [[ "${CRON_WORKERS}" == "0" || -z "${CRON_WORKERS}" ]]; then
    record "cron_no_workers" "PASS" "info" "no cron-started workers"
else
    record "cron_no_workers" "FAIL" "medium" \
        "${CRON_WORKERS} cron entry(ies) start queue workers" \
        "Move workers to systemd units; cron-started workers are unsupervised and overlap"
fi

# 8. Scheduler is actually firing
SCHED_AGE="$(fact scheduler_log_age_seconds)"
if [[ "${SCHED_AGE}" =~ ^[0-9]+$ ]]; then
    if [[ "${SCHED_AGE}" -le 180 ]]; then
        record "scheduler_fired" "PASS" "info" "last scheduler output ${SCHED_AGE}s ago"
    else
        record "scheduler_fired" "FAIL" "high" \
            "the scheduler log has not changed in ${SCHED_AGE}s" \
            "Check 'systemctl status cron' and run the cron line manually to see the error"
    fi
else
    record "scheduler_fired" "WARN" "low" \
        "no scheduler log at ${QUEUE_LOG_DIR}/scheduler.log; freshness cannot be confirmed" \
        "Add >> ${QUEUE_LOG_DIR}/scheduler.log 2>&1 to the cron line"
fi

# 9. failed_jobs within threshold
FAILED_JOBS="$(fact failed_jobs)"
if [[ "${FAILED_JOBS}" =~ ^[0-9]+$ ]]; then
    if [[ "${FAILED_JOBS}" -le "${MAX_FAILED}" ]]; then
        record "failed_jobs" "PASS" "info" "${FAILED_JOBS} failed job(s)"
    else
        record "failed_jobs" "FAIL" "high" \
            "${FAILED_JOBS} failed job(s), limit is ${MAX_FAILED}" \
            "Inspect with 'php artisan queue:failed', then 'queue:retry all' or 'queue:flush'"
    fi
else
    record "failed_jobs" "WARN" "low" "failed_jobs could not be read" \
        "Confirm the queue connection in the manifest matches the application"
fi

# 10. Oldest pending job
OLDEST_MIN="$(fact oldest_pending_minutes)"
if [[ "${OLDEST_MIN}" =~ ^[0-9]+$ ]]; then
    if [[ "${OLDEST_MIN}" -le "${MAX_AGE}" ]]; then
        record "oldest_job_age" "PASS" "info" "${OLDEST_MIN} minute(s)"
    else
        record "oldest_job_age" "FAIL" "high" \
            "the oldest pending job is ${OLDEST_MIN} minute(s) old (limit ${MAX_AGE}); the queue is not draining" \
            "Check worker logs for crashes and confirm 'redis-cli ping' responds"
    fi
else
    record "oldest_job_age" "PASS" "info" "no pending jobs"
fi

# 11. Log rotation
LOGROTATE="$(fact logrotate_configured)"
if [[ "${LOGROTATE}" == "yes" ]]; then
    record "log_rotation" "PASS" "info" "logrotate drop-in present"
else
    record "log_rotation" "FAIL" "medium" \
        "no logrotate drop-in for ${QUEUE_LOG_DIR}" \
        "bash scripts/setup-workers.sh --client ${CLIENT} --confirm \"CONFIRM SETUP\""
fi

# 12. Dead-man's switch for critical jobs
HEALTHCHECK="$(fact healthcheck_configured)"
CRITICAL_JOBS="$(manifest_get queue.critical_jobs)"
if [[ -z "${CRITICAL_JOBS}" ]]; then
    record "dead_mans_switch" "PASS" "info" "no critical_jobs declared"
elif [[ "${HEALTHCHECK}" == "yes" ]]; then
    record "dead_mans_switch" "PASS" "info" "healthcheck configured"
else
    record "dead_mans_switch" "FAIL" "high" \
        "queue.critical_jobs is set but no healthcheck URL is wired" \
        "Set queue.healthcheck in the manifest and re-run setup-workers.sh"
fi

# ── Result ────────────────────────────────────────────────────────────────────
CHECKS_OBJ="$(printf '{%s}' "${CHECKS_JSON}")"

result_add_string "action" "verify"
result_add_string "host" "${HOST}"
result_add_raw "checks" "${CHECKS_OBJ}"
result_add_raw "issues" "[${ISSUES_JSON}]"
result_add_raw "issue_count" "${ISSUE_COUNT}"
result_add_string "journal" "$(journal_path)"

if [[ "${ISSUE_COUNT}" -gt 0 ]]; then
    step ISSUES_FOUND "${ISSUE_COUNT} issue(s) found; see issues[] for a proposed fix per item"
    emit_result "ISSUES_FOUND"
    exit 0
fi

step VERIFIED "Workers, cron, and queues are healthy"
emit_result "VERIFIED"
exit 0
