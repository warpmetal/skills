#!/usr/bin/env bash
# fix-nginx.sh — Propose and apply nginx TLS serving fixes for ssl-dns-fix
#
# Usage:
#   fix-nginx.sh --client <name> [--domain <domain>] [--vhost <file>] [--dry-run]
#                [--confirm "CONFIRM NGINX CHANGE"]
#
# Reads the vhost, identifies serving problems, prints the proposed change, and
# applies it only when the gate is satisfied and `nginx -t` passes afterwards.
#
# Approval (see conventions/approvals.md):
#   CONFIRM NGINX CHANGE      before writing the vhost
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
VHOST_OVERRIDE=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)  CLIENT="${2:-}"; shift 2 ;;
        --domain)  DOMAIN_OVERRIDE="${2:-}"; shift 2 ;;
        --vhost)   VHOST_OVERRIDE="${2:-}"; shift 2 ;;
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

step OBSERVING "Locating the vhost for ${DOMAIN}"

if [[ -n "${VHOST_OVERRIDE}" ]]; then
    VHOST_PATH="${VHOST_OVERRIDE}"
else
    try_rsh "
        for f in /etc/nginx/sites-available/* /etc/nginx/conf.d/*.conf; do
            [ -f \"\$f\" ] || continue
            if grep -qE 'server_name[^;]*${DOMAIN}' \"\$f\" 2>/dev/null; then
                echo \"\$f\"
                break
            fi
        done
        for f in /etc/nginx/sites-available/* /etc/nginx/conf.d/*.conf; do
            [ -f \"\$f\" ] || continue
            if grep -qi '${CLIENT}' \"\$f\" 2>/dev/null; then
                echo \"\$f\"
                break
            fi
        done
    "
    VHOST_PATH="$(printf '%s' "${REMOTE_OUT}" | grep -E '^/' | head -1 | tr -d '[:space:]')"
fi

if [[ -z "${VHOST_PATH}" ]]; then
    fail_with 5 STOPPED "Could not locate an nginx vhost for ${DOMAIN} on ${HOST}. Pass --vhost explicitly."
fi

step OBSERVING "Vhost: ${VHOST_PATH}"
try_rsh "cat '${VHOST_PATH}'"
CURRENT_CONFIG="${REMOTE_OUT}"

if [[ -z "${CURRENT_CONFIG}" ]]; then
    fail_with 5 STOPPED "Could not read ${VHOST_PATH} on ${HOST}"
fi

# ── Analyse ───────────────────────────────────────────────────────────────────
ISSUES=()
PROPOSED=()

if printf '%s' "${CURRENT_CONFIG}" | grep -qE 'ssl_certificate[[:space:]]+[^;]*cert\.pem' && \
   ! printf '%s' "${CURRENT_CONFIG}" | grep -qE 'ssl_certificate[[:space:]]+[^;]*fullchain\.pem'; then
    ISSUES+=("cert_pem_used")
    PROPOSED+=("replace 'ssl_certificate .../cert.pem' with '.../fullchain.pem' in ${VHOST_PATH}")
fi

try_rsh "ls -1 /etc/letsencrypt/renewal-hooks/deploy/ 2>/dev/null | head -5 || true"
if [[ -z "$(printf '%s' "${REMOTE_OUT}" | tr -d '[:space:]')" ]]; then
    ISSUES+=("no_reload_hook")
    PROPOSED+=("create /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh containing 'systemctl reload nginx'")
fi

if printf '%s' "${CURRENT_CONFIG}" | grep -q 'return 301 https' && \
   ! printf '%s' "${CURRENT_CONFIG}" | grep -q 'well-known'; then
    ISSUES+=("challenge_blocked")
    PROPOSED+=("add 'location ^~ /.well-known/acme-challenge/ { ... }' before the HTTP->HTTPS redirect")
fi

if [[ ${#ISSUES[@]} -eq 0 ]]; then
    step OBSERVING "No nginx TLS serving issues detected"
    journal_log "OBSERVING" "No nginx issues found" "read-only inspection" 0 0 "${VHOST_PATH}" "OBSERVING" "OBSERVED"

    result_add_string "action" "fix-nginx"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "vhost" "${VHOST_PATH}"
    result_add_raw "fix_applied" "false"
    emit_result "INCONCLUSIVE"
    exit 0
fi

# ── Propose ───────────────────────────────────────────────────────────────────
{
    printf '\nProposed nginx changes for %s (%s)\n' "${DOMAIN}" "${VHOST_PATH}"
    printf '  Issues: %s\n' "${ISSUES[*]}"
    printf '  Changes:\n'
    for p in "${PROPOSED[@]}"; do
        printf '    - %s\n' "${p}"
    done
    printf '  Gate required: CONFIRM NGINX CHANGE\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no mutations performed"
    result_add_string "action" "fix-nginx"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "vhost" "${VHOST_PATH}"
    result_add_string_array "issues" "${ISSUES[@]}"
    result_add_string_array "proposed_changes" "${PROPOSED[@]}"
    result_add_raw "fix_applied" "false"
    emit_result "PLANNED"
    exit 0
fi

# ── Gate ──────────────────────────────────────────────────────────────────────
step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM NGINX CHANGE" "NGINX CHANGE" "Modify ${VHOST_PATH} on ${HOST}; a failing nginx -t will abort the reload"

# ── Back up, then apply ───────────────────────────────────────────────────────
BACKUP_PATH="${VHOST_PATH}.agency-$(date -u +%Y%m%d%H%M%S).bak"
step EXECUTING "Backing up ${VHOST_PATH} to ${BACKUP_PATH}"
try_rsh "cp -p '${VHOST_PATH}' '${BACKUP_PATH}'"
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    fail_with 14 FAILED "Could not back up ${VHOST_PATH}: ${REMOTE_OUT}"
fi

APPLIED=()

for issue in "${ISSUES[@]}"; do
    case "${issue}" in
        cert_pem_used)
            step EXECUTING "Switching ssl_certificate to fullchain.pem"
            try_rsh "sed -i 's|ssl_certificate[[:space:]]\\+[^;]*cert\\.pem|ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem|g' '${VHOST_PATH}'"
            if [[ "${REMOTE_RC}" -ne 0 ]]; then
                try_rsh "cp -p '${BACKUP_PATH}' '${VHOST_PATH}'" || true
                fail_with 14 FAILED "Could not update ssl_certificate; ${VHOST_PATH} was restored from the backup."
            fi
            APPLIED+=("cert_pem_used")
            ;;
        no_reload_hook)
            step EXECUTING "Adding the certbot deploy hook"
            try_rsh "mkdir -p /etc/letsencrypt/renewal-hooks/deploy && printf '%s\n' '#!/bin/sh' 'systemctl reload nginx' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"
            if [[ "${REMOTE_RC}" -ne 0 ]]; then
                result_warn "Could not create the renewal hook: ${REMOTE_OUT}"
            else
                APPLIED+=("no_reload_hook")
            fi
            ;;
        challenge_blocked)
            step EXECUTING "The .well-known fix needs a manual vhost edit; skipping"
            result_warn "challenge_blocked was not auto-fixed: the ACME location block must be placed by hand. See references/cert-issuance.md"
            ;;
    esac
done

# ── Validate, then reload, or restore ─────────────────────────────────────────
step EXECUTING "Validating nginx configuration"
try_rsh "nginx -t 2>&1"
NGINX_TEST="${REMOTE_OUT}"
if printf '%s' "${NGINX_TEST}" | grep -qiE 'test failed|syntax error'; then
    step FAILED "nginx -t failed; restoring ${VHOST_PATH} and NOT reloading"
    printf '%s\n' "${NGINX_TEST}" >&2
    try_rsh "cp -p '${BACKUP_PATH}' '${VHOST_PATH}'" || true

    result_add_string "action" "fix-nginx"
    result_add_string "domain" "${DOMAIN}"
    result_add_string "vhost" "${VHOST_PATH}"
    result_add_raw "fix_applied" "false"
    fail_with 4 FAILED "nginx -t failed after the change. ${VHOST_PATH} was restored from ${BACKUP_PATH} and nginx was not reloaded."
fi

step EXECUTING "Reloading nginx"
try_rsh "systemctl reload nginx 2>&1"
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    result_warn "nginx reload failed: ${REMOTE_OUT}"
    result_add_raw "nginx_reloaded" "false"
else
    result_add_raw "nginx_reloaded" "true"
fi

# ── Verify ────────────────────────────────────────────────────────────────────
step VERIFYING "Verifying TLS serving"
verify_out="$(printf '' | openssl s_client -connect "${DOMAIN}:443" -servername "${DOMAIN}" 2>/dev/null | grep -i 'Verify return code' | head -1 || true)"
step FIXED "Applied: ${APPLIED[*]:-none}"

journal_log "READY" "Applied nginx fixes: ${APPLIED[*]:-none}" "sed/printf on ${VHOST_PATH}" 0 0 \
    "${VHOST_PATH} (backup: ${BACKUP_PATH})" "EXECUTING" "READY"

result_add_string "action" "fix-nginx"
result_add_string "domain" "${DOMAIN}"
result_add_string "vhost" "${VHOST_PATH}"
result_add_string "backup_path" "${BACKUP_PATH}"
result_add_string_array "issues" "${ISSUES[@]}"
result_add_string_array "fixes_applied" "${APPLIED[@]+"${APPLIED[@]}"}"
result_add_raw "fix_applied" "true"
result_add_string "tls_verify" "${verify_out:-unknown}"
result_add_string "journal" "$(journal_path)"

emit_result "FIXED"
exit 0
