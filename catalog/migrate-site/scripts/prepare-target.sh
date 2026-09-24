#!/usr/bin/env bash
# prepare-target.sh — Phase 2 of migrate-site: prepare the target host
#
# Usage:
#   prepare-target.sh --client <name> [--source <alias>] [--target <alias>]
#                     [--target-root <path>] [--skip-packages] [--skip-database]
#                     [--dry-run]
#                     [--confirm "CONFIRM PREPARE"]
#
# The database name, user, and password are read from the SOURCE's
# shared/.env so that the application configuration stays valid after cutover.
# The password is written over stdin and never appears in argv on either host.
#
# Approval (see conventions/approvals.md):
#   CONFIRM PREPARE           before mutating the target host
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
SOURCE_OVERRIDE=""
TARGET_OVERRIDE=""
TARGET_ROOT_OVERRIDE=""
MYSQL_ADMIN="sudo mysql --protocol=socket"
SKIP_PACKAGES=false
SKIP_DATABASE=false
ACTION=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)        CLIENT="${2:-}"; shift 2 ;;
        --source)        SOURCE_OVERRIDE="${2:-}"; shift 2 ;;
        --target)        TARGET_OVERRIDE="${2:-}"; shift 2 ;;
        --target-root)   TARGET_ROOT_OVERRIDE="${2:-}"; shift 2 ;;
        --mysql-admin)   MYSQL_ADMIN="${2:-}"; shift 2 ;;
        --skip-packages) SKIP_PACKAGES=true; shift ;;
        --skip-database) SKIP_DATABASE=true; shift ;;
        --action)        ACTION="${2:-}"; shift 2 ;;
        --dry-run)       DRY_RUN=true; shift ;;
        --confirm)       confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }
if [[ -n "${ACTION}" && "${ACTION}" != "prepare" ]]; then
    printf 'ERROR: --action %s does not match this script (prepare)\n' "${ACTION}" >&2
    exit 2
fi

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "migrate-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root domain stack

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report

SOURCE_HOST="${SOURCE_OVERRIDE:-${MIGRATION_SOURCE_HOST:-${HOST}}}"
TARGET_HOST="${TARGET_OVERRIDE:-${MIGRATION_TARGET_HOST}}"
TARGET_ROOT="${TARGET_ROOT_OVERRIDE:-${MIGRATION_TARGET_ROOT:-${SITE_ROOT}}}"

[[ -n "${TARGET_HOST}" ]] || fail_with 5 STOPPED "No target host: pass --target or set migration.target_host"
migration_require_alias "${SOURCE_HOST}" "source"
migration_require_alias "${TARGET_HOST}" "target"

journal_init "migrate-site" "${CLIENT}" "${MANIFEST}"

SOURCE_SSH="$(ssh_target "${SOURCE_HOST}" "${DEPLOY_USER}")"
TARGET_SSH="$(ssh_target "${TARGET_HOST}" "${DEPLOY_USER}")"

# ── Preflight ─────────────────────────────────────────────────────────────────
migration_require_phase "${CLIENT}" "inventory" "The inventory phase" 12

step OBSERVING "Prepare ${TARGET_HOST} for ${CLIENT} (target root ${TARGET_ROOT})"

set +e
SOURCE_ENV_RAW="$(ssh "${SSH_OPTS[@]}" "${SOURCE_SSH}" "cat '${SITE_ROOT}/shared/.env' 2>/dev/null")"
SOURCE_ENV_RC=$?
set -e
if [[ "${SOURCE_ENV_RC}" -ne 0 ]]; then
    fail_with 5 STOPPED "Could not read ${SITE_ROOT}/shared/.env on the source ${SOURCE_HOST}"
fi

env_value() {
    printf '%s\n' "${SOURCE_ENV_RAW}" | grep -m1 "^$1=" | cut -d= -f2- | tr -d '"' | tr -d "'"
}

DB_NAME_EFFECTIVE="$(env_value DB_DATABASE)"
DB_USER_EFFECTIVE="$(env_value DB_USERNAME)"
DB_PASS_EFFECTIVE="$(env_value DB_PASSWORD)"

[[ -n "${DB_NAME_EFFECTIVE}" ]] || fail_with 5 STOPPED "DB_DATABASE is not set in the source .env"
[[ -n "${DB_USER_EFFECTIVE}" ]] || fail_with 5 STOPPED "DB_USERNAME is not set in the source .env"
[[ -n "${DB_PASS_EFFECTIVE}" ]] || fail_with 5 STOPPED "DB_PASSWORD is not set in the source .env"

for pair in "DB_DATABASE:${DB_NAME_EFFECTIVE}" "DB_USERNAME:${DB_USER_EFFECTIVE}"; do
    name="${pair%%:*}"
    value="${pair#*:}"
    if ! [[ "${value}" =~ ^[A-Za-z0-9_]+$ ]]; then
        fail_with 5 STOPPED "${name} '${value}' contains characters that are unsafe to interpolate into SQL"
    fi
done

step OBSERVING "Target database will be ${DB_NAME_EFFECTIVE} owned by ${DB_USER_EFFECTIVE}"

{
    printf '\nPrepare plan for %s\n' "${TARGET_HOST}"
    printf '  Target root:     %s\n' "${TARGET_ROOT}"
    printf '  Stack:           %s\n' "${STACK}"
    printf '  PHP:             %s\n' "${PHP:-unset}"
    printf '  Database:        %s (user %s)\n' "${DB_NAME_EFFECTIVE}" "${DB_USER_EFFECTIVE}"
    printf '  Packages:        %s\n' "$([[ "${SKIP_PACKAGES}" == "true" ]] && printf 'skipped' || printf 'will install')"
    printf '  Directory tree:  %s/{shared/{storage,public/uploads},releases}\n' "${TARGET_ROOT}"
    printf '  Gate required:   CONFIRM PREPARE\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no mutations performed"
    result_add_string "action" "prepare"
    result_add_string "source_host" "${SOURCE_HOST}"
    result_add_string "target_host" "${TARGET_HOST}"
    result_add_string "target_root" "${TARGET_ROOT}"
    result_add_string "db_name" "${DB_NAME_EFFECTIVE}"
    emit_result "PLANNED"
    exit 0
fi

# ── Gate ──────────────────────────────────────────────────────────────────────
step CONFIRMING "Checking approval gate"
require_confirm "CONFIRM PREPARE" "PREPARE" "Install packages, create the directory tree, and create the database on ${TARGET_HOST}."

# ── Packages ──────────────────────────────────────────────────────────────────
if [[ "${SKIP_PACKAGES}" == "false" ]]; then
    step EXECUTING "Ensuring the runtime matches the source"
    PKG_LIST=""
    case "${STACK}" in
        laravel|wordpress)
            if [[ -n "${PHP}" ]]; then
                PKG_LIST="php${PHP}-fpm php${PHP}-cli php${PHP}-mbstring php${PHP}-xml php${PHP}-curl php${PHP}-mysql php${PHP}-zip php${PHP}-gd php${PHP}-bcmath"
            else
                result_warn "The manifest has no 'php' field; skipping package installation"
            fi
            ;;
        node)
            PKG_LIST="nodejs npm"
            ;;
        static)
            PKG_LIST=""
            ;;
    esac

    if [[ -n "${PKG_LIST}" ]]; then
        set +e
        PKG_OUT="$(ssh "${SSH_OPTS[@]}" "${TARGET_SSH}" "DEBIAN_FRONTEND=noninteractive apt-get install -y ${PKG_LIST} 2>&1 | tail -10")"
        PKG_RC=$?
        set -e
        journal_log "EXECUTING" "Install packages" "apt-get install ${PKG_LIST}" "${PKG_RC}" 0 \
            "$(printf '%s' "${PKG_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"
        if [[ "${PKG_RC}" -ne 0 ]]; then
            fail_with 6 FAILED "Package installation failed on ${TARGET_HOST}: $(printf '%s' "${PKG_OUT}" | tr '\n' ' ' | tail -c 300)"
        fi
        step EXECUTING "Packages installed"
    fi
fi

# ── Directory tree ────────────────────────────────────────────────────────────
step EXECUTING "Creating the directory tree under ${TARGET_ROOT}"
set +e
TREE_OUT="$(ssh "${SSH_OPTS[@]}" "${TARGET_SSH}" "
    set -e
    mkdir -p '${TARGET_ROOT}/shared/storage' '${TARGET_ROOT}/shared/public/uploads' '${TARGET_ROOT}/releases'
    chown -R '${DEPLOY_USER}:${DEPLOY_USER}' '${TARGET_ROOT}' 2>/dev/null || true
    chmod 0755 '${TARGET_ROOT}' '${TARGET_ROOT}/shared'
    stat -c '%n %U:%G' '${TARGET_ROOT}' '${TARGET_ROOT}/shared' 2>/dev/null || true
")"
TREE_RC=$?
set -e
if [[ "${TREE_RC}" -ne 0 ]]; then
    fail_with 14 FAILED "Could not create the directory tree on ${TARGET_HOST}: ${TREE_OUT}"
fi
printf '%s\n' "${TREE_OUT}" >&2

# ── Database ──────────────────────────────────────────────────────────────────
DB_CREATED=false
if [[ "${SKIP_DATABASE}" == "false" ]]; then
    step EXECUTING "Creating database ${DB_NAME_EFFECTIVE} and user ${DB_USER_EFFECTIVE}"

    SQL_PW="${DB_PASS_EFFECTIVE//\'/\'\'}"
    SQL="$(cat <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME_EFFECTIVE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER_EFFECTIVE}'@'localhost' IDENTIFIED BY '${SQL_PW}';
ALTER USER '${DB_USER_EFFECTIVE}'@'localhost' IDENTIFIED BY '${SQL_PW}';
GRANT ALL PRIVILEGES ON \`${DB_NAME_EFFECTIVE}\`.* TO '${DB_USER_EFFECTIVE}'@'localhost';
FLUSH PRIVILEGES;
SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${DB_NAME_EFFECTIVE}';
SQL
)"

    # SQL travels over stdin: the password never appears in argv on either host.
    set +e
    DB_OUT="$(printf '%s\n' "${SQL}" | ssh "${SSH_OPTS[@]}" "${TARGET_SSH}" "${MYSQL_ADMIN}" 2>&1)"
    DB_RC=$?
    set -e

    journal_log "EXECUTING" "Create database and user" "${MYSQL_ADMIN} < stdin" "${DB_RC}" 0 \
        "$(printf '%s' "${DB_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"

    if [[ "${DB_RC}" -ne 0 ]]; then
        fail_with 4 FAILED "Database preparation failed on ${TARGET_HOST} (try --mysql-admin): $(printf '%s' "${DB_OUT}" | tr '\n' ' ' | tail -c 300)"
    fi
    DB_CREATED=true
    step EXECUTING "Database ready"
fi

# ── Target .env placeholder ───────────────────────────────────────────────────
step EXECUTING "Writing the target .env from the source (mode 0600)"
set +e
printf '%s\n' "${SOURCE_ENV_RAW}" | ssh "${SSH_OPTS[@]}" "${TARGET_SSH}" \
    "umask 077 && cat > '${TARGET_ROOT}/shared/.env' && chmod 0600 '${TARGET_ROOT}/shared/.env'" >/dev/null 2>&1
ENV_RC=$?
set -e
[[ "${ENV_RC}" -eq 0 ]] || result_warn "Could not seed ${TARGET_ROOT}/shared/.env on the target"

migration_state_set "${CLIENT}" "prepare" "target_root=${TARGET_ROOT} db=${DB_NAME_EFFECTIVE}"

step PREPARED "Target ${TARGET_HOST} prepared"

result_add_string "action" "prepare"
result_add_string "source_host" "${SOURCE_HOST}"
result_add_string "target_host" "${TARGET_HOST}"
result_add_string "target_root" "${TARGET_ROOT}"
result_add_string "db_name" "${DB_NAME_EFFECTIVE}"
result_add_raw "database_created" "${DB_CREATED}"
result_add_raw "packages_installed" "$([[ "${SKIP_PACKAGES}" == "true" ]] && printf 'false' || printf 'true')"
result_add_string "journal" "$(journal_path)"

emit_result "PREPARED"
exit 0
