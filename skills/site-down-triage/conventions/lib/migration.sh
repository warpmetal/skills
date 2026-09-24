#!/usr/bin/env bash
# migration.sh — Phase state tracking and DNS helpers for migrate-site
#
# A migration is eight ordered phases run as separate commands, possibly on
# different days. The phase state therefore has to persist between runs.
#
# State lives at:
#   ~/.local/state/agency/<client>/migration-state.tsv   (append-only ledger)
#   ~/.local/state/agency/<client>/migration/inventory.json
#
# The ledger is a TSV of: phase <TAB> ISO-8601 UTC timestamp <TAB> detail

migration_state_dir() {
    printf '%s\n' "${HOME}/.local/state/agency/${1}/migration"
}

migration_state_file() {
    printf '%s\n' "${HOME}/.local/state/agency/${1}/migration-state.tsv"
}

migration_inventory_file() {
    printf '%s\n' "$(migration_state_dir "${1}")/inventory.json"
}

# migration_state_set <client> <phase> <detail>
migration_state_set() {
    local client="$1" phase="$2" detail="${3:-}"
    mkdir -p "$(migration_state_dir "${client}")"
    printf '%s\t%s\t%s\n' "${phase}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${detail}" >> "$(migration_state_file "${client}")"
}

# migration_state_get <client> <phase> -> timestamp, or empty
migration_state_get() {
    local file
    file="$(migration_state_file "$1")"
    [[ -r "${file}" ]] || return 0
    awk -F'\t' -v k="$2" '$1 == k { v = $2 } END { print v }' "${file}"
}

# migration_state_detail <client> <phase> -> detail of the last occurrence
migration_state_detail() {
    local file
    file="$(migration_state_file "$1")"
    [[ -r "${file}" ]] || return 0
    awk -F'\t' -v k="$2" '$1 == k { v = $3 } END { print v }' "${file}"
}

# migration_state_clear <client>
migration_state_clear() {
    rm -f "$(migration_state_file "$1")"
}

# migration_ttl_warning <client> <domain>
# Prints a warning line when the A record TTL is too high, empty otherwise.
migration_ttl_warning() {
    local client="$1" domain="$2"
    command -v dig >/dev/null 2>&1 || return 0

    local line ttl lowered
    line="$(dig +noall +answer A "${domain}" 2>/dev/null | head -1)"
    ttl="$(printf '%s' "${line}" | awk '{print $2}')"
    [[ "${ttl}" =~ ^[0-9]+$ ]] || return 0

    lowered="$(manifest_get migration.ttl_lowered 2>/dev/null || true)"

    if (( ttl > 300 )); then
        if [[ -n "${lowered}" ]]; then
            printf 'A record TTL for %s is %ss even though migration.ttl_lowered is set to %s; the cutover window will be up to %ss\n' \
                "${domain}" "${ttl}" "${lowered}" "${ttl}"
        else
            printf 'A record TTL for %s is %ss and was never lowered; the cutover window will be up to %ss, with traffic split across both hosts. Lower it to 300 and wait 24-48h before cutover.\n' \
                "${domain}" "${ttl}" "${ttl}"
        fi
    fi
}

# migration_a_record_ip <domain>
migration_a_record_ip() {
    command -v dig >/dev/null 2>&1 || return 0
    dig +noall +answer A "$1" 2>/dev/null | head -1 | awk '{print $5}'
}

# migration_a_record_ttl <domain>
migration_a_record_ttl() {
    command -v dig >/dev/null 2>&1 || return 0
    dig +noall +answer A "$1" 2>/dev/null | head -1 | awk '{print $2}'
}

# migration_require_phase <client> <phase> <human description> <exit code>
migration_require_phase() {
    local client="$1" phase="$2" description="$3" code="${4:-12}"
    if [[ -z "$(migration_state_get "${client}" "${phase}")" ]]; then
        fail_with "${code}" STOPPED "${description} has not been recorded for ${client}. Run the ${phase} phase first; the state ledger is $(migration_state_file "${client}")."
    fi
}

# migration_require_alias <alias> <label>
migration_require_alias() {
    if ! ssh -G "$1" >/dev/null 2>&1; then
        fail_with 3 STOPPED "SSH alias '$1' (${2}) was not found in ~/.ssh/config"
    fi
}
