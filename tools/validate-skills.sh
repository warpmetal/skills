#!/usr/bin/env bash
# validate-skills.sh — the documented entry point for the skill policy checks.
#
# A thin wrapper so the command named in conventions/client-manifest.md
# (`tools/validate-skills.sh`) exists and works on any platform. The checks live in
# scripts/validate-skills.mjs; this file exists so a reviewer does not need to know
# that, and so a `.ps1` twin can share the same implementation.
#
# Run from any working directory.
set -euo pipefail

_here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "${_here}")"

NODE_BIN=""
for candidate in node node.exe; do
    if command -v "${candidate}" >/dev/null 2>&1; then
        NODE_BIN="${candidate}"
        break
    fi
done

if [[ -z "${NODE_BIN}" ]]; then
    printf 'ERROR: node is required to run the skill validators\n' >&2
    exit 127
fi

SCRIPT="${ROOT}/scripts/validate-skills.mjs"

# A Windows `node.exe` reached through WSL interop does not understand `/mnt/...`,
# so the path is translated when that is where it came from. On a native shell this
# branch never runs.
case "${NODE_BIN}" in
    *.exe)
        if command -v wslpath >/dev/null 2>&1; then
            SCRIPT="$(wslpath -w "${SCRIPT}")"
        fi
        ;;
esac

# `exec` keeps the validator's exit code intact.
exec "${NODE_BIN}" "${SCRIPT}"
