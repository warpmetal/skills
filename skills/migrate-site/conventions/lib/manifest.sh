#!/usr/bin/env bash
# manifest.sh — Client manifest loading and validation (shared library)
#
# Reads ~/.config/agency/clients/<client>.toml and exposes the values the skills
# need as uppercase shell variables.
#
# See conventions/client-manifest.md for the schema.
#
# Usage:
#   manifest_load "$CLIENT"           # loads and populates the variables below
#   manifest_get "backup.repo"        # ad-hoc dotted lookup
#   manifest_require host site_root   # validation gate
#
# Populated by manifest_load:
#   MANIFEST, MANIFEST_CLIENT
#   HOST, SITE_ROOT, DOMAIN, STACK, PHP, HEALTH_URL, ALERT_TO
#   DEPLOY_USER, BRANCH, REPO_URL, WORKER_UNIT, APP_UNIT
#   DB_ENGINE, DB_NAME, DB_USER
#   BACKUP_REPO, BACKUP_HEALTHCHECK, BACKUP_OFFSITE_CONFIRMED
#   QUEUE_DRIVER, QUEUE_CONNECTION, QUEUE_WORKERS, QUEUE_MAX_TIME, QUEUE_HEALTHCHECK,
#   QUEUE_QUEUES, QUEUE_TRIES, QUEUE_SLEEP, QUEUE_TIMEOUT, QUEUE_CRITICAL_JOBS,
#   QUEUE_WORKER_USER, QUEUE_LOG_DIR, QUEUE_OLDEST_JOB_MAX_MINUTES, QUEUE_FAILED_JOBS_MAX,
#   QUEUE_ALERT_WEBHOOK
#   MONITORING_HOST, UPTIME_KUMA_URL, PAGE_CHANNEL, DIGEST_CHANNEL,
#   MONITORING_PAGE_NOTIFICATION_ID, MONITORING_DIGEST_NOTIFICATION_ID,
#   MONITORING_CHECK_INTERVAL, MONITORING_DOMAIN_EXPIRY_CHECK, MONITORING_NETDATA_URL,
#   MONITORING_KUMA_TOKEN_ENV
#   MIGRATION_SOURCE_HOST, MIGRATION_TARGET_HOST, MIGRATION_TARGET_ROOT, MIGRATION_MAIL_RELAY, MIGRATION_TTL_LOWERED
#
# Exit codes (per conventions/outputs.md):
#   2 — invalid arguments / missing manifest
#   5 — manifest validation failure

AGENCY_MANIFEST_DIR="${AGENCY_MANIFEST_DIR:-${HOME}/.config/agency/clients}"
MANIFEST_DUMP=""

# --- Parser: python3 when available, awk otherwise ---------------------------

_manifest_python_parse() {
    python3 - "$1" <<'PY'
import re
import sys


def strip_comment(s):
    out = []
    quote = None
    i = 0
    while i < len(s):
        c = s[i]
        if quote:
            if c == '\\' and quote == '"' and i + 1 < len(s):
                out.append(c)
                out.append(s[i + 1])
                i += 2
                continue
            if c == quote:
                quote = None
            out.append(c)
        else:
            if c in ('"', "'"):
                quote = c
                out.append(c)
            elif c == '#':
                break
            else:
                out.append(c)
        i += 1
    return ''.join(out).strip()


def unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
        return v[1:-1]
    return v


def split_top(s, sep=','):
    parts, depth, quote, cur = [], 0, None, []
    for c in s:
        if quote:
            cur.append(c)
            if c == quote:
                quote = None
            continue
        if c in ('"', "'"):
            quote = c
            cur.append(c)
        elif c in '{[':
            depth += 1
            cur.append(c)
        elif c in '}]':
            depth -= 1
            cur.append(c)
        elif c == sep and depth == 0:
            parts.append(''.join(cur))
            cur = []
        else:
            cur.append(c)
    parts.append(''.join(cur))
    return parts


def main(path):
    try:
        with open(path, 'r', encoding='utf-8') as fh:
            text = fh.read()
    except OSError:
        return 1

    data = {}
    section = None

    for raw in text.splitlines():
        line = strip_comment(raw)
        if not line:
            continue
        m = re.match(r'^\[([^\]]+)\]$', line)
        if m:
            section = m.group(1).strip()
            data.setdefault(section, {})
            continue
        m = re.match(r'^([A-Za-z0-9_.\-]+)\s*=\s*(.*)$', line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        target = data.setdefault(section, {}) if section else data
        if val.startswith('{') and val.endswith('}'):
            sub = {}
            for part in split_top(val[1:-1]):
                if '=' not in part:
                    continue
                k, v = part.split('=', 1)
                sub[k.strip()] = unquote(v)
            target[key] = sub
        else:
            target[key] = unquote(val)

    def walk(prefix, obj):
        for k, v in obj.items():
            name = prefix + '.' + k if prefix else k
            if isinstance(v, dict):
                walk(name, v)
            else:
                sys.stdout.write('%s\t%s\n' % (name, v))

    walk('', data)
    return 0


sys.exit(main(sys.argv[1]) if len(sys.argv) > 1 else 1)
PY
}

_manifest_awk_parse() {
    awk '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    function unquote(v) {
        v = trim(v)
        if (v ~ /^".*"$/ && length(v) >= 2) v = substr(v, 2, length(v) - 2)
        return v
    }
    # Strip a trailing comment, but never inside a quoted string.
    function strip_comment(s,   out, i, c, quote, n) {
        out = ""
        quote = ""
        n = length(s)
        for (i = 1; i <= n; i++) {
            c = substr(s, i, 1)
            if (quote != "") {
                out = out c
                if (c == "\\" && quote == "\"") {
                    i++
                    if (i <= n) out = out substr(s, i, 1)
                    continue
                }
                if (c == quote) quote = ""
                continue
            }
            if (c == "\"" || c == "\x27") { quote = c; out = out c; continue }
            if (c == "#") break
            out = out c
        }
        return out
    }
    {
        line = strip_comment($0)
        line = trim(line)
        if (line == "") next
        if (line ~ /^\[[^]]+\]$/) {
            section = line
            gsub(/^\[/, "", section); gsub(/\]$/, "", section)
            next
        }
        if (line !~ /=/) next
        eq = index(line, "=")
        key = trim(substr(line, 1, eq - 1))
        val = trim(substr(line, eq + 1))
        if (key == "" || key ~ /[ \t]/) next
        prefix = (section == "") ? "" : section "."
        if (val ~ /^\{.*\}$/) {
            inner = substr(val, 2, length(val) - 2)
            n = split(inner, parts, ",")
            for (i = 1; i <= n; i++) {
                if (parts[i] !~ /=/) continue
                e = index(parts[i], "=")
                k = trim(substr(parts[i], 1, e - 1))
                v = unquote(substr(parts[i], e + 1))
                printf "%s%s.%s\t%s\n", prefix, key, k, v
            }
        } else {
            printf "%s%s\t%s\n", prefix, key, unquote(val)
        }
    }
    ' "$1"
}

manifest_dump() {
    local file="$1"
    if command -v python3 >/dev/null 2>&1; then
        MANIFEST_PARSER="python3"
        _manifest_python_parse "$file"
    else
        # The awk fallback is the least exercised path, and a parse error here is
        # expensive (client name, host, systemd unit). Record which parser ran so
        # the script can surface it in its result and warn on the fallback.
        MANIFEST_PARSER="awk"
        _manifest_awk_parse "$file"
    fi
}

# manifest_parser_report
# Call AFTER result_init(). Adds `manifest_parser` to the result and warns when
# the awk fallback was used. Safe to call even if no manifest was parsed yet:
# manifest_dump is what sets MANIFEST_PARSER, and it may run before result_init.
manifest_parser_report() {
    if [[ -z "${MANIFEST_PARSER:-}" ]]; then
        return 0
    fi
    if command -v result_add_string >/dev/null 2>&1; then
        result_add_string "manifest_parser" "${MANIFEST_PARSER}"
    fi
    if [[ "${MANIFEST_PARSER}" == "awk" ]]; then
        result_warn "manifest_parser: python3 is not installed, so the TOML manifest was parsed by the awk fallback. Install python3 if a value looks wrong."
    fi
}

# --- Accessors ----------------------------------------------------------------

# manifest_get <dotted.key> [default]
manifest_get() {
    local key="$1"
    local default_value="${2:-}"
    local value
    value="$(printf '%s\n' "${MANIFEST_DUMP}" | awk -F'\t' -v k="${key}" '$1 == k { print $2; exit }')"
    if [[ -z "${value}" ]]; then
        printf '%s\n' "${default_value}"
    else
        printf '%s\n' "${value}"
    fi
}

# manifest_get_from <file> <dotted.key> [default]
# Reads an arbitrary manifest without disturbing the loaded globals. Used by
# site-down-triage to inspect sibling clients on the same host.
manifest_get_from() {
    local file="$1"
    local key="$2"
    local default_value="${3:-}"
    local value
    value="$(manifest_dump "${file}" 2>/dev/null | awk -F'\t' -v k="${key}" '$1 == k { print $2; exit }')"
    if [[ -z "${value}" ]]; then
        printf '%s\n' "${default_value}"
    else
        printf '%s\n' "${value}"
    fi
}

# --- Failure ------------------------------------------------------------------

_manifest_fail() {
    local code="$1"
    local message="$2"
    printf 'ERROR: %s\n' "${message}" >&2
    if command -v result_init >/dev/null 2>&1; then
        if [[ -z "${RESULT_SKILL}" ]]; then
            result_init "${MANIFEST_SKILL:-unknown}" "${MANIFEST_CLIENT:-unknown}"
        fi
        result_error "${message}"
        emit_result "STOPPED"
    fi
    exit "${code}"
}

# --- Validation ---------------------------------------------------------------

# manifest_require <key> [<key> ...]
manifest_require() {
    local key value
    for key in "$@"; do
        value="$(manifest_get "${key}")"
        if [[ -z "${value}" ]]; then
            _manifest_fail 2 "Manifest field '${key}' is required. Manifest: ${MANIFEST}"
        fi
    done
}

manifest_validate() {
    local stack
    stack="$(manifest_get stack)"
    case "${stack}" in
        laravel|wordpress|node|static) ;;
        "")
            _manifest_fail 5 "Manifest field 'stack' is required. Manifest: ${MANIFEST}" ;;
        *)
            _manifest_fail 5 "Invalid stack '${stack}'. Must be one of: laravel, wordpress, node, static" ;;
    esac

    local health_url
    health_url="$(manifest_get health_url)"
    if [[ -n "${health_url}" && "${health_url}" != https://* ]]; then
        _manifest_fail 5 "health_url must use HTTPS (got: ${health_url})"
    fi

    local site_root
    site_root="$(manifest_get site_root)"
    if [[ -n "${site_root}" && "${site_root}" != /* ]]; then
        _manifest_fail 5 "site_root must be an absolute path (got: ${site_root})"
    fi
}

# manifest_validate_ssh — the alias must exist in the SSH config.
manifest_validate_ssh() {
    if ! ssh -G "${HOST}" >/dev/null 2>&1; then
        _manifest_fail 3 "SSH host '${HOST}' not found in ~/.ssh/config"
    fi
}

# --- Loader -------------------------------------------------------------------

manifest_load() {
    local client="${1:-}"
    if [[ -z "${client}" ]]; then
        _manifest_fail 2 "manifest_load requires a client name"
    fi

    MANIFEST_CLIENT="${client}"
    MANIFEST="${AGENCY_MANIFEST_DIR}/${client}.toml"

    if [[ ! -f "${MANIFEST}" ]]; then
        _manifest_fail 2 "Client manifest not found: ${MANIFEST}"
    fi

    MANIFEST_DUMP="$(manifest_dump "${MANIFEST}")" || \
        _manifest_fail 2 "Could not parse manifest: ${MANIFEST}"

    HOST="$(manifest_get host)"
    SITE_ROOT="$(manifest_get site_root)"
    DOMAIN="$(manifest_get domain)"
    STACK="$(manifest_get stack)"
    PHP="$(manifest_get php)"
    HEALTH_URL="$(manifest_get health_url)"
    ALERT_TO="$(manifest_get alert_to)"

    DEPLOY_USER="$(manifest_get deploy_user www-data)"
    BRANCH="$(manifest_get branch main)"
    REPO_URL="$(manifest_get repo_url)"

    # Service unit names — never hardcode a client name in a script.
    WORKER_UNIT="$(manifest_get worker_unit "${client}-worker@")"
    APP_UNIT="$(manifest_get app_unit "${client}-app")"

    DB_ENGINE="$(manifest_get db.engine)"
    DB_NAME="$(manifest_get db.name)"
    DB_USER="$(manifest_get db.user)"

    BACKUP_REPO="$(manifest_get backup.repo)"
    BACKUP_HEALTHCHECK="$(manifest_get backup.healthcheck)"
    BACKUP_OFFSITE_CONFIRMED="$(manifest_get backup.offsite_confirmed)"

    QUEUE_DRIVER="$(manifest_get queue.driver)"
    QUEUE_CONNECTION="$(manifest_get queue.connection)"
    QUEUE_WORKERS="$(manifest_get queue.workers 1)"
    QUEUE_MAX_TIME="$(manifest_get queue.max_time 3600)"
    QUEUE_HEALTHCHECK="$(manifest_get queue.healthcheck)"
    QUEUE_QUEUES="$(manifest_get queue.queues default)"
    QUEUE_TRIES="$(manifest_get queue.tries 3)"
    QUEUE_SLEEP="$(manifest_get queue.sleep 3)"
    QUEUE_TIMEOUT="$(manifest_get queue.timeout 90)"
    QUEUE_CRITICAL_JOBS="$(manifest_get queue.critical_jobs)"
    QUEUE_WORKER_USER="$(manifest_get queue.worker_user "${DEPLOY_USER}")"
    QUEUE_LOG_DIR="$(manifest_get queue.log_dir "/var/log/${client}")"
    QUEUE_OLDEST_JOB_MAX_MINUTES="$(manifest_get queue.oldest_job_max_minutes 5)"
    QUEUE_FAILED_JOBS_MAX="$(manifest_get queue.failed_jobs_max 0)"
    QUEUE_ALERT_WEBHOOK="$(manifest_get queue.alert_webhook)"

    MONITORING_HOST="$(manifest_get monitoring.monitoring_host)"
    UPTIME_KUMA_URL="$(manifest_get monitoring.uptime_kuma_url)"
    PAGE_CHANNEL="$(manifest_get monitoring.page_channel)"
    DIGEST_CHANNEL="$(manifest_get monitoring.digest_channel)"
    MONITORING_PAGE_NOTIFICATION_ID="$(manifest_get monitoring.page_notification_id)"
    MONITORING_DIGEST_NOTIFICATION_ID="$(manifest_get monitoring.digest_notification_id)"
    MONITORING_CHECK_INTERVAL="$(manifest_get monitoring.check_interval 60)"
    MONITORING_DOMAIN_EXPIRY_CHECK="$(manifest_get monitoring.domain_expiry_check false)"
    MONITORING_NETDATA_URL="$(manifest_get monitoring.netdata_url)"
    MONITORING_KUMA_TOKEN_ENV="$(manifest_get monitoring.api_key_env AGENCY_UPTIME_KUMA_KEY)"

    MIGRATION_SOURCE_HOST="$(manifest_get migration.source_host)"
    MIGRATION_TARGET_HOST="$(manifest_get migration.target_host)"
    MIGRATION_TARGET_ROOT="$(manifest_get migration.target_root)"
    MIGRATION_MAIL_RELAY="$(manifest_get migration.mail_relay)"
    MIGRATION_TTL_LOWERED="$(manifest_get migration.ttl_lowered)"

    export MANIFEST MANIFEST_CLIENT MANIFEST_DUMP
    export HOST SITE_ROOT DOMAIN STACK PHP HEALTH_URL ALERT_TO
    export DEPLOY_USER BRANCH REPO_URL WORKER_UNIT APP_UNIT
    export DB_ENGINE DB_NAME DB_USER
    export BACKUP_REPO BACKUP_HEALTHCHECK BACKUP_OFFSITE_CONFIRMED
    export QUEUE_DRIVER QUEUE_CONNECTION QUEUE_WORKERS QUEUE_MAX_TIME QUEUE_HEALTHCHECK
    export QUEUE_QUEUES QUEUE_TRIES QUEUE_SLEEP QUEUE_TIMEOUT QUEUE_CRITICAL_JOBS
    export QUEUE_WORKER_USER QUEUE_LOG_DIR QUEUE_OLDEST_JOB_MAX_MINUTES QUEUE_FAILED_JOBS_MAX
    export QUEUE_ALERT_WEBHOOK
    export MONITORING_HOST UPTIME_KUMA_URL PAGE_CHANNEL DIGEST_CHANNEL
    export MONITORING_PAGE_NOTIFICATION_ID MONITORING_DIGEST_NOTIFICATION_ID
    export MONITORING_CHECK_INTERVAL MONITORING_DOMAIN_EXPIRY_CHECK
    export MONITORING_NETDATA_URL MONITORING_KUMA_TOKEN_ENV
    export MIGRATION_SOURCE_HOST MIGRATION_TARGET_HOST MIGRATION_TARGET_ROOT
    export MIGRATION_MAIL_RELAY MIGRATION_TTL_LOWERED
}
