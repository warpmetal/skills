#!/usr/bin/env bash
# queue.sh — Queue and scheduler fact collection (shared by queue-cron-setup)
#
# One SSH session collects everything inspect-queues.sh and verify-workers.sh
# need, so the two read-only actions cannot drift apart.
#
# Output is a stable list of key=value lines on stdout, terminated by
# QUEUE_FACTS_DONE. Unknown values are empty rather than absent, so callers can
# always rely on the key existing.
#
#   queue_collect_facts <ssh_dest> <site_root> <stack> <worker_unit_prefix> <log_dir>
#   queue_fact <facts_blob> <key>

queue_collect_facts() {
    local dest="$1"
    local site_root="$2"
    local stack="$3"
    local unit_prefix="$4"
    local log_dir="$5"

    local remote
    remote="$(cat <<REMOTE
set -uo pipefail
SITE_ROOT='${site_root}'
STACK='${stack}'
UNIT_PREFIX='${unit_prefix}'
LOG_DIR='${log_dir}'

emit() { printf '%s=%s\n' "\$1" "\$2"; }

# --- Worker units -------------------------------------------------------------
total=0
active=0
pids=""
for u in \$(systemctl list-unit-files --no-pager 2>/dev/null | awk -v p="\$UNIT_PREFIX" 'index(\$1, p) == 1 && \$1 ~ /\\.service\$/ {print \$1}'); do
    total=\$((total + 1))
    state=\$(systemctl is-active "\$u" 2>/dev/null || echo unknown)
    if [ "\$state" = "active" ]; then
        active=\$((active + 1))
        p=\$(systemctl show -p MainPID "\$u" 2>/dev/null | cut -d= -f2)
        [ -n "\$p" ] && [ "\$p" != "0" ] && pids="\$pids \$p"
    fi
done
emit worker_units_total "\$total"
emit worker_units_active "\$active"
emit worker_pids "\$(echo \$pids | tr -s ' ' | sed 's/^ //')"

# --- Stale-code check ---------------------------------------------------------
current="\$(readlink -f "\$SITE_ROOT/current" 2>/dev/null)"
if [ -z "\$current" ]; then current="\$(readlink -f "\$SITE_ROOT" 2>/dev/null)"; fi
stale_state="unknown"
stale_detail=""
checked=0
for p in \$pids; do
    cwd="\$(readlink -f "/proc/\$p/cwd" 2>/dev/null)"
    [ -z "\$cwd" ] && continue
    checked=\$((checked + 1))
    if [ "\$cwd" != "\$current" ]; then
        stale_state="stale"
        stale_detail="pid \$p runs \$cwd but current is \$current"
        break
    fi
done
if [ "\$stale_state" != "stale" ] && [ "\$checked" -gt 0 ]; then stale_state="ok"; fi
if [ "\$checked" -eq 0 ]; then stale_detail="no worker process was inspected"; fi
emit stale_state "\$stale_state"
emit stale_detail "\$stale_detail"

# --- Cron ---------------------------------------------------------------------
emit cron_schedule_entries "\$(crontab -l 2>/dev/null | grep -cE '^[^#].*schedule:(run|work)' || true)"
emit cron_worker_entries "\$(crontab -l 2>/dev/null | grep -cE '^[^#].*queue:(work|listen)' || true)"
emit cron_total_entries "\$(crontab -l 2>/dev/null | grep -cvE '^\s*(#|\$)' || true)"
emit cron_scheduler_log_redirect "\$(crontab -l 2>/dev/null | grep -E 'schedule:(run|work)' | grep -c '>>' || true)"

# --- Queue depth --------------------------------------------------------------
emit failed_jobs ""
emit oldest_pending_minutes ""
emit pending_jobs ""
if [ "\$STACK" = "laravel" ] && [ -f "\$SITE_ROOT/shared/.env" ]; then
    set -a; . "\$SITE_ROOT/shared/.env" 2>/dev/null; set +a
    export MYSQL_PWD="\$DB_PASSWORD"
    q() { mysql -N -B -u "\$DB_USERNAME" "\$DB_DATABASE" -e "\$1" 2>/dev/null | tail -1 | tr -d '[:space:]'; }
    emit failed_jobs "\$(q 'SELECT COUNT(*) FROM failed_jobs;')"
    emit pending_jobs "\$(q 'SELECT COUNT(*) FROM jobs;')"
    emit oldest_pending_minutes "\$(q 'SELECT TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(MIN(available_at)), NOW()) FROM jobs;')"
elif [ "\$STACK" = "node" ] && command -v redis-cli >/dev/null 2>&1; then
    qn="default"
    if [ -f "\$SITE_ROOT/shared/.env" ]; then
        qn="\$(grep -m1 '^QUEUE_NAME=' "\$SITE_ROOT/shared/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
        [ -z "\$qn" ] && qn="default"
    fi
    emit pending_jobs "\$(redis-cli LLEN "bull:\$qn:wait" 2>/dev/null)"
    emit failed_jobs "\$(redis-cli ZCARD "bull:\$qn:failed" 2>/dev/null)"
fi

# --- Cache health (queue:restart depends on it) -------------------------------
cache_ok="unknown"
if [ "\$STACK" = "laravel" ] && [ -f "\$SITE_ROOT/current/artisan" ]; then
    driver="\$(grep -m1 '^CACHE_STORE=' "\$SITE_ROOT/shared/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
    [ -z "\$driver" ] && driver="\$(grep -m1 '^CACHE_DRIVER=' "\$SITE_ROOT/shared/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
    case "\$driver" in
        null|"") cache_ok="no" ;;
        *) cache_ok="yes" ;;
    esac
    emit cache_driver "\$driver"
fi
emit cache_ok "\$cache_ok"

# --- Logs ---------------------------------------------------------------------
if [ -d "\$LOG_DIR" ]; then
    emit log_dir_size_bytes "\$(du -sb "\$LOG_DIR" 2>/dev/null | awk '{print \$1}')"
    emit log_file_count "\$(find "\$LOG_DIR" -maxdepth 1 -type f -name '*.log' 2>/dev/null | wc -l | tr -d ' ')"
else
    emit log_dir_size_bytes ""
    emit log_file_count "0"
fi
emit logrotate_configured "\$([ -f "/etc/logrotate.d/${UNIT_PREFIX%%-*}-workers" ] && echo yes || echo no)"

# --- Scheduler progress -------------------------------------------------------
slog="\$LOG_DIR/scheduler.log"
if [ -f "\$slog" ]; then
    emit scheduler_log_age_seconds "\$(( \$(date +%s) - \$(stat -c %Y "\$slog" 2>/dev/null || echo 0) ))"
else
    emit scheduler_log_age_seconds ""
fi
emit scheduler_log_path "\$slog"

# --- Dead-man's switch --------------------------------------------------------
emit healthcheck_configured "no"
if [ -f "\$SITE_ROOT/shared/.env" ]; then
    if grep -qE '^QUEUE_HEALTHCHECK=|^HEALTHCHECK_URL=' "\$SITE_ROOT/shared/.env" 2>/dev/null; then
        emit healthcheck_configured "yes"
    fi
fi
if crontab -l 2>/dev/null | grep -qE 'HC_PING_URL|healthchecks\.io|hc-ping\.com'; then
    emit healthcheck_configured "yes"
fi

# --- Runtime ------------------------------------------------------------------
emit php_path "\$(command -v php 2>/dev/null || true)"
emit node_path "\$(command -v node 2>/dev/null || true)"
emit redis_reachable "\$(command -v redis-cli >/dev/null 2>&1 && (redis-cli ping 2>/dev/null | grep -c PONG || echo 0) || echo unknown)"

printf 'QUEUE_FACTS_DONE\n'
REMOTE
)"

    set +e
    printf '%s' "${remote}" | ssh "${SSH_OPTS[@]}" "${dest}" "bash -s" 2>&1
    set -e
}

# queue_fact <facts_blob> <key>
queue_fact() {
    printf '%s\n' "$1" | sed -n "s/^$2=//p" | head -1
}
