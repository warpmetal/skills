#!/usr/bin/env bash
# confirm.sh — Approval gates (shared library)
#
# The toolkit is non-interactive: every mutating operation requires an explicit
# typed confirmation string passed as a flag. There are no `read` prompts and no
# `--yes`/`--force` bypass.
#
#     bash scripts/deploy.sh --client acme --confirm "CONFIRM DEPLOY"
#
# A single invocation may need more than one documented gate. Pass one flag per
# gate; order does not matter:
#
#     bash scripts/freeze.sh --client acme \
#         --confirm "CONFIRM FREEZE" --confirm "CONFIRM DISABLE CRON"
#
# If any required gate is missing or does not match, the script performs NO
# mutation and emits a CONFIRMATION_REQUIRED result listing every string the
# caller must supply. Exit code 11.
#
# See conventions/approvals.md for the authoritative gate table.

# Callers append to this from: --confirm <STRING>
CONFIRM_VALUES=()

# confirm_add <string> — call from the argument parser.
confirm_add() {
    if [[ -n "${1:-}" ]]; then
        CONFIRM_VALUES+=("$1")
    fi
    return 0
}

# confirm_has <string>
confirm_has() {
    local expected="$1"
    local v
    for v in "${CONFIRM_VALUES[@]+"${CONFIRM_VALUES[@]}"}"; do
        if [[ "$v" == "$expected" ]]; then
            return 0
        fi
    done
    return 1
}

# require_confirm <string> <gate_name> [context]
require_confirm() {
    require_confirms "$1" "$2" "${3:-}"
}

# require_confirms <string> <gate_name> [<string> <gate_name> ...]
# Checks every gate before proceeding, so the operator is asked once.
require_confirms() {
    local missing_strings=()
    local missing_gates=()
    local context=""
    local expected gate
    local all_gates=("$@")

    while [[ $# -gt 0 ]]; do
        expected="${1:-}"
        gate="${2:-}"
        if [[ -z "${gate}" ]]; then
            context="${expected}"
            break
        fi
        shift 2
        if ! confirm_has "${expected}"; then
            missing_strings+=("${expected}")
            missing_gates+=("${gate}")
        fi
    done

    if [[ ${#missing_strings[@]} -eq 0 ]]; then
        journal_log "CONFIRMING" "Gates satisfied: ${all_gates[*]}" "confirmation flags" 0 0 "" "CONFIRMING" "EXECUTING"
        return 0
    fi

    local reason="approval_required"
    if [[ ${#CONFIRM_VALUES[@]} -gt 0 ]]; then
        reason="approval_mismatch"
    fi

    {
        printf '\n'
        printf 'APPROVAL REQUIRED\n'
        printf '  Gate(s): %s\n' "${missing_gates[*]}"
        if [[ -n "${context}" ]]; then
            printf '%s\n' "${context}"
        fi
        if [[ "${reason}" == "approval_mismatch" ]]; then
            printf '  Received: %s\n' "${CONFIRM_VALUES[*]}"
        fi
        printf '\n  Re-run with:\n'
        local s
        for s in "${missing_strings[@]}"; do
            printf '    --confirm "%s"\n' "${s}"
        done
        printf '\n'
    } >&2

    journal_log "CONFIRMING" "Gates not approved (${reason}): ${missing_gates[*]}" "confirmation flags" 11 0 "" "CONFIRMING" "STOPPED"

    result_add_string_array "gates" "${missing_gates[@]+"${missing_gates[@]}"}"
    result_add_string_array "confirm_strings" "${missing_strings[@]+"${missing_strings[@]}"}"
    # Convenience for the single-gate case; an agent can always read the array.
    if [[ ${#missing_strings[@]} -eq 1 ]]; then
        result_add_string "confirm_string" "${missing_strings[0]}"
    fi
    result_add_string "reason" "${reason}"
    emit_result "CONFIRMATION_REQUIRED"
    exit 11
}
