#!/usr/bin/env bash
# setup-monitoring.sh — Add Uptime Kuma checks, Netdata alerts, and routing
#
# Usage:
#   setup-monitoring.sh --client <name> [--monitoring-host <alias>]
#                       [--api-key <key>] [--kuma-url <url>]
#                       [--skip-netdata] [--skip-push] [--skip-test-alert]
#                       [--dry-run]
#                       [--confirm "CONFIRM MONITORING SETUP"]
#
# Checks are derived from the threshold table in server-monitoring/SKILL.md and
# never from CPU, memory, or load averages (see references/anti-goals.md).
#
# Uptime Kuma monitors cover what the API can actually create: HTTP, certificate,
# DNS, and push. Disk, inode, OOM, and service liveness are Netdata health alerts,
# installed as a drop-in on the monitored host. Queue age and backup dead-man
# come from push monitors fed by the queue watchdog installed by queue-cron-setup.
#
# Approval (see conventions/approvals.md):
#   CONFIRM MONITORING SETUP  create monitors, write Netdata alerts, add push checks
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
MON_HOST_OVERRIDE=""
ACTION=""
SKIP_NETDATA=false
SKIP_PUSH=false
SKIP_TEST_ALERT=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)            CLIENT="${2:-}"; shift 2 ;;
        --monitoring-host)   MON_HOST_OVERRIDE="${2:-}"; shift 2 ;;
        --api-key)           KUMA_KEY="${2:-}"; shift 2 ;;
        --kuma-url)          KUMA_URL="${2:-}"; shift 2 ;;
        --skip-netdata)      SKIP_NETDATA=true; shift ;;
        --skip-push)         SKIP_PUSH=true; shift ;;
        --skip-test-alert)   SKIP_TEST_ALERT=true; shift ;;
        --action)            ACTION="${2:-}"; shift 2 ;;
        --dry-run)           DRY_RUN=true; shift ;;
        --confirm)           confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
case "${ACTION}" in
    ""|setup) ;;
    *) printf 'ERROR: --action %s does not match this script (setup)\n' "${ACTION}" >&2; exit 2 ;;
esac

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "server-monitoring" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host domain

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
agency_require_tools "python3:the exact Uptime Kuma API parse"

MONITORING_HOST="${MON_HOST_OVERRIDE:-${MONITORING_HOST}}"
KUMA_URL="${KUMA_URL:-${UPTIME_KUMA_URL}}"
if [[ -z "${KUMA_KEY}" ]]; then
    KUMA_KEY="${!MONITORING_KUMA_TOKEN_ENV:-}"
fi

journal_init "server-monitoring" "${CLIENT}" "${MANIFEST}"

# ── Rule 1: the monitor must be external ─────────────────────────────────────
# monitoring_require_external_host emits STOPPED and exits when the rule is
# violated, so there is nothing to re-check afterwards.
step OBSERVING "Checking that the monitor is external to the monitored host"
monitoring_require_external_host "${HOST}" "${MONITORING_HOST}"
step OBSERVING "Monitor host '${MONITORING_HOST}' is external to '${HOST}'"
if [[ -z "${PAGE_CHANNEL}" ]]; then
    result_warn "monitoring.page_channel is not set; page-tier alerts have nowhere to go"
fi
if [[ -z "${DIGEST_CHANNEL}" ]]; then
    result_warn "monitoring.digest_channel is not set; digest-tier alerts have nowhere to go"
fi

HEALTH_TARGET="${HEALTH_URL:-https://${DOMAIN}/}"
INTERVAL="${MONITORING_CHECK_INTERVAL}"

# ── Proposed monitors ────────────────────────────────────────────────────────
# Each entry: name|type|severity|extra-json
PROPOSED=()
PROPOSED+=("${CLIENT}-http|http|page|$(printf '{"url":%s,"interval":%s,"maxretries":2,"retryInterval":60,"accepted_statuscodes":[["200-299"]],"notificationIDList":[%s]}' "$(json_string "${HEALTH_TARGET}")" "${INTERVAL}" "${MONITORING_PAGE_NOTIFICATION_ID:-0}")")
PROPOSED+=("${CLIENT}-cert|certificate|digest|$(printf '{"hostname":%s,"port":443,"interval":3600,"expiryNotification":true,"notificationIDList":[%s]}' "$(json_string "${DOMAIN}")" "${MONITORING_DIGEST_NOTIFICATION_ID:-0}")")
PROPOSED+=("${CLIENT}-dns|dns|page|$(printf '{"hostname":%s,"interval":300,"notificationIDList":[%s]}' "$(json_string "${DOMAIN}")" "${MONITORING_PAGE_NOTIFICATION_ID:-0}")")
if [[ "${SKIP_PUSH}" == "false" ]]; then
    PROPOSED+=("${CLIENT}-queue-age|push|page|$(printf '{"interval":%s,"notificationIDList":[%s]}' 300 "${MONITORING_PAGE_NOTIFICATION_ID:-0}")")
    if [[ -n "${BACKUP_HEALTHCHECK}" ]]; then
        PROPOSED+=("${CLIENT}-backup|push|digest|$(printf '{"interval":%s,"notificationIDList":[%s]}' 43200 "${MONITORING_DIGEST_NOTIFICATION_ID:-0}")")
    else
        result_warn "backup.healthcheck is not set in the manifest; the backup dead-man's switch monitor was skipped"
    fi
fi

step PLANNING "Proposed Uptime Kuma monitors for ${CLIENT}"
for entry in "${PROPOSED[@]}"; do
    step PLANNING "$(printf '%s' "${entry}" | cut -d'|' -f1,2,3 --output-delimiter=' ')"
done
step PLANNING "Netdata health alerts on ${HOST}: disk, inodes, oom, service liveness"
step PLANNING "Routing: page -> ${PAGE_CHANNEL:-<unset>}, digest -> ${DIGEST_CHANNEL:-<unset>}"

NETDATA_DROPIN="/etc/netdata/health.d/agency-${CLIENT}.conf"
NETDATA_CONTENT="$(cat <<NETDATA
# Managed by server-monitoring for ${CLIENT}. Symptoms, not signals:
# no CPU, memory, or load-average alerts by policy.

 alarm: ${CLIENT}_disk_space
    on: disk.space
 class: Utilization
  type: System
component: Disk
   lookup: max -1m unaligned of avail
    units: %
    every: 1m
     warn: \$this < 20
     crit: \$this < 10
    delay: down 10m multiplier 1.5 max 1h
     info: disk space available for ${CLIENT}
       to: sysadmin

 alarm: ${CLIENT}_disk_inodes
    on: disk.inodes
 class: Utilization
  type: System
component: Disk
   lookup: max -1m unaligned of avail
    units: %
    every: 1m
     warn: \$this < 20
     crit: \$this < 10
     info: inode availability for ${CLIENT}
       to: sysadmin

 alarm: ${CLIENT}_oom
    on: mem.oom_kill
 class: Errors
  type: System
component: Memory
   lookup: sum -10m unaligned of kills
    units: kills
    every: 1m
     crit: \$this > 0
     info: the kernel killed a process on ${CLIENT}: investigate memory pressure now
       to: sysadmin

 alarm: ${CLIENT}_service_down
    on: systemd.unit_state
 class: Errors
  type: System
component: Services
   lookup: max -1m unaligned
    units: state
    every: 1m
     crit: \$status != "running"
    label: unit
     info: a required service is not running on ${CLIENT}
       to: sysadmin
NETDATA
)"

# ── Dry run ───────────────────────────────────────────────────────────────────
if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: nothing created"
    printf '\n=== %s ===\n%s\n\n' "${NETDATA_DROPIN}" "${NETDATA_CONTENT}" >&2
    result_add_string "action" "setup"
    result_add_string "monitoring_host" "${MONITORING_HOST}"
    result_add_raw "proposed_count" "${#PROPOSED[@]}"
    emit_result "PLANNED"
    exit 0
fi

kuma_require_key
step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM MONITORING SETUP" "MONITORING SETUP" "Create ${#PROPOSED[@]} Uptime Kuma monitor(s) and install Netdata alerts on ${HOST}."

# ── Existing monitors (duplicate prevention) ─────────────────────────────────
step OBSERVING "Inventorying existing monitors"
set +e
EXISTING_TSV="$(kuma_monitors_tsv 2>&1)"
EXISTING_RC=$?
set -e
if [[ "${EXISTING_RC}" -ne 0 ]]; then
    fail_with 3 FAILED "Could not list monitors at ${KUMA_URL}: $(printf '%s' "${EXISTING_TSV}" | tail -3 | tr '\n' ' ')"
fi
EXISTING_COUNT="$(printf '%s\n' "${EXISTING_TSV}" | grep -c . || true)"
step OBSERVING "${EXISTING_COUNT} monitor(s) exist already"

# ── Create monitors ──────────────────────────────────────────────────────────
CHECKS_ADDED=""
ADDED=0
SKIPPED=0
PUSH_URLS=""

for entry in "${PROPOSED[@]}"; do
    name="$(printf '%s' "${entry}" | cut -d'|' -f1)"
    mtype="$(printf '%s' "${entry}" | cut -d'|' -f2)"
    severity="$(printf '%s' "${entry}" | cut -d'|' -f3)"
    extra="$(printf '%s' "${entry}" | cut -d'|' -f4-)"

    if printf '%s\n' "${EXISTING_TSV}" | awk -F'\t' -v n="${name}" '$2 == n { found = 1 } END { exit(found ? 0 : 1) }'; then
        step EXECUTING "${name}: already exists, left untouched"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    body="$(printf '{"name":%s,"type":%s,"active":true' "$(json_string "${name}")" "$(json_string "${mtype}")")"
    body="$(printf '%s,%s}' "${body}" "${extra#?}")"

    step EXECUTING "Creating ${name} (${mtype}, ${severity})"
    set +e
    CREATE_OUT="$(kuma_api POST /api/monitors "${body}" 2>&1)"
    CREATE_RC=$?
    set -e
    journal_log "EXECUTING" "Create monitor ${name}" "POST /api/monitors" "${CREATE_RC}" 0 \
        "$(printf '%s' "${CREATE_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

    if [[ "${CREATE_RC}" -ne 0 ]]; then
        fail_with 3 FAILED "Could not create monitor ${name}: $(printf '%s' "${CREATE_OUT}" | tail -3 | tr '\n' ' ')"
    fi

    ADDED=$((ADDED + 1))
    centry="$(printf '{"name":%s,"type":%s,"severity":%s}' \
        "$(json_string "${name}")" "$(json_string "${mtype}")" "$(json_string "${severity}")")"
    if [[ -z "${CHECKS_ADDED}" ]]; then CHECKS_ADDED="${centry}"; else CHECKS_ADDED="${CHECKS_ADDED},${centry}"; fi

    if [[ "${mtype}" == "push" ]]; then
        PUSH_URLS="${PUSH_URLS}  ${name}: ${KUMA_URL%/}/api/push/<token shown in the Uptime Kuma UI>
"
    fi
done

# ── Netdata alerts ───────────────────────────────────────────────────────────
NETDATA_INSTALLED="skipped"
if [[ "${SKIP_NETDATA}" == "false" ]]; then
    SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"
    step EXECUTING "Installing Netdata health alerts on ${HOST}"

    set +e
    NETDATA_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "
        set -e
        if ! systemctl is-active netdata >/dev/null 2>&1; then
            echo 'netdata is not running; attempting install'
            if command -v apt-get >/dev/null 2>&1; then
                curl -fsSL https://get.netdata.cloud/kickstart.sh -o /tmp/netdata-kickstart.sh
                sudo sh /tmp/netdata-kickstart.sh --non-interactive --dont-wait --stable-channel
                rm -f /tmp/netdata-kickstart.sh
            else
                echo 'no supported package manager; skipping the Netdata install' >&2
            fi
        fi
        sudo mkdir -p /etc/netdata/health.d
        sudo tee '${NETDATA_DROPIN}' >/dev/null <<'NETDATA_FILE'
${NETDATA_CONTENT}
NETDATA_FILE
        sudo chmod 0644 '${NETDATA_DROPIN}'
        sudo systemctl restart netdata 2>/dev/null || true
        systemctl is-active netdata 2>/dev/null || echo unknown
    " 2>&1)"
    NETDATA_RC=$?
    set -e
    printf '%s\n' "${NETDATA_OUT}" >&2
    journal_log "EXECUTING" "Netdata health drop-in" "tee ${NETDATA_DROPIN}" "${NETDATA_RC}" 0 \
        "$(printf '%s' "${NETDATA_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

    if [[ "${NETDATA_RC}" -ne 0 ]]; then
        result_warn "Netdata setup on ${HOST} reported errors; the Uptime Kuma monitors are unaffected"
        NETDATA_INSTALLED="failed"
    else
        NETDATA_INSTALLED="yes"
    fi
fi

# ── Push monitor wiring guidance ─────────────────────────────────────────────
if [[ -n "${PUSH_URLS}" ]]; then
    step OBSERVING "Push monitors created. Feed them from the host:"
    printf '%s\n' "${PUSH_URLS}" >&2
    if [[ -n "${QUEUE_HEALTHCHECK}" ]]; then
        step OBSERVING "queue.healthcheck is set, so the queue watchdog already feeds a heartbeat"
    else
        result_warn "queue.healthcheck is not set; the queue-age push monitor has no heartbeat source. Set it and re-run queue-cron-setup setup-workers.sh."
    fi
fi

# ── Test alert ───────────────────────────────────────────────────────────────
TEST_DELIVERED=false
if [[ "${SKIP_TEST_ALERT}" == "false" ]]; then
    if [[ -z "${MONITORING_PAGE_NOTIFICATION_ID}" ]]; then
        result_warn "monitoring.page_notification_id is not set, so the test alert could not be sent"
    else
        step EXECUTING "Sending a test notification to the page channel"
        set +e
        TEST_OUT="$(kuma_notify_test "${MONITORING_PAGE_NOTIFICATION_ID}" 2>&1)"
        TEST_RC=$?
        set -e
        journal_log "EXECUTING" "Test notification" "POST /api/notifications/test" "${TEST_RC}" 0 \
            "$(printf '%s' "${TEST_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"
        if [[ "${TEST_RC}" -eq 0 ]]; then
            TEST_DELIVERED=true
            step VERIFYING "Test notification accepted by ${KUMA_URL}; confirm it arrived in ${PAGE_CHANNEL:-the page channel}"
        else
            result_warn "The test notification failed: $(printf '%s' "${TEST_OUT}" | tail -3 | tr '\n' ' ')"
        fi
    fi
else
    result_warn "--skip-test-alert was given; the routing path is unverified"
fi

step CONFIGURED "Monitoring configured for ${CLIENT}"

result_add_string "action" "setup"
result_add_string "host" "${HOST}"
result_add_string "monitoring_host" "${MONITORING_HOST}"
result_add_string "kuma_url" "${KUMA_URL}"
result_add_raw "checks_added" "[${CHECKS_ADDED}]"
result_add_raw "monitors_created" "${ADDED}"
result_add_raw "monitors_already_present" "${SKIPPED}"
result_add_string "netdata" "${NETDATA_INSTALLED}"
if [[ "${SKIP_NETDATA}" == "false" ]]; then
    result_add_string "netdata_dropin" "${NETDATA_DROPIN}"
fi
result_add_raw "test_alert_delivered" "${TEST_DELIVERED}"
result_add_string "page_channel" "${PAGE_CHANNEL}"
result_add_string "digest_channel" "${DIGEST_CHANNEL}"
result_add_string "journal" "$(journal_path)"

emit_result "CONFIGURED"
exit 0
