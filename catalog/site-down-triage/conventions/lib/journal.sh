#!/usr/bin/env bash
# journal.sh — Run journal (audit trail) helpers (shared library)
#
# Journal location, exactly as specified in conventions/logging.md:
#   ~/.local/state/agency/<client>/<YYYYMMDD>-<skill>.md
#
# Usage:
#   journal_init "deploy-site" "$CLIENT" "$MANIFEST"
#   journal_log "EXECUTING" "Installing dependencies" "ssh ... 'composer install'"
#   some_output | journal_sanitize
#   journal_path

JOURNAL_DIR=""
JOURNAL_FILE=""

journal_path() {
    printf '%s\n' "${JOURNAL_FILE}"
}

journal_init() {
    local skill="$1"
    local client="$2"
    local manifest="${3:-}"

    JOURNAL_DIR="${HOME}/.local/state/agency/${client}"
    JOURNAL_FILE="${JOURNAL_DIR}/$(date -u +%Y%m%d)-${skill}.md"

    mkdir -p "${JOURNAL_DIR}" 2>/dev/null || true

    if [[ ! -f "${JOURNAL_FILE}" ]]; then
        {
            printf '# Run Journal: %s for %s\n\n' "${skill}" "${client}"
            printf '**Date:** %s\n' "$(date -u +%Y-%m-%d)"
            printf '**Skill:** %s\n' "${skill}"
            printf '**Client:** %s\n' "${client}"
            printf '**Operator:** %s@%s\n' "$(whoami 2>/dev/null || echo unknown)" "$(hostname 2>/dev/null || echo unknown)"
            printf '**Manifest:** %s\n' "${manifest:-n/a}"
        } >> "${JOURNAL_FILE}"
    fi
}

# journal_log <phase> <description> [command] [exit_code] [duration] [output] [from_state] [to_state]
journal_log() {
    local phase="$1"
    local description="$2"
    local command="${3:-}"
    local exit_code="${4:-0}"
    local duration="${5:-0}"
    local output="${6:-}"
    local from_state="${7:-}"
    local to_state="${8:-}"

    [[ -n "${JOURNAL_FILE}" ]] || return 0

    {
        printf '\n## [%s] %s: %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${phase}" "${description}"
        if [[ -n "${command}" ]]; then
            printf '**Command:**\n```bash\n%s\n```\n\n' "${command}"
        else
            printf '**Command:** local operation\n\n'
        fi
        printf '**Exit Code:** %s\n' "${exit_code}"
        printf '**Duration:** %ss\n' "${duration}"
        if [[ -n "${output}" ]]; then
            printf '\n**Output (sanitized):**\n```\n%s\n```\n' "${output}"
        fi
        if [[ -n "${from_state}" || -n "${to_state}" ]]; then
            printf '\n**State Transition:** %s -> %s\n' "${from_state}" "${to_state}"
        fi
    } >> "${JOURNAL_FILE}" 2>/dev/null || true
}

# Strip secrets from anything before it reaches the journal.
journal_sanitize() {
    sed \
        -e 's/password=[^ ]*/password=***REDACTED***/gi' \
        -e 's/token=[^ ]*/token=***REDACTED***/gi' \
        -e 's/secret=[^ ]*/secret=***REDACTED***/gi' \
        -e 's/Authorization: Bearer [^ ]*/Authorization: Bearer ***REDACTED***/gi' \
        -e 's/ssh-rsa AAAA[^ ]*/ssh-rsa ***REDACTED***/gi' \
        -e 's/ssh-ed25519 AAAA[^ ]*/ssh-ed25519 ***REDACTED***/gi' \
        -e 's/-----BEGIN [A-Z ]*PRIVATE KEY-----/***PRIVATE KEY REDACTED***/gi' \
        -e 's/^\(export \)\?[A-Z_]*_PASSWORD=.*/\1***REDACTED***/gi' \
        -e 's/^\(export \)\?[A-Z_]*_TOKEN=.*/\1***REDACTED***/gi' \
        -e 's/^\(export \)\?[A-Z_]*_SECRET=.*/\1***REDACTED***/gi'
}

# Run a command, capture output/exit code/duration, log it sanitized, echo the output.
# journal_run <phase> <description> <from_state> <to_state> -- <command...>
journal_run() {
    local phase="$1"
    local description="$2"
    local from_state="$3"
    local to_state="$4"
    shift 4
    [[ "${1:-}" == "--" ]] && shift

    local start_epoch output rc duration sanitized
    start_epoch="$(date +%s)"

    set +e
    output="$("$@" 2>&1)"
    rc=$?
    set -e

    duration=$(( $(date +%s) - start_epoch ))
    sanitized="$(printf '%s' "${output}" | journal_sanitize)"

    journal_log "${phase}" "${description}" "$*" "${rc}" "${duration}" "${sanitized}" "${from_state}" "${to_state}"

    printf '%s' "${output}"
    return "${rc}"
}
