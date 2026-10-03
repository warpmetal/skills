#!/usr/bin/env bash
# output.sh — Canonical JSON result envelope (shared library)
#
# Every skill emits exactly one JSON object on the final line of stdout.
# This library builds it so that the envelope is identical across skills.
#
# See conventions/outputs.md for the authoritative contract.
#
# Usage:
#   result_init "deploy-site" "$CLIENT"
#   result_add_string "release_id" "$RELEASE_ID"
#   result_add_raw    "health_checks" '{"attempts":5,"passed":5}'
#   result_warn "Disk usage at 85%"
#   result_error "Migration failed"
#   emit_result "READY"          # prints the JSON line

# --- Constructors -------------------------------------------------------------

json_escape() {
    printf '%s' "${1-}" | awk 'BEGIN { ORS = "" } {
        gsub(/\\/, "\\\\")
        gsub(/"/, "\\\"")
        gsub(/\t/, "\\t")
        gsub(/\r/, "\\r")
        if (NR > 1) printf "\\n"
        printf "%s", $0
    }'
}

json_string() {
    printf '"%s"' "$(json_escape "${1-}")"
}

# Build a JSON array from already-encoded elements.
# Call as: json_array_of "${ARR[@]+"${ARR[@]}"}"
json_array_of() {
    local out="[" first=1 v
    for v in "$@"; do
        if [[ $first -eq 1 ]]; then first=0; else out+=","; fi
        out+="$v"
    done
    printf '%s]' "$out"
}

# --- Result accumulator -------------------------------------------------------

RESULT_SKILL=""
RESULT_CLIENT=""
RESULT_START_EPOCH=0
RESULT_WARNINGS=()
RESULT_ERRORS=()
RESULT_EXTRA=""

result_init() {
    RESULT_SKILL="${1:-unknown}"
    RESULT_CLIENT="${2:-unknown}"
    RESULT_START_EPOCH="$(date +%s)"
    RESULT_WARNINGS=()
    RESULT_ERRORS=()
    RESULT_EXTRA=""
}

result_add_string() {
    RESULT_EXTRA+=",\"$(json_escape "$1")\":$(json_string "$2")"
}

# Add a raw, already-valid JSON value (number, boolean, object, array, null).
result_add_raw() {
    RESULT_EXTRA+=",\"$(json_escape "$1")\":$2"
}

# Add a JSON array built from plain strings.
result_add_string_array() {
    local key="$1"; shift
    local encoded=()
    local v
    for v in "$@"; do
        encoded+=("$(json_string "$v")")
    done
    RESULT_EXTRA+=",\"$(json_escape "$key")\":$(json_array_of "${encoded[@]+"${encoded[@]}"}")"
}

result_warn() {
    RESULT_WARNINGS+=("$(json_string "$1")")
}

result_error() {
    RESULT_ERRORS+=("$(json_string "$1")")
}

# --- Emission -----------------------------------------------------------------

emit_result() {
    local status="$1"
    local duration=$(( $(date +%s) - RESULT_START_EPOCH ))
    if [[ $duration -lt 0 ]]; then duration=0; fi

    printf '{"skill":%s,"client":%s,"status":%s,"timestamp":%s,"duration_seconds":%d,"warnings":%s,"errors":%s%s}\n' \
        "$(json_string "$RESULT_SKILL")" \
        "$(json_string "$RESULT_CLIENT")" \
        "$(json_string "$status")" \
        "$(json_string "$(date -u +%Y-%m-%dT%H:%M:%SZ)")" \
        "$duration" \
        "$(json_array_of "${RESULT_WARNINGS[@]+"${RESULT_WARNINGS[@]}"}")" \
        "$(json_array_of "${RESULT_ERRORS[@]+"${RESULT_ERRORS[@]}"}")" \
        "$RESULT_EXTRA"
}
