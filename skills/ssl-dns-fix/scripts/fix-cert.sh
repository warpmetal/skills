#!/usr/bin/env bash
# fix-cert.sh — Issue or renew a Let's Encrypt certificate for ssl-dns-fix
#
# Usage:
#   fix-cert.sh --client <name> [--domain <domain>] [--dry-run]
#               [--confirm "CONFIRM CERT ISSUE"]
#
# Always runs `certbot renew --dry-run` first. The real renewal only happens when
# the dry run passes and the gate is satisfied.
#
# Approval (see conventions/approvals.md):
#   CONFIRM CERT ISSUE        before the real certbot run
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
DOMAIN_OVERRIDE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)  CLIENT="${2:-}"; shift 2 ;;
        --domain)  DOMAIN_OVERRIDE="${2:-}"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --confirm) confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "ssl-dns-fix" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host domain

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
agency_require_tools "dig:the A-record lookup with the preferred resolver"
manifest_validate_ssh

journal_init "ssl-dns-fix" "${CLIENT}" "${MANIFEST}"

DOMAIN="${DOMAIN_OVERRIDE:-${DOMAIN}}"
SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"

REMOTE_OUT=""
REMOTE_RC=0
try_rsh() {
    set +e
    REMOTE_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "$1" 2>&1)"
    REMOTE_RC=$?
    set -e
    return 0
}

# ── Pre-flight: DNS must point somewhere ──────────────────────────────────────
step OBSERVING "Pre-flight DNS check for ${DOMAIN}"
if command -v dig >/dev/null 2>&1; then
    DNS_IP="$(dig +short A "${DOMAIN}" 2>/dev/null | head -1 || true)"
else
    DNS_IP="$(getent hosts "${DOMAIN}" 2>/dev/null | awk '{print $1}' | head -1 || true)"
fi

try_rsh "curl -fsS --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print \$1}'"
SERVER_IP="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"

step OBSERVING "DNS: ${DOMAIN} -> ${DNS_IP:-none}; server: ${SERVER_IP:-unknown}"

if [[ -z "${DNS_IP}" ]]; then
    result_add_string "action" "issue-cert"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "reason" "no_dns_record"
    result_add_raw "fix_applied" "false"
    fail_with 5 STOPPED "${DOMAIN} has no A record. Fix DNS before attempting certificate issuance."
fi

if [[ -n "${SERVER_IP}" && -n "${DNS_IP}" && "${DNS_IP}" != "${SERVER_IP}" ]]; then
    result_warn "DNS for ${DOMAIN} resolves to ${DNS_IP}, not to the target server ${SERVER_IP}"
fi

# ── Dry run (always) ──────────────────────────────────────────────────────────
step EXECUTING "Running certbot --dry-run (staging; no quota consumed)"
try_rsh "certbot renew --dry-run --cert-name '${DOMAIN}' 2>&1"
DRY_OUT="${REMOTE_OUT}"

if ! printf '%s' "${DRY_OUT}" | grep -qiE 'congratulations|success|the dry run was successful'; then
    journal_log "EXECUTING" "certbot dry run failed" "certbot renew --dry-run" "${REMOTE_RC}" 0 \
        "$(printf '%s' "${DRY_OUT}" | journal_sanitize)" "EXECUTING" "FAILED"

    result_add_string "action" "issue-cert"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "reason" "dry_run_failed"
    result_add_raw "fix_applied" "false"
    fail_with 4 FAILED "certbot --dry-run failed for ${DOMAIN}. Fix the underlying cause (see references/cert-issuance.md) before attempting a real run. Output: $(printf '%s' "${DRY_OUT}" | tr '\n' ' ' | tail -c 400)"
fi
step EXECUTING "Dry run passed"

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run only; no certificate was issued"
    result_add_string "action" "issue-cert"
    result_add_string "domain" "${DOMAIN}"
    result_add_raw "fix_applied" "false"
    result_add_raw "dry_run" "success"
    emit_result "PLANNED"
    exit 0
fi

# ── Gate ──────────────────────────────────────────────────────────────────────
step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM CERT ISSUE" "CERT ISSUE" "Renew the certificate for ${DOMAIN} on ${HOST}, then reload nginx"

# ── Real run ──────────────────────────────────────────────────────────────────
step EXECUTING "Running certbot renew"
try_rsh "certbot renew --cert-name '${DOMAIN}' 2>&1"
RENEW_OUT="${REMOTE_OUT}"

journal_log "EXECUTING" "certbot renew" "certbot renew --cert-name ${DOMAIN}" "${REMOTE_RC}" 0 \
    "$(printf '%s' "${RENEW_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

if ! printf '%s' "${RENEW_OUT}" | grep -qiE 'congratulations|successfully renewed|not yet due'; then
    result_add_string "action" "issue-cert"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "reason" "renewal_failed"
    result_add_raw "fix_applied" "false"
    fail_with 4 FAILED "Certificate renewal failed for ${DOMAIN}: $(printf '%s' "${RENEW_OUT}" | tr '\n' ' ' | tail -c 400)"
fi
step EXECUTING "Renewal completed"

# ── Validate config, then reload ──────────────────────────────────────────────
step EXECUTING "Validating nginx configuration"
try_rsh "nginx -t 2>&1"
NGINX_TEST="${REMOTE_OUT}"
if printf '%s' "${NGINX_TEST}" | grep -qiE 'test failed|syntax error'; then
    result_add_string "action" "issue-cert"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "reason" "nginx_test_failed"
    result_add_raw "fix_applied" "false"
    fail_with 4 FAILED "nginx -t failed after the renewal; nginx was NOT reloaded. Fix the configuration first."
fi

step EXECUTING "Reloading nginx"
try_rsh "systemctl reload nginx 2>&1"
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    result_add_string "action" "issue-cert"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "reason" "nginx_reload_failed"
    result_add_raw "fix_applied" "false"
    fail_with 8 FAILED "nginx reload failed: ${REMOTE_OUT}"
fi

# ── Verify ────────────────────────────────────────────────────────────────────
step VERIFYING "Verifying the certificate now being served"
cert_dates="$(printf '' | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null \
    | openssl x509 -noout -dates 2>/dev/null || true)"
expiry="$(printf '%s' "${cert_dates}" | sed -n 's/^notAfter=//p' | head -1)"
expiry_epoch="$(date -d "${expiry}" +%s 2>/dev/null || true)"

DAYS_LEFT="null"
if [[ -n "${expiry_epoch}" ]]; then
    DAYS_LEFT=$(( (expiry_epoch - $(date +%s)) / 86400 ))
fi

step FIXED "Certificate renewed for ${DOMAIN} (expires in ${DAYS_LEFT} days)"

result_add_string "action" "issue-cert"
result_add_string "domain" "${DOMAIN}"
result_add_string "cert_expiry" "${expiry}"
result_add_raw "cert_expiry_days" "${DAYS_LEFT}"
result_add_raw "fix_applied" "true"
result_add_raw "nginx_reloaded" "true"
result_add_string "journal" "$(journal_path)"

emit_result "FIXED"
exit 0
