#!/usr/bin/env bash
# fix-cert.sh — Issue or renew a Let's Encrypt certificate for ssl-dns-fix
#
# Usage:
#   fix-cert.sh --client <name> [--domain <domain>]
#               [--dns-challenge auto|http|cloudflare]
#               [--skip-dns-preflight] [--dry-run]
#               [--confirm "CONFIRM CERT ISSUE"]
#
# The challenge is chosen from evidence, not from a guess:
#
#   * A certificate that already exists is renewed (`certbot renew`), which keeps
#     the challenge it was issued with.
#   * A certificate that does not exist yet has to be issued, and the challenge is
#     picked then: DNS-01 through the Cloudflare integration when it is ready,
#     HTTP-01 otherwise. DNS-01 survives Cloudflare proxying, which is exactly the
#     case HTTP-01 cannot handle (see references/cert-issuance.md § 5).
#
#   --dns-challenge cloudflare asks for DNS-01 explicitly. If the integration is
#   not ready the run stops: silently falling back to HTTP-01 would turn a DNS
#   problem into a rate-limit problem.
#
#   --skip-dns-preflight covers the case where the record does exist but this
#   machine cannot see it: no `dig` in the container or on the control host, a
#   split-horizon view, or a record that is still propagating. The pre-flight is
#   there to stop certbot spending a rate-limit slot on a domain that points
#   nowhere, so skipping it is never silent: it is recorded as a warning and
#   reported as `dns_preflight = "skipped"`.
#
# The credential never travels as an argument. It is written to a 0600 file on the
# server through an `umask 077` ssh stdin redirect, which is stricter than scp —
# a plain scp would leave the file world-readable for as long as the copy takes.
# The file is removed by a trap, whatever the outcome.
#
# Always runs the staging dry run first. The real issuance only happens when the
# dry run passes and the gate is satisfied.
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

# ── Cleanup ───────────────────────────────────────────────────────────────────
# Declared before anything can create state, and before integration.sh has a
# chance to install a trap of its own: the library only installs one when the
# script does not already own it, so owning it here is what keeps a single trap
# able to clean both the local temp files and the remote credential.
REMOTE_CREDS=""
REMOTE_CREDS_HOST=""
LOCAL_INI_PATH=""

_fixcert_remote_cleanup() {
    if [[ -n "${REMOTE_CREDS}" && -n "${REMOTE_CREDS_HOST}" ]]; then
        ssh "${SSH_OPTS[@]}" "${REMOTE_CREDS_HOST}" "rm -f -- '${REMOTE_CREDS}'" >/dev/null 2>&1 || true
    fi
    REMOTE_CREDS=""
    REMOTE_CREDS_HOST=""
}

_fixcert_cleanup() {
    local rc=$?
    rm -f -- ${LOCAL_INI_PATH:+"${LOCAL_INI_PATH}"}
    integration_tmp_cleanup
    _fixcert_remote_cleanup
    return "${rc}"
}

trap '_fixcert_cleanup' EXIT

CLIENT=""
DOMAIN_OVERRIDE=""
DRY_RUN=false
CHALLENGE_REQUEST="auto"
SKIP_DNS_PREFLIGHT=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)        CLIENT="${2:-}"; shift 2 ;;
        --domain)        DOMAIN_OVERRIDE="${2:-}"; shift 2 ;;
        --dns-challenge) CHALLENGE_REQUEST="${2:-}"; shift 2 ;;
        --skip-dns-preflight) SKIP_DNS_PREFLIGHT=true; shift ;;
        --dry-run)       DRY_RUN=true; shift ;;
        --confirm)       confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

case "${CHALLENGE_REQUEST}" in
    auto|http|cloudflare) ;;
    *) printf 'ERROR: --dns-challenge must be one of: auto, http, cloudflare (got: %s)\n' "${CHALLENGE_REQUEST}" >&2; exit 2 ;;
esac

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
    if [[ "${SKIP_DNS_PREFLIGHT}" == "true" ]]; then
        # Recorded, not swallowed: the operator asked for this and the result says so.
        result_add_string "dns_preflight" "skipped"
        result_warn "The pre-flight DNS check found no A record for ${DOMAIN} and was skipped on request; certbot will decide whether the challenge can be completed"
    else
        result_add_string "action" "issue-cert"
        result_add_string "domain" "${DOMAIN}"
        result_add_string "reason" "no_dns_record"
        result_add_raw "fix_applied" "false"
        fail_with 5 STOPPED "${DOMAIN} has no A record. Fix DNS before attempting certificate issuance. If the record exists and this host cannot see it, re-run with --skip-dns-preflight."
    fi
fi

if [[ -n "${SERVER_IP}" && -n "${DNS_IP}" && "${DNS_IP}" != "${SERVER_IP}" ]]; then
    result_warn "DNS for ${DOMAIN} resolves to ${DNS_IP}, not to the target server ${SERVER_IP}"
fi

# ── Which state is the certificate in? ────────────────────────────────────────
step OBSERVING "Checking certbot and the current certificate state on ${HOST}"

try_rsh "command -v certbot >/dev/null 2>&1 && echo CERTBOT=yes || echo CERTBOT=no"
if ! printf '%s' "${REMOTE_OUT}" | grep -q 'CERTBOT=yes'; then
    result_add_string "action" "issue-cert"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "reason" "certbot_missing"
    result_add_raw "fix_applied" "false"
    fail_with 5 STOPPED "certbot is not installed on ${HOST}. Install it first (see references/cert-issuance.md); this script will not install packages for you."
fi

try_rsh "if certbot certificates --cert-name '${DOMAIN}' 2>/dev/null | grep -q 'Certificate Name: ${DOMAIN}'; then echo CERT_STATE=present; else echo CERT_STATE=absent; fi"
CERT_STATE="$(printf '%s' "${REMOTE_OUT}" | sed -n 's/^CERT_STATE=//p' | tail -1)"

case "${CERT_STATE}" in
    present) CERT_MODE="renew" ;;
    absent)  CERT_MODE="issue" ;;
    # Neither answer means the probe itself failed. Guessing here would either
    # renew a certificate that does not exist or issue a duplicate.
    *)
        result_add_string "action" "issue-cert"
        result_add_string "domain" "${DOMAIN}"
        result_add_string "reason" "state_unknown"
        result_add_raw "fix_applied" "false"
        fail_with 5 STOPPED "Could not determine whether a certificate exists for ${DOMAIN} on ${HOST} (certbot said neither present nor absent). Output: $(printf '%s' "${REMOTE_OUT}" | tail -3 | tr '\n' ' ')"
        ;;
esac

# ── Which challenge? ─────────────────────────────────────────────────────────
# Only asked when there is something to issue: a renewal keeps the challenge the
# certificate was created with, and switching it silently would be a surprise.
CHALLENGE="http"
CF_READY=false
if integration_declared cloudflare && integration_ready cloudflare; then
    CF_READY=true
fi

case "${CHALLENGE_REQUEST}" in
    cloudflare)
        if [[ "${CF_READY}" != "true" ]]; then
            fail_with 5 STOPPED "--dns-challenge cloudflare was requested but the Cloudflare integration is not ready for ${CLIENT}. Store a token with: warpmetal env store set $(integration_secret_name cloudflare)"
        fi
        ;;
    auto)
        if integration_declared cloudflare && [[ "${CF_READY}" != "true" ]]; then
            result_warn "check_skipped: cloudflare is declared for ${CLIENT} but the integration is not ready, so the DNS-01 challenge was not used"
        fi
        ;;
    http)
        ;;
esac

if [[ "${CHALLENGE_REQUEST}" != "http" && "${CF_READY}" == "true" ]]; then
    CHALLENGE="dns-cloudflare"
fi

if [[ "${CERT_MODE}" == "issue" && "${CHALLENGE}" != "dns-cloudflare" ]]; then
    # Deliberately not guessing a plugin. A new certificate needs to know how the
    # vhost serves its webroot, and inventing `--nginx` or `--webroot` here would
    # be a coin flip on someone's production config.
    result_add_string "action" "issue-cert"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "reason" "no_certificate"
    result_add_raw "fix_applied" "false"
    fail_with 5 STOPPED "No certificate exists for ${DOMAIN} on ${HOST} and no DNS-01 integration is set up, so there is nothing to renew. Issue it once with the plugin this server already uses (see references/cert-issuance.md § 2), then rerun this script."
fi

step OBSERVING "Certificate state: ${CERT_MODE}; challenge: ${CHALLENGE}"

# ── Credential for DNS-01 ─────────────────────────────────────────────────────
CF_CREDS_PATH=""
CREDENTIAL_REMOVED=false
if [[ "${CHALLENGE}" == "dns-cloudflare" ]]; then
    CF_SECRET="$(integration_secret_name cloudflare)"
    CREDS_LOCAL=""
    if ! CREDS_LOCAL="$(integration_secret_file "${CF_SECRET}")"; then
        fail_with 5 STOPPED "Could not read ${CF_SECRET} from the vault for ${CLIENT}. Store it with: warpmetal env store set ${CF_SECRET}"
    fi
    LOCAL_INI="$(umask 077; mktemp "${TMPDIR:-/tmp}/warpmetal-cf-ini.XXXXXX")" || fail_with 5 STOPPED "Could not create a local credentials file"
    LOCAL_INI_PATH="${LOCAL_INI}"
    printf 'dns_cloudflare_api_token = %s\n' "$(cat "${CREDS_LOCAL}")" >"${LOCAL_INI}"

    try_rsh "umask 077; mktemp -t warpmetal-cf-XXXXXX.ini"
    CF_CREDS_PATH="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"
    if [[ -z "${CF_CREDS_PATH}" || "${CF_CREDS_PATH}" != /* ]]; then
        fail_with 5 STOPPED "Could not create a credentials file on ${HOST} (got: ${CF_CREDS_PATH:-empty})"
    fi
    REMOTE_CREDS="${CF_CREDS_PATH}"
    REMOTE_CREDS_HOST="${SSH_DEST}"

    # The value travels on stdin, never in argv: `cat > file` under the remote's
    # own umask 077 is stricter than scp, which would leave the file readable
    # while the copy is in flight.
    set +e
    REMOTE_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "cat > '${CF_CREDS_PATH}' && chmod 600 '${CF_CREDS_PATH}' && stat -c '%a' '${CF_CREDS_PATH}'" <"${LOCAL_INI}" 2>&1)"
    REMOTE_RC=$?
    set -e
    if [[ "${REMOTE_RC}" -ne 0 || "${REMOTE_OUT//[^0-9]/}" != "600" ]]; then
        fail_with 5 STOPPED "Could not stage the Cloudflare credential at 0600 on ${HOST} (exit ${REMOTE_RC}; mode ${REMOTE_OUT:-unknown})"
    fi
    step EXECUTING "Staged the DNS-01 credential on ${HOST} (0600)"
fi

# ── Dry run (always) ──────────────────────────────────────────────────────────
if [[ "${CHALLENGE}" == "dns-cloudflare" ]]; then
    step EXECUTING "Running certbot certonly --dry-run (staging; no quota consumed)"
    try_rsh "certbot certonly --non-interactive --agree-tos --dry-run --dns-cloudflare --dns-cloudflare-credentials '${CF_CREDS_PATH}' -d '${DOMAIN}' 2>&1"
else
    step EXECUTING "Running certbot renew --dry-run (staging; no quota consumed)"
    try_rsh "certbot renew --dry-run --cert-name '${DOMAIN}' 2>&1"
fi
DRY_OUT="${REMOTE_OUT}"

if ! printf '%s' "${DRY_OUT}" | grep -qiE 'congratulations|success|the dry run was successful'; then
    journal_log "EXECUTING" "certbot dry run failed" "certbot dry run (${CERT_MODE})" "${REMOTE_RC}" 0 \
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
    result_add_string "challenge" "${CHALLENGE}"
    result_add_raw "fix_applied" "false"
    result_add_raw "dry_run" "success"
    emit_result "PLANNED"
    exit 0
fi

# ── Gate ──────────────────────────────────────────────────────────────────────
step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM CERT ISSUE" "CERT ISSUE" "Issue or renew the certificate for ${DOMAIN} on ${HOST}, then reload nginx"

# ── Real run ──────────────────────────────────────────────────────────────────
if [[ "${CHALLENGE}" == "dns-cloudflare" ]]; then
    step EXECUTING "Running certbot certonly --dns-cloudflare"
    try_rsh "certbot certonly --non-interactive --agree-tos --dns-cloudflare --dns-cloudflare-credentials '${CF_CREDS_PATH}' -d '${DOMAIN}' 2>&1"
else
    step EXECUTING "Running certbot renew"
    try_rsh "certbot renew --cert-name '${DOMAIN}' 2>&1"
fi
RENEW_OUT="${REMOTE_OUT}"

journal_log "EXECUTING" "certbot ${CERT_MODE}" "certbot ${CERT_MODE} for ${DOMAIN}" "${REMOTE_RC}" 0 \
    "$(printf '%s' "${RENEW_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

# The credential has done its job. Remove it now rather than at exit: the rest of
# this script does not need it, and a long nginx validation must not be a window
# in which it is still on the server.
if [[ -n "${CF_CREDS_PATH}" ]]; then
    _fixcert_remote_cleanup
    try_rsh "test -e '${CF_CREDS_PATH}' && echo CREDS_REMOVED=no || echo CREDS_REMOVED=yes"
    if ! printf '%s' "${REMOTE_OUT}" | grep -q 'CREDS_REMOVED=yes'; then
        result_warn "The staged Cloudflare credential at ${CF_CREDS_PATH} on ${HOST} could not be removed; delete it by hand"
    else
        CREDENTIAL_REMOVED=true
        step EXECUTING "Removed the staged DNS-01 credential from ${HOST}"
    fi
fi

if ! printf '%s' "${RENEW_OUT}" | grep -qiE 'congratulations|successfully renewed|not yet due|successfully received'; then
    result_add_string "action" "issue-cert"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "reason" "renewal_failed"
    result_add_raw "fix_applied" "false"
    fail_with 4 FAILED "Certificate issuance failed for ${DOMAIN}: $(printf '%s' "${RENEW_OUT}" | tr '\n' ' ' | tail -c 400)"
fi
step EXECUTING "Issuance completed"

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

step FIXED "Certificate issued for ${DOMAIN} (expires in ${DAYS_LEFT} days)"

result_add_string "action" "issue-cert"
result_add_string "domain" "${DOMAIN}"
result_add_string "cert_state" "${CERT_MODE}"
result_add_string "challenge" "${CHALLENGE}"
result_add_string "cert_expiry" "${expiry}"
result_add_raw "cert_expiry_days" "${DAYS_LEFT}"
result_add_raw "fix_applied" "true"
result_add_raw "nginx_reloaded" "true"
result_add_raw "credential_staged" "$([[ -n "${CF_CREDS_PATH}" ]] && printf 'true' || printf 'false')"
result_add_raw "credential_removed" "${CREDENTIAL_REMOVED}"
result_add_string "journal" "$(journal_path)"

emit_result "FIXED"
exit 0
