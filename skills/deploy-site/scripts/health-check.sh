#!/usr/bin/env bash
# health-check.sh — Poll the client health URL
#
# Usage:
#   health-check.sh --client <name> [--url <url>] [--attempts <n>]
#                   [--interval <s>] [--timeout <s>]
#
# Polls the health URL N times and reports how many attempts returned HTTP 200.
#
# No approval gate: this script never mutates anything.
#
# Exit codes: see conventions/outputs.md (9 = health check failure)

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
CUSTOM_URL=""
ATTEMPTS=5
INTERVAL=3
TIMEOUT=10

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)   CLIENT="${2:-}"; shift 2 ;;
        --url)      CUSTOM_URL="${2:-}"; shift 2 ;;
        --attempts) ATTEMPTS="${2:-}"; shift 2 ;;
        --interval) INTERVAL="${2:-}"; shift 2 ;;
        --timeout)  TIMEOUT="${2:-}"; shift 2 ;;
        --confirm)  confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

for pair in "attempts:${ATTEMPTS}" "interval:${INTERVAL}" "timeout:${TIMEOUT}"; do
    value="${pair#*:}"
    if ! [[ "${value}" =~ ^[0-9]+$ ]] || [[ "${value}" -lt 1 ]]; then
        printf 'ERROR: %s must be a positive integer, got: %s\n' "${pair%%:*}" "${value}" >&2
        exit 2
    fi
done

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "deploy-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require health_url

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report

journal_init "deploy-site" "${CLIENT}" "${MANIFEST}"

HEALTH_URL="${CUSTOM_URL:-${HEALTH_URL}}"
if [[ "${HEALTH_URL}" != https://* ]]; then
    fail_with 5 STOPPED "Health URL must use HTTPS (got: ${HEALTH_URL})"
fi

step VERIFYING "Polling ${HEALTH_URL} (${ATTEMPTS} attempts, ${INTERVAL}s apart)"

passed=0
failed=0
response_times=()

for i in $(seq 1 "${ATTEMPTS}"); do
    start_ns="$(date +%s%N 2>/dev/null || date +%s000000000)"
    http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time "${TIMEOUT}" "${HEALTH_URL}" 2>/dev/null || printf '000')"
    end_ns="$(date +%s%N 2>/dev/null || date +%s000000000)"
    duration_ms=$(( (end_ns - start_ns) / 1000000 ))
    response_times+=("${duration_ms}")

    if [[ "${http_code}" == "200" ]]; then
        passed=$((passed + 1))
        step VERIFYING "[${i}/${ATTEMPTS}] OK (${duration_ms}ms)"
    else
        failed=$((failed + 1))
        step VERIFYING "[${i}/${ATTEMPTS}] FAILED (HTTP ${http_code}, ${duration_ms}ms)"
    fi

    [[ "${i}" -lt "${ATTEMPTS}" ]] && sleep "${INTERVAL}"
done

journal_log "VERIFYING" "Health check" "curl ${HEALTH_URL}" "$([[ ${failed} -eq 0 ]] && printf 0 || printf 9)" 0 \
    "passed=${passed} failed=${failed} times_ms=${response_times[*]}" "VERIFYING" "$([[ ${failed} -eq 0 ]] && printf OBSERVED || printf FAILED)"

result_add_string "health_url" "${HEALTH_URL}"
result_add_raw "attempts" "${ATTEMPTS}"
result_add_raw "passed" "${passed}"
result_add_raw "failed" "${failed}"
result_add_raw "response_times_ms" "[$(IFS=,; printf '%s' "${response_times[*]}")]"
result_add_string "journal" "$(journal_path)"

if [[ "${failed}" -gt 0 ]]; then
    step FAILED "${failed}/${ATTEMPTS} health checks failed"
    emit_result "FAILED"
    exit 9
fi

step VERIFYING "${passed}/${ATTEMPTS} health checks passed"
emit_result "OBSERVED"
exit 0
