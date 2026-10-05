#!/usr/bin/env bash
# format-report.sh — Render a human report and a post-incident note from triage JSON
#
# Usage:
#   format-report.sh --client <name> [--input <file>|-] [--write-journal]
#
# Reads the site-down-triage JSON result from --input (default: stdin) and prints
# a markdown report. With --write-journal it also writes the post-incident note
# next to the run journal.
#
# No approval gate: this script never mutates a client host. --write-journal only
# writes to the operator's local state directory.
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
INPUT="-"
WRITE_JOURNAL=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --client)        CLIENT="${2:-}"; shift 2 ;;
        --input)         INPUT="${2:-}"; shift 2 ;;
        --write-journal) WRITE_JOURNAL=true; shift ;;
        --confirm)       confirm_add "${2:-}"; shift 2 ;;
        *) printf 'ERROR: Unknown argument: %s\n' "$1" >&2; exit 2 ;;
    esac
done

[[ -n "${CLIENT}" ]] || { printf 'ERROR: --client is required\n' >&2; exit 2; }

if [[ "${INPUT}" == "-" ]]; then
    JSON="$(cat)"
else
    [[ -r "${INPUT}" ]] || { printf 'ERROR: Cannot read %s\n' "${INPUT}" >&2; exit 2; }
    JSON="$(cat "${INPUT}")"
fi

# The triage result is the last JSON line on stdout.
JSON="$(printf '%s\n' "${JSON}" | tail -1)"

journal_init "site-down-triage" "${CLIENT}" ""

# Minimal extractors; the toolkit deliberately does not require jq.
json_get_string() {
    printf '%s' "${JSON}" | sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p" | head -1
}
json_get_raw() {
    printf '%s' "${JSON}" | sed -n "s/.*\"$1\":\([^,}]*\).*/\1/p" | head -1 | tr -d '"'
}

STATUS="$(json_get_string status)"
LAYER="$(json_get_raw layer)"
LAYER_NAME="$(json_get_string layer_name)"
DIAGNOSIS="$(json_get_string diagnosis)"
PROPOSED="$(json_get_string proposed_fix)"
ROOT="$(json_get_string root_cause_note)"
HANDOFF="$(json_get_string handoff)"
TIMESTAMP="$(json_get_string timestamp)"

if [[ -z "${STATUS}" ]]; then
    printf 'ERROR: input does not look like a site-down-triage result (no status field)\n' >&2
    exit 2
fi

REPORT="$(cat <<EOF
# Site Down Triage Report — ${CLIENT}

**Status:** ${STATUS}
**Layer:** ${LAYER} — ${LAYER_NAME}
**Timestamp:** ${TIMESTAMP}
**Handoff:** ${HANDOFF}

## Diagnosis

${DIAGNOSIS}

## Minimal Fix (proposed, not executed)

${PROPOSED}

## Root Cause — Fix Later

${ROOT}

## Raw JSON

\`\`\`json
${JSON}
\`\`\`
EOF
)"

printf '%s\n' "${REPORT}"

if [[ "${WRITE_JOURNAL}" == "true" ]]; then
    NOTE_FILE="${JOURNAL_DIR}/$(date -u +%Y%m%d)-post-incident.md"
    cat > "${NOTE_FILE}" <<EOF
# Post-Incident Note — ${CLIENT}

**Date (UTC):** ${TIMESTAMP}
**Operator:** $(whoami)@$(hostname 2>/dev/null || printf 'unknown')
**Skill:** site-down-triage
**Status:** ${STATUS}
**Layer:** ${LAYER} — ${LAYER_NAME}

## What Users Felt

- (fill in: down | 502 | slow | intermittent)
- Started (approx):
- Detected by:

## Evidence (inline)

- See the triage journal and the JSON evidence array.

## Diagnosis

${DIAGNOSIS}

## Minimal Fix (stop the bleeding)

- [ ] ${PROPOSED}
- Approvals required: human, or a handoff skill
- Expected time to restore: (estimate)

## Root Cause — Fix Later

- ${ROOT}
- Follow-up skill: ${HANDOFF}
- Due:

## What We Did Not Do

- Did not restart services during triage
- Did not delete files
- Did not change DNS, TLS, or configuration

## Handoff

- Next skill: ${HANDOFF}
- Signal attached: layer ${LAYER} ${LAYER_NAME}
EOF

    journal_log "READY" "Wrote the post-incident note" "local write" 0 0 "${NOTE_FILE}" "DIAGNOSED" "READY"
    step READY "Wrote ${NOTE_FILE}"
fi

exit 0
