#!/usr/bin/env bash
# bootstrap.sh — Resolve paths and load every shared library.
#
# Every skill script starts with the resolver block delimited by the markers
# `# >>> agency-lib-resolver` and `# <<< agency-lib-resolver`. It tries, in order:
#
#   1. $AGENCY_LIB                        (explicit override)
#   2. <skill-dir>/../../conventions/lib  (the repo layout)
#   3. <skill-dir>/../conventions/lib     (conventions/ next to the skills)
#   4. ~/.cursor/skills/conventions/lib
#   5. ~/.claude/skills/conventions/lib
#   6. ~/.agents/skills/conventions/lib
#
# A skill directory copied on its own therefore still works as long as
# conventions/ sits beside it, or AGENCY_LIB points at this file. If none match,
# the script exits 127 and prints the paths it tried plus how to fix it — never a
# single dead path.
#
# After sourcing, these are defined:
#   LIB_DIR, CONVENTIONS_DIR, AGENCY_DIR  (paths)
#   json_string, json_escape, json_array_of
#   result_init, result_add_string, result_add_raw, result_add_string_array,
#   result_warn, result_error, emit_result
#   journal_init, journal_log, journal_run, journal_sanitize, journal_path
#   ssh_run, ssh_user_run, ssh_script, ssh_target, scp_put, ssh_resolve_hostname
#   require_confirm
#   manifest_load, manifest_get, manifest_require, manifest_validate, manifest_validate_ssh
#   agency_require_tools
#   fail_with, note, step

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONVENTIONS_DIR="$(dirname "${LIB_DIR}")"
AGENCY_DIR="$(dirname "${CONVENTIONS_DIR}")"

# shellcheck source=/dev/null
source "${LIB_DIR}/output.sh"
# shellcheck source=/dev/null
source "${LIB_DIR}/journal.sh"
# shellcheck source=/dev/null
source "${LIB_DIR}/ssh.sh"
# shellcheck source=/dev/null
source "${LIB_DIR}/confirm.sh"
# shellcheck source=/dev/null
source "${LIB_DIR}/manifest.sh"
# shellcheck source=/dev/null
source "${LIB_DIR}/migration.sh"
# shellcheck source=/dev/null
source "${LIB_DIR}/queue.sh"
# shellcheck source=/dev/null
source "${LIB_DIR}/monitoring.sh"

# --- Small conveniences used by every script ---------------------------------

note() { printf '%s\n' "$*" >&2; }

# step <PHASE> <message>
step() { printf '[%s] %s\n' "$1" "${2:-}" >&2; }

# agency_require_tools <tool:purpose> [<tool:purpose> ...]
#
# Call this AFTER result_init(). It records one warning per missing tool so that
# "not verified" never reads as "OK".
#
# This exists because the optional probes degrade silently: without `dig`,
# migration_ttl_warning() returns 0 without checking anything, and an agent would
# see warnings:[] and conclude the TTL was fine. A false OK is the worst possible
# outcome for an autonomous consumer, so a skipped check must be visible.
#
# Order matters: result_init() resets RESULT_WARNINGS, so warnings registered
# before it are discarded without a trace.
agency_require_tools() {
    local spec tool purpose
    for spec in "$@"; do
        tool="${spec%%:*}"
        purpose="${spec#*:}"
        [[ -z "${tool}" ]] && continue
        if ! command -v "${tool}" >/dev/null 2>&1; then
            if [[ "${purpose}" == "${tool}" ]]; then
                result_warn "check_skipped: '${tool}' is not installed"
            else
                result_warn "check_skipped: '${tool}' is not installed, so ${purpose} was not verified"
            fi
        fi
    done
}

# fail_with <exit_code> <status> <message>
# Emits a canonical result and exits. Use only after result_init.
fail_with() {
    local code="$1"
    local status="$2"
    local message="$3"
    printf 'ERROR: %s\n' "${message}" >&2
    result_error "${message}"
    emit_result "${status}"
    exit "${code}"
}
