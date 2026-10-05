#!/usr/bin/env bash
# syntax-check.sh — parse every shell script in the repository.
#
# Runs `bash -n` over the skill libraries and scripts so a broken quoting mistake
# fails here instead of on a client's production host. It is a parser, not a
# linter: it catches syntax, not semantics.
#
# Run from any working directory; the repository root is found from this file.
set -euo pipefail

_here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "${_here}")"

checked=0
failed=0

check_file() {
    local file="$1"
    checked=$((checked + 1))
    if ! bash -n "${file}" 2>/tmp/warpmetal-syntax-error; then
        printf 'SYNTAX ERROR: %s\n' "${file#${ROOT}/}" >&2
        sed 's/^/    /' /tmp/warpmetal-syntax-error >&2
        failed=$((failed + 1))
    fi
    return 0
}

while IFS= read -r file; do
    check_file "${file}"
done < <(
    {
        find "${ROOT}/skills" -type f -name '*.sh'
        find "${ROOT}/tools" -type f -name '*.sh'
    } | sort
)

if [[ "${failed}" -gt 0 ]]; then
    printf 'syntax-check: %d of %d file(s) failed to parse\n' "${failed}" "${checked}" >&2
    exit 1
fi

printf 'syntax-check: ok (%d file(s))\n' "${checked}"
