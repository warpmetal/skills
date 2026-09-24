#!/usr/bin/env bash
# deploy.sh — Zero-downtime Git-based production deployment for deploy-site
#
# Usage:
#   deploy.sh --client <name> [--commit <sha>] [--ref <ref>] [--no-migrations] [--dry-run]
#             [--confirm "<STRING>"]...
#
# Approvals (see conventions/approvals.md) — one --confirm flag per gate this run needs:
#   CONFIRM DEPLOY            always
#   CONFIRM MIGRATIONS        unless --no-migrations
#   CONFIRM ACTIVATE          always
#   CONFIRM RELOAD            always
#   CONFIRM RESTART WORKERS   always
#   CONFIRM PRUNE             always
#
# Every gate is checked before the first mutation. If one is missing the script
# mutates nothing and exits 11 with status CONFIRMATION_REQUIRED.
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

# ── Defaults ──────────────────────────────────────────────────────────────────
CLIENT=""
TARGET_COMMIT=""
TARGET_REF=""
SKIP_MIGRATIONS=false
DRY_RUN=false
HEALTH_ATTEMPTS=5
HEALTH_INTERVAL=3
KEEP_RELEASES=5

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)        CLIENT="${2:-}"; shift 2 ;;
        --commit)        TARGET_COMMIT="${2:-}"; shift 2 ;;
        --ref)           TARGET_REF="${2:-}"; shift 2 ;;
        --no-migrations) SKIP_MIGRATIONS=true; shift ;;
        --dry-run)       DRY_RUN=true; shift ;;
        --confirm)       confirm_add "${2:-}"; shift 2 ;;
        --attempts)      HEALTH_ATTEMPTS="${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "deploy-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root domain stack health_url repo_url

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
manifest_validate_ssh

journal_init "deploy-site" "${CLIENT}" "${MANIFEST}"

RELEASES_DIR="${SITE_ROOT}/releases"
SHARED_DIR="${SITE_ROOT}/shared"
MIRROR_DIR="${SITE_ROOT}/.git"
LOCKFILE="/tmp/deploy-${CLIENT}.lock"
TARGET_REF="${TARGET_REF:-${TARGET_COMMIT:-${BRANCH}}}"

SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"

# Remote execution helper.
# IMPORTANT: never call this as `out=$(try_rsh ...)` — the command substitution would
# run in a subshell and REMOTE_RC would be lost. Read $REMOTE_OUT and $REMOTE_RC.
REMOTE_OUT=""
REMOTE_RC=0
try_rsh() {
    set +e
    REMOTE_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "$1" 2>&1)"
    REMOTE_RC=$?
    set -e
    return 0
}

CURRENT_RELEASE_ID=""
PREVIOUS_RELEASE_ID=""
RELEASE_ID=""
RELEASE_DIR=""
RESOLVED_SHA=""
SWAP_DONE=false
MIGRATIONS_ATTEMPTED=false

WILL_MIGRATE=false
if [[ "${SKIP_MIGRATIONS}" == "false" && "${STACK}" == "laravel" ]]; then
    WILL_MIGRATE=true
fi

# ── Preflight (read-only) ─────────────────────────────────────────────────────
step OBSERVING "Client=${CLIENT} host=${HOST} stack=${STACK} site_root=${SITE_ROOT}"
step OBSERVING "Ref to deploy: ${TARGET_REF}"

if [[ -n "${TARGET_COMMIT}" && ! "${TARGET_COMMIT}" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
    fail_with 5 STOPPED "--commit must be a hexadecimal SHA, got: ${TARGET_COMMIT}"
fi

try_rsh "readlink -f '${SITE_ROOT}/current' 2>/dev/null || true"
CURRENT_RELEASE_ID="$(basename "${REMOTE_OUT}" 2>/dev/null || true)"

try_rsh "
    cd '${RELEASES_DIR}' 2>/dev/null || exit 0
    for d in \$(ls -1t); do
        [ \"\$d\" = '${CURRENT_RELEASE_ID}' ] && continue
        echo \"\$d\"
        break
    done
"
PREVIOUS_RELEASE_ID="$(printf '%s' "${REMOTE_OUT}" | head -1 | tr -d '[:space:]')"

try_rsh "df -h '${SITE_ROOT}' 2>/dev/null | tail -1 | awk '{print \$5}'"
DISK_PCT="$(printf '%s' "${REMOTE_OUT}" | tr -d '%[:space:]')"
if [[ "${DISK_PCT}" =~ ^[0-9]+$ ]] && (( DISK_PCT > 90 )); then
    fail_with 13 STOPPED "Disk usage is ${DISK_PCT}% on ${HOST}; refusing to deploy"
fi

step OBSERVING "Current release: ${CURRENT_RELEASE_ID:-none}"
step OBSERVING "Rollback target: ${PREVIOUS_RELEASE_ID:-none}"

# ── Plan ──────────────────────────────────────────────────────────────────────
GATES=("CONFIRM DEPLOY" "DEPLOY")
if [[ "${WILL_MIGRATE}" == "true" ]]; then
    GATES+=("CONFIRM MIGRATIONS" "MIGRATIONS")
fi
GATES+=("CONFIRM ACTIVATE" "ACTIVATE")
GATES+=("CONFIRM RELOAD" "RELOAD")
GATES+=("CONFIRM RESTART WORKERS" "RESTART WORKERS")
GATES+=("CONFIRM PRUNE" "PRUNE")

{
    printf '\nDeployment plan for %s (%s)\n' "${CLIENT}" "${HOST}"
    printf '  Ref:              %s\n' "${TARGET_REF}"
    printf '  Stack:            %s\n' "${STACK}"
    printf '  Site root:        %s\n' "${SITE_ROOT}"
    printf '  Health URL:       %s\n' "${HEALTH_URL}"
    printf '  Current release:  %s\n' "${CURRENT_RELEASE_ID:-none}"
    printf '  Rollback target:  %s\n' "${PREVIOUS_RELEASE_ID:-none}"
    printf '  Migrations:       %s\n' "$([[ "${WILL_MIGRATE}" == "true" ]] && printf 'will run' || printf 'will not run')"
    printf '  Prune:            keep the last %s releases\n' "${KEEP_RELEASES}"
    printf '  Disk used:        %s%%\n' "${DISK_PCT:-unknown}"
    printf '  Gates required:   %s\n' "$(printf '%s ' "${GATES[@]}")"
    printf '\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no mutations performed"
    result_add_string "action" "deploy"
    result_add_string "target_ref" "${TARGET_REF}"
    result_add_string "current_release_id" "${CURRENT_RELEASE_ID}"
    result_add_string_array "gates_required" "${GATES[@]}"
    result_add_string "plan" "create release, checkout, link shared, install dependencies, build, migrate, warm caches, swap, reload, restart workers, health gate, prune"
    emit_result "PLANNED"
    exit 0
fi

# ── Gates ─────────────────────────────────────────────────────────────────────
step CONFIRMING "Checking approval gates"
require_confirms "${GATES[@]}"

# ── Lock ──────────────────────────────────────────────────────────────────────
step EXECUTING "Acquiring deployment lock"
exec 9>"${LOCKFILE}"
if ! flock -n 9; then
    fail_with 12 STOPPED "Another deployment holds ${LOCKFILE}"
fi

release_lock() {
    flock -u 9 2>/dev/null || true
    exec 9>&- 2>/dev/null || true
}
trap release_lock EXIT

# Remove a half-built release when the swap never happened.
discard_release() {
    if [[ "${SWAP_DONE}" == "false" && -n "${RELEASE_DIR}" ]]; then
        try_rsh "rm -rf '${RELEASE_DIR}'" || true
        step FAILED "Removed orphan release ${RELEASE_ID}"
    fi
}

# ── Resolve the target to an exact SHA ────────────────────────────────────────
step EXECUTING "Preparing the server-side Git mirror"
try_rsh "
    set -e
    if [ ! -d '${MIRROR_DIR}' ]; then
        git init --bare -q '${MIRROR_DIR}'
    fi
    if ! git --git-dir='${MIRROR_DIR}' remote get-url origin >/dev/null 2>&1; then
        git --git-dir='${MIRROR_DIR}' remote add origin '${REPO_URL}'
    fi
"
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    fail_with 4 FAILED "Could not prepare the Git mirror at ${MIRROR_DIR}: ${REMOTE_OUT}"
fi

step EXECUTING "Resolving ${TARGET_REF} to an exact commit"
try_rsh "
    set -e
    cd '${MIRROR_DIR}'
    if printf '%s' '${TARGET_REF}' | grep -Eq '^[0-9a-fA-F]{40}\$'; then
        git cat-file -e '${TARGET_REF}^{commit}' 2>/dev/null || git fetch -q origin '${TARGET_REF}' 2>/dev/null || true
        git cat-file -e '${TARGET_REF}^{commit}'
        git rev-parse '${TARGET_REF}^{commit}'
    else
        git fetch -q origin '${TARGET_REF}' 2>/dev/null || git fetch -q origin 2>/dev/null
        git rev-parse --verify 'FETCH_HEAD^{commit}' 2>/dev/null || git rev-parse --verify 'origin/${TARGET_REF}^{commit}'
    fi
"
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    fail_with 4 FAILED "Could not resolve ${TARGET_REF} on ${HOST}: ${REMOTE_OUT}"
fi

RESOLVED_SHA="$(printf '%s\n' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"
if [[ ! "${RESOLVED_SHA}" =~ ^[0-9a-fA-F]{40}$ ]]; then
    fail_with 4 FAILED "Ref ${TARGET_REF} did not resolve to a full SHA (got: ${RESOLVED_SHA})"
fi

RELEASE_ID="$(date -u +%Y%m%d-%H%M%S)-${RESOLVED_SHA:0:7}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"
journal_log "EXECUTING" "Resolved target" "git rev-parse ${TARGET_REF}" 0 0 "${RESOLVED_SHA}" "PLANNING" "EXECUTING"
step EXECUTING "Deploying ${RESOLVED_SHA} as release ${RELEASE_ID}"

# ── Create the release ────────────────────────────────────────────────────────
step EXECUTING "Creating release directory and checking out"
try_rsh "
    set -e
    mkdir -p '${RELEASE_DIR}'
    git --git-dir='${MIRROR_DIR}' --work-tree='${RELEASE_DIR}' checkout -f '${RESOLVED_SHA}' -- .
"
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    discard_release
    fail_with 4 FAILED "Checkout failed for ${RESOLVED_SHA}: ${REMOTE_OUT}"
fi

# ── Shared resources ──────────────────────────────────────────────────────────
step EXECUTING "Linking shared paths"
try_rsh "
    set -e
    if [ ! -f '${SHARED_DIR}/.env' ]; then
        echo 'MISSING_SHARED_ENV'
        exit 1
    fi
    mkdir -p '${SHARED_DIR}/storage'
    ln -sfn '${SHARED_DIR}/.env' '${RELEASE_DIR}/.env'
    [ -d '${SHARED_DIR}/storage' ] && ln -sfn '${SHARED_DIR}/storage' '${RELEASE_DIR}/storage' || true
    if [ -d '${SHARED_DIR}/public/uploads' ]; then
        mkdir -p '${RELEASE_DIR}/public'
        ln -sfn '${SHARED_DIR}/public/uploads' '${RELEASE_DIR}/public/uploads'
    fi
"
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    discard_release
    fail_with 5 STOPPED "Shared path setup failed (is ${SHARED_DIR}/.env present?): ${REMOTE_OUT}"
fi

# ── Dependencies and build ────────────────────────────────────────────────────
if [[ "${STACK}" == "laravel" || "${STACK}" == "node" ]]; then
    step EXECUTING "Installing dependencies (${STACK})"
    if [[ "${STACK}" == "laravel" ]]; then
        DEP_CMD="composer install --no-dev --optimize-autoloader --no-interaction"
    else
        DEP_CMD="(npm ci --omit=dev 2>/dev/null || npm ci)"
    fi
    try_rsh "cd '${RELEASE_DIR}' && ${DEP_CMD}"
    if [[ "${REMOTE_RC}" -ne 0 ]]; then
        discard_release
        fail_with 6 FAILED "Dependency install failed: ${REMOTE_OUT}"
    fi

    step EXECUTING "Building assets"
    try_rsh "cd '${RELEASE_DIR}' && npm run build"
    if [[ "${REMOTE_RC}" -ne 0 ]]; then
        if printf '%s' "${REMOTE_OUT}" | grep -qi 'missing script\|ENOENT.*package.json\|Could not read package.json'; then
            step EXECUTING "No build step present; continuing"
        else
            discard_release
            fail_with 6 FAILED "Asset build failed: ${REMOTE_OUT}"
        fi
    fi
else
    step EXECUTING "No dependency install or build required for ${STACK}"
fi

# ── Migrations ────────────────────────────────────────────────────────────────
if [[ "${WILL_MIGRATE}" == "true" ]]; then
    step EXECUTING "Running migrations"
    MIGRATIONS_ATTEMPTED=true

    set +e
    MIGRATION_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "cd '${RELEASE_DIR}' && php artisan migrate --force 2>&1")"
    MIGRATION_RC=$?
    set -e

    journal_log "EXECUTING" "Migrations" "php artisan migrate --force" "${MIGRATION_RC}" 0 \
        "$(printf '%s' "${MIGRATION_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

    if [[ "${MIGRATION_RC}" -ne 0 ]]; then
        step FAILED "Migrations failed (exit ${MIGRATION_RC})"
        try_rsh "cd '${RELEASE_DIR}' && php artisan migrate:status 2>&1 | tail -20"
        printf '%s\n' "${REMOTE_OUT}" >&2

        result_add_string "action" "deploy"
        result_add_string "git_commit" "${RESOLVED_SHA}"
        result_add_string "release_id" "${RELEASE_ID}"
        result_add_string "previous_release_id" "${CURRENT_RELEASE_ID}"
        result_add_string "migration_status" "$(printf '%s' "${REMOTE_OUT}" | tr '\n' ' ')"
        result_add_raw "rollback_performed" "false"
        result_add_raw "migrations_attempted" "true"

        discard_release
        fail_with 7 FAILED "Migration failed. The live release was left untouched and automatic rollback is refused because migrations were attempted. Resolve the migration manually."
    fi
    step EXECUTING "Migrations completed"
    # Durable marker so rollback.sh can refuse without a shared /tmp file.
    try_rsh "touch '${RELEASE_DIR}/.migrations-ran'" || true
fi

# ── Warm caches ───────────────────────────────────────────────────────────────
if [[ "${STACK}" == "laravel" ]]; then
    step EXECUTING "Warming caches"
    try_rsh "cd '${RELEASE_DIR}' && php artisan config:cache && php artisan route:cache && php artisan view:cache"
    if [[ "${REMOTE_RC}" -ne 0 ]]; then
        result_warn "Cache warm incomplete: $(printf '%s' "${REMOTE_OUT}" | tr '\n' ' ')"
    fi
fi

# ── Activate ──────────────────────────────────────────────────────────────────
step EXECUTING "Atomically activating ${RELEASE_ID}"
try_rsh "
    set -e
    ln -sfn '${RELEASE_DIR}' '${SITE_ROOT}/current.tmp'
    mv -Tf '${SITE_ROOT}/current.tmp' '${SITE_ROOT}/current'
"
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    discard_release
    fail_with 10 FAILED "Atomic swap failed; 'current' still points at ${CURRENT_RELEASE_ID:-none}: ${REMOTE_OUT}"
fi
SWAP_DONE=true
journal_log "EXECUTING" "Atomic swap" "ln -sfn ... && mv -Tf" 0 0 "${RELEASE_DIR}" "EXECUTING" "EXECUTING"

# ── Reload runtime ────────────────────────────────────────────────────────────
step EXECUTING "Reloading runtime (${STACK})"
case "${STACK}" in
    laravel|wordpress)
        try_rsh "systemctl reload php*-fpm 2>&1 || systemctl reload php-fpm 2>&1"
        [[ "${REMOTE_RC}" -eq 0 ]] || result_warn "PHP-FPM reload reported an error: $(printf '%s' "${REMOTE_OUT}" | tr '\n' ' ')"
        ;;
    node)
        try_rsh "systemctl reload nginx 2>&1; systemctl restart '${APP_UNIT}' 2>&1"
        [[ "${REMOTE_RC}" -eq 0 ]] || result_warn "Node runtime restart reported an error: $(printf '%s' "${REMOTE_OUT}" | tr '\n' ' ')"
        ;;
    static)
        try_rsh "systemctl reload nginx 2>&1"
        [[ "${REMOTE_RC}" -eq 0 ]] || result_warn "nginx reload reported an error: $(printf '%s' "${REMOTE_OUT}" | tr '\n' ' ')"
        ;;
esac

# ── Restart workers ───────────────────────────────────────────────────────────
step EXECUTING "Restarting queue workers"
if [[ -n "${WORKER_UNIT}" ]]; then
    try_rsh "systemctl restart '${WORKER_UNIT}'1 2>&1"
    [[ "${REMOTE_RC}" -eq 0 ]] || result_warn "Worker restart reported an error for ${WORKER_UNIT}1: $(printf '%s' "${REMOTE_OUT}" | tr '\n' ' ')"
fi
if [[ "${STACK}" == "laravel" ]]; then
    try_rsh "cd '${SITE_ROOT}/current' && php artisan queue:restart 2>&1"
    [[ "${REMOTE_RC}" -eq 0 ]] || result_warn "queue:restart reported an error: $(printf '%s' "${REMOTE_OUT}" | tr '\n' ' ')"
fi

# ── Health gate ───────────────────────────────────────────────────────────────
step VERIFYING "Polling ${HEALTH_URL}"
health_passed=0
health_failed=0
for i in $(seq 1 "${HEALTH_ATTEMPTS}"); do
    http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${HEALTH_URL}" 2>/dev/null || printf '000')"
    if [[ "${http_code}" == "200" ]]; then
        health_passed=$((health_passed + 1))
        step VERIFYING "Health check ${i}/${HEALTH_ATTEMPTS}: OK"
    else
        health_failed=$((health_failed + 1))
        step VERIFYING "Health check ${i}/${HEALTH_ATTEMPTS}: HTTP ${http_code}"
    fi
    [[ "${i}" -lt "${HEALTH_ATTEMPTS}" ]] && sleep "${HEALTH_INTERVAL}"
done

if [[ "${health_failed}" -gt 0 ]]; then
    step FAILED "Health gate failed (${health_failed}/${HEALTH_ATTEMPTS})"

    result_add_string "action" "deploy"
    result_add_string "git_commit" "${RESOLVED_SHA}"
    result_add_string "release_id" "${RELEASE_ID}"
    result_add_string "previous_release_id" "${CURRENT_RELEASE_ID}"
    result_add_raw "health_checks" "{\"attempts\":${HEALTH_ATTEMPTS},\"passed\":${health_passed},\"url\":$(json_string "${HEALTH_URL}")}"

    if [[ "${MIGRATIONS_ATTEMPTED}" == "true" ]]; then
        result_add_raw "rollback_performed" "false"
        result_add_raw "migrations_attempted" "true"
        fail_with 9 FAILED "Health gate failed and migrations were attempted in this deploy. Automatic rollback is refused. Release ${RELEASE_ID} is active and needs manual resolution."
    fi

    if [[ -z "${PREVIOUS_RELEASE_ID}" ]]; then
        result_add_raw "rollback_performed" "false"
        fail_with 10 FAILED "Health gate failed and there is no previous release to roll back to."
    fi

    step ROLLING_BACK "Restoring ${PREVIOUS_RELEASE_ID}"
    try_rsh "
        set -e
        ln -sfn '${RELEASES_DIR}/${PREVIOUS_RELEASE_ID}' '${SITE_ROOT}/current.tmp'
        mv -Tf '${SITE_ROOT}/current.tmp' '${SITE_ROOT}/current'
    "
    if [[ "${REMOTE_RC}" -ne 0 ]]; then
        result_add_raw "rollback_performed" "false"
        fail_with 10 FAILED "Automatic rollback failed: ${REMOTE_OUT}"
    fi

    case "${STACK}" in
        laravel|wordpress) try_rsh "systemctl reload php*-fpm 2>/dev/null || true" ;;
        node)              try_rsh "systemctl restart '${APP_UNIT}' 2>/dev/null || true" ;;
        static)            try_rsh "systemctl reload nginx 2>/dev/null || true" ;;
    esac

    result_add_raw "rollback_performed" "true"
    result_add_string "rolled_back_to" "${PREVIOUS_RELEASE_ID}"
    emit_result "ROLLED_BACK"
    exit 9
fi

# ── Prune ─────────────────────────────────────────────────────────────────────
step EXECUTING "Pruning releases beyond the last ${KEEP_RELEASES}"
try_rsh "
    cd '${RELEASES_DIR}' 2>/dev/null || exit 0
    ls -1t | tail -n +$((KEEP_RELEASES + 1)) | while IFS= read -r old; do
        [ -n \"\$old\" ] && rm -rf -- \"\$old\"
    done
"

# ── Result ────────────────────────────────────────────────────────────────────
step READY "Deployment complete: ${RELEASE_ID}"

result_add_string "action" "deploy"
result_add_string "git_commit" "${RESOLVED_SHA}"
result_add_string "target_ref" "${TARGET_REF}"
result_add_string "release_id" "${RELEASE_ID}"
result_add_string "previous_release_id" "${CURRENT_RELEASE_ID}"
result_add_raw "health_checks" "{\"attempts\":${HEALTH_ATTEMPTS},\"passed\":${health_passed},\"url\":$(json_string "${HEALTH_URL}")}"
result_add_raw "rollback_performed" "false"
result_add_raw "migrations_attempted" "$([[ "${MIGRATIONS_ATTEMPTED}" == "true" ]] && printf 'true' || printf 'false')"
result_add_string "journal" "$(journal_path)"

emit_result "READY"
release_lock
exit 0
