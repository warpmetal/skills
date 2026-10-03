#!/usr/bin/env bash
# check-all.sh — every check that does not need a network or a client host.
#
# This is the acceptance gate named in the agency skills' documentation:
# validate the skill policies, parse every shell script, and exercise the shared
# integration library against a stub CLI. `npm run check` covers the registry side;
# this covers the shell side, which the Node gate cannot parse.
#
# Run from any working directory.
set -euo pipefail

_here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "${_here}")"

failed=0

run_step() {
    local label="$1"
    shift
    printf '\n== %s ==\n' "${label}"
    if "$@"; then
        return 0
    fi
    printf 'FAILED: %s\n' "${label}" >&2
    failed=$((failed + 1))
    return 0
}

run_step "skill policies" bash "${ROOT}/tools/validate-skills.sh"
run_step "shell syntax" bash "${ROOT}/tools/syntax-check.sh"
run_step "integration library" bash "${ROOT}/tools/integration-selftest.sh"

printf '\n'
if [[ "${failed}" -gt 0 ]]; then
    printf 'check-all: %d step(s) failed\n' "${failed}" >&2
    exit 1
fi
printf 'check-all: ok\n'
