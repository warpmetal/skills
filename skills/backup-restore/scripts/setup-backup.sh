#!/usr/bin/env bash
# setup-backup.sh — Initialise restic backups for backup-restore
#
# Usage:
#   setup-backup.sh --client <name> [--repo <url>] [--schedule <cron>]
#                   [--escrow-location <string>] [--password-file <path>]
#                   [--env-file <path>] [--dry-run]
#                   [--confirm "CONFIRM BACKUP SETUP"] [--confirm "CONFIRM PRUNE"]
#
# The restic password is never prompted for and never placed in a command line.
# It is read from (in order): $RESTIC_PASSWORD, --password-file, or stdin.
#
# Approvals (see conventions/approvals.md):
#   CONFIRM BACKUP SETUP      before creating the repo, files, and cron entry
#   CONFIRM PRUNE             before enabling the nightly retention prune
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
REPO_OVERRIDE=""
SCHEDULE="0 3 * * *"
ESCROW_LOCATION=""
PASSWORD_FILE=""
ENV_FILE_SRC=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)          CLIENT="${2:-}"; shift 2 ;;
        --repo)            REPO_OVERRIDE="${2:-}"; shift 2 ;;
        --schedule)        SCHEDULE="${2:-}"; shift 2 ;;
        --escrow-location) ESCROW_LOCATION="${2:-}"; shift 2 ;;
        --password-file)   PASSWORD_FILE="${2:-}"; shift 2 ;;
        --env-file)        ENV_FILE_SRC="${2:-}"; shift 2 ;;
        --dry-run)         DRY_RUN=true; shift ;;
        --confirm)         confirm_add "${2:-}"; shift 2 ;;
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

journal_init "backup-restore" "${CLIENT}" "${MANIFEST}"

REPO="${REPO_OVERRIDE:-${BACKUP_REPO}}"
HEALTHCHECK_URL="${BACKUP_HEALTHCHECK}"
SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/run-backup.sh"

REMOTE_OUT=""
REMOTE_RC=0
try_rsh() {
    set +e
    REMOTE_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "$1" 2>&1)"
    REMOTE_RC=$?
    set -e
    return 0
}

# ── Preflight (read-only) ─────────────────────────────────────────────────────
step OBSERVING "Client=${CLIENT} host=${HOST} repo=${REPO:-unset}"

if [[ -z "${REPO}" ]]; then
    fail_with 5 STOPPED "backup.repo is required in the manifest (or pass --repo)"
fi

if [[ -z "${HEALTHCHECK_URL}" ]]; then
    fail_with 5 STOPPED "backup.healthcheck is required: setup must not complete without a dead-man's switch. Create a check at https://healthchecks.io and add its ping URL to the manifest."
fi

if [[ -z "${ESCROW_LOCATION}" ]]; then
    ESCROW_LOCATION="${BACKUP_OFFSITE_CONFIRMED:+manifest backup.offsite_confirmed=${BACKUP_OFFSITE_CONFIRMED}}"
fi
if [[ -z "${ESCROW_LOCATION}" ]]; then
    fail_with 5 STOPPED "Key escrow not confirmed. The restic password must be stored off this server. Pass --escrow-location '1Password: Agency Clients / ${CLIENT}-backup' or set backup.offsite_confirmed in the manifest."
fi

if [[ ! -r "${TEMPLATE}" ]]; then
    fail_with 2 STOPPED "Missing the server-side backup template: ${TEMPLATE}"
fi

if ! [[ "${SCHEDULE}" =~ ^[0-9*/,.-]+(\ [0-9*/,.-]+){4}$ ]]; then
    fail_with 5 STOPPED "--schedule must be a 5-field cron expression (got: ${SCHEDULE})"
fi

manifest_validate_ssh

step OBSERVING "Escrow confirmed: ${ESCROW_LOCATION}"
step OBSERVING "Dead-man's switch: ${HEALTHCHECK_URL}"

try_rsh "restic version 2>/dev/null || echo NOT_INSTALLED"
RESTIC_INSTALLED=true
if printf '%s' "${REMOTE_OUT}" | grep -q 'NOT_INSTALLED'; then
    RESTIC_INSTALLED=false
    result_warn "restic is not installed on ${HOST}; it will be installed during setup"
else
    step OBSERVING "$(printf '%s' "${REMOTE_OUT}" | head -1)"
fi

BACKUP_SCRIPT="/usr/local/bin/run-backup-${CLIENT}.sh"
CRON_FILE="/etc/cron.d/${CLIENT}-backup"
PASS_FILE="/etc/restic/${CLIENT}.password"
ENV_FILE="/etc/restic/${CLIENT}.env"

try_rsh "restic --password-file '${PASS_FILE}' -r '${REPO}' snapshots --last 1 2>&1 || echo REPO_INIT_NEEDED"
REPO_STATE="init_needed"
if ! printf '%s' "${REMOTE_OUT}" | grep -q 'REPO_INIT_NEEDED\|Is there a repository at\|does not exist'; then
    REPO_STATE="exists"
    [[ -f "${PASS_FILE}" ]] || true
fi

step OBSERVING "Repository state: ${REPO_STATE}"

# ── Plan ──────────────────────────────────────────────────────────────────────
GATES=("CONFIRM BACKUP SETUP" "BACKUP SETUP" "CONFIRM PRUNE" "PRUNE")

{
    printf '\nBackup setup plan for %s (%s)\n' "${CLIENT}" "${HOST}"
    printf '  Repository:        %s (%s)\n' "${REPO}" "${REPO_STATE}"
    printf '  Site root:         %s\n' "${SITE_ROOT}"
    printf '  Schedule:          %s\n' "${SCHEDULE}"
    printf '  Script:            %s\n' "${BACKUP_SCRIPT}"
    printf '  Password file:     %s (mode 0600)\n' "${PASS_FILE}"
    printf '  Retention:         keep 7 daily, 4 weekly, 6 monthly (with prune)\n'
    printf '  Dead-man%s switch: %s\n' "'s" "${HEALTHCHECK_URL}"
    printf '  Escrow:            %s\n' "${ESCROW_LOCATION}"
    printf '  Gates required:    CONFIRM BACKUP SETUP, CONFIRM PRUNE\n\n'
} >&2

if [[ "${DRY_RUN}" == "true" ]]; then
    step PLANNING "Dry run: no mutations performed"
    result_add_string "action" "setup"
    result_add_string "repo" "${REPO}"
    result_add_string "repo_state" "${REPO_STATE}"
    result_add_string "schedule" "${SCHEDULE}"
    result_add_string "escrow_location" "${ESCROW_LOCATION}"
    result_add_raw "retention_prune" "true"
    emit_result "PLANNED"
    exit 0
fi

# ── Gates ─────────────────────────────────────────────────────────────────────
step CONFIRMING "Checking approval gates"
require_confirms "${GATES[@]}"

# ── Acquire the restic password without ever putting it in argv ───────────────
RESTIC_PASSWORD_VALUE=""
if [[ -n "${RESTIC_PASSWORD:-}" ]]; then
    RESTIC_PASSWORD_VALUE="${RESTIC_PASSWORD}"
elif [[ -n "${PASSWORD_FILE}" ]]; then
    [[ -r "${PASSWORD_FILE}" ]] || fail_with 2 STOPPED "Cannot read --password-file ${PASSWORD_FILE}"
    RESTIC_PASSWORD_VALUE="$(cat "${PASSWORD_FILE}")"
elif [[ ! -t 0 ]]; then
    RESTIC_PASSWORD_VALUE="$(cat)"
fi

if [[ -z "${RESTIC_PASSWORD_VALUE}" ]]; then
    fail_with 5 STOPPED "No restic password available. Set RESTIC_PASSWORD, pass --password-file, or pipe the password on stdin. This script never prompts."
fi

if (( ${#RESTIC_PASSWORD_VALUE} < 16 )); then
    fail_with 5 STOPPED "The restic password must be at least 16 characters."
fi

# ── Install restic ────────────────────────────────────────────────────────────
if [[ "${RESTIC_INSTALLED}" == "false" ]]; then
    step EXECUTING "Installing restic"
    try_rsh "apt-get install -y restic 2>&1 | tail -5"
    if [[ "${REMOTE_RC}" -ne 0 ]]; then
        fail_with 6 FAILED "Could not install restic on ${HOST}: ${REMOTE_OUT}"
    fi
fi

# ── Write the password file over stdin, never in argv ─────────────────────────
step EXECUTING "Writing ${PASS_FILE} (mode 0600)"
set +e
printf '%s' "${RESTIC_PASSWORD_VALUE}" | ssh "${SSH_OPTS[@]}" "${SSH_DEST}" \
    "umask 077 && mkdir -p /etc/restic && cat > '${PASS_FILE}' && chmod 0600 '${PASS_FILE}' && chown root:root '${PASS_FILE}'" >/dev/null 2>&1
PW_RC=$?
set -e
if [[ "${PW_RC}" -ne 0 ]]; then
    fail_with 14 FAILED "Could not write ${PASS_FILE} on ${HOST}"
fi

# Optional cloud-credential env file, also piped over stdin.
if [[ -n "${ENV_FILE_SRC}" ]]; then
    [[ -r "${ENV_FILE_SRC}" ]] || fail_with 2 STOPPED "Cannot read --env-file ${ENV_FILE_SRC}"
    step EXECUTING "Writing ${ENV_FILE} (mode 0600)"
    set +e
    cat "${ENV_FILE_SRC}" | ssh "${SSH_OPTS[@]}" "${SSH_DEST}" \
        "umask 077 && mkdir -p /etc/restic && cat > '${ENV_FILE}' && chmod 0600 '${ENV_FILE}'" >/dev/null 2>&1
    ENV_RC=$?
    set -e
    [[ "${ENV_RC}" -eq 0 ]] || fail_with 14 FAILED "Could not write ${ENV_FILE} on ${HOST}"
fi

# ── Init the repository ───────────────────────────────────────────────────────
if [[ "${REPO_STATE}" == "init_needed" ]]; then
    step EXECUTING "Initialising the restic repository"
    set +e
    INIT_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" \
        "set -a; [ -f '${ENV_FILE}' ] && . '${ENV_FILE}'; set +a; restic --password-file '${PASS_FILE}' -r '${REPO}' init 2>&1")"
    INIT_RC=$?
    set -e
    journal_log "EXECUTING" "restic init" "restic init ${REPO}" "${INIT_RC}" 0 \
        "$(printf '%s' "${INIT_OUT}" | journal_sanitize)" "EXECUTING" "EXECUTING"
    if [[ "${INIT_RC}" -ne 0 ]] && ! printf '%s' "${INIT_OUT}" | grep -qi 'already initialized\|already exists'; then
        fail_with 4 FAILED "restic init failed: ${INIT_OUT}"
    fi
    step EXECUTING "Repository initialised"
else
    step EXECUTING "Repository already exists"
fi

# ── Render and install the server-side backup script ──────────────────────────
step EXECUTING "Rendering ${BACKUP_SCRIPT} from the template"
TEMPLATE_BODY="$(cat "${TEMPLATE}")"
TEMPLATE_BODY="${TEMPLATE_BODY//\{\{CLIENT\}\}/${CLIENT}}"
TEMPLATE_BODY="${TEMPLATE_BODY//\{\{SITE_ROOT\}\}/${SITE_ROOT}}"
TEMPLATE_BODY="${TEMPLATE_BODY//\{\{BACKUP_REPO\}\}/${REPO}}"
TEMPLATE_BODY="${TEMPLATE_BODY//\{\{HEALTHCHECK_URL\}\}/${HEALTHCHECK_URL}}"
TEMPLATE_BODY="${TEMPLATE_BODY//\{\{DEPLOY_USER\}\}/${DEPLOY_USER}}"

if printf '%s' "${TEMPLATE_BODY}" | grep -q '{{'; then
    left="$(printf '%s' "${TEMPLATE_BODY}" | grep -o '{{[A-Z_]*}}' | sort -u | tr '\n' ' ')"
    fail_with 5 STOPPED "Unsubstituted template placeholders remain: ${left}"
fi

set +e
printf '%s\n' "${TEMPLATE_BODY}" | ssh "${SSH_OPTS[@]}" "${SSH_DEST}" \
    "umask 022 && cat > '${BACKUP_SCRIPT}' && chmod 0755 '${BACKUP_SCRIPT}'" >/dev/null 2>&1
RENDER_RC=$?
set -e
if [[ "${RENDER_RC}" -ne 0 ]]; then
    fail_with 14 FAILED "Could not install ${BACKUP_SCRIPT} on ${HOST}"
fi

try_rsh "bash -n '${BACKUP_SCRIPT}'"
if [[ "${REMOTE_RC}" -ne 0 ]]; then
    fail_with 5 STOPPED "${BACKUP_SCRIPT} failed a syntax check on ${HOST}: ${REMOTE_OUT}"
fi

# ── Install the cron entry ────────────────────────────────────────────────────
step EXECUTING "Installing ${CRON_FILE}"
CRON_BODY="# Managed by agency-skills backup-restore. Do not edit by hand.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
${SCHEDULE} root ${BACKUP_SCRIPT}"

set +e
printf '%s\n' "${CRON_BODY}" | ssh "${SSH_OPTS[@]}" "${SSH_DEST}" \
    "umask 022 && cat > '${CRON_FILE}' && chmod 0644 '${CRON_FILE}' && chown root:root '${CRON_FILE}'" >/dev/null 2>&1
CRON_RC=$?
set -e
[[ "${CRON_RC}" -eq 0 ]] || fail_with 14 FAILED "Could not install ${CRON_FILE} on ${HOST}"

# ── First backup ──────────────────────────────────────────────────────────────
step EXECUTING "Running the first backup"
set +e
FIRST_RUN="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "'${BACKUP_SCRIPT}' 2>&1")"
FIRST_RC=$?
set -e
journal_log "EXECUTING" "First backup" "${BACKUP_SCRIPT}" "${FIRST_RC}" 0 \
    "$(printf '%s' "${FIRST_RUN}" | tail -40 | journal_sanitize)" "EXECUTING" "VERIFYING"

SNAPSHOT_ID=""
if [[ "${FIRST_RC}" -ne 0 ]]; then
    result_warn "The first backup run exited ${FIRST_RC}; review it before relying on the schedule"
else
    try_rsh "restic --password-file '${PASS_FILE}' -r '${REPO}' snapshots --last 1 --json 2>/dev/null | tr -d '\n' | sed -n 's/.*\"short_id\":\"\\([^\"]*\\)\".*/\\1/p'"
    SNAPSHOT_ID="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"
fi

step CONFIGURED "Backup configured for ${CLIENT}"

result_add_string "action" "setup"
result_add_string "repo" "${REPO}"
result_add_string "schedule" "${SCHEDULE}"
result_add_string "backup_script" "${BACKUP_SCRIPT}"
result_add_string "cron_file" "${CRON_FILE}"
result_add_string "snapshot_id" "${SNAPSHOT_ID}"
result_add_string "escrow_location" "${ESCROW_LOCATION}"
result_add_raw "retention_prune" "true"
result_add_raw "dead_mans_switch_wired" "true"
result_add_raw "first_backup_exit_code" "${FIRST_RC}"
result_add_string "journal" "$(journal_path)"

emit_result "CONFIGURED"
exit 0
