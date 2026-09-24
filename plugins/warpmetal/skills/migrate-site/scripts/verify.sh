#!/usr/bin/env bash
# verify.sh — Phase 7 of migrate-site: run the cutover checklist
#
# Usage:
#   verify.sh --client <name> [--source <alias>] [--target <alias>]
#             [--target-ip <ip>] [--skip-source-liveness] [--dry-run]
#
# Read-only against both hosts: it only observes. The checklist it executes is
# references/cutover-checklist.md. Items that cannot be checked without a human
# (form submissions, email arrival, payment webhooks) are reported under
# manual_checks and never count as failures.
#
# No approval gate: this script never mutates anything.
#
# Exit codes: see conventions/outputs.md  (1 when any automated check fails)

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
SKIP_SOURCE_LIVENESS=false
ACTION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)                CLIENT="${2:-}"; shift 2 ;;
        --source)                SOURCE_OVERRIDE="${2:-}"; shift 2 ;;
        --target)                TARGET_OVERRIDE="${2:-}"; shift 2 ;;
        --target-ip)             TARGET_IP="${2:-}"; shift 2 ;;
        --skip-source-liveness)  SKIP_SOURCE_LIVENESS=true; shift ;;
        --action)                ACTION="${2:-}"; shift 2 ;;
        --dry-run)               DRY_RUN=true; shift ;;
        --confirm)               confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
if [[ -n "${ACTION}" && "${ACTION}" != "verify" ]]; then
    printf 'ERROR: --action %s does not match this script (verify)\n' "${ACTION}" >&2
    exit 2
fi

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "migrate-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root domain

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
agency_require_tools "dig:verifying that DNS points at the target" "curl:checking the target over HTTP" "openssl:verifying the served certificate"

SOURCE_HOST="${SOURCE_OVERRIDE:-${MIGRATION_SOURCE_HOST:-${HOST}}}"
TARGET_HOST="${TARGET_OVERRIDE:-${MIGRATION_TARGET_HOST}}"
[[ -n "${TARGET_HOST}" ]] || fail_with 5 STOPPED "No target host: pass --target or set migration.target_host"

migration_require_alias "${SOURCE_HOST}" "source"
migration_require_alias "${TARGET_HOST}" "target"

journal_init "migrate-site" "${CLIENT}" "${MANIFEST}"

SOURCE_SSH="$(ssh_target "${SOURCE_HOST}" "${DEPLOY_USER}")"
TARGET_SSH="$(ssh_target "${TARGET_HOST}" "${DEPLOY_USER}")"

migration_require_phase "${CLIENT}" "cutover" "The cutover phase" 12

step OBSERVING "Verifying ${CLIENT} after cutover (${DOMAIN})"

if [[ -z "${TARGET_IP}" ]]; then
    TARGET_IP="$(migration_state_detail "${CLIENT}" "cutover" | sed -n 's/.*target_ip=\([^ ]*\).*/\1/p')"
fi

# ── Check bookkeeping ─────────────────────────────────────────────────────────
CHECKS_JSON=""
MANUAL_JSON=""
FAILED_COUNT=0
PASSED_COUNT=0
MANUAL_COUNT=0

record_check() {  # <id> <description> <status> <detail>
    local id="$1" desc="$2" status="$3" detail="${4:-}"
    case "${status}" in
        pass) PASSED_COUNT=$((PASSED_COUNT + 1)) ;;
        fail) FAILED_COUNT=$((FAILED_COUNT + 1)) ;;
    esac
    case "${status}" in
        pass) step VERIFYING "${desc}: OK${detail:+ (${detail})}" ;;
        fail) step VERIFYING "${desc}: FAILED${detail:+ (${detail})}" ;;
        warn) step VERIFYING "${desc}: WARN${detail:+ (${detail})}" ;;
        *)    step VERIFYING "${desc}: ${detail:-skipped}" ;;
    esac
    [[ "${status}" == "fail" ]] && result_error "${desc}: ${detail}"

    local entry
    entry="$(printf '{"id":%s,"description":%s,"status":%s,"detail":%s}' \
        "$(json_string "${id}")" "$(json_string "${desc}")" "$(json_string "${status}")" "$(json_string "${detail}")")"
    if [[ -z "${CHECKS_JSON}" ]]; then CHECKS_JSON="${entry}"; else CHECKS_JSON="${CHECKS_JSON},${entry}"; fi
}

record_manual() {  # <id> <description>
    MANUAL_COUNT=$((MANUAL_COUNT + 1))
    step VERIFYING "MANUAL: $2"
    local entry
    entry="$(printf '{"id":%s,"description":%s,"verified":false}' "$(json_string "$1")" "$(json_string "$2")")"
    if [[ -z "${MANUAL_JSON}" ]]; then MANUAL_JSON="${entry}"; else MANUAL_JSON="${MANUAL_JSON},${entry}"; fi
}

rsys() {  # <dest> <command> -> stdout, never aborts
    local dest="$1" cmd="$2" out
    set +e
    out="$(ssh "${SSH_OPTS[@]}" "${dest}" "${cmd}" 2>&1)"
    set -e
    printf '%s' "${out}"
}

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: the checklist would run against ${DOMAIN}"
    printf '\nChecklist source: migrate-site/references/cutover-checklist.md\n\n' >&2
    result_add_string "action" "verify"
    result_add_string "source_host" "${SOURCE_HOST}"
    result_add_string "target_host" "${TARGET_HOST}"
    emit_result "PLANNED"
    exit 0
fi

# ── 1. DNS ────────────────────────────────────────────────────────────────────
if command -v dig >/dev/null 2>&1; then
    RESOLVED_IP="$(migration_a_record_ip "${DOMAIN}" || true)"
    RESOLVED_TTL="$(migration_a_record_ttl "${DOMAIN}" || true)"
    if [[ -n "${TARGET_IP}" && "${RESOLVED_IP}" == "${TARGET_IP}" ]]; then
        record_check "dns_points_to_target" "dns_points_to_target" "pass" "${DOMAIN} -> ${RESOLVED_IP}"
    elif [[ -z "${TARGET_IP}" ]]; then
        record_check "dns_points_to_target" "dns_points_to_target" "warn" "${DOMAIN} -> ${RESOLVED_IP}; the target IP is unknown (run cutover.sh first)"
    else
        record_check "dns_points_to_target" "dns_points_to_target" "fail" "${DOMAIN} -> ${RESOLVED_IP}, expected ${TARGET_IP}"
    fi
    if [[ "${RESOLVED_TTL}" =~ ^[0-9]+$ ]] && [[ "${RESOLVED_TTL}" -gt 300 ]]; then
        result_warn "A record TTL is ${RESOLVED_TTL}s; keep the source up for at least that long"
    fi
else
    record_check "dns_points_to_target" "dns_points_to_target" "warn" "dig unavailable"
fi

# ── 2. HTTPS and redirects (from this machine) ─────────────────────────────────
if command -v curl >/dev/null 2>&1; then
    HTTPS_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://${DOMAIN}/" 2>/dev/null || true)"
    if [[ "${HTTPS_CODE}" == "200" ]]; then
        record_check "home_renders" "home_renders" "pass" "HTTP ${HTTPS_CODE}"
    else
        record_check "home_renders" "home_renders" "fail" "HTTP ${HTTPS_CODE:-no response}"
    fi

    REDIRECT_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://${DOMAIN}/" 2>/dev/null || true)"
    if [[ "${REDIRECT_CODE}" == "301" || "${REDIRECT_CODE}" == "302" || "${REDIRECT_CODE}" == "308" ]]; then
        record_check "https_enforced" "https_enforced" "pass" "HTTP -> ${REDIRECT_CODE}"
    else
        record_check "https_enforced" "https_enforced" "fail" "plain HTTP returned ${REDIRECT_CODE:-no response} instead of a redirect"
    fi

    NOTFOUND_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://${DOMAIN}/this-page-does-not-exist-agency-check" 2>/dev/null || true)"
    if [[ "${NOTFOUND_CODE}" == "404" ]]; then
        record_check "404_page" "404_page" "pass" "HTTP 404"
    else
        record_check "404_page" "404_page" "fail" "HTTP ${NOTFOUND_CODE:-no response} for an unknown path (expected 404)"
    fi

    RESPONSE_TIME="$(curl -s -o /dev/null -w '%{time_total}' --max-time 30 "https://${DOMAIN}/" 2>/dev/null || true)"
    if [[ -n "${RESPONSE_TIME}" ]]; then
        case "${RESPONSE_TIME}" in
            0.*|1.*|2.*) record_check "response_time" "response_time" "pass" "${RESPONSE_TIME}s" ;;
            *)           record_check "response_time" "response_time" "warn" "${RESPONSE_TIME}s is slow" ;;
        esac
    fi

    MIXED="$(curl -s --max-time 20 "https://${DOMAIN}/" 2>/dev/null | grep -oE 'src="http://[^"]+|href="http://[^"]+' | grep -v 'http://'"${DOMAIN}" | head -3 || true)"
    if [[ -z "${MIXED}" ]]; then
        record_check "no_mixed_content" "no_mixed_content" "pass" "no absolute http:// assets found on the home page"
    else
        record_check "no_mixed_content" "no_mixed_content" "fail" "$(printf '%s' "${MIXED}" | tr '\n' ' ')"
    fi

    ROBOTS_TARGET="$(curl -s --max-time 20 "https://${DOMAIN}/robots.txt" 2>/dev/null | grep -vE '^\s*$' || true)"
    ROBOTS_SOURCE="$(rsys "${SOURCE_SSH}" "curl -s --max-time 20 'https://${DOMAIN}/robots.txt' 2>/dev/null" | grep -vE '^\s*$' || true)"
    if [[ -z "${ROBOTS_TARGET}" && -z "${ROBOTS_SOURCE}" ]]; then
        record_check "robots_txt" "robots_txt" "warn" "no robots.txt on either host"
    elif [[ "${ROBOTS_TARGET}" == "${ROBOTS_SOURCE}" ]]; then
        record_check "robots_txt" "robots_txt" "pass" "identical to the source"
    else
        record_check "robots_txt" "robots_txt" "fail" "robots.txt differs from the source"
    fi
else
    record_check "home_renders" "home_renders" "warn" "curl unavailable"
fi

# ── 3. TLS ────────────────────────────────────────────────────────────────────
if command -v openssl >/dev/null 2>&1; then
    set +e
    CERT_OUT="$(printf '' | timeout 20 openssl s_client -servername "${DOMAIN}" -connect "${DOMAIN}:443" 2>/dev/null </dev/null)"
    set -e
    if printf '%s' "${CERT_OUT}" | grep -q "Verify return code: 0"; then
        record_check "ssl_valid" "ssl_valid" "pass" "chain verified"
    else
        record_check "ssl_valid" "ssl_valid" "fail" "$(printf '%s' "${CERT_OUT}" | grep -m1 'Verify return code' || printf 'could not verify the chain')"
    fi
    CERT_END="$(printf '%s' "${CERT_OUT}" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
    CERT_DAYS=""
    if [[ -n "${CERT_END}" ]]; then
        set +e
        CERT_EPOCH="$(date -d "${CERT_END}" +%s 2>/dev/null)"
        set -e
        if [[ -n "${CERT_EPOCH}" ]]; then
            CERT_DAYS=$(( (CERT_EPOCH - $(date +%s)) / 86400 ))
            if [[ "${CERT_DAYS}" -lt 14 ]]; then
                result_warn "The certificate for ${DOMAIN} expires in ${CERT_DAYS} days"
            fi
        fi
    fi
else
    CERT_DAYS=""
    record_check "ssl_valid" "ssl_valid" "warn" "openssl unavailable"
fi

# ── 4. Source is quiet ────────────────────────────────────────────────────────
if [[ "${SKIP_SOURCE_LIVENESS}" == "false" ]]; then
    SOURCE_CRON="$(rsys "${SOURCE_SSH}" "crontab -l -u www-data 2>/dev/null | grep -vcE '^\s*(#|$)' || true" | tail -1 | tr -d '[:space:]')"
    if [[ "${SOURCE_CRON}" == "0" ]]; then
        record_check "source_cron_disabled" "source_cron_disabled" "pass" "no www-data crontab entries"
    elif [[ "${SOURCE_CRON}" =~ ^[0-9]+$ ]]; then
        record_check "source_cron_disabled" "source_cron_disabled" "fail" "${SOURCE_CRON} crontab entries remain on ${SOURCE_HOST}"
    else
        record_check "source_cron_disabled" "source_cron_disabled" "warn" "could not read the source crontab"
    fi

    SOURCE_LIVE="$(rsys "${SOURCE_SSH}" "systemctl is-active nginx php*-fpm mysql 2>/dev/null | tr '\n' ' '" | tr -s ' ')"
    if [[ "${SOURCE_LIVE}" == *"active"* ]]; then
        record_check "source_still_live" "source_still_live" "pass" "the source still responds for rollback"
    else
        record_check "source_still_live" "source_still_live" "fail" "the source looks stopped; rollback is no longer possible"
    fi

    SOURCE_WORKERS="$(rsys "${SOURCE_SSH}" "systemctl list-units --type=service --state=running --no-pager 2>/dev/null | grep -c 'worker@' || true" | tail -1 | tr -d '[:space:]')"
    if [[ "${SOURCE_WORKERS}" == "0" ]]; then
        record_check "source_workers_stopped" "source_workers_stopped" "pass" "no worker units running on the source"
    elif [[ "${SOURCE_WORKERS}" =~ ^[0-9]+$ ]]; then
        result_warn "${SOURCE_WORKERS} worker units are still running on ${SOURCE_HOST}; they will double-process jobs with the target"
        record_check "source_workers_stopped" "source_workers_stopped" "fail" "${SOURCE_WORKERS} worker units running on the source"
    fi
fi

# ── 5. Target health ──────────────────────────────────────────────────────────
TARGET_CHECKS="$(rsys "${TARGET_SSH}" "
    echo \"worker_units=\$(systemctl list-units --type=service --state=running --no-pager 2>/dev/null | grep -c 'worker@' || true)\"
    echo \"scheduler=\$(crontab -l -u www-data 2>/dev/null | grep -c 'schedule:run\|artisan schedule' || true)\"
    echo \"timers=\$(systemctl list-timers --no-pager 2>/dev/null | grep -cE 'backup|restic|monitor' || true)\"
    echo \"fatal_logs=\$(journalctl -u 'php*-fpm' --since '-15 min' --no-pager 2>/dev/null | grep -ciE 'php fatal|allowed memory size' || true)\"
    echo \"disk=\$(df --output=pcent '$SITE_ROOT' 2>/dev/null | tail -1 | tr -d ' %' || echo '')\"
")"

target_value() { printf '%s' "${TARGET_CHECKS}" | sed -n "s/^$1=//p" | head -1 | tr -d '[:space:]'; }

T_WORKERS="$(target_value worker_units)"
T_SCHED="$(target_value scheduler)"
T_FATAL="$(target_value fatal_logs)"
T_DISK="$(target_value disk)"

[[ "${T_WORKERS}" =~ ^[0-9]+$ && "${T_WORKERS}" -gt 0 ]] \
    && record_check "target_workers_running" "target_workers_running" "pass" "${T_WORKERS} worker unit(s)" \
    || record_check "target_workers_running" "target_workers_running" "fail" "no running worker units found on ${TARGET_HOST}"

[[ "${T_SCHED}" =~ ^[0-9]+$ && "${T_SCHED}" -gt 0 ]] \
    && record_check "target_scheduler" "target_scheduler" "pass" "cron entry present" \
    || record_check "target_scheduler" "target_scheduler" "fail" "no scheduler entry in the target crontab"

[[ "${T_FATAL}" =~ ^[0-9]+$ && "${T_FATAL}" -eq 0 ]] \
    && record_check "target_logs_clean" "target_logs_clean" "pass" "no PHP fatal errors in the last 15 minutes" \
    || record_check "target_logs_clean" "target_logs_clean" "fail" "${T_FATAL:-unknown} PHP fatal errors in the target logs"

if [[ "${T_DISK}" =~ ^[0-9]+$ ]]; then
    if [[ "${T_DISK}" -lt 85 ]]; then
        record_check "target_disk" "target_disk" "pass" "${T_DISK}% used"
    else
        record_check "target_disk" "target_disk" "fail" "${T_DISK}% used"
    fi
fi

# ── 6. Queue depth and database parity ────────────────────────────────────────
TARGET_TABLES="$(rsys "${TARGET_SSH}" "set -a; . '${SITE_ROOT}/shared/.env' 2>/dev/null; set +a; export MYSQL_PWD=\"\$DB_PASSWORD\"; mysql -N -B -u \"\$DB_USERNAME\" \"\$DB_DATABASE\" -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();\" 2>/dev/null" | tail -1 | tr -d '[:space:]')"
SOURCE_TABLES="$(rsys "${SOURCE_SSH}" "set -a; . '${SITE_ROOT}/shared/.env' 2>/dev/null; set +a; export MYSQL_PWD=\"\$DB_PASSWORD\"; mysql -N -B -u \"\$DB_USERNAME\" \"\$DB_DATABASE\" -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();\" 2>/dev/null" | tail -1 | tr -d '[:space:]')"

if [[ "${TARGET_TABLES}" =~ ^[0-9]+$ && "${SOURCE_TABLES}" =~ ^[0-9]+$ ]]; then
    if [[ "${TARGET_TABLES}" -eq "${SOURCE_TABLES}" ]]; then
        record_check "db_table_parity" "db_table_parity" "pass" "${TARGET_TABLES} tables on both hosts"
    else
        record_check "db_table_parity" "db_table_parity" "fail" "target has ${TARGET_TABLES} tables, source has ${SOURCE_TABLES}"
    fi
else
    record_check "db_table_parity" "db_table_parity" "warn" "could not count tables on both hosts"
fi

OLDEST_JOB="$(rsys "${TARGET_SSH}" "set -a; . '${SITE_ROOT}/shared/.env' 2>/dev/null; set +a; export MYSQL_PWD=\"\$DB_PASSWORD\"; mysql -N -B -u \"\$DB_USERNAME\" \"\$DB_DATABASE\" -e \"SELECT TIMESTAMPDIFF(MINUTE, MIN(available_at), UNIX_TIMESTAMP()) FROM jobs;\" 2>/dev/null" | tail -1 | tr -d '[:space:]')"
if [[ "${OLDEST_JOB}" =~ ^[0-9]+$ ]]; then
    if [[ "${OLDEST_JOB}" -le 5 ]]; then
        record_check "queue_draining" "queue_draining" "pass" "oldest job is ${OLDEST_JOB} min old"
    else
        record_check "queue_draining" "queue_draining" "fail" "oldest job is ${OLDEST_JOB} min old; workers are not draining"
    fi
else
    record_check "queue_draining" "queue_draining" "warn" "no jobs table, or the queue is empty"
fi

# ── 7. Manual items ───────────────────────────────────────────────────────────
record_manual "forms_submit" "Contact and registration forms submit successfully"
record_manual "checkout" "Checkout completes end to end (if e-commerce)"
record_manual "email_delivery" "Transactional email arrives, not in spam, with dkim=pass and spf=pass"
record_manual "upload_writes" "A real file upload lands in the target upload directory"
record_manual "webhooks" "Payment and third-party webhooks reach the new host"
record_manual "browser_check" "No certificate warnings in Chrome, Safari, and Firefox"

# ── Result ────────────────────────────────────────────────────────────────────
journal_log "VERIFYING" "Cutover checklist" "references/cutover-checklist.md" \
    "$([[ "${FAILED_COUNT}" -eq 0 ]] && printf 0 || printf 1)" 0 \
    "$(printf 'passed=%s failed=%s manual_pending=%s' "${PASSED_COUNT}" "${FAILED_COUNT}" "${MANUAL_COUNT}")" \
    "VERIFYING" "$([[ "${FAILED_COUNT}" -eq 0 ]] && printf VERIFIED || printf FAILED)"

result_add_string "action" "verify"
result_add_string "source_host" "${SOURCE_HOST}"
result_add_string "target_host" "${TARGET_HOST}"
result_add_string "domain" "${DOMAIN}"
if [[ -n "${TARGET_IP}" ]]; then result_add_string "target_ip" "${TARGET_IP}"; fi
if [[ -n "${CERT_DAYS:-}" ]]; then result_add_raw "cert_expiry_days" "${CERT_DAYS}"; fi
result_add_raw "verification_results" "[${CHECKS_JSON}]"
result_add_raw "manual_checks" "[${MANUAL_JSON}]"
result_add_raw "passed" "${PASSED_COUNT}"
result_add_raw "failed" "${FAILED_COUNT}"
result_add_raw "manual_pending" "${MANUAL_COUNT}"
result_add_string "checklist" "migrate-site/references/cutover-checklist.md"
result_add_string "journal" "$(journal_path)"

if [[ "${FAILED_COUNT}" -gt 0 ]]; then
    step FAILED "${FAILED_COUNT} checklist item(s) failed; the migration is not complete"
    emit_result "FAILED"
    exit 1
fi

step VERIFIED "All automated checklist items passed; ${MANUAL_COUNT} manual item(s) still need a human"
emit_result "VERIFIED"
exit 0
