#!/usr/bin/env bash
# collect-remote.sh — Read-only remote collector for triage layers 4-9
#
# @standalone-remote
# This script is piped into a remote shell:
#     ssh <dest> 'CLIENT=... SITE_ROOT=... bash -s' < collect-remote.sh
# It therefore runs ON the client host and cannot source conventions/lib.
# It performs no writes, no restarts, and no deletions.
#
# Env: CLIENT SITE_ROOT STACK SINCE PHP_VERSION (optional)
#
# Prints structured sections delimited by "===== LAYER_n: name =====" and ends
# with "===== COLLECT_DONE client=<name> =====".

set -euo pipefail

CLIENT="${CLIENT:-unknown}"
SITE_ROOT="${SITE_ROOT:?SITE_ROOT required}"
STACK="${STACK:-laravel}"
SINCE="${SINCE:-1h}"
PHP_VERSION="${PHP_VERSION:-}"

section() {
    echo ""
    echo "===== LAYER_$1: $2 ====="
}

safe_tail() {
    local file="$1"
    local lines="${2:-50}"
    if [[ -r "$file" ]]; then
        tail -n "$lines" "$file" 2>/dev/null || true
    else
        echo "(missing or unreadable: $file)"
    fi
}

# --- Layer 4: Web server ---
section 4 web_server
if command -v systemctl >/dev/null 2>&1; then
    systemctl is-active nginx 2>/dev/null || echo "nginx_is_active: unknown"
    systemctl status nginx --no-pager -l 2>/dev/null | head -40 || true
fi
if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>&1 || true
fi
if command -v ss >/dev/null 2>&1; then
    ss -lntp 2>/dev/null | grep -E ':80|:443' || echo "no_listeners_80_443"
fi

# --- Layer 5: App runtime ---
section 5 app_runtime
case "$STACK" in
    laravel|wordpress)
        if [[ -n "$PHP_VERSION" ]]; then
            systemctl is-active "php${PHP_VERSION}-fpm" 2>/dev/null || true
            systemctl status "php${PHP_VERSION}-fpm" --no-pager -l 2>/dev/null | head -40 || true
        else
            systemctl is-active 'php*-fpm' 2>/dev/null || true
            systemctl status 'php*-fpm' --no-pager -l 2>/dev/null | head -40 || true
        fi
        if command -v journalctl >/dev/null 2>&1; then
            journalctl --since "$SINCE" -u 'php*-fpm' --no-pager 2>/dev/null | grep -i 'max_children\|ERROR\|FATAL' | tail -30 || true
        fi
        ;;
    node)
        if command -v systemctl >/dev/null 2>&1; then
            systemctl list-units --type=service --state=running --no-pager 2>/dev/null | grep -i node || true
        fi
        pgrep -af node 2>/dev/null | head -20 || echo "no_node_process"
        ;;
    static)
        echo "static_stack: runtime_n_a"
        ;;
    *)
        echo "unknown_stack: $STACK"
        ;;
esac

# --- Layer 6: Resources ---
section 6 resources
df -h "$SITE_ROOT" 2>/dev/null || df -h / 2>/dev/null || true
df -i "$SITE_ROOT" 2>/dev/null || df -i / 2>/dev/null || true
free -m 2>/dev/null || true
if command -v dmesg >/dev/null 2>&1; then
    dmesg 2>/dev/null | grep -i oom | tail -20 || echo "no_oom_in_dmesg"
elif command -v journalctl >/dev/null 2>&1; then
    journalctl -k --since "$SINCE" --no-pager 2>/dev/null | grep -i oom | tail -20 || true
fi
echo "RECLAIM_CANDIDATES:"
echo "  /var/log (rotated logs)"
echo "  /var/log/journal (vacuum propose only)"
echo "  ${SITE_ROOT}/releases (keep last 5)"
echo "  ${SITE_ROOT}/shared/storage/logs (if present)"

# --- Layer 7: Database ---
section 7 database
case "$STACK" in
    laravel|wordpress)
        if command -v mysql >/dev/null 2>&1; then
            # Read-only attempt without inventing credentials
            mysql -e "SHOW PROCESSLIST; SHOW VARIABLES LIKE 'max_connections';" 2>&1 | head -80 || echo "mysql_probe_failed_no_credentials_or_socket"
        elif command -v mariadb >/dev/null 2>&1; then
            mariadb -e "SHOW PROCESSLIST; SHOW VARIABLES LIKE 'max_connections';" 2>&1 | head -80 || echo "mariadb_probe_failed"
        else
            echo "no_mysql_client"
            ss -lntp 2>/dev/null | grep -E ':3306|:5432' || echo "no_db_listener_found"
        fi
        ;;
    *)
        echo "db_probe_skipped_for_stack: $STACK"
        ;;
esac

# --- Layer 8: Logs ---
section 8 logs
for candidate in /var/log/nginx/error.log /var/log/nginx/error.log.1; do
    echo "--- $candidate ---"
    safe_tail "$candidate" 50
done
if [[ -d "${SITE_ROOT}/current/storage/logs" ]]; then
    latest_log="$(ls -1t "${SITE_ROOT}/current/storage/logs"/*.log 2>/dev/null | head -1 || true)"
    if [[ -n "${latest_log}" ]]; then
        echo "--- ${latest_log} ---"
        safe_tail "$latest_log" 50
    fi
fi
if [[ -f "${SITE_ROOT}/current/wp-content/debug.log" ]]; then
    echo "--- wp-content/debug.log ---"
    safe_tail "${SITE_ROOT}/current/wp-content/debug.log" 50
fi
if command -v journalctl >/dev/null 2>&1; then
    journalctl --since "$SINCE" -u nginx --no-pager 2>/dev/null | tail -40 || true
fi

# --- Layer 9: Recent change ---
section 9 recent_change
if [[ -d "${SITE_ROOT}/releases" ]]; then
    echo "releases:"
    ls -lt "${SITE_ROOT}/releases" 2>/dev/null | head -10 || true
fi
if [[ -L "${SITE_ROOT}/current" ]] || [[ -e "${SITE_ROOT}/current" ]]; then
    echo "current -> $(readlink -f "${SITE_ROOT}/current" 2>/dev/null || echo unknown)"
fi
if [[ -f /var/log/apt/history.log ]]; then
    echo "apt_history_tail:"
    safe_tail /var/log/apt/history.log 40
fi
if [[ -d /var/log/letsencrypt ]]; then
    echo "letsencrypt_tail:"
    safe_tail /var/log/letsencrypt/letsencrypt.log 30
fi
echo "crontab_root:"
crontab -l 2>/dev/null | head -30 || echo "(no root crontab or denied)"

echo ""
echo "===== COLLECT_DONE client=${CLIENT} ====="