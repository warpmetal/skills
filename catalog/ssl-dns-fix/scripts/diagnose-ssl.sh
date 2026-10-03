#!/usr/bin/env bash
# diagnose-ssl.sh — Read-only TLS/DNS diagnosis for ssl-dns-fix
#
# Usage:
#   diagnose-ssl.sh --client <name> [--domain <domain>] [--layer dns|issuance|serving]
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
DOMAIN_OVERRIDE=""
LAYER_FILTER=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client) CLIENT="${2:-}"; shift 2 ;;
        --domain) DOMAIN_OVERRIDE="${2:-}"; shift 2 ;;
        --layer)  LAYER_FILTER="${2:-}"; shift 2 ;;
        --confirm) confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

if [[ -n "${LAYER_FILTER}" ]]; then
    case "${LAYER_FILTER}" in
        dns|issuance|serving) ;;
        *) printf 'ERROR: --layer must be dns, issuance, or serving (got: %s)\n' "${LAYER_FILTER}" >&2; exit 2 ;;
    esac
fi

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "ssl-dns-fix" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host domain

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
agency_require_tools "dig:the preferred DNS resolution layer" "whois:the domain-expiry check"
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

FINDINGS=()
BROKEN_LAYER=""
CAUSE="none"
DNS_LOCAL="unknown"
DNS_AUTHORITATIVE="unknown"
CERT_SERVING="unknown"
CERT_EXPIRY_DAYS="null"
CHALLENGE="unknown"
CERTBOT_TIMER="unknown"

step OBSERVING "Diagnosing ${DOMAIN} on ${HOST}"

# ── Layer: dns ────────────────────────────────────────────────────────────────
if [[ -z "${LAYER_FILTER}" || "${LAYER_FILTER}" == "dns" ]]; then
    step OBSERVING "Layer: DNS resolution"

    if command -v dig >/dev/null 2>&1; then
        DNS_LOCAL="$(dig +short A "${DOMAIN}" 2>/dev/null | head -5 | tr '\n' ' ' || true)"
        DNS_NS="$(dig +short NS "${DOMAIN}" 2>/dev/null | head -1 | tr -d '[:space:]' || true)"

        if [[ -n "${DNS_NS}" ]]; then
            DNS_AUTHORITATIVE="$(dig +short A "${DOMAIN}" "@${DNS_NS}" 2>/dev/null | head -5 | tr '\n' ' ' || true)"
        fi

        if [[ -z "${DNS_LOCAL// }" ]]; then
            DNS_LOCAL="NO_RECORD"
            BROKEN_LAYER="dns"
            CAUSE="no_dns_record"
            FINDINGS+=("DNS: no A record for ${DOMAIN}")
            step DIAGNOSED "DNS: ${DOMAIN} has no A record"
        else
            DNS_LOCAL="${DNS_LOCAL// /,}"
            FINDINGS+=("DNS: ${DOMAIN} -> ${DNS_LOCAL} (NS: ${DNS_NS:-unknown})")
            [[ -n "${DNS_AUTHORITATIVE// }" ]] && DNS_AUTHORITATIVE="${DNS_AUTHORITATIVE// /,}" || DNS_AUTHORITATIVE="none"
            step OBSERVING "DNS: ${DOMAIN} -> ${DNS_LOCAL}"
        fi
    else
        result_warn "dig is not available; the DNS layer was skipped"
    fi

    if command -v whois >/dev/null 2>&1; then
        whois_expiry="$(whois "${DOMAIN}" 2>/dev/null | grep -iE 'expir' | head -3 || true)"
        if [[ -n "${whois_expiry}" ]]; then
            FINDINGS+=("Registrar: ${whois_expiry//$'\n'/ }")
        fi
    fi
fi

# ── Layer: issuance ───────────────────────────────────────────────────────────
if [[ -z "${LAYER_FILTER}" || "${LAYER_FILTER}" == "issuance" ]]; then
    step OBSERVING "Layer: certificate issuance"

    try_rsh "certbot certificates 2>/dev/null || echo CERTBOT_NOT_FOUND"
    CERTBOT_OUT="${REMOTE_OUT}"
    if printf '%s' "${CERTBOT_OUT}" | grep -q 'CERTBOT_NOT_FOUND'; then
        FINDINGS+=("Issuance: certbot is not installed on ${HOST}")
        if [[ -z "${BROKEN_LAYER}" ]]; then
            BROKEN_LAYER="issuance"
            CAUSE="certbot_absent"
        fi
    else
        cert_count="$(printf '%s' "${CERTBOT_OUT}" | grep -c 'Certificate Name' || true)"
        FINDINGS+=("Issuance: certbot reports ${cert_count} managed certificate(s)")
    fi

    try_rsh "systemctl is-active certbot.timer 2>/dev/null || systemctl is-active snap.certbot.renew.timer 2>/dev/null || echo no-timer"
    CERTBOT_TIMER="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"

    if [[ "${CERTBOT_TIMER}" == "no-timer" ]]; then
        FINDINGS+=("Issuance: no certbot renewal timer is active")
        if [[ -z "${BROKEN_LAYER}" ]]; then
            BROKEN_LAYER="issuance"
            CAUSE="no_renewal_timer"
        fi
    else
        FINDINGS+=("Issuance: renewal timer is ${CERTBOT_TIMER}")
    fi

    challenge_http="$(curl -sI --max-time 5 "http://${DOMAIN}/.well-known/acme-challenge/test" 2>/dev/null | head -1 || true)"
    if printf '%s' "${challenge_http}" | grep -qE '^HTTP/[0-9.]+ 30[12]'; then
        CHALLENGE="REDIRECTED"
        FINDINGS+=("Issuance: /.well-known/acme-challenge/ is redirected; the HTTP->HTTPS redirect will block validation")
        if [[ -z "${BROKEN_LAYER}" ]]; then
            BROKEN_LAYER="issuance"
            CAUSE="challenge_redirected"
        fi
    else
        CHALLENGE="OK"
    fi
fi

# ── Layer: serving ────────────────────────────────────────────────────────────
if [[ -z "${LAYER_FILTER}" || "${LAYER_FILTER}" == "serving" ]]; then
    step OBSERVING "Layer: certificate serving"

    cert_info="$(printf '' | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null \
        | openssl x509 -noout -subject -issuer -dates 2>/dev/null || printf 'CONNECT_FAILED')"

    if printf '%s' "${cert_info}" | grep -q 'CONNECT_FAILED'; then
        CERT_SERVING="CONNECT_FAILED"
        FINDINGS+=("Serving: cannot connect to ${DOMAIN}:443")
        if [[ -z "${BROKEN_LAYER}" ]]; then
            BROKEN_LAYER="serving"
            CAUSE="tls_connect_failed"
        fi
    else
        expiry="$(printf '%s' "${cert_info}" | sed -n 's/^notAfter=//p' | head -1)"
        expiry_epoch="$(date -d "${expiry}" +%s 2>/dev/null || true)"
        if [[ -n "${expiry_epoch}" ]]; then
            now_epoch="$(date +%s)"
            days_left=$(( (expiry_epoch - now_epoch) / 86400 ))
            CERT_EXPIRY_DAYS="${days_left}"
            FINDINGS+=("Serving: certificate expires ${expiry} (${days_left} days)")

            if [[ "${days_left}" -lt 0 ]]; then
                CERT_SERVING="EXPIRED"
                BROKEN_LAYER="${BROKEN_LAYER:-serving}"
                CAUSE="cert_expired"
                FINDINGS+=("Serving: the certificate has already expired")
            elif [[ "${days_left}" -lt 14 ]]; then
                CERT_SERVING="EXPIRING"
                FINDINGS+=("Serving: certificate expires in ${days_left} days; renewal has likely failed")
                [[ -z "${BROKEN_LAYER}" ]] && BROKEN_LAYER="serving" && CAUSE="cert_expiring"
            else
                CERT_SERVING="OK"
            fi
        else
            CERT_SERVING="UNKNOWN"
            FINDINGS+=("Serving: could not parse the certificate expiry date")
        fi
    fi

    try_rsh "nginx -T 2>/dev/null | grep -E 'ssl_certificate ' | grep -v '#' || true"
    nginx_ssl="${REMOTE_OUT}"
    if printf '%s' "${nginx_ssl}" | grep -q 'cert.pem' && ! printf '%s' "${nginx_ssl}" | grep -q 'fullchain.pem'; then
        FINDINGS+=("Serving: nginx uses cert.pem instead of fullchain.pem; this breaks API clients and mobile apps")
        if [[ -z "${BROKEN_LAYER}" ]]; then
            BROKEN_LAYER="serving"
            CAUSE="missing_intermediate"
        fi
    fi
    FINDINGS+=("Serving: nginx ssl_certificate directives: $(printf '%s' "${nginx_ssl}" | tr '\n' ' ' | tr -s ' ')")
fi

# ── Result ────────────────────────────────────────────────────────────────────
if [[ -z "${BROKEN_LAYER}" ]]; then
    CAUSE="none"
    step OBSERVING "No TLS or DNS problem detected"
else
    step DIAGNOSED "Broken layer: ${BROKEN_LAYER} (${CAUSE})"
fi

journal_log "DIAGNOSED" "Diagnosis result: layer=${BROKEN_LAYER:-none} cause=${CAUSE}" "read-only probes" 0 0 \
    "$(printf '%s' "${FINDINGS[*]:-}" | journal_sanitize)" "OBSERVING" "OBSERVED"

result_add_string "action" "diagnose"
result_add_string "domain" "${DOMAIN}"
result_add_string "layer" "${BROKEN_LAYER}"
result_add_string "cause" "${CAUSE}"
result_add_string_array "findings" "${FINDINGS[@]+"${FINDINGS[@]}"}"
result_add_string "dns_local" "${DNS_LOCAL}"
result_add_string "dns_authoritative" "${DNS_AUTHORITATIVE}"
result_add_string "cert_serving" "${CERT_SERVING}"
result_add_raw "cert_expiry_days" "${CERT_EXPIRY_DAYS}"
result_add_string "challenge_accessible" "${CHALLENGE}"
result_add_string "certbot_timer" "${CERTBOT_TIMER}"
result_add_string "journal" "$(journal_path)"

if [[ -z "${BROKEN_LAYER}" ]]; then
    emit_result "OBSERVED"
else
    emit_result "DIAGNOSED"
fi
exit 0
