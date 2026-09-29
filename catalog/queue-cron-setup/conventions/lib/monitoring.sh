#!/usr/bin/env bash
# monitoring.sh — Uptime Kuma API access and monitor parsing (shared library)
#
# The API key is never placed in argv. It is written to a 0600 curl config file
# that curl reads with -K, and the request body travels in a 0600 file read with
# --data-binary @file. Nothing sensitive is visible in `ps` on either host.
#
#   kuma_require_key
#   kuma_resolve_key               -> fills KUMA_KEY from --api-key, then the env var
#                                     named by monitoring.api_key_env, then the vault
#                                     secret named by monitoring.api_key_secret
#   kuma_api <METHOD> <path> [json_body]
#   kuma_monitors_tsv              -> id <TAB> name <TAB> type <TAB> active <TAB> url
#   kuma_check_exists <client> <suffix>
#   kuma_notify_test <notification_id>
#   monitoring_require_external_host <client_host> <monitoring_host>
#   monitoring_push_monitors <client>

KUMA_KEY=""
KUMA_KEY_SOURCE=""
KUMA_URL="${UPTIME_KUMA_URL:-}"

kuma_require_key() {
    if [[ -z "${KUMA_KEY}" ]]; then
        fail_with 5 STOPPED "No Uptime Kuma API key. Pass --api-key, export ${MONITORING_KUMA_TOKEN_ENV:-AGENCY_UPTIME_KUMA_KEY}, or store monitoring.api_key_secret in the vault."
    fi
    if [[ -z "${KUMA_URL}" ]]; then
        fail_with 5 STOPPED "No Uptime Kuma URL. Set monitoring.uptime_kuma_url in the manifest or pass --kuma-url."
    fi
}

# kuma_resolve_key
#
# Fills KUMA_KEY from the first source that has one, in order of decreasing
# explicitness:
#
#   1. --api-key             (the caller said so; already in KUMA_KEY)
#   2. the environment       (the variable named by monitoring.api_key_env)
#   3. the credential vault  (the secret named by monitoring.api_key_secret)
#
# The vault is last because it is the least visible to the operator running the
# command, not because it is less trustworthy. The value is read through
# integration_emit_secret, the only sanctioned path, and lands in a shell variable
# - never in argv, the journal, or a warning.
#
# Returns 0 when a key was found, 1 when none of the sources had one. It does not
# fail: a caller may legitimately want to report the gap instead of stopping.
kuma_resolve_key() {
    if [[ -n "${KUMA_KEY}" ]]; then
        KUMA_KEY_SOURCE="--api-key"
        return 0
    fi

    local from_env_name="${MONITORING_KUMA_TOKEN_ENV:-AGENCY_UPTIME_KUMA_KEY}"
    if [[ -n "${!from_env_name:-}" ]]; then
        KUMA_KEY="${!from_env_name}"
        KUMA_KEY_SOURCE="env:${from_env_name}"
        return 0
    fi

    local secret_name="${MONITORING_KUMA_TOKEN_SECRET:-uptime-kuma.token}"
    if ! command -v integration_emit_secret >/dev/null 2>&1; then
        return 1
    fi
    local value=""
    set +e
    value="$(integration_emit_secret "${secret_name}" 2>/dev/null)"
    set -e
    if [[ -n "${value}" ]]; then
        KUMA_KEY="${value}"
        KUMA_KEY_SOURCE="vault:${secret_name}"
        return 0
    fi
    return 1
}

# kuma_api <METHOD> <path> [json_body]
kuma_api() {
    local method="$1" path="$2" body="${3:-}"
    local cfg body_file out rc
    cfg="$(mktemp)"
    chmod 600 "${cfg}"
    {
        printf 'silent\nshow-error\nmax-time = 30\n'
        printf 'request = "%s"\n' "${method}"
        printf 'header = "Authorization: Bearer %s"\n' "${KUMA_KEY}"
        printf 'header = "Content-Type: application/json"\n'
        printf 'url = "%s"\n' "${KUMA_URL%/}${path}"
    } > "${cfg}"

    local args=(-K "${cfg}")
    body_file=""
    if [[ -n "${body}" ]]; then
        body_file="$(mktemp)"
        chmod 600 "${body_file}"
        printf '%s' "${body}" > "${body_file}"
        args+=(--data-binary "@${body_file}")
    fi

    set +e
    out="$(curl "${args[@]}" 2>&1)"
    rc=$?
    set -e

    rm -f "${cfg}" ${body_file:+"${body_file}"}
    printf '%s' "${out}"
    return "${rc}"
}

# kuma_monitors_tsv — one line per monitor.
kuma_monitors_tsv() {
    local raw
    raw="$(kuma_api GET /api/monitors)"
    if command -v python3 >/dev/null 2>&1; then
        printf '%s' "${raw}" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(1)
if isinstance(data, dict):
    for key in ("monitors", "data"):
        if key in data:
            data = data[key]
            break
if not isinstance(data, list):
    sys.exit(1)
for m in data:
    if not isinstance(m, dict):
        continue
    print("\t".join([
        str(m.get("id", "")),
        str(m.get("name", "")),
        str(m.get("type", "")),
        "yes" if m.get("active") else "no",
        str(m.get("url", m.get("hostname", ""))),
    ]))
'
    else
        printf '%s' "${raw}" | tr '}' '\n' | while IFS= read -r chunk; do
            id="$(printf '%s' "${chunk}" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')"
            name="$(printf '%s' "${chunk}" | sed -n 's/.*"name":"\([^"]*\)".*/\1/p')"
            type="$(printf '%s' "${chunk}" | sed -n 's/.*"type":"\([^"]*\)".*/\1/p')"
            url="$(printf '%s' "${chunk}" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')"
            [[ -n "${id}" ]] && printf '%s\t%s\t%s\t?\t%s\n' "${id}" "${name}" "${type}" "${url}"
        done
    fi
}

# kuma_check_exists <client> <suffix>  -> 0 when a monitor named <client>-<suffix> exists
kuma_check_exists() {
    local want="$1-$2"
    kuma_monitors_tsv | awk -F'\t' -v n="${want}" '$2 == n { found = 1 } END { exit(found ? 0 : 1) }'
}

# kuma_monitor_id <client> <suffix>
kuma_monitor_id() {
    local want="$1-$2"
    kuma_monitors_tsv | awk -F'\t' -v n="${want}" '$2 == n { print $1; exit }'
}

# kuma_notify_test <notification_id>
kuma_notify_test() {
    kuma_api POST /api/notifications/test "$(printf '{"id":%s}' "$1")"
}

# monitoring_require_external_host <client_host> <monitoring_host>
# Rule 1 of server-monitoring/SKILL.md: never monitor a host from itself.
monitoring_require_external_host() {
    local client_host="$1" monitoring_host="$2"
    if [[ -z "${monitoring_host}" ]]; then
        fail_with 5 STOPPED "No monitoring host. Set monitoring.monitoring_host or pass --monitoring-host. Monitoring must run on a different server from the one it watches."
    fi
    if [[ "${monitoring_host}" == "${client_host}" ]]; then
        fail_with 5 STOPPED "monitoring_host is '${monitoring_host}', the same host as the client site. A monitor on the box it watches reports nothing when that box dies."
    fi

    local client_addr mon_addr
    set +e
    client_addr="$(ssh -G "${client_host}" 2>/dev/null | awk '/^hostname /{print $2}')"
    mon_addr="$(ssh -G "${monitoring_host}" 2>/dev/null | awk '/^hostname /{print $2}')"
    set -e
    if [[ -n "${client_addr}" && "${client_addr}" == "${mon_addr}" ]]; then
        result_warn "monitoring_host and the client host resolve to the same address (${client_addr}); confirm they are really separate instances"
    fi
}

# monitoring_ssh <monitoring_host> <label>
monitoring_ssh() {
    if ! ssh -G "$1" >/dev/null 2>&1; then
        fail_with 3 STOPPED "SSH alias '$1' ($2) was not found in ~/.ssh/config"
    fi
    ssh_target "$1" "${DEPLOY_USER}"
}

# monitoring_push_monitors <client> -> prints one "name url" line per push monitor
monitoring_push_monitors() {
    kuma_monitors_tsv | awk -F'\t' -v p="$1-" 'index($2, p) == 1 && $3 == "push" { print $2, $5 }'
}
