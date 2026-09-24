#!/usr/bin/env bash
# setup-workers.sh — Install systemd worker units, cron, log rotation, and alerts
#
# Usage:
#   setup-workers.sh --client <name> [--workers <n>] [--skip-logrotate]
#                    [--skip-deadman] [--skip-alerts] [--dry-run]
#                    [--confirm "CONFIRM SETUP"]
#
# Every generated file is printed before anything is written, so the plan can be
# reviewed from the journal even when the operator approves in one step.
#
# Approval (see conventions/approvals.md):
#   CONFIRM SETUP             write the units, crontab, logrotate, and watchdog
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
WORKERS=""
ACTION=""
SKIP_LOGROTATE=false
SKIP_DEADMAN=false
SKIP_ALERTS=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)          CLIENT="${2:-}"; shift 2 ;;
        --workers)         WORKERS="${2:-}"; shift 2 ;;
        --skip-logrotate)  SKIP_LOGROTATE=true; shift ;;
        --skip-deadman)    SKIP_DEADMAN=true; shift ;;
        --skip-alerts)     SKIP_ALERTS=true; shift ;;
        --action)          ACTION="${2:-}"; shift 2 ;;
        --dry-run)         DRY_RUN=true; shift ;;
        --confirm)         confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
case "${ACTION}" in
    ""|setup) ;;
    *) printf 'ERROR: --action %s does not match this script (setup)\n' "${ACTION}" >&2; exit 2 ;;
esac

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "queue-cron-setup" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root stack

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
manifest_validate_ssh

WORKERS="${WORKERS:-${QUEUE_WORKERS}}"
if ! [[ "${WORKERS}" =~ ^[1-9][0-9]*$ ]]; then
    printf 'ERROR: --workers must be a positive integer (got: %s)\n' "${WORKERS}" >&2
    exit 2
fi
if ! [[ "${QUEUE_MAX_TIME}" =~ ^[0-9]+$ ]]; then
    printf 'ERROR: queue.max_time in the manifest must be an integer (got: %s)\n' "${QUEUE_MAX_TIME}" >&2
    exit 2
fi

journal_init "queue-cron-setup" "${CLIENT}" "${MANIFEST}"

SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"

# ── Resolve runtime paths on the host ─────────────────────────────────────────
step OBSERVING "Resolving the PHP/Node binary and release layout on ${HOST}"
set +e
RUNTIME_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "
    echo \"php_bin=\$(command -v php || true)\"
    echo \"node_bin=\$(command -v node || true)\"
    echo \"current=\$(readlink -f '${SITE_ROOT}/current' 2>/dev/null || true)\"
    echo \"worker_user=\$(id -u '${QUEUE_WORKER_USER}' >/dev/null 2>&1 && echo yes || echo no)\"
" 2>&1)"
RUNTIME_RC=$?
set -e
if [[ "${RUNTIME_RC}" -ne 0 ]]; then
    fail_with 3 STOPPED "Could not inspect ${HOST}: ${RUNTIME_OUT}"
fi

rt() { printf '%s' "${RUNTIME_OUT}" | sed -n "s/^$1=//p" | head -1; }

PHP_BIN="$(rt php_bin)"
NODE_BIN="$(rt node_bin)"
CURRENT_DIR="$(rt current)"
WORKER_USER_EXISTS="$(rt worker_user)"

case "${STACK}" in
    laravel)
        [[ -n "${PHP_BIN}" ]] || fail_with 5 STOPPED "php was not found on ${HOST}; cannot build a worker unit"
        ;;
    node)
        [[ -n "${NODE_BIN}" ]] || fail_with 5 STOPPED "node was not found on ${HOST}; cannot build a worker unit"
        ;;
esac
if [[ "${WORKER_USER_EXISTS}" != "yes" ]]; then
    fail_with 5 STOPPED "User '${QUEUE_WORKER_USER}' does not exist on ${HOST}. Set queue.worker_user in the manifest."
fi
[[ -n "${CURRENT_DIR}" ]] || result_warn "${SITE_ROOT}/current does not resolve yet; workers will not start until a release is activated"

# ── Build the unit ────────────────────────────────────────────────────────────
UNIT_PATH="/etc/systemd/system/${WORKER_UNIT}.service"
UNIT_NAME="${WORKER_UNIT}.service"

case "${STACK}" in
    laravel)
        EXEC_START="${PHP_BIN} artisan queue:work --sleep=${QUEUE_SLEEP} --tries=${QUEUE_TRIES} --max-time=${QUEUE_MAX_TIME} --timeout=${QUEUE_TIMEOUT} --queue=${QUEUE_QUEUES}"
        ;;
    node)
        EXEC_START="${NODE_BIN} ${SITE_ROOT}/current/worker.js"
        ;;
    *)
        fail_with 5 STOPPED "Queue workers are not supported for stack '${STACK}'"
        ;;
esac

UNIT_CONTENT="$(cat <<UNIT
[Unit]
Description=${CLIENT} queue worker %i
After=network.target redis-server.service
Wants=redis-server.service

[Service]
Type=simple
User=${QUEUE_WORKER_USER}
Group=${QUEUE_WORKER_USER}
WorkingDirectory=${SITE_ROOT}/current
ExecStart=${EXEC_START}
Restart=always
RestartSec=5
TimeoutStopSec=${QUEUE_TIMEOUT}
KillSignal=SIGTERM
StandardOutput=append:${QUEUE_LOG_DIR}/worker-%i.log
StandardError=append:${QUEUE_LOG_DIR}/worker-%i.log
Environment=APP_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
)"

CRON_LINE="* * * * * ${QUEUE_WORKER_USER} cd ${SITE_ROOT}/current && ${PHP_BIN:-${NODE_BIN}} artisan schedule:run >> ${QUEUE_LOG_DIR}/scheduler.log 2>&1"
if [[ "${STACK}" == "node" ]]; then
    CRON_LINE="* * * * * ${QUEUE_WORKER_USER} cd ${SITE_ROOT}/current && ${NODE_BIN} scheduler.js >> ${QUEUE_LOG_DIR}/scheduler.log 2>&1"
fi
if [[ -n "${QUEUE_HEALTHCHECK}" && "${SKIP_DEADMAN}" == "false" ]]; then
    CRON_LINE="${CRON_LINE} && curl -fsS -m 10 ${QUEUE_HEALTHCHECK} >/dev/null 2>&1"
fi

LOGROTATE_PATH="/etc/logrotate.d/${CLIENT}-workers"
LOGROTATE_CONTENT="$(cat <<LOGROTATE
${QUEUE_LOG_DIR}/worker-*.log ${QUEUE_LOG_DIR}/scheduler.log ${QUEUE_LOG_DIR}/queue-alerts.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        systemctl kill --signal=USR1 "${WORKER_UNIT}*.service" 2>/dev/null || true
    endscript
}
LOGROTATE
)"

WATCHDOG_PATH="/usr/local/bin/${CLIENT}-queue-watchdog.sh"
WATCHDOG_CONTENT="$(cat <<WATCHDOG
#!/usr/bin/env bash
# Managed by queue-cron-setup for ${CLIENT}. Do not edit by hand.
set -uo pipefail
SITE_ROOT='${SITE_ROOT}'
LOG_DIR='${QUEUE_LOG_DIR}'
MAX_FAILED='${QUEUE_FAILED_JOBS_MAX}'
MAX_AGE_MINUTES='${QUEUE_OLDEST_JOB_MAX_MINUTES}'
HEALTHCHECK='${QUEUE_HEALTHCHECK}'
WEBHOOK='${QUEUE_ALERT_WEBHOOK:-}'

log() { printf '%s %s\n' "\$(date -u +%Y-%m-%dT%H:%M:%SZ)" "\$*" >> "\${LOG_DIR}/queue-alerts.log"; }
notify() {
    local msg="\$1"
    log "\$msg"
    if [ -n "\$WEBHOOK" ]; then
        curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \\
            -d "{\\"client\\":\\"${CLIENT}\\",\\"check\\":\\"queue\\",\\"message\\":\\"\${msg}\\"}" \\
            "\$WEBHOOK" >/dev/null 2>&1 || log 'webhook delivery failed'
    fi
    if [ -n "\$HEALTHCHECK" ]; then
        curl -fsS -m 10 "\${HEALTHCHECK}/fail" >/dev/null 2>&1 || true
    fi
}

set -a; . "\${SITE_ROOT}/shared/.env" 2>/dev/null; set +a
export MYSQL_PWD="\${DB_PASSWORD:-}"
q() { mysql -N -B -u "\${DB_USERNAME:-}" "\${DB_DATABASE:-}" -e "\$1" 2>/dev/null | tail -1 | tr -d '[:space:]'; }

failed=\$(q 'SELECT COUNT(*) FROM failed_jobs;')
oldest=\$(q 'SELECT COALESCE(TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(MIN(available_at)), NOW()), 0) FROM jobs;')

status=0
if [ -n "\$failed" ] && [ "\$failed" -gt "\$MAX_FAILED" ] 2>/dev/null; then
    notify "failed_jobs=\$failed exceeds \$MAX_FAILED"
    status=1
fi
if [ -n "\$oldest" ] && [ "\$oldest" -gt "\$MAX_AGE_MINUTES" ] 2>/dev/null; then
    notify "oldest pending job is \$oldest minutes (limit \$MAX_AGE_MINUTES): workers are not draining"
    status=1
fi
if [ "\$status" -eq 0 ] && [ -n "\$HEALTHCHECK" ]; then
    curl -fsS -m 10 "\$HEALTHCHECK" >/dev/null 2>&1 || log 'healthcheck ping failed'
fi
exit "\$status"
WATCHDOG
)"

WATCHDOG_CRON="*/5 * * * * root ${WATCHDOG_PATH} >/dev/null 2>&1"

# ── Show the plan ─────────────────────────────────────────────────────────────
step PLANNING "Plan for ${CLIENT} on ${HOST}"

{
    printf '\n=== %s ===\n%s\n' "${UNIT_PATH}" "${UNIT_CONTENT}"
    printf '=== %s (%s instances) ===\n' "${UNIT_NAME}" "${WORKERS}"
    printf '=== %s ===\n%s\n' "/etc/cron.d/${CLIENT}-queue" "${CRON_LINE}"
    if [[ "${SKIP_ALERTS}" == "false" ]]; then
        printf '=== %s ===\n%s\n' "/etc/cron.d/${CLIENT}-queue-watchdog" "${WATCHDOG_CRON}"
        printf '=== %s ===\n%s\n' "${WATCHDOG_PATH}" "${WATCHDOG_CONTENT}"
    fi
    if [[ "${SKIP_LOGROTATE}" == "false" ]]; then
        printf '=== %s ===\n%s\n' "${LOGROTATE_PATH}" "${LOGROTATE_CONTENT}"
    fi
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: nothing written"
    result_add_string "action" "setup"
    result_add_string "host" "${HOST}"
    result_add_string "worker_unit" "${WORKER_UNIT}"
    result_add_raw "workers_requested" "${WORKERS}"
    result_add_string "unit_content" "${UNIT_CONTENT}"
    emit_result "PLANNED"
    exit 0
fi

step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM SETUP" "SETUP" "Install worker units, the scheduler cron entry, log rotation, and the queue watchdog on ${HOST}."

# ── Helper for privileged writes over stdin ───────────────────────────────────
remote_write() {  # <remote_path> <mode> <content>
    printf '%s' "${3}" | ssh "${SSH_OPTS[@]}" "${SSH_DEST}" \
        "umask 022 && sudo mkdir -p \"\$(dirname '${1}')\" && sudo tee '${1}' >/dev/null && sudo chmod ${2} '${1}' && echo written"
}

CREATED=()

step EXECUTING "Writing ${UNIT_PATH}"
UNIT_RC=0
set +e
UNIT_OUT="$(remote_write "${UNIT_PATH}" "0644" "${UNIT_CONTENT}" 2>&1)"
UNIT_RC=$?
set -e
journal_log "EXECUTING" "Write systemd unit" "tee ${UNIT_PATH}" "${UNIT_RC}" 0 \
    "$(printf '%s' "${UNIT_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"
if [[ "${UNIT_RC}" -ne 0 ]]; then
    fail_with 14 FAILED "Could not write ${UNIT_PATH} on ${HOST}: $(printf '%s' "${UNIT_OUT}" | tail -3 | tr '\n' ' ')"
fi
CREATED+=("${UNIT_PATH}")

step EXECUTING "Enabling ${WORKERS} instance(s) of ${UNIT_NAME}"
set +e
ENABLE_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "
    set -e
    sudo systemctl daemon-reload
    i=1
    while [ \$i -le ${WORKERS} ]; do
        sudo systemctl enable --now '${WORKER_UNIT}@'\$i'.service'
        i=\$((i + 1))
    done
" 2>&1)"
ENABLE_RC=$?
set -e
journal_log "EXECUTING" "Enable worker instances" "systemctl enable --now ${WORKER_UNIT}@{1..N}" "${ENABLE_RC}" 0 \
    "$(printf '%s' "${ENABLE_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"
if [[ "${ENABLE_RC}" -ne 0 ]]; then
    fail_with 8 FAILED "Could not enable the worker instances on ${HOST}: $(printf '%s' "${ENABLE_OUT}" | tail -5 | tr '\n' ' ')"
fi

# ── Cron ──────────────────────────────────────────────────────────────────────
step EXECUTING "Installing one scheduler cron entry"
set +e
CRON_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "
    set -e
    existing=\$(sudo crontab -l 2>/dev/null || true)
    filtered=\$(printf '%s\n' \"\$existing\" | grep -vF '${SITE_ROOT}' | grep -vF '${CLIENT}-queue' || true)
    {
        printf '%s\n' \"\$filtered\" | sed '/^[[:space:]]*\$/d'
        printf '%s\n' '${CRON_LINE}'
    } | sudo crontab -
    sudo mkdir -p '${QUEUE_LOG_DIR}'
    sudo chown '${QUEUE_WORKER_USER}:${QUEUE_WORKER_USER}' '${QUEUE_LOG_DIR}'
    sudo crontab -l | grep -c 'schedule:run\\|scheduler.js'
" 2>&1)"
CRON_RC=$?
set -e
journal_log "EXECUTING" "Install scheduler cron entry" "crontab -" "${CRON_RC}" 0 \
    "$(printf '%s' "${CRON_OUT}" | tail -5 | journal_sanitize)" "EXECUTING" "EXECUTING"
if [[ "${CRON_RC}" -ne 0 ]]; then
    fail_with 14 FAILED "Could not install the cron entry on ${HOST}: $(printf '%s' "${CRON_OUT}" | tail -5 | tr '\n' ' ')"
fi

# ── Log rotation ──────────────────────────────────────────────────────────────
if [[ "${SKIP_LOGROTATE}" == "false" ]]; then
    step EXECUTING "Writing ${LOGROTATE_PATH}"
    set +e
    LR_OUT="$(remote_write "${LOGROTATE_PATH}" "0644" "${LOGROTATE_CONTENT}" 2>&1)"
    LR_RC=$?
    set -e
    if [[ "${LR_RC}" -ne 0 ]]; then
        fail_with 14 FAILED "Could not write ${LOGROTATE_PATH} on ${HOST}: $(printf '%s' "${LR_OUT}" | tail -3 | tr '\n' ' ')"
    fi
    CREATED+=("${LOGROTATE_PATH}")
fi

# ── Watchdog and alerts ───────────────────────────────────────────────────────
if [[ "${SKIP_ALERTS}" == "false" ]]; then
    step EXECUTING "Writing ${WATCHDOG_PATH}"
    set +e
    WD_OUT="$(remote_write "${WATCHDOG_PATH}" "0755" "${WATCHDOG_CONTENT}" 2>&1)"
    WD_RC=$?
    set -e
    if [[ "${WD_RC}" -ne 0 ]]; then
        fail_with 14 FAILED "Could not write ${WATCHDOG_PATH} on ${HOST}: $(printf '%s' "${WD_OUT}" | tail -3 | tr '\n' ' ')"
    fi
    CREATED+=("${WATCHDOG_PATH}")

    step EXECUTING "Installing the 5-minute watchdog cron entry"
    set +e
    WDC_OUT="$(remote_write "/etc/cron.d/${CLIENT}-queue-watchdog" "0644" "${WATCHDOG_CRON}
" 2>&1)"
    WDC_RC=$?
    set -e
    if [[ "${WDC_RC}" -ne 0 ]]; then
        fail_with 14 FAILED "Could not install the watchdog cron entry on ${HOST}: $(printf '%s' "${WDC_OUT}" | tail -3 | tr '\n' ' ')"
    fi
    CREATED+=("/etc/cron.d/${CLIENT}-queue-watchdog")

    step VERIFYING "Running the watchdog once"
    set +e
    WDR_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "sudo ${WATCHDOG_PATH}; echo rc=\$?" 2>&1)"
    set -e
    WDR_RC="$(printf '%s' "${WDR_OUT}" | sed -n 's/^rc=//p' | tail -1)"
    step VERIFYING "Watchdog exit: ${WDR_RC:-unknown}"
    if [[ "${WDR_RC}" != "0" ]]; then
        result_warn "The queue watchdog reported a problem on its first run; see ${QUEUE_LOG_DIR}/queue-alerts.log"
    fi
fi

# ── Verify ────────────────────────────────────────────────────────────────────
step VERIFYING "Waiting for the worker instances to come up"
sleep 5

set +e
VERIFY_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "
    active=\$(systemctl list-units --type=service --state=active --no-pager 2>/dev/null | grep -c '${WORKER_UNIT}@' || true)
    echo \"active=\$active\"
    systemctl list-units --type=service --no-pager 2>/dev/null | grep '${WORKER_UNIT}@' || true
" 2>&1)"
set -e
printf '%s\n' "${VERIFY_OUT}" >&2
ACTIVE_COUNT="$(printf '%s' "${VERIFY_OUT}" | sed -n 's/^active=//p' | head -1 | tr -d '[:space:]')"

if [[ "${ACTIVE_COUNT}" =~ ^[0-9]+$ && "${ACTIVE_COUNT}" -ge "${WORKERS}" ]]; then
    step VERIFYING "Workers active: ${ACTIVE_COUNT}/${WORKERS}"
else
    step VERIFYING "Workers active: ${ACTIVE_COUNT:-0}/${WORKERS}"
    emit_result "FAILED"
    exit 8
fi

WATCHDOG_INSTALLED="false"
[[ "${SKIP_ALERTS}" == "false" ]] && WATCHDOG_INSTALLED="true"

step CONFIGURED "Workers, cron, rotation, and alerts configured"

result_add_string "action" "setup"
result_add_string "host" "${HOST}"
result_add_string "worker_unit" "${WORKER_UNIT}"
result_add_raw "workers_configured" "${ACTIVE_COUNT}"
result_add_raw "workers_requested" "${WORKERS}"
result_add_string_array "files_written" ${CREATED[@]+"${CREATED[@]}"}
result_add_string "cron_entry" "${CRON_LINE}"
result_add_string "logrotate_path" "$([[ "${SKIP_LOGROTATE}" == "false" ]] && printf '%s' "${LOGROTATE_PATH}" || printf 'skipped')"
result_add_raw "watchdog_installed" "${WATCHDOG_INSTALLED}"
result_add_raw "dead_mans_switch" "$([[ -n "${QUEUE_HEALTHCHECK}" && "${SKIP_DEADMAN}" == "false" ]] && printf 'true' || printf 'false')"
result_add_string "journal" "$(journal_path)"

emit_result "CONFIGURED"
exit 0
