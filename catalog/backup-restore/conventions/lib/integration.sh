#!/usr/bin/env bash
# integration.sh — Provider integrations (shared library)
#
# The bridge between a skill script and the `warpmetal integration` / `warpmetal env`
# engine. It owns three things and refuses to own a fourth:
#
#   1. Resolution of the CLI, with an honest capability probe.
#   2. A record of what could not be verified, so "not checked" never reads as "OK".
#   3. Temporary 0600 files for tools that demand a credentials file on disk.
#
# What it does NOT do is decide policy. It never invents a `--confirm` value and
# never performs a mutation the caller has not already been granted. The gate is
# enforced by confirm.sh before a mutating verb is reachable; `integration_run_mutating`
# re-checks it so a helper called from a loop cannot drift away from the gate.
#
# Requires: nothing. Uses confirm.sh's `confirm_has`/`journal_log` when they are
# already sourced (bootstrap.sh sources confirm.sh before this file), and degrades
# to a plain refusal when they are not.
#
# See conventions/integrations.md for the contract and the provider catalog.

# --- Resolution ---------------------------------------------------------------

# The resolved CLI command, or empty. Cached: resolution spawns processes.
INTEGRATION_CLI=""
# "true" only after a successful probe of the `env` namespace.
INTEGRATION_CLI_OK=false
_INTEGRATION_RESOLVED=false
# Temp files this library created; cleaned by integration_tmp_cleanup.
INTEGRATION_TMP_FILES=()

# _integration_resolve_cli — idempotent. Never fails the caller: an absent CLI is
# a state to report, not an error to raise.
_integration_resolve_cli() {
    if [[ "${_INTEGRATION_RESOLVED}" == "true" ]]; then
        return 0
    fi
    _INTEGRATION_RESOLVED=true
    INTEGRATION_CLI=""
    INTEGRATION_CLI_OK=false

    if [[ -n "${WARPMETAL_CLI:-}" ]]; then
        INTEGRATION_CLI="${WARPMETAL_CLI}"
    elif command -v warpmetal >/dev/null 2>&1; then
        INTEGRATION_CLI="warpmetal"
    else
        return 0
    fi

    # The published upstream CLI is also called `warpmetal` but has no `env`
    # namespace. Probing for the namespace is what separates "installed" from
    # "installed and able to do this", and the difference is a warning, not a crash.
    if "${INTEGRATION_CLI}" env status --json >/dev/null 2>&1; then
        INTEGRATION_CLI_OK=true
    fi
    return 0
}

# integration_cli — echoes the CLI command when it is usable. Returns 1 otherwise.
integration_cli() {
    _integration_resolve_cli
    if [[ "${INTEGRATION_CLI_OK}" != "true" ]]; then
        return 1
    fi
    printf '%s' "${INTEGRATION_CLI}"
}

# integration_reset — forget the cached resolution. For tests and for a script
# that installs the CLI mid-run.
integration_reset() {
    INTEGRATION_CLI=""
    INTEGRATION_CLI_OK=false
    _INTEGRATION_RESOLVED=false
}

# _integration_provider_known <provider>
# Asks the engine rather than duplicating the catalog here. `integration status`
# exits 4 for a known provider without credentials and 2 for an unknown one, which
# is exactly the distinction needed and needs no JSON parsing.
_integration_provider_known() {
    local provider="$1"
    local rc=0
    "${INTEGRATION_CLI}" integration status "${provider}" --json >/dev/null 2>&1 || rc=$?
    case "${rc}" in
        0 | 4) return 0 ;;
        *) return 1 ;;
    esac
}

# integration_available <provider>
# Pure predicate: 0 when the integration can actually be used right now. Emits no
# warnings, so it is safe to call before result_init.
integration_available() {
    local provider="${1:-}"
    if [[ -z "${provider}" ]]; then
        return 2
    fi
    _integration_resolve_cli
    if [[ "${INTEGRATION_CLI_OK}" != "true" ]]; then
        return 1
    fi
    if ! _integration_provider_known "${provider}"; then
        return 1
    fi
    return 0
}

# integration_ready <provider>
#
# Stricter than integration_available, and the predicate to use *before a
# mutation*: it asks the engine to probe the provider, so it is false when the
# credential is missing or rejected. `integration_available` answers "can this
# engine do the provider at all", which is not the same question and would let a
# cutover fail halfway through on a missing token.
#
# Exit 0 for OK and for DEGRADED: a DEGRADED probe ran and reported honestly, and
# the caller can read the detail from `integration_run status`.
integration_ready() {
    local provider="${1:-}"
    if [[ -z "${provider}" ]]; then
        return 2
    fi
    _integration_resolve_cli
    if [[ "${INTEGRATION_CLI_OK}" != "true" ]]; then
        return 1
    fi
    if ! _integration_provider_known "${provider}"; then
        return 1
    fi
    if ! "${INTEGRATION_CLI}" integration status "${provider}" --json >/dev/null 2>&1; then
        return 1
    fi
    return 0
}

# integration_declared <provider>
# 0 when the client manifest has an [integrations.<provider>] section. Pure
# manifest read; it does not touch the engine, so it stays cheap and testable.
integration_declared() {
    local provider="${1:-}"
    if [[ -z "${provider}" ]]; then
        return 2
    fi
    if ! command -v manifest_integration_declared >/dev/null 2>&1; then
        return 1
    fi
    manifest_integration_declared "${provider}"
}

# integration_ref <provider> <key> [default]
# A manifest reference (zone id, account label, secret name) — never a value.
integration_ref() {
    local provider="$1"
    local key="$2"
    local default_value="${3:-}"
    if ! command -v manifest_integration >/dev/null 2>&1; then
        printf '%s' "${default_value}"
        return 0
    fi
    manifest_integration "${provider}" "${key}" "${default_value}"
}

# integration_secret_name <provider> [default] — the vault name to read.
integration_secret_name() {
    local provider="$1"
    local default_value="${2:-${provider}.token}"
    local declared
    declared="$(integration_ref "${provider}" "secret" "")"
    if [[ -n "${declared}" ]]; then
        printf '%s' "${declared}"
    else
        printf '%s' "${default_value}"
    fi
}

# --- Honest degradation -------------------------------------------------------

# integration_require_tools <provider> [purpose]
#
# Call this AFTER result_init(). Records one `check_skipped` warning per missing
# prerequisite, following the same rule as `agency_require_tools`: a skipped check
# must be visible in warnings[], because a false OK is the worst outcome for an
# autonomous consumer.
#
# It checks three things in order of increasing specificity: the CLI exists, it has
# the integration namespaces, and the provider's preferred external tools are on
# PATH. Returns 0 when everything is present, 1 when something is missing.
integration_require_tools() {
    local provider="${1:-}"
    local purpose="${2:-${provider} work}"

    if [[ -z "${provider}" ]]; then
        result_warn "check_skipped: integration_require_tools was called without a provider"
        return 1
    fi

    _integration_resolve_cli
    if [[ -z "${INTEGRATION_CLI}" ]]; then
        result_warn "check_skipped: the warpmetal CLI is not installed, so ${purpose} was not verified"
        return 1
    fi
    if [[ "${INTEGRATION_CLI_OK}" != "true" ]]; then
        result_warn "check_skipped: '${INTEGRATION_CLI}' has no env/integration support (install @warpmetal/cli), so ${purpose} was not verified"
        return 1
    fi
    if ! _integration_provider_known "${provider}"; then
        result_warn "check_skipped: the '${provider}' integration is not offered by '${INTEGRATION_CLI}', so ${purpose} was not verified"
        return 1
    fi

    local tools
    tools="$(_integration_provider_tools "${provider}")"
    if [[ -z "${tools}" ]]; then
        # Not a failure: most providers need no external binary. The distinction
        # matters only when the requirement list could not be read at all.
        if ! _integration_tools_readable "${provider}"; then
            result_warn "check_skipped: could not read the tool requirements for '${provider}', so ${purpose} was not verified"
            return 1
        fi
        return 0
    fi

    local tool missing=0
    while IFS= read -r tool; do
        [[ -z "${tool}" ]] && continue
        if ! command -v "${tool}" >/dev/null 2>&1; then
            result_warn "check_skipped: '${tool}' is not installed, so ${purpose} was not verified"
            missing=1
        fi
    done <<< "${tools}"

    if [[ "${missing}" -eq 1 ]]; then
        return 1
    fi
    return 0
}

# integration_require_ready <provider> [purpose]
#
# Call AFTER result_init(). One call for the common case: it records the honest
# reason a path was skipped and tells the caller whether it may take it. Returns 1
# when the provider cannot be used, so a script can branch on it directly instead
# of asking the same question twice with two different helpers.
integration_require_ready() {
    local provider="${1:-}"
    local purpose="${2:-${provider} work}"
    if ! integration_require_tools "${provider}" "${purpose}"; then
        return 1
    fi
    if ! integration_ready "${provider}"; then
        result_warn "check_skipped: the '${provider}' integration is not ready (no usable credential, or the provider rejected it), so ${purpose} was not verified"
        return 1
    fi
    return 0
}

# _integration_provider_tools <provider> — requiresTools as one entry per line.
# The JSON is generated by the engine with a fixed shape, and python3 is preferred
# for the same reason manifest.sh prefers it: correctness over cleverness.
_integration_provider_tools() {
    local provider="$1"
    local json=""
    json="$("${INTEGRATION_CLI}" integration list --json 2>/dev/null)" || json=""
    if [[ -z "${json}" ]]; then
        return 1
    fi
    if command -v python3 >/dev/null 2>&1; then
        printf '%s' "${json}" | python3 -c '
import json, sys
provider = sys.argv[1]
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for entry in data.get("providers", []):
    if entry.get("name") == provider:
        for tool in entry.get("requiresTools", []) or []:
            print(tool)
' "${provider}"
        return 0
    fi
    printf '%s' "${json}" | awk -v provider="${provider}" '
        /^[[:space:]]*"name":/ {
            line = $0
            sub(/^[^:]*:[[:space:]]*/, "", line)
            gsub(/[",]/, "", line)
            current = line
        }
        current != provider { next }
        /"requiresTools":/ {
            if ($0 ~ /\[\]/) next
            inlist = 1
            next
        }
        inlist == 1 {
            if ($0 ~ /\]/) { inlist = 0; next }
            line = $0
            gsub(/^[[:space:]]*"/, "", line)
            gsub(/",?[[:space:]]*$/, "", line)
            if (line != "") print line
        }
    '
    return 0
}

# _integration_tools_readable <provider> — distinguishes "no requirements" from
# "could not find out", so an empty list is not mistaken for a clean bill of health.
_integration_tools_readable() {
    local provider="$1"
    local json=""
    json="$("${INTEGRATION_CLI}" integration list --json 2>/dev/null)" || return 1
    printf '%s' "${json}" | grep -q "\"name\": *\"${provider}\"" || return 1
    printf '%s' "${json}" | grep -q '"requiresTools"' || return 1
    return 0
}

# --- Invocation ---------------------------------------------------------------

# integration_run <provider> <verb> [flags...]
#
# Runs a verb and always asks for --json, because the caller needs the status, not
# a sentence. Arguments are passed as argv; nothing is concatenated into a shell
# string, so a value from a manifest cannot become a command.
#
# This function adds no gate. Callers must have passed require_confirm already, or
# use integration_run_mutating.
#
# Returns the engine's exit code: 0 reported (including DEGRADED), 4 needs auth,
# 5 the provider rejected the action, 127 the engine is unavailable.
integration_run() {
    local provider="${1:-}"
    local verb="${2:-}"
    if [[ -z "${provider}" || -z "${verb}" ]]; then
        printf 'ERROR: integration_run requires a provider and a verb\n' >&2
        return 2
    fi
    shift 2
    _integration_resolve_cli
    if [[ "${INTEGRATION_CLI_OK}" != "true" ]]; then
        return 127
    fi
    "${INTEGRATION_CLI}" integration "${provider}" "${verb}" "$@" --json
}

# integration_run_mutating <provider> <verb> <gate-string> [flags...]
#
# For every verb that changes something upstream. The gate must already be
# approved in this run; this re-check exists so that a caller who reaches this
# function through a code path that skipped require_confirm gets a refusal instead
# of a mutation. The string is passed through to the engine, which applies its own
# check for the same reason.
integration_run_mutating() {
    local provider="${1:-}"
    local verb="${2:-}"
    local gate="${3:-}"
    if [[ -z "${provider}" || -z "${verb}" || -z "${gate}" ]]; then
        printf 'ERROR: integration_run_mutating requires a provider, a verb and a gate string\n' >&2
        return 2
    fi
    shift 3

    if ! command -v confirm_has >/dev/null 2>&1; then
        printf 'ERROR: refusing to run %s %s: confirm.sh is not loaded, so the gate cannot be verified\n' \
            "${provider}" "${verb}" >&2
        return 11
    fi
    if ! confirm_has "${gate}"; then
        printf 'ERROR: refusing to run %s %s: gate "%s" was not approved in this run\n' \
            "${provider}" "${verb}" "${gate}" >&2
        return 11
    fi
    integration_run "${provider}" "${verb}" --confirm "${gate}" "$@"
}

# integration_json_string <json> <field> — top-level string field, or empty.
# Deliberately minimal: it reads the engine's own pretty-printed envelope and
# nothing else. Use jq when a real document has to be traversed.
integration_json_string() {
    local json="$1"
    local field="$2"
    printf '%s' "${json}" | awk -v key="\"${field}\":" '
        index($0, key) == 1 || $0 ~ "^[[:space:]]*" key {
            line = $0
            sub(/^[^:]*:[[:space:]]*/, "", line)
            gsub(/^"/, "", line)
            gsub(/",?[[:space:]]*$/, "", line)
            print line
            exit
        }
    ' || true
}

# integration_status_of <json> — the `status` field of a result document.
integration_status_of() {
    integration_json_string "${1:-}" "status"
}

# --- Secret materialisation ---------------------------------------------------

# integration_emit_secret <name> — one secret on stdout, no trailing newline.
# The only sanctioned way for a script to read a credential.
integration_emit_secret() {
    local name="${1:-}"
    if [[ -z "${name}" ]]; then
        printf 'ERROR: integration_emit_secret requires a secret name\n' >&2
        return 2
    fi
    _integration_resolve_cli
    if [[ "${INTEGRATION_CLI_OK}" != "true" ]]; then
        return 127
    fi
    "${INTEGRATION_CLI}" env secret "${name}" --stdout
}

# _integration_trap_install — installs an EXIT trap only when the caller has none.
# Clobbering a script's own trap would be a silent regression, so when a trap
# already exists the caller must call integration_tmp_cleanup itself (documented in
# conventions/integrations.md).
_integration_trap_install() {
    if [[ -z "$(trap -p EXIT)" ]]; then
        trap 'integration_tmp_cleanup' EXIT
    fi
}

# integration_tmp_cleanup — removes every file this library created.
#
# Two sources are consulted because `integration_secret_file` may have been called
# inside a command substitution, which runs in a subshell: the in-memory list only
# survives in the shell that called it, so a registry file keyed by `$$` (stable
# across subshells of the same script) is what makes cleanup reliable either way.
integration_tmp_cleanup() {
    local file
    local tmp_root="${TMPDIR:-/tmp}"
    tmp_root="${tmp_root%/}"

    for file in "${INTEGRATION_TMP_FILES[@]+"${INTEGRATION_TMP_FILES[@]}"}"; do
        [[ -n "${file}" ]] && rm -f -- "${file}"
    done
    INTEGRATION_TMP_FILES=()

    local registered
    registered="$(_integration_registered_tmp_files)"
    if [[ -n "${registered}" ]]; then
        while IFS= read -r file; do
            [[ -z "${file}" ]] && continue
            # The name pattern is the guard: a tampered registry entry that points
            # somewhere else must not make this function delete an unrelated file.
            case "${file}" in
                "${tmp_root}/warpmetal-"*) [[ -f "${file}" ]] && rm -f -- "${file}" ;;
            esac
        done <<<"${registered}"
    fi

    rm -f -- "$(_integration_registry_path)"
    return 0
}

# _integration_registry_path — per-process registry of materialised secrets.
_integration_registry_path() {
    local tmp_root="${TMPDIR:-/tmp}"
    tmp_root="${tmp_root%/}"
    printf '%s/warpmetal-shim-registry-%s' "${tmp_root}" "$$"
}

# _integration_register_tmp <path> — appends to the registry, created 0600.
_integration_register_tmp() {
    local file="$1"
    (umask 077; printf '%s\n' "${file}" >>"$(_integration_registry_path)") 2>/dev/null || true
    return 0
}

_integration_registered_tmp_files() {
    local registry
    registry="$(_integration_registry_path)"
    if [[ -f "${registry}" ]]; then
        cat "${registry}" 2>/dev/null || true
    fi
    return 0
}

# integration_secret_file <name> — echoes the path to a 0600 file holding one
# secret. Use it for tools that insist on a credentials file (certbot, restic).
#
# The file is created under umask 077 *before* the value is written, so there is no
# window in which it is readable by anyone else. The path is recorded in a
# per-process registry, so `integration_tmp_cleanup` removes it even when this
# function was called inside a command substitution; callers should still invoke
# `integration_tmp_cleanup` explicitly, because the library installs an EXIT trap
# only when the script does not already own one.
integration_secret_file() {
    local name="${1:-}"
    if [[ -z "${name}" ]]; then
        printf 'ERROR: integration_secret_file requires a secret name\n' >&2
        return 2
    fi
    _integration_resolve_cli
    if [[ "${INTEGRATION_CLI_OK}" != "true" ]]; then
        return 127
    fi

    local tmp_root="${TMPDIR:-/tmp}"
    tmp_root="${tmp_root%/}"
    local safe_name="${name//[^A-Za-z0-9_.-]/_}"
    local file=""
    file="$(umask 077; mktemp "${tmp_root}/warpmetal-${safe_name}.XXXXXX" 2>/dev/null)" || return 1
    INTEGRATION_TMP_FILES+=("${file}")
    _integration_register_tmp "${file}"
    _integration_trap_install

    if ! integration_emit_secret "${name}" >"${file}"; then
        rm -f -- "${file}"
        return 1
    fi
    chmod 600 "${file}" 2>/dev/null || true
    printf '%s' "${file}"
    return 0
}

# --- Journal ------------------------------------------------------------------

# integration_journal <phase> <action> <detail> [exit_code]
# Records an integration decision in the client journal. Only the provider, the
# verb and the outcome are written - never a command line and never a value, so a
# denied gate is auditable without the journal becoming a secret store.
integration_journal() {
    local phase="${1:-OBSERVING}"
    local action="${2:-integration}"
    local detail="${3:-}"
    local code="${4:-0}"
    if command -v journal_log >/dev/null 2>&1; then
        journal_log "${phase}" "${action}" "integration: ${detail}" "${code}" 0 "" "${phase}" "${phase}"
    fi
    return 0
}

# integration_denied <provider> <verb> <gate> [exit_code]
# A denial is a fact worth recording with its reason, not a silent return.
integration_denied() {
    local provider="${1:-}"
    local verb="${2:-}"
    local gate="${3:-}"
    local code="${4:-11}"
    printf 'ERROR: %s %s was not run: the gate "%s" was not approved\n' \
        "${provider}" "${verb}" "${gate}" >&2
    if command -v result_warn >/dev/null 2>&1; then
        result_warn "integration_denied: ${provider} ${verb} requires --confirm \"${gate}\""
    fi
    integration_journal "STOPPED" "denied ${provider} ${verb}" "gate=${gate}" "${code}"
    return "${code}"
}
