#!/usr/bin/env bash
# verify.sh — Read-only post-deployment verification for deploy-site
#
# Usage:
#   verify.sh --client <name> [--release-id <id>]
#
# Checks: current symlink, release structure, shared path symlinks, health URL,
# runtime status, deployment lock, and the server-side Git mirror HEAD.
#
# No approval gate: this script never mutates anything.
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
RELEASE_ID=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)     CLIENT="${2:-}"; shift 2 ;;
        --release-id) RELEASE_ID="${2:-}"; shift 2 ;;
        --confirm)    confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

# ── Load and validate ─────────────────────────────────────────────────────────
result_init "deploy-site" "${CLIENT}"
manifest_load "${CLIENT}"
manifest_validate
manifest_require host site_root stack health_url

# Surface dependency gaps in warnings[]: "not verified" must never read as "OK".
manifest_parser_report
manifest_validate_ssh

journal_init "deploy-site" "${CLIENT}" "${MANIFEST}"

RELEASES_DIR="${SITE_ROOT}/releases"
MIRROR_DIR="${SITE_ROOT}/.git"
LOCKFILE="/tmp/deploy-${CLIENT}.lock"
SSH_DEST="$(ssh_target "${HOST}" "${DEPLOY_USER}")"

REMOTE_OUT=""
REMOTE_RC=0
try_rsh() {
    set +e
    REMOTE_OUT="$(ssh "${SSH_OPTS[@]}" "${SSH_DEST}" "$1" 2>&1)"
    REMOTE_RC=$?
    set -e
    return 0
}

CHECKS=()
CHECKS_PASSED=0
CHECKS_FAILED=0

record_check() {
    local name="$1" passed="$2" detail="$3"
    CHECKS+=("{\"name\":$(json_string "${name}"),\"passed\":${passed},\"detail\":$(json_string "${detail}")}")
    if [[ "${passed}" == "true" ]]; then
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
        step VERIFYING "PASS ${name}${detail:+ (${detail})}"
    else
        CHECKS_FAILED=$((CHECKS_FAILED + 1))
        step VERIFYING "FAIL ${name}${detail:+ (${detail})}"
    fi
}

step VERIFYING "Post-deployment verification for ${CLIENT}"

# 1. current symlink resolves
try_rsh "readlink -f '${SITE_ROOT}/current' 2>/dev/null || true"
CURRENT_TARGET="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"
if [[ -n "${CURRENT_TARGET}" && "${CURRENT_TARGET}" == "${RELEASES_DIR}/"* ]]; then
    record_check "current_symlink" "true" "${CURRENT_TARGET}"
else
    record_check "current_symlink" "false" "does not resolve under ${RELEASES_DIR}"
fi

if [[ -z "${RELEASE_ID}" ]]; then
    RELEASE_ID="$(basename "${CURRENT_TARGET}" 2>/dev/null || true)"
fi

# 2. Release directory exists
try_rsh "[ -d '${RELEASES_DIR}/${RELEASE_ID}' ] && echo yes || echo no"
if [[ "$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')" == "yes" ]]; then
    record_check "release_directory" "true" "${RELEASE_ID}"
else
    record_check "release_directory" "false" "${RELEASES_DIR}/${RELEASE_ID} missing"
fi

# 3. Shared path symlinks
for path in .env storage; do
    try_rsh "[ -L '${RELEASES_DIR}/${RELEASE_ID}/${path}' ] && echo yes || echo no"
    if [[ "$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')" == "yes" ]]; then
        record_check "shared_${path#.}" "true" "symlinked"
    else
        record_check "shared_${path#.}" "false" "not a symlink"
    fi
done

# 4. Health URL
http_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${HEALTH_URL}" 2>/dev/null || printf '000')"
if [[ "${http_code}" == "200" ]]; then
    record_check "health_url" "true" "${HEALTH_URL}"
else
    record_check "health_url" "false" "HTTP ${http_code}"
fi

# 5. Runtime is active
case "${STACK}" in
    laravel|wordpress) try_rsh "systemctl is-active php*-fpm 2>/dev/null || echo unknown" ;;
    node)              try_rsh "systemctl is-active '${APP_UNIT}' 2>/dev/null || echo unknown" ;;
    static)            try_rsh "systemctl is-active nginx 2>/dev/null || echo unknown" ;;
esac
RUNTIME_STATUS="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"
[[ "${RUNTIME_STATUS}" == "active" ]] \
    && record_check "runtime" "true" "${RUNTIME_STATUS}" \
    || record_check "runtime" "false" "${RUNTIME_STATUS:-unknown}"

# 6. Deployment lock is free
try_rsh "flock -n '${LOCKFILE}' true 2>/dev/null && echo free || echo held"
LOCK_STATE="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"
[[ "${LOCK_STATE}" == "free" ]] \
    && record_check "deploy_lock" "true" "free" \
    || record_check "deploy_lock" "false" "a deployment may still be running"

# 7. Git mirror HEAD
try_rsh "git --git-dir='${MIRROR_DIR}' rev-parse --short HEAD 2>/dev/null || echo none"
MIRROR_HEAD="$(printf '%s' "${REMOTE_OUT}" | tail -1 | tr -d '[:space:]')"
record_check "git_mirror" "true" "${MIRROR_HEAD}"

journal_log "VERIFYING" "Post-deployment verification" "read-only checks" "${CHECKS_FAILED}" 0 \
    "passed=${CHECKS_PASSED} failed=${CHECKS_FAILED}" "VERIFYING" "OBSERVED"

result_add_string "step" "verify"
result_add_string "release_id" "${RELEASE_ID}"
result_add_string "current_target" "${CURRENT_TARGET}"
result_add_string "runtime_status" "${RUNTIME_STATUS}"
result_add_string "git_mirror_head" "${MIRROR_HEAD}"
result_add_raw "checks" "[$(IFS=,; printf '%s' "${CHECKS[*]}")]"
result_add_raw "checks_passed" "${CHECKS_PASSED}"
result_add_raw "checks_failed" "${CHECKS_FAILED}"
result_add_string "journal" "$(journal_path)"

if [[ "${CHECKS_FAILED}" -gt 0 ]]; then
    step FAILED "${CHECKS_FAILED} verification check(s) failed"
    emit_result "FAILED"
    exit 1
fi

step READY "All verification checks passed"
emit_result "OBSERVED"
exit 0
