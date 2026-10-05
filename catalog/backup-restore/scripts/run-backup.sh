#!/usr/bin/env bash
# run-backup.sh — Incremental restic backup with retention pruning and dead-man's switch
#
# @standalone-remote
# This file is a TEMPLATE. It is rendered by setup-backup.sh and installed on the
# client host as /usr/local/bin/run-backup-<client>.sh, where it runs from cron.
# It cannot source conventions/lib because it executes on the client host.
#
# Template variables: {{CLIENT}}, {{SITE_ROOT}}, {{BACKUP_REPO}}, {{HEALTHCHECK_URL}},
#                    {{DEPLOY_USER}}
#
# Running this file directly, before substitution, is an error.
#
# Exit codes: 0=success, 1=backup failed, 2=prune failed

set -euo pipefail

# Refuse to run as an unsubstituted template.
if grep -q '{{[A-Z_]*}}' "$0" 2>/dev/null; then
    echo "ERROR: $(basename "$0") is an unsubstituted template. Install it with setup-backup.sh." >&2
    exit 2
fi

CLIENT="{{CLIENT}}"
SITE_ROOT="{{SITE_ROOT}}"
BACKUP_REPO="{{BACKUP_REPO}}"
HEALTHCHECK_URL="{{HEALTHCHECK_URL}}"

ENV_FILE="/etc/restic/${CLIENT}.env"
PASS_FILE="/etc/restic/${CLIENT}.password"
EXCLUDE_FILE="/etc/restic/${CLIENT}.excludes"
LOG_FILE="/var/log/${CLIENT}/backup.log"
LOCK_FILE="/tmp/backup-${CLIENT}.lock"

mkdir -p "$(dirname "$LOG_FILE")"

set -a
[[ -f "$ENV_FILE" ]] && source "$ENV_FILE"
set +a

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    echo "$(date -u): Another backup is running. Exiting." | tee -a "$LOG_FILE"
    exit 0
fi

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG_FILE"; }

log "=== Backup started: $CLIENT ==="

DB_DUMP_DIR="/tmp/backup-dumps-${CLIENT}"
mkdir -p "$DB_DUMP_DIR"

if command -v mysqldump &>/dev/null && [[ -f "$SITE_ROOT/shared/.env" ]]; then
    DB_NAME=$(grep -m1 "^DB_DATABASE=" "$SITE_ROOT/shared/.env" | cut -d= -f2 | tr -d '"' || true)
    DB_USER=$(grep -m1 "^DB_USERNAME=" "$SITE_ROOT/shared/.env" | cut -d= -f2 | tr -d '"' || true)
    DB_PASS=$(grep -m1 "^DB_PASSWORD=" "$SITE_ROOT/shared/.env" | cut -d= -f2 | tr -d '"' || true)
    
    if [[ -n "$DB_NAME" ]]; then
        log "Dumping database: $DB_NAME"
        MYSQL_PWD="$DB_PASS" mysqldump \
            --single-transaction --routines --triggers \
            --user="$DB_USER" "$DB_NAME" \
            | gzip > "$DB_DUMP_DIR/${DB_NAME}-$(date +%Y%m%d-%H%M%S).sql.gz"
        log "Database dump: done"
    fi
fi

if [[ ! -f "$EXCLUDE_FILE" ]]; then
    cat > "$EXCLUDE_FILE" << 'EOF'
releases/*/vendor
releases/*/node_modules
releases/*/public/build
*.log
*.tmp
.git
EOF
fi

crontab -l -u {{DEPLOY_USER}} > "$DB_DUMP_DIR/crontab-{{DEPLOY_USER}}.txt" 2>/dev/null || true

log "Running restic backup..."
restic --password-file "$PASS_FILE" -r "$BACKUP_REPO" \
    backup \
    --exclude-file "$EXCLUDE_FILE" \
    --tag "$CLIENT" \
    --tag "$(date +%Y-%m-%d)" \
    "$SITE_ROOT/shared" \
    "$DB_DUMP_DIR" \
    /etc/nginx/sites-available \
    /etc/systemd/system \
    | tee -a "$LOG_FILE"
BACKUP_EXIT=${PIPESTATUS[0]}

rm -rf "$DB_DUMP_DIR"

if [[ "$BACKUP_EXIT" -ne 0 ]]; then
    log "ERROR: Backup failed (exit $BACKUP_EXIT)"
    exit 1
fi

log "Applying retention policy (7d / 4w / 6m)..."
restic --password-file "$PASS_FILE" -r "$BACKUP_REPO" \
    forget \
    --keep-daily 7 --keep-weekly 4 --keep-monthly 6 \
    --group-by host,tags \
    --prune --quiet \
    | tee -a "$LOG_FILE"

if [[ -n "$HEALTHCHECK_URL" ]]; then
    log "Pinging dead-man's switch..."
    curl -fsS --retry 3 --retry-delay 5 "$HEALTHCHECK_URL" \
        -d "backup ok: $CLIENT $(date -u)" > /dev/null 2>&1 \
        || log "WARNING: Failed to ping healthcheck"
fi

log "=== Backup completed successfully ==="
