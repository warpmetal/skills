#!/usr/bin/env bash
# drill-restore.sh — Proved restore drill for backup-restore
#
# Usage:
#   drill-restore.sh --client <name> [--snapshot <id>] [--repo <url>] [--keep-scratch]
#
# Restores the newest snapshot into a scratch directory on the client host,
# loads the dump into a temporary database, runs four verification checks, and
# then destroys the scratch directory and the temporary database.
#
# No approval gate: this script never touches live data. It creates and removes
# only its own scratch paths.
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
SNAPSHOT="latest"
REPO_OVERRIDE=""
KEEP_SCRATCH=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)       CLIENT="${2:-}"; shift 2 ;;
        --snapshot)     SNAPSHOT="${2:-}"; shift 2 ;;
        --repo)         REPO_OVERRIDE="${2:-}"; shift 2 ;;
        --keep-scratch) KEEP_SCRATCH=true; shift ;;
        --confirm)      confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "backup-restore" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
manifest_validate_ssh

journal_init "backup-restore" "${CLIENT}" "${MANIFEST}"

REPO="${REPO_OVERRIDE:-${BACKUP_REPO}}"
SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"
PASS_FILE="/etc/restic/${CLIENT}.password"
ENV_FILE="/etc/restic/${CLIENT}.env"

if [[ -z "${REPO}" ]]; then
    fail_with 5 STOPPED "backup.repo is required in the manifest (or pass --repo)"
fi

STAMP="$(date -u +%Y%m%d%H%M%S)"
SCRATCH_DIR="/tmp/restore-drill-${CLIENT}-${STAMP}"
TEMP_DB="drill_${CLIENT}_${STAMP}"
TEMP_DB="${TEMP_DB//[^A-Za-z0-9_]/_}"

step VERIFYING "Restore drill for ${CLIENT} (snapshot ${SNAPSHOT})"

REMOTE_SCRIPT="$(cat <<'REMOTE'
set -uo pipefail

say() { printf '%s\n' "$*"; }

say "PHASE list_snapshots"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
restic --password-file "$PASS_FILE" -r "$REPO" snapshots --last 5 2>&1 | head -20

say "PHASE restore"
mkdir -p "$SCRATCH_DIR"
if ! restic --password-file "$PASS_FILE" -r "$REPO" restore "$SNAPSHOT" --target "$SCRATCH_DIR" 2>&1 | tail -5; then
    say "RESULT restore FAIL could not restore snapshot"
    exit 0
fi

DB_DUMP="$(find "$SCRATCH_DIR" -name '*.sql.gz' -type f 2>/dev/null | head -1)"
say "PHASE db_dump path=${DB_DUMP:-none}"

DB_NAME=""
DB_USER=""
DB_PASS=""
if [ -f "$SITE_ROOT/shared/.env" ]; then
    DB_NAME="$(grep -m1 '^DB_DATABASE=' "$SITE_ROOT/shared/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')"
    DB_USER="$(grep -m1 '^DB_USERNAME=' "$SITE_ROOT/shared/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')"
    DB_PASS="$(grep -m1 '^DB_PASSWORD=' "$SITE_ROOT/shared/.env" 2>/dev/null | cut -d= -f2- | tr -d '"')"
fi

if ! command -v mysql >/dev/null 2>&1; then
    say "RESULT row_counts SKIP mysql client unavailable"
    say "RESULT app_boot SKIP mysql client unavailable"
    say "RESULT newest_record_age SKIP mysql client unavailable"
else
    say "PHASE restore_database"
    MYSQL_PWD="$DB_PASS" mysql -u "$DB_USER" -e "DROP DATABASE IF EXISTS \`$TEMP_DB\`; CREATE DATABASE \`$TEMP_DB\` CHARACTER SET utf8mb4;" 2>&1 | head -5
    if [ -n "$DB_DUMP" ]; then
        zcat "$DB_DUMP" | MYSQL_PWD="$DB_PASS" mysql -u "$DB_USER" "$TEMP_DB" 2>&1 | head -5
    fi

    say "PHASE row_counts"
    WORST=0
    TABLES="$(MYSQL_PWD="$DB_PASS" mysql -u "$DB_USER" -N -B -e 'SHOW TABLES;' "$TEMP_DB" 2>/dev/null)"
    for T in $TABLES; do
        R="$(MYSQL_PWD="$DB_PASS" mysql -u "$DB_USER" -N -B -e "SELECT COUNT(*) FROM \`$T\`;" "$TEMP_DB" 2>/dev/null || echo 0)"
        P="$(MYSQL_PWD="$DB_PASS" mysql -u "$DB_USER" -N -B -e "SELECT COUNT(*) FROM \`$T\`;" "$DB_NAME" 2>/dev/null || echo NA)"
        case "$R" in ''|*[!0-9]*) R=0 ;; esac
        case "$P" in ''|*[!0-9]*) P=NA ;; esac
        if [ "$P" != "NA" ] && [ "$P" -gt 0 ]; then
            D=$(( (P - R) * 100 / (P + 1) ))
            D=${D#-}
            [ "$D" -gt "$WORST" ] && WORST="$D"
            [ "$D" -gt 5 ] && say "WARN $T restored=$R prod=$P diff=${D}%"
        fi
    done
    if [ "$WORST" -gt 5 ]; then
        say "RESULT row_counts FAIL worst table difference ${WORST}%"
    else
        say "RESULT row_counts PASS worst table difference ${WORST}%"
    fi

    say "PHASE newest_record_age"
    NEWEST="$(MYSQL_PWD="$DB_PASS" mysql -u "$DB_USER" -N -B -e 'SELECT MAX(created_at) FROM users;' "$TEMP_DB" 2>/dev/null || echo NA)"
    if [ "$NEWEST" != "NA" ] && [ -n "$NEWEST" ]; then
        say "RESULT newest_record_age PASS newest users.created_at=${NEWEST}"
    else
        say "RESULT newest_record_age SKIP no users.created_at in the restored database"
    fi

    say "PHASE app_boot"
    BOOT="SKIP"
    if [ -f "$SCRATCH_DIR$SITE_ROOT/shared/.env" ] && command -v php >/dev/null 2>&1; then
        if ( cd "$SCRATCH_DIR$SITE_ROOT/shared" && DB_DATABASE="$TEMP_DB" php artisan migrate:status >/dev/null 2>&1 ); then
            BOOT="PASS"
        else
            BOOT="FAIL"
        fi
    fi
    say "RESULT app_boot $BOOT php artisan migrate:status against the restored database"
fi

say "PHASE checksums"
UPLOAD_DIR="$SCRATCH_DIR$SITE_ROOT/shared/public/uploads"
if [ -d "$UPLOAD_DIR" ]; then
    SAMPLED=0
    MISMATCH=0
    for F in $(find "$UPLOAD_DIR" -type f 2>/dev/null | head -5); do
        REL="${F#$SCRATCH_DIR}"
        SAMPLED=$((SAMPLED + 1))
        if [ -f "$REL" ]; then
            A="$(sha256sum "$F" 2>/dev/null | awk '{print $1}')"
            B="$(sha256sum "$REL" 2>/dev/null | awk '{print $1}')"
            [ "$A" = "$B" ] || MISMATCH=$((MISMATCH + 1))
        fi
    done
    if [ "$SAMPLED" -eq 0 ]; then
        say "RESULT file_checksums SKIP no uploaded files to sample"
    elif [ "$MISMATCH" -gt 0 ]; then
        say "RESULT file_checksums FAIL ${MISMATCH}/${SAMPLED} sampled files differ from live"
    else
        say "RESULT file_checksums PASS ${SAMPLED}/${SAMPLED} sampled files match live"
    fi
else
    say "RESULT file_checksums SKIP no uploads directory in the snapshot"
fi

say "PHASE teardown"
if [ "$KEEP_SCRATCH" != "true" ]; then
    rm -rf "$SCRATCH_DIR"
    say "RESULT teardown PASS removed ${SCRATCH_DIR}"
else
    say "RESULT teardown SKIP kept ${SCRATCH_DIR}"
fi
if command -v mysql >/dev/null 2>&1; then
    MYSQL_PWD="$DB_PASS" mysql -u "$DB_USER" -e "DROP DATABASE IF EXISTS \`$TEMP_DB\`;" 2>/dev/null || true
fi

say "DRILL_DONE"
REMOTE
)"

step EXECUTING "Running the drill on ${HOST}"
set +e
DRILL_OUT="$(printf '%s' "${REMOTE_SCRIPT}" | ssh "${SSH_OPTS[@]}" "${SSH_DEST}" \
    "CLIENT='${CLIENT}' SITE_ROOT='${SITE_ROOT}' SCRATCH_DIR='${SCRATCH_DIR}' TEMP_DB='${TEMP_DB}' SNAPSHOT='${SNAPSHOT}' REPO='${REPO}' PASS_FILE='${PASS_FILE}' ENV_FILE='${ENV_FILE}' KEEP_SCRATCH='${KEEP_SCRATCH}' bash -s" 2>&1)"
DRILL_RC=$?
set -e

journal_log "VERIFYING" "Restore drill" "ssh ${SSH_DEST} bash -s < drill" "${DRILL_RC}" 0 \
    "$(printf '%s' "${DRILL_OUT}" | journal_sanitize)" "VERIFYING" "VERIFYING"

if [[ "${DRILL_RC}" -ne 0 ]] || ! printf '%s' "${DRILL_OUT}" | grep -q 'DRILL_DONE'; then
    fail_with 3 STOPPED "The drill did not complete on ${HOST} (ssh exit ${DRILL_RC}). Output: $(printf '%s' "${DRILL_OUT}" | tr '\n' ' ' | tail -c 400)"
fi

# ── Parse the check results ───────────────────────────────────────────────────
CHECK_ROW_COUNTS="SKIP"
CHECK_APP_BOOT="SKIP"
CHECK_FILE_CHECKSUMS="SKIP"
CHECK_NEWEST_RECORD="SKIP"
DETAIL_ROW_COUNTS=""
DETAIL_APP_BOOT=""
DETAIL_FILE_CHECKSUMS=""
DETAIL_NEWEST_RECORD=""

while IFS= read -r line; do
    case "${line}" in
        "RESULT row_counts "*)
            CHECK_ROW_COUNTS="$(printf '%s' "${line}" | awk '{print $3}')"
            DETAIL_ROW_COUNTS="$(printf '%s' "${line}" | cut -d' ' -f4-)" ;;
        "RESULT app_boot "*)
            CHECK_APP_BOOT="$(printf '%s' "${line}" | awk '{print $3}')"
            DETAIL_APP_BOOT="$(printf '%s' "${line}" | cut -d' ' -f4-)" ;;
        "RESULT file_checksums "*)
            CHECK_FILE_CHECKSUMS="$(printf '%s' "${line}" | awk '{print $3}')"
            DETAIL_FILE_CHECKSUMS="$(printf '%s' "${line}" | cut -d' ' -f4-)" ;;
        "RESULT newest_record_age "*)
            CHECK_NEWEST_RECORD="$(printf '%s' "${line}" | awk '{print $3}')"
            DETAIL_NEWEST_RECORD="$(printf '%s' "${line}" | cut -d' ' -f4-)" ;;
    esac
done <<< "${DRILL_OUT}"

step VERIFYING "row_counts: ${CHECK_ROW_COUNTS} (${DETAIL_ROW_COUNTS})"
step VERIFYING "app_boot: ${CHECK_APP_BOOT} (${DETAIL_APP_BOOT})"
step VERIFYING "file_checksums: ${CHECK_FILE_CHECKSUMS} (${DETAIL_FILE_CHECKSUMS})"
step VERIFYING "newest_record_age: ${CHECK_NEWEST_RECORD} (${DETAIL_NEWEST_RECORD})"

OVERALL="DRILLED"
if [[ "${CHECK_ROW_COUNTS}" == "FAIL" || "${CHECK_APP_BOOT}" == "FAIL" || "${CHECK_FILE_CHECKSUMS}" == "FAIL" ]]; then
    OVERALL="FAILED"
fi

if [[ "${CHECK_ROW_COUNTS}" == "SKIP" || "${CHECK_APP_BOOT}" == "SKIP" ]]; then
    result_warn "Some checks were skipped; the drill did not prove those properties"
fi

result_add_string "action" "drill"
result_add_string "snapshot_id" "${SNAPSHOT}"
result_add_raw "checks" "{\"row_counts\":$(json_string "${CHECK_ROW_COUNTS}"),\"app_boot\":$(json_string "${CHECK_APP_BOOT}"),\"file_checksums\":$(json_string "${CHECK_FILE_CHECKSUMS}"),\"newest_record_age\":$(json_string "${CHECK_NEWEST_RECORD}")}"
result_add_raw "scratch_destroyed" "$([[ "${KEEP_SCRATCH}" == "true" ]] && printf 'false' || printf 'true')"
result_add_string "journal" "$(journal_path)"

if [[ "${OVERALL}" == "FAILED" ]]; then
    step FAILED "The drill found a problem: the backup is not proven restorable"
    emit_result "FAILED"
    exit 4
fi

step DRILLED "The backup restored successfully and passed every check"
emit_result "DRILLED"
exit 0
