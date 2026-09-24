#!/usr/bin/env bash
# status-monitoring.sh — Read-only view of a client's monitoring state
#
# Usage:
#   status-monitoring.sh --client <name> [--monitoring-host <alias>]
#                        [--api-key <key>] [--kuma-url <url>]
#
# Lists the Uptime Kuma monitors belonging to the client, their current state and
# uptime, and reports the Netdata presence on the monitored host. Checks that the
# monitor really is external, since that is the one rule this skill exists for.
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
MON_HOST_OVERRIDE=""
ACTION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)          CLIENT="${2:-}"; shift 2 ;;
        --monitoring-host) MON_HOST_OVERRIDE="${2:-}"; shift 2 ;;
        --api-key)         KUMA_KEY="${2:-}"; shift 2 ;;
        --kuma-url)        KUMA_URL="${2:-}"; shift 2 ;;
        --action)          ACTION="${2:-}"; shift 2 ;;
        --dry-run)         DRY_RUN=true; shift ;;
        --confirm)         confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
case "${ACTION}" in
    ""|status) ;;
    *) printf 'ERROR: --action %s does not match this script (status)\n' "${ACTION}" >&2; exit 2 ;;
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

step OBSERVING "Monitoring status for ${CLIENT}"

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run"
    result_add_string "action" "status"
    result_add_string "monitoring_host" "${MONITORING_HOST}"
    emit_result "PLANNED"
    exit 0
fi

MONITORS_JSON="[]"
MONITOR_COUNT=0
DOWN_COUNT=0
MONITORING_HOST_TSV=""

if [[ -z "${KUMA_URL}" ]]; then
    fail_with 5 STOPPED "No Uptime Kuma URL. Set monitoring.uptime_kuma_url in the manifest or pass --kuma-url."
fi
if [[ -z "${KUMA_KEY}" ]]; then
    result_warn "No API key available (export ${MONITORING_KUMA_TOKEN_ENV:-AGENCY_UPTIME_KUMA_KEY}); monitor state could not be read"
else
    step OBSERVING "Querying ${KUMA_URL}"
    set +e
    RAW_TSV="$(kuma_monitors_tsv 2>&1)"
    TSV_RC=$?
    set -e
    if [[ "${TSV_RC}" -ne 0 ]]; then
        fail_with 3 STOPPED "The Uptime Kuma API at ${KUMA_URL} did not return a monitor list: $(printf '%s' "${RAW_TSV}" | tail -3 | tr '\n' ' ')"
    fi

    MONITORING_HOST_TSV="${RAW_TSV}"
    CLIENT_TSV="$(printf '%s\n' "${RAW_TSV}" | awk -F'\t' -v p="${CLIENT}-" 'index($2, p) == 1')"

    entries=""
    while IFS=$'\t' read -r mid mname mtype mactive murl; do
        [[ -z "${mid}" ]] && continue
        MONITOR_COUNT=$((MONITOR_COUNT + 1))
        [[ "${mactive}" == "no" ]] && DOWN_COUNT=$((DOWN_COUNT + 1))
        step OBSERVING "${mname} [${mtype}] active=${mactive} ${murl}"
        entry="$(printf '{"id":%s,"name":%s,"type":%s,"active":%s,"url":%s}' \
            "${mid}" "$(json_string "${mname}")" "$(json_string "${mtype}")" \
            "$([[ "${mactive}" == "yes" ]] && printf 'true' || printf 'false')" "$(json_string "${murl}")")"
        if [[ -z "${entries}" ]]; then entries="${entry}"; else entries="${entries},${entry}"; fi
    done <<< "${CLIENT_TSV}"

    MONITORS_JSON="[${entries}]"

    if [[ "${MONITOR_COUNT}" -eq 0 ]]; then
        result_warn "No Uptime Kuma monitors are named '${CLIENT}-*'. Run setup-monitoring.sh for this client."
    fi
fi

# ── Netdata on the monitored host ─────────────────────────────────────────────
NETDATA_PRESENT="unknown"
SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"
set +e
NETDATA_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "
    if systemctl is-active netdata >/dev/null 2>&1; then echo active
    elif command -v netdata >/dev/null 2>&1; then echo installed
    else echo absent
    fi" 2>&1)"
set -e
case "${NETDATA_OUT}" in
    active|installed|absent) NETDATA_PRESENT="${NETDATA_OUT}" ;;
esac
step OBSERVING "Netdata on ${HOST}: ${NETDATA_PRESENT}"

# ── The rule this skill exists for ────────────────────────────────────────────
EXTERNAL="unknown"
if [[ -n "${MONITORING_HOST}" ]]; then
    set +e
    monitoring_require_external_host "${HOST}" "${MONITORING_HOST}" 2>/dev/null
    EXT_RC=$?
    set -e
    if [[ "${EXT_RC}" -eq 0 ]]; then
        EXTERNAL="yes"
        step OBSERVING "Monitor host '${MONITORING_HOST}' is external to '${HOST}'"
    else
        EXTERNAL="no"
        result_error "The monitoring host is the same as the monitored host (${HOST}). A monitor on the box it watches reports nothing when that box dies."
    fi
else
    result_warn "monitoring.monitoring_host is not set, so the external-check rule could not be verified"
fi

result_add_string "action" "status"
result_add_string "host" "${HOST}"
result_add_string "domain" "${DOMAIN}"
result_add_string "monitoring_host" "${MONITORING_HOST}"
result_add_string "kuma_url" "${KUMA_URL}"
result_add_raw "monitors" "${MONITORS_JSON}"
result_add_raw "monitor_count" "${MONITOR_COUNT}"
result_add_raw "monitors_inactive" "${DOWN_COUNT}"
result_add_string "netdata" "${NETDATA_PRESENT}"
result_add_string "external_monitor" "${EXTERNAL}"
result_add_string "page_channel" "${PAGE_CHANNEL}"
result_add_string "digest_channel" "${DIGEST_CHANNEL}"
result_add_string "journal" "$(journal_path)"

if [[ "${EXTERNAL}" == "no" ]]; then
    step FAILED "External-check rule violated"
    emit_result "FAILED"
    exit 5
fi

step OBSERVED "Monitoring status reported"
emit_result "OBSERVED"
exit 0
