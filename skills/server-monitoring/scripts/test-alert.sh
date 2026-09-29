#!/usr/bin/env bash
# test-alert.sh — Trigger a test notification and confirm the routing path
#
# Usage:
#   test-alert.sh --client <name> [--check <monitor-name>]
#                 [--notification-id <id>] [--monitoring-host <alias>]
#                 [--api-key <key>] [--kuma-url <url>]
#                 [--via uptime-kuma|slack] [--channel <#channel>]
#                 [--confirm "CONFIRM NOTIFY"] [--dry-run]
#
# Proves one notification path end to end. It does not change monitoring
# configuration: the only side effect is the notification itself, which is the point.
#
# Two transports, because "the alert arrived" can be proven two ways:
#
#   --via uptime-kuma   Uptime Kuma sends the test through the configured channel.
#   --via slack         The Slack integration posts it directly. This is the
#                       fallback when Kuma's channel config cannot be exercised
#                       (an incoming webhook cannot be verified without sending
#                       something), and it is the only mutating action here:
#                       it carries the engine's own `CONFIRM NOTIFY` gate.
#
# The Kuma API key is resolved by kuma_resolve_key: --api-key, then the variable
# named by monitoring.api_key_env, then the vault secret named by
# monitoring.api_key_secret. It is never an argument to a remote command.
#
# Approval (see conventions/approvals.md):
#   CONFIRM NOTIFY            only for --via slack
#
# Exit codes: see conventions/outputs.md  (3 when the API rejects the request)

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
CHECK_NAME=""
NOTIFICATION_ID=""
MON_HOST_OVERRIDE=""
ACTION=""
DRY_RUN=false
VIA="uptime-kuma"
CHANNEL=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)          CLIENT="${2:-}"; shift 2 ;;
        --check)           CHECK_NAME="${2:-}"; shift 2 ;;
        --notification-id) NOTIFICATION_ID="${2:-}"; shift 2 ;;
        --monitoring-host) MON_HOST_OVERRIDE="${2:-}"; shift 2 ;;
        --api-key)         KUMA_KEY="${2:-}"; shift 2 ;;
        --kuma-url)        KUMA_URL="${2:-}"; shift 2 ;;
        --via)             VIA="${2:-}"; shift 2 ;;
        --channel)         CHANNEL="${2:-}"; shift 2 ;;
        --action)          ACTION="${2:-}"; shift 2 ;;
        --dry-run)         DRY_RUN=true; shift ;;
        --confirm)         confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
case "${ACTION}" in
    ""|test-alert) ;;
    *) printf 'ERROR: --action %s does not match this script (test-alert)\n' "${ACTION}" >&2; exit 2 ;;
esac
case "${VIA}" in
    uptime-kuma|slack) ;;
    *) printf 'ERROR: --via must be uptime-kuma or slack (got: %s)\n' "${VIA}" >&2; exit 2 ;;
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
# --api-key, then the variable named by monitoring.api_key_env, then the vault
# secret named by monitoring.api_key_secret. kuma_require_key reports the gap.
kuma_resolve_key || true

journal_init "server-monitoring" "${CLIENT}" "${MANIFEST}"

step OBSERVING "Test alert for ${CLIENT} via ${VIA}"

# The channel reference, in order of explicitness: --channel, the manifest's
# integrations.slack.channel, then the channel half of `alert_to`/page_channel
# (the manifest stores `slack:#acme-alerts`, so the prefix is dropped here).
SLACK_CHANNEL="${CHANNEL}"
if [[ -z "${SLACK_CHANNEL}" ]]; then
    SLACK_CHANNEL="$(integration_ref slack channel)"
fi
if [[ -z "${SLACK_CHANNEL}" && "${PAGE_CHANNEL}" == slack:* ]]; then
    SLACK_CHANNEL="${PAGE_CHANNEL#slack:}"
fi

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no notification sent"
    result_add_string "action" "test-alert"
    result_add_string "transport" "${VIA}"
    result_add_string "monitoring_host" "${MONITORING_HOST}"
    result_add_string "check" "${CHECK_NAME:-${CLIENT}-http}"
    if [[ "${VIA}" == "slack" ]]; then
        result_add_string "channel" "${SLACK_CHANNEL}"
        result_add_string "confirm_string" "CONFIRM NOTIFY"
    fi
    emit_result "PLANNED"
    exit 0
fi

# ── Slack transport ──────────────────────────────────────────────────────────
# This is the one path in this script that mutates something upstream, so it is
# the one path with a gate. The engine applies the same literal again; the gate
# here is what stops a script that never passed through the approval loop.
if [[ "${VIA}" == "slack" ]]; then
    if ! integration_require_ready slack "the Slack test notification"; then
        fail_with 5 STOPPED "The Slack integration is not ready for ${CLIENT}. Store a credential with: warpmetal env store set $(integration_secret_name slack)"
    fi
    if [[ -z "${SLACK_CHANNEL}" ]]; then
        fail_with 5 STOPPED "No Slack channel. Pass --channel, set integrations.slack.channel in the manifest, or set monitoring.page_channel = \"slack:#channel\"."
    fi

    step CONFIRMING "Checking approval gate"
    require_confirm "CONFIRM NOTIFY" "NOTIFY" "Post a test notification to ${SLACK_CHANNEL} for ${CLIENT}."

    step EXECUTING "Posting a test notification to ${SLACK_CHANNEL}"
    set +e
    NOTIFY_OUT="$(integration_run_mutating slack notify "CONFIRM NOTIFY" \
        --channel "${SLACK_CHANNEL}" \
        --text "[${CLIENT}] Test alert from the server-monitoring skill. No action needed." 2>&1)"
    NOTIFY_RC=$?
    set -e

    integration_journal "EXECUTING" "slack notify" "test notification to ${SLACK_CHANNEL}" "${NOTIFY_RC}"

    if [[ "${NOTIFY_RC}" -ne 0 ]]; then
        case "${NOTIFY_RC}" in
            4) fail_with 5 STOPPED "Slack rejected the stored credential for ${CLIENT}" ;;
            127) fail_with 127 STOPPED "The warpmetal CLI is not installed; nothing was posted" ;;
            *) fail_with 1 FAILED "Slack rejected the test notification (exit ${NOTIFY_RC}): $(printf '%s' "${NOTIFY_OUT}" | tail -3 | tr '\n' ' ')" ;;
        esac
    fi

    step VERIFYING "Accepted by Slack; confirm it arrived in ${SLACK_CHANNEL}"
    step ALERT_TESTED "Test alert delivered through Slack"

    result_add_string "action" "test-alert"
    result_add_string "host" "${HOST}"
    result_add_string "transport" "slack"
    result_add_string "channel" "${SLACK_CHANNEL}"
    result_add_string "check" "${CHECK_NAME:-${CLIENT}-http}"
    result_add_raw "test_alert_delivered" "true"
    result_add_string "page_channel" "${PAGE_CHANNEL}"
    result_add_string "journal" "$(journal_path)"

    emit_result "ALERT_TESTED"
    exit 0
fi

kuma_require_key

# ── Identify the target notification channel ─────────────────────────────────
TARGET_ID="${NOTIFICATION_ID}"
TARGET_LABEL="notification id ${TARGET_ID}"

if [[ -z "${TARGET_ID}" ]]; then
    TARGET_ID="${MONITORING_PAGE_NOTIFICATION_ID}"
    TARGET_LABEL="page channel (${PAGE_CHANNEL:-unset})"
fi
if [[ -z "${TARGET_ID}" ]]; then
    fail_with 5 STOPPED "No notification id. Set monitoring.page_notification_id in the manifest, or pass --notification-id."
fi
if ! [[ "${TARGET_ID}" =~ ^[0-9]+$ ]]; then
    fail_with 5 STOPPED "--notification-id must be numeric (got: ${TARGET_ID})"
fi

# ── Confirm the monitor exists, when one was named ───────────────────────────
CHECK_NAME="${CHECK_NAME:-${CLIENT}-http}"
set +e
MONITORS_TSV="$(kuma_monitors_tsv 2>&1)"
MONITORS_RC=$?
set -e
CHECK_FOUND="unknown"
if [[ "${MONITORS_RC}" -eq 0 ]]; then
    if printf '%s\n' "${MONITORS_TSV}" | awk -F'\t' -v n="${CHECK_NAME}" '$2 == n { found = 1 } END { exit(found ? 0 : 1) }'; then
        CHECK_FOUND="yes"
        step OBSERVING "Monitor '${CHECK_NAME}' exists"
    else
        CHECK_FOUND="no"
        result_warn "No monitor named '${CHECK_NAME}'; the test still exercises the notification channel"
    fi
else
    result_warn "Could not list monitors: $(printf '%s' "${MONITORS_TSV}" | tail -3 | tr '\n' ' ')"
fi

# ── Fire the test ────────────────────────────────────────────────────────────
step EXECUTING "Sending a test notification to ${TARGET_LABEL}"
set +e
TEST_OUT="$(kuma_notify_test "${TARGET_ID}" 2>&1)"
TEST_RC=$?
set -e

journal_log "EXECUTING" "Test notification" "POST /api/notifications/test" "${TEST_RC}" 0 \
    "$(printf '%s' "${TEST_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"
printf '%s\n' "${TEST_OUT}" >&2

if [[ "${TEST_RC}" -ne 0 ]]; then
    fail_with 3 FAILED "Uptime Kuma rejected the test notification: $(printf '%s' "${TEST_OUT}" | tail -3 | tr '\n' ' ')"
fi

if printf '%s' "${TEST_OUT}" | grep -qiE '"ok"[[:space:]]*:[[:space:]]*false|error'; then
    fail_with 3 FAILED "Uptime Kuma returned an error for the test notification: $(printf '%s' "${TEST_OUT}" | tail -3 | tr '\n' ' ')"
fi

step VERIFYING "Test notification accepted by ${KUMA_URL}"
step VERIFYING "Confirm it arrived in ${PAGE_CHANNEL:-the page channel}; this script cannot read your chat client"

step ALERT_TESTED "Test alert delivered"

result_add_string "action" "test-alert"
result_add_string "host" "${HOST}"
result_add_string "transport" "uptime-kuma"
result_add_string "monitoring_host" "${MONITORING_HOST}"
result_add_string "check" "${CHECK_NAME}"
result_add_string "check_exists" "${CHECK_FOUND}"
result_add_raw "notification_id" "${TARGET_ID}"
result_add_raw "test_alert_delivered" "true"
result_add_string "page_channel" "${PAGE_CHANNEL}"
result_add_string "journal" "$(journal_path)"

emit_result "ALERT_TESTED"
exit 0
