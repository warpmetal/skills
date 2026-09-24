#!/usr/bin/env bash
# triage.sh — Read-only site-down triage ladder for site-down-triage
#
# Usage:
#   triage.sh --client <name> [--from-layer N] [--stop-after-layer N] [--since 1h]
#
# Layers: 0 scope, 1 reachability, 2 dns, 3 tls, 4 web_server, 5 app_runtime,
#         6 resources, 7 database, 8 logs, 9 recent_change
#
# No approval gate: this script never mutates anything. It proposes a fix and
# names the skill to hand off to; it never executes a fix.
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
FROM_LAYER=0
STOP_AFTER_LAYER=9
SINCE="1h"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)           CLIENT="${2:-}"; shift 2 ;;
        --from-layer)       FROM_LAYER="${2:-}"; shift 2 ;;
        --stop-after-layer) STOP_AFTER_LAYER="${2:-}"; shift 2 ;;
        --since)            SINCE="${2:-}"; shift 2 ;;
        --confirm)          confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

for n in "${FROM_LAYER}" "${STOP_AFTER_LAYER}"; do
    if ! [[ "${n}" =~ ^[0-9]$ ]]; then
        printf 'ERROR: layer must be 0-9, got: %s\n' "${n}" >&2
        exit 2
    fi
done

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "site-down-triage" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root domain stack health_url

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
agency_require_tools "dig:the DNS layer" "whois:the domain-expiry check" "openssl:the TLS layer" "nc:the port-reachability check"
manifest_validate_ssh

journal_init "site-down-triage" "${CLIENT}" "${MANIFEST}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLLECTOR="${SCRIPT_DIR}/collect-remote.sh"

SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"

LAYER_NAMES=(scope reachability dns tls web_server app_runtime resources database logs recent_change)

EVIDENCE=()
STATUS="INCONCLUSIVE"
BROKEN_LAYER=""
BROKEN_NAME=""
DIAGNOSIS=""
PROPOSED_FIX=""
ROOT_CAUSE=""
HANDOFF="none"
http_code="200"
REMOTE_OUT=""

# The hostname behind the SSH alias, for probes that must bypass DNS.
REMOTE_HOST="$(ssh_resolve_hostname "${HOST}" || true)"
if [[ -z "${REMOTE_HOST}" ]]; then
    fail_with 3 STOPPED "SSH host '${HOST}' not found in ~/.ssh/config"
fi

in_range() { [[ "$1" -ge "${FROM_LAYER}" && "$1" -le "${STOP_AFTER_LAYER}" ]]; }

emit_diagnosis() {
    local status="$1"
    journal_log "DIAGNOSED" "Layer ${BROKEN_LAYER} (${BROKEN_NAME}): ${DIAGNOSIS}" \
        "local signature match" 0 0 "$(printf '%s' "${DIAGNOSIS}" | journal_sanitize)" "DIAGNOSING" "${status}"

    result_add_raw "layer" "${BROKEN_LAYER:-null}"
    result_add_string "layer_name" "${BROKEN_NAME}"
    result_add_string "diagnosis" "${DIAGNOSIS}"
    result_add_string_array "evidence" "${EVIDENCE[@]+"${EVIDENCE[@]}"}"
    result_add_string "proposed_fix" "${PROPOSED_FIX}"
    result_add_string "root_cause_note" "${ROOT_CAUSE}"
    result_add_string "handoff" "${HANDOFF}"
    result_add_string "journal" "$(journal_path)"

    emit_result "${status}"
    exit 0
}

# diagnose_layer <layer> <name> <evidence> <diagnosis> <fix> <root_cause> <handoff>
diagnose_layer() {
    BROKEN_LAYER="$1"
    BROKEN_NAME="$2"
    EVIDENCE+=("$3")
    DIAGNOSIS="$4"
    PROPOSED_FIX="$5"
    ROOT_CAUSE="$6"
    HANDOFF="$7"
    step DIAGNOSED "Layer ${1} ${2}: ${4}"
    emit_diagnosis "DIAGNOSED"
}

probe_pause() { sleep 1; }

step OBSERVING "Client=${CLIENT} host=${HOST} domain=${DOMAIN} stack=${STACK}"

# ── Layer 0: Scope ────────────────────────────────────────────────────────────
if in_range 0; then
    step OBSERVING "Layer 0: scope"
    http_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "${HEALTH_URL}" 2>/dev/null || printf '000')"
    EVIDENCE+=("health_url HTTP ${http_code}")

    sibling_ok=0
    sibling_count=0
    while IFS= read -r sib; do
        [[ -z "${sib}" ]] && continue
        sib_file="$(basename "${sib}" .toml)"
        sib_host="$(manifest_get_from "${sib}" host)"
        sib_url="$(manifest_get_from "${sib}" health_url)"
        [[ "${sib_host}" != "${HOST}" ]] && continue
        [[ -z "${sib_url}" ]] && continue

        scode="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "${sib_url}" 2>/dev/null || printf '000')"
        sibling_count=$((sibling_count + 1))
        if [[ "${scode}" == "200" ]]; then
            sibling_ok=$((sibling_ok + 1))
        fi
        EVIDENCE+=("sibling ${sib_file} HTTP ${scode}")
        [[ "${sibling_count}" -ge 3 ]] && break
    done < <(find "${HOME}/.config/agency/clients" -name '*.toml' ! -name "${CLIENT}.toml" 2>/dev/null | head -20)

    if [[ "${http_code}" != "200" && "${sibling_ok}" -gt 0 ]]; then
        diagnose_layer 0 scope "health HTTP ${http_code}; ${sibling_ok} sibling(s) on the same host healthy" \
            "Site-scoped outage (siblings on the same host are healthy)" \
            "Focus on this site's vhost and application. Do not restart shared services yet." \
            "Isolated site failure — a recent deploy or a site-specific config change is likely." \
            "deploy-site"
    fi
    probe_pause
fi

# ── Layer 1: Reachability ─────────────────────────────────────────────────────
if in_range 1; then
    step OBSERVING "Layer 1: reachability"
    if command -v nc >/dev/null 2>&1; then
        if nc -z -w 5 "${REMOTE_HOST}" 443 2>/dev/null; then
            EVIDENCE+=("nc ${REMOTE_HOST}:443 open")
        else
            diagnose_layer 1 reachability "nc ${REMOTE_HOST}:443 failed" \
                "Host unreachable on TCP 443" \
                "Check provider status, firewall rules, and power. Do not restart local services." \
                "Provider incident or network path failure." \
                "none"
        fi
    else
        result_warn "nc is not available; the reachability probe was skipped"
    fi
    probe_pause
fi

# ── Layer 2: DNS ──────────────────────────────────────────────────────────────
if in_range 2; then
    step OBSERVING "Layer 2: dns"
    if command -v dig >/dev/null 2>&1; then
        a_rec="$(dig +short A "${DOMAIN}" 2>/dev/null | head -5 | tr '\n' ' ')"
        ns_rec="$(dig +short NS "${DOMAIN}" 2>/dev/null | head -5 | tr '\n' ' ')"
        EVIDENCE+=("dig A: ${a_rec:-empty}")
        EVIDENCE+=("dig NS: ${ns_rec:-empty}")

        if [[ -z "${a_rec// }" ]]; then
            diagnose_layer 2 dns "dig A empty for ${DOMAIN}" \
                "DNS A record missing or NXDOMAIN" \
                "Propose the DNS fix via ssl-dns-fix or the registrar. Never edit zones unattended." \
                "DNS misconfiguration or an expired domain." \
                "ssl-dns-fix"
        fi

        if command -v whois >/dev/null 2>&1; then
            whois_out="$(whois "${DOMAIN}" 2>/dev/null | head -40 || true)"
            if printf '%s' "${whois_out}" | grep -qi 'expir'; then
                EVIDENCE+=("whois reports expiry lines")
                result_warn "Check the domain expiry date in the journal"
            fi
        fi
    else
        result_warn "dig is not available; the DNS probe was skipped"
    fi
    probe_pause
fi

# ── Layer 3: TLS ──────────────────────────────────────────────────────────────
if in_range 3; then
    step OBSERVING "Layer 3: tls"
    if command -v openssl >/dev/null 2>&1; then
        tls_out="$(printf '' | openssl s_client -servername "${DOMAIN}" -connect "${REMOTE_HOST}:443" 2>/dev/null | head -40 || true)"
        EVIDENCE+=("openssl s_client summary captured in the journal")

        if printf '%s' "${tls_out}" | grep -qi 'certificate has expired'; then
            diagnose_layer 3 tls "certificate has expired" \
                "TLS certificate has expired" \
                "Hand off to ssl-dns-fix: dry-run the renewal, then renew and reload nginx after approval." \
                "The renewal job has already failed; monitoring should warn at 14 days." \
                "ssl-dns-fix"
        fi

        if printf '%s' "${tls_out}" | grep -qi 'unable to get local issuer certificate'; then
            diagnose_layer 3 tls "unable to get local issuer certificate" \
                "Missing TLS intermediate certificate" \
                "Propose switching nginx to fullchain.pem via ssl-dns-fix." \
                "Wrong certificate file after a renewal or a manual edit." \
                "ssl-dns-fix"
        fi

        if ! printf '%s' "${tls_out}" | grep -qi 'Verify return code: 0'; then
            vcode="$(printf '%s' "${tls_out}" | grep -i 'Verify return code:' | head -1 || true)"
            if [[ -n "${vcode}" ]]; then
                diagnose_layer 3 tls "${vcode}" \
                    "TLS verification failed" \
                    "Hand off to ssl-dns-fix with the openssl evidence." \
                    "Chain, SNI, or certificate mismatch." \
                    "ssl-dns-fix"
            fi
        fi
    else
        result_warn "openssl is not available; the TLS probe was skipped"
    fi
    probe_pause
fi

# ── Layers 4-9: one remote collection ─────────────────────────────────────────
need_remote=0
for L in 4 5 6 7 8 9; do
    if in_range "${L}"; then need_remote=1; break; fi
done

if [[ "${need_remote}" -eq 1 ]]; then
    if [[ ! -f "${COLLECTOR}" ]]; then
        fail_with 5 STOPPED "Missing remote collector: ${COLLECTOR}"
    fi

    step OBSERVING "Collecting remote layers 4-9 over a single SSH session"
    set +e
    COLLECT_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" \
        "CLIENT='${CLIENT}' SITE_ROOT='${SITE_ROOT}' STACK='${STACK}' SINCE='${SINCE}' PHP_VERSION='${PHP}' bash -s" \
        < "${COLLECTOR}" 2>&1)"
    ssh_rc=$?
    set -e

    if [[ "${ssh_rc}" -ne 0 && -z "${COLLECT_OUT}" ]]; then
        fail_with 3 STOPPED "SSH collection failed (exit ${ssh_rc})"
    fi

    REMOTE_OUT="${COLLECT_OUT}"
    journal_log "OBSERVING" "Remote collection" "ssh ${SSH_DEST} bash -s < collect-remote.sh" "${ssh_rc}" 0 \
        "$(printf '%s' "${REMOTE_OUT}" | head -400 | journal_sanitize)" "OBSERVING" "OBSERVING"

    # Layer 4: web server
    if in_range 4; then
        step OBSERVING "Layer 4: web_server"
        web_sec="$(printf '%s' "${REMOTE_OUT}" | sed -n '/===== LAYER_4/,/===== LAYER_5/p')"
        if printf '%s' "${web_sec}" | grep -qi 'configuration file test failed'; then
            diagnose_layer 4 web_server "nginx -t failed" \
                "nginx configuration test failed" \
                "Propose reverting the last config edit. Do not reload until nginx -t passes." \
                "An unreviewed nginx change." \
                "none"
        fi
        if printf '%s' "${web_sec}" | grep -qi 'no_listeners_80_443'; then
            diagnose_layer 4 web_server "no listeners on 80/443" \
                "HTTP/HTTPS ports are not bound" \
                "Propose starting nginx after approval; verify with ss -lntp." \
                "The web server is not listening." \
                "none"
        fi
    fi

    # Layer 5: application runtime
    if in_range 5; then
        step OBSERVING "Layer 5: app_runtime"
        rt_sec="$(printf '%s' "${REMOTE_OUT}" | sed -n '/===== LAYER_5/,/===== LAYER_6/p')"
        if printf '%s' "${rt_sec}" | grep -qi 'max_children'; then
            diagnose_layer 5 app_runtime "pm.max_children" \
                "php-fpm reached pm.max_children" \
                "Evidence preserved. Propose a php-fpm restart only after approval." \
                "Capacity limit or slow requests holding workers." \
                "none"
        fi
        if [[ "${STACK}" == "node" ]] && printf '%s' "${rt_sec}" | grep -qi 'no_node_process'; then
            diagnose_layer 5 app_runtime "no_node_process" \
                "The Node application process is not running" \
                "Propose starting the systemd unit after approval." \
                "Process crash or a failed deploy." \
                "deploy-site"
        fi
        if [[ "${STACK}" == "laravel" || "${STACK}" == "wordpress" ]]; then
            if printf '%s' "${rt_sec}" | grep -qi 'inactive\|failed' && printf '%s' "${rt_sec}" | grep -qi 'fpm'; then
                diagnose_layer 5 app_runtime "php-fpm inactive" \
                    "PHP-FPM runtime is down" \
                    "Propose starting php-fpm after approval." \
                    "Runtime crash." \
                    "none"
            fi
        fi
    fi

    # Layer 6: resources
    if in_range 6; then
        step OBSERVING "Layer 6: resources"
        res_sec="$(printf '%s' "${REMOTE_OUT}" | sed -n '/===== LAYER_6/,/===== LAYER_7/p')"
        if printf '%s' "${res_sec}" | grep -E '9[0-9]%|100%' | grep -vqE 'tmpfs|udev'; then
            diagnose_layer 6 resources "disk or inode near full" \
                "Disk or inode exhaustion" \
                "Propose reclaiming known-safe paths only (rotated logs, journal vacuum, old releases). Never delete automatically." \
                "Missing rotation or missing monitoring." \
                "server-monitoring"
        fi
        if printf '%s' "${res_sec}" | grep -qi 'oom'; then
            diagnose_layer 6 resources "oom signature" \
                "OOM killer activity detected" \
                "Identify the killed process from the evidence; propose a capacity fix rather than a blind restart." \
                "Memory pressure." \
                "server-monitoring"
        fi
    fi

    # Layer 7: database
    if in_range 7; then
        step OBSERVING "Layer 7: database"
        db_sec="$(printf '%s' "${REMOTE_OUT}" | sed -n '/===== LAYER_7/,/===== LAYER_8/p')"
        if printf '%s' "${db_sec}" | grep -qi 'too many connections\|max_connections'; then
            diagnose_layer 7 database "max_connections / too many connections" \
                "Database connection pool exhausted" \
                "PROCESSLIST evidence is in the journal when available. Propose remediation after approval." \
                "Connection leak or a traffic spike." \
                "none"
        fi
        if printf '%s' "${db_sec}" | grep -qi 'crashed'; then
            diagnose_layer 7 database "table crashed" \
                "A database table is marked as crashed" \
                "Propose an offline repair; consider verifying a backup first." \
                "Disk or data corruption." \
                "backup-restore"
        fi
    fi

    # Layer 8: logs
    if in_range 8; then
        step OBSERVING "Layer 8: logs"
        log_sec="$(printf '%s' "${REMOTE_OUT}" | sed -n '/===== LAYER_8/,/===== LAYER_9/p')"
        if printf '%s' "${log_sec}" | grep -qi 'SQLSTATE\|Fatal error\|Uncaught\|ErrorException'; then
            diagnose_layer 8 logs "application error in logs" \
                "Application error signature in the logs" \
                "Propose a code fix, or a deploy-site rollback if a recent release correlates." \
                "Application defect or a bad deploy." \
                "deploy-site"
        fi
        if printf '%s' "${log_sec}" | grep -qi 'max_children'; then
            diagnose_layer 8 logs "max_children in logs" \
                "php-fpm max_children evidenced in the logs" \
                "Propose php-fpm remediation after approval." \
                "Capacity limit." \
                "none"
        fi
    fi

    # Layer 9: recent change
    if in_range 9; then
        step OBSERVING "Layer 9: recent_change"
        recent_sec="$(printf '%s' "${REMOTE_OUT}" | sed -n '/===== LAYER_9/,/===== COLLECT_DONE/p')"

        local_deploy="$(ls -1t "${JOURNAL_DIR}"/*-deploy-site.md 2>/dev/null | head -1 || true)"
        [[ -n "${local_deploy}" ]] && EVIDENCE+=("local deploy journal: $(basename "${local_deploy}")")

        if [[ "${http_code}" != "200" ]] && printf '%s' "${recent_sec}" | grep -qi 'releases:'; then
            diagnose_layer 9 recent_change "recent releases present during the outage" \
                "Recent change detected; correlate it with the outage window" \
                "If the deploy correlates, propose a deploy-site rollback after approval." \
                "Change management gap — verify the health gate and the change window." \
                "deploy-site"
        fi
    fi
fi

# ── Inconclusive ──────────────────────────────────────────────────────────────
STATUS="INCONCLUSIVE"
DIAGNOSIS="No clearly broken layer; the site may be slow or intermittent"
PROPOSED_FIX="Collect metrics over a longer window, check slow queries, and re-run with --since 6h"
ROOT_CAUSE="Undetermined pending more data"
HANDOFF="none"
step INCONCLUSIVE "${DIAGNOSIS}"

result_add_raw "layer" "null"
result_add_string "layer_name" ""
result_add_string "diagnosis" "${DIAGNOSIS}"
result_add_string_array "evidence" "${EVIDENCE[@]+"${EVIDENCE[@]}"}"
result_add_string "proposed_fix" "${PROPOSED_FIX}"
result_add_string "root_cause_note" "${ROOT_CAUSE}"
result_add_string "handoff" "${HANDOFF}"
result_add_string "journal" "$(journal_path)"

journal_log "INCONCLUSIVE" "${DIAGNOSIS}" "layered probes" 0 0 "" "DIAGNOSING" "INCONCLUSIVE"
emit_result "INCONCLUSIVE"
exit 0
