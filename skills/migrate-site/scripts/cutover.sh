#!/usr/bin/env bash
# cutover.sh — Phase 6 of migrate-site: point DNS at the target
#
# Usage:
#   cutover.sh --client <name> [--source <alias>] [--target <alias>]
#              [--target-ip <ip>] [--dns-command <cmd>] [--timeout <seconds>]
#              [--skip-preflight] [--dry-run]
#              [--confirm "CONFIRM CUTOVER"] [--confirm "CONFIRM DNS CHANGE"]
#
# The source stays up and serving a maintenance page throughout; nothing is torn
# down here. That keeps the migration reversible (see migrate-site/SKILL.md,
# rules 8 and 9).
#
# The DNS provider is intentionally not hardcoded. The required record change is
# printed, and it is applied either by the operator or by the command passed in
# --dns-command (see references/cutover-checklist.md and references/ttl-strategy.md).
#
# Approval (see conventions/approvals.md):
#   CONFIRM CUTOVER           run the pre-cutover verification and start the cutover
#   CONFIRM DNS CHANGE        apply the DNS record change (only when it will be applied)
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
TARGET_IP=""
DNS_COMMAND=""
TIMEOUT=1800
SKIP_PREFLIGHT=false
ACTION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)         CLIENT="${2:-}"; shift 2 ;;
        --source)         SOURCE_OVERRIDE="${2:-}"; shift 2 ;;
        --target)         TARGET_OVERRIDE="${2:-}"; shift 2 ;;
        --target-ip)      TARGET_IP="${2:-}"; shift 2 ;;
        --dns-command)    DNS_COMMAND="${2:-}"; shift 2 ;;
        --timeout)        TIMEOUT="${2:-}"; shift 2 ;;
        --skip-preflight) SKIP_PREFLIGHT=true; shift ;;
        --action)         ACTION="${2:-}"; shift 2 ;;
        --dry-run)        DRY_RUN=true; shift ;;
        --confirm)        confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
if [[ -n "${ACTION}" && "${ACTION}" != "cutover" ]]; then
    printf 'ERROR: --action %s does not match this script (cutover)\n' "${ACTION}" >&2
    exit 2
fi
[[ "${TIMEOUT}" =~ ^[0-9]+$ ]] || { printf 'ERROR: --timeout must be an integer number of seconds\n' >&2; exit 2; }

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "migrate-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root domain

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
agency_require_tools "dig:reading the current A record and TTL" "curl:checking that the domain serves live traffic"

SOURCE_HOST="${SOURCE_OVERRIDE:-${MIGRATION_SOURCE_HOST:-${HOST}}}"
TARGET_HOST="${TARGET_OVERRIDE:-${MIGRATION_TARGET_HOST}}"
[[ -n "${TARGET_HOST}" ]] || fail_with 5 STOPPED "No target host: pass --target or set migration.target_host"

migration_require_alias "${SOURCE_HOST}" "source"
migration_require_alias "${TARGET_HOST}" "target"

journal_init "migrate-site" "${CLIENT}" "${MANIFEST}"

TARGET_SSH="$(ssh_target "${TARGET_HOST}" "${DEPLOY_USER}")"

migration_require_phase "${CLIENT}" "inventory" "The inventory phase" 12
migration_require_phase "${CLIENT}" "prepare" "The prepare phase" 12
migration_require_phase "${CLIENT}" "sync" "The sync phase" 12
migration_require_phase "${CLIENT}" "freeze" "The freeze phase" 12

step OBSERVING "Cutover ${CLIENT}: ${SOURCE_HOST} -> ${TARGET_HOST}"

# ── Determine the target IP ───────────────────────────────────────────────────
if [[ -z "${TARGET_IP}" ]]; then
    set +e
    TARGET_IP="$(ssh "${SSH_OPTS[@]}" "${TARGET_SSH}" "curl -s -4 --max-time 10 ifconfig.me 2>/dev/null || curl -s -4 --max-time 10 icanhazip.com 2>/dev/null" 2>/dev/null | head -1 | tr -d '[:space:]')"
    set -e
fi
[[ -n "${TARGET_IP}" ]] || fail_with 5 STOPPED "Could not determine the target public IP: pass --target-ip"

CURRENT_IP="$(migration_a_record_ip "${DOMAIN}" || true)"
CURRENT_TTL="$(migration_a_record_ttl "${DOMAIN}" || true)"
DNS_CHANGES_NEEDED=true
[[ "${CURRENT_IP}" == "${TARGET_IP}" ]] && DNS_CHANGES_NEEDED=false

step OBSERVING "DNS: ${DOMAIN} currently -> ${CURRENT_IP:-unknown} (TTL ${CURRENT_TTL:-unknown}); target -> ${TARGET_IP}"

{
    printf '\nCutover plan\n'
    printf '  Domain:        %s\n' "${DOMAIN}"
    printf '  Current A:     %s\n' "${CURRENT_IP:-unknown}"
    printf '  Required A:    %s\n' "${TARGET_IP}"
    printf '  DNS change:    %s\n' "$([[ "${DNS_CHANGES_NEEDED}" == "true" ]] && printf 'yes' || printf 'not needed')"
    printf '  Applied by:    %s\n' "$([[ -n "${DNS_COMMAND}" ]] && printf 'this script, via --dns-command' || printf 'the operator')"
    printf '  Source stays:  up, serving a maintenance page\n'
    printf '  Gate required: CONFIRM CUTOVER'
    [[ -n "${DNS_COMMAND}" && "${DNS_CHANGES_NEEDED}" == "true" ]] && printf ', CONFIRM DNS CHANGE'
    printf '\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no mutations performed"
    result_add_string "action" "cutover"
    result_add_string "source_host" "${SOURCE_HOST}"
    result_add_string "target_host" "${TARGET_HOST}"
    result_add_string "current_ip" "${CURRENT_IP}"
    result_add_string "target_ip" "${TARGET_IP}"
    result_add_raw "dns_change_needed" "${DNS_CHANGES_NEEDED}"
    emit_result "PLANNED"
    exit 0
fi

step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM CUTOVER" "CUTOVER" "Point ${DOMAIN} at ${TARGET_IP} and serve live traffic from ${TARGET_HOST}."

# ── Pre-cutover verification on the target ────────────────────────────────────
PREFLIGHT_FAILURES=0
if [[ "${SKIP_PREFLIGHT}" == "false" ]]; then
    step VERIFYING "Exercising the target with the production hostname forced locally"
    set +e
    PREFLIGHT_OUT="$(ssh "${SSH_OPTS[@]}" "${TARGET_SSH}" "
        set +e
        code=\$(curl -s -o /dev/null -w '%{http_code}' --resolve '${DOMAIN}:443:127.0.0.1' --max-time 20 'https://${DOMAIN}/')
        echo \"fqdn_status=\$code\"
        app=\$(curl -s -o /dev/null -w '%{http_code}' --resolve '${DOMAIN}:443:127.0.0.1' --max-time 20 'https://${DOMAIN}${HEALTH_URL}')
        echo \"health_status=\$app\"
        echo \"db_tables=\$(set -a; . '${SITE_ROOT}/shared/.env' 2>/dev/null; set +a; export MYSQL_PWD=\"\$DB_PASSWORD\"; mysql -N -B -u \"\$DB_USERNAME\" \"\$DB_DATABASE\" -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();' 2>/dev/null)\"
    " 2>&1)"
    set -e
    printf '%s\n' "${PREFLIGHT_OUT}" >&2

    FQDN_STATUS="$(printf '%s' "${PREFLIGHT_OUT}" | sed -n 's/^fqdn_status=//p' | head -1)"
    HEALTH_STATUS="$(printf '%s' "${PREFLIGHT_OUT}" | sed -n 's/^health_status=//p' | head -1)"
    DB_TABLES="$(printf '%s' "${PREFLIGHT_OUT}" | sed -n 's/^db_tables=//p' | head -1)"

    [[ "${FQDN_STATUS}" == "200" ]] || { result_warn "The target returned ${FQDN_STATUS:-no status} for https://${DOMAIN}/ when forced locally"; PREFLIGHT_FAILURES=$((PREFLIGHT_FAILURES + 1)); }
    [[ "${HEALTH_STATUS}" =~ ^(200|204|302)$ ]] || { result_warn "The target health endpoint returned ${HEALTH_STATUS:-no status}"; PREFLIGHT_FAILURES=$((PREFLIGHT_FAILURES + 1)); }
    if [[ "${DB_TABLES}" =~ ^[0-9]+$ ]]; then
        [[ "${DB_TABLES}" -gt 0 ]] || { result_warn "The target database has no tables"; PREFLIGHT_FAILURES=$((PREFLIGHT_FAILURES + 1)); }
    else
        result_warn "Could not count tables on the target database"
    fi

    journal_log "VERIFYING" "Pre-cutover preflight" "curl --resolve ${DOMAIN}:443:127.0.0.1" \
        "$([[ "${PREFLIGHT_FAILURES}" -eq 0 ]] && printf 0 || printf 1)" 0 \
        "$(printf '%s' "${PREFLIGHT_OUT}" | journal_sanitize)" "VERIFYING" "VERIFYING"

    if [[ "${PREFLIGHT_FAILURES}" -gt 0 ]]; then
        fail_with 1 FAILED "Pre-cutover verification found ${PREFLIGHT_FAILURES} problem(s) on ${TARGET_HOST}. Fix them before cutting over; use --skip-preflight only if you have already verified manually."
    fi
    step VERIFYING "Pre-cutover verification passed"
fi

# ── DNS ───────────────────────────────────────────────────────────────────────
DNS_APPLIED=false
if [[ "${DNS_CHANGES_NEEDED}" == "true" ]]; then
    if [[ -n "${DNS_COMMAND}" ]]; then
        step CONFIRMING "Checking approval gate for the DNS change"
        require_confirm "CONFIRM DNS CHANGE" "DNS CHANGE" "Change the A record for ${DOMAIN} from ${CURRENT_IP:-unknown} to ${TARGET_IP}."

        step EXECUTING "Applying the DNS change"
        set +e
        DNS_OUT="$(DOMAIN="${DOMAIN}" TARGET_IP="${TARGET_IP}" CLIENT="${CLIENT}" bash -c "${DNS_COMMAND}" 2>&1)"
        DNS_RC=$?
        set -e
        journal_log "EXECUTING" "Apply DNS change" "--dns-command" "${DNS_RC}" 0 \
            "$(printf '%s' "${DNS_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"
        if [[ "${DNS_RC}" -ne 0 ]]; then
            fail_with 6 FAILED "The DNS command failed (exit ${DNS_RC}): $(printf '%s' "${DNS_OUT}" | tail -5 | tr '\n' ' ')"
        fi
        DNS_APPLIED=true
        step EXECUTING "DNS change submitted"
    else
        step OBSERVING "No --dns-command given; apply this change yourself:"
        printf '\n  %s  A  %s   (was %s)\n\n' "${DOMAIN}" "${TARGET_IP}" "${CURRENT_IP:-unknown}" >&2
    fi
else
    step OBSERVING "The A record already points at ${TARGET_IP}; nothing to change"
fi

# ── Wait for propagation ──────────────────────────────────────────────────────
PROPAGATED=false
if command -v dig >/dev/null 2>&1; then
    step VERIFYING "Waiting up to ${TIMEOUT}s for ${DOMAIN} to resolve to ${TARGET_IP}"
    WAITED=0
    while [[ "${WAITED}" -lt "${TIMEOUT}" ]]; do
        if [[ "$(migration_a_record_ip "${DOMAIN}" || true)" == "${TARGET_IP}" ]]; then
            PROPAGATED=true
            break
        fi
        sleep 15
        WAITED=$((WAITED + 15))
        if (( WAITED % 300 == 0 )); then
            step VERIFYING "Still waiting (${WAITED}s elapsed)"
        fi
    done
    if [[ "${PROPAGATED}" == "true" ]]; then
        step VERIFYING "Propagation: confirmed"
    else
        step VERIFYING "Propagation: not confirmed within ${TIMEOUT}s"
    fi
else
    result_warn "dig is not available; DNS propagation was not verified"
fi

# ── Live check ────────────────────────────────────────────────────────────────
LIVE_STATUS=""
if command -v curl >/dev/null 2>&1; then
    step VERIFYING "Checking https://${DOMAIN}/ from this machine"
    set +e
    LIVE_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://${DOMAIN}/" 2>/dev/null)"
    set -e
    step VERIFYING "https://${DOMAIN}/ -> ${LIVE_STATUS}"
    if [[ "${LIVE_STATUS}" != "200" && "${LIVE_STATUS}" != "301" && "${LIVE_STATUS}" != "302" ]]; then
        result_warn "Unexpected status ${LIVE_STATUS} from ${DOMAIN} after cutover"
    fi
fi

migration_state_set "${CLIENT}" "cutover" "target_ip=${TARGET_IP} dns_applied=${DNS_APPLIED} propagated=${PROPAGATED}"

RESULT_STATUS="CUTOVER"
if [[ "${PROPAGATED}" == "false" ]] && command -v dig >/dev/null 2>&1; then
    RESULT_STATUS="INCONCLUSIVE"
    step INCONCLUSIVE "DNS has not switched yet; rerun verify.sh once it has"
fi

result_add_string "action" "cutover"
result_add_string "source_host" "${SOURCE_HOST}"
result_add_string "target_host" "${TARGET_HOST}"
result_add_string "domain" "${DOMAIN}"
result_add_string "previous_ip" "${CURRENT_IP}"
result_add_string "target_ip" "${TARGET_IP}"
result_add_raw "dns_change_needed" "${DNS_CHANGES_NEEDED}"
result_add_raw "dns_applied" "${DNS_APPLIED}"
result_add_raw "propagated" "${PROPAGATED}"
if [[ -n "${LIVE_STATUS}" ]]; then
    result_add_raw "live_status" "${LIVE_STATUS}"
fi
result_add_string "journal" "$(journal_path)"

emit_result "${RESULT_STATUS}"
exit 0
