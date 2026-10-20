#!/usr/bin/env bash
# integration-selftest.sh — behavioural test for conventions/lib/integration.sh
#
# Runs against a stub `warpmetal` CLI so it is offline and deterministic. It
# proves the three properties the plan calls out, plus the one that matters most:
#
#   1. Degradation is visible. With no CLI, a missing provider, or a missing
#      external tool, a `check_skipped` warning is recorded - never a silent pass.
#   2. A secret reaches a file only through a 0600 path, and the file is removed.
#   3. A mutating verb does not run without an approved gate, and the caller gets
#      exit 11 with nothing recorded upstream.
#
# Run from any working directory.
set -euo pipefail

_here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "${_here}")"
LIB="${ROOT}/skills/migrate-site/conventions/lib/bootstrap.sh"

CANARY="canary-value-that-must-never-leak-9f3a2b"
ABSENT_TOOL="wm-absent-tool-for-selftest"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

PASS=0
FAIL=0

ok() {
    PASS=$((PASS + 1))
    printf '  ok   %s\n' "$1"
}

bad() {
    FAIL=$((FAIL + 1))
    printf '  FAIL %s\n' "$1" >&2
}

expect_eq() {
    if [[ "$1" == "$2" ]]; then
        ok "$3"
    else
        bad "$3 (expected '$2', got '$1')"
    fi
}

# --- Stub CLI -----------------------------------------------------------------

cat >"${WORK}/warpmetal" <<'STUB'
#!/usr/bin/env bash
record="${WM_TEST_RECORD:-/dev/null}"
case "${1:-}" in
    env)
        case "${2:-}" in
            status) printf '{"backend":"file","exists":true,"generation":3,"secretCount":1}\n'; exit 0 ;;
            secret)
                if [[ "${3:-}" == "cloudflare.token" ]]; then
                    printf '%s' "${WM_TEST_CANARY:-canary}"
                    exit 0
                fi
                printf 'ERROR: no such secret\n' >&2
                exit 3
                ;;
            *) exit 2 ;;
        esac
        ;;
    integration)
        case "${2:-}" in
            list)
                cat <<'JSON'
{
  "providers": [
    {
      "name": "cloudflare",
      "requiresTools": [],
      "capabilities": [
        "dns.record.upsert"
      ]
    },
    {
      "name": "github",
      "requiresTools": [
        "wm-absent-tool-for-selftest"
      ],
      "capabilities": [
        "repo.view"
      ]
    },
    {
      "name": "slack",
      "requiresTools": [
        "sh"
      ],
      "capabilities": [
        "notify.send"
      ]
    }
  ]
}
JSON
                exit 0
                ;;
            status)
                case "${3:-}" in
                    cloudflare)
                        if [[ -n "${WM_TEST_STATUS_ACTIVE:-}" ]]; then
                            printf '{"status":"OK"}\n'
                            exit 0
                        fi
                        printf '{"status":"NEEDS_AUTH"}\n'
                        exit 4
                        ;;
                    github|slack) printf '{"status":"NEEDS_AUTH"}\n'; exit 4 ;;
                    *) printf '{"status":"ERROR"}\n'; exit 2 ;;
                esac
                ;;
            *)
                printf '%s\n' "$*" >>"${record}"
                printf '{"status":"OK"}\n'
                exit 0
                ;;
        esac
        ;;
esac
exit 2
STUB
chmod +x "${WORK}/warpmetal"

export WM_TEST_RECORD="${WORK}/record"
export WM_TEST_CANARY="${CANARY}"
: >"${WM_TEST_RECORD}"

# shellcheck source=/dev/null
source "${LIB}"

printf 'integration.sh self-test\n'

# --- 1. Honest degradation: no CLI on PATH ------------------------------------
#
# PATH is narrowed to the system bin directories rather than emptied: the library
# under test still needs `date`, `mktemp` and `rm`. The stub directory is what is
# withheld, so `command -v warpmetal` genuinely finds nothing.

save_path="${PATH}"
export PATH="/usr/bin:/bin"
integration_reset
result_init "integration-selftest" "selftest"
if integration_available cloudflare; then
    bad "integration_available must fail when the CLI is absent"
else
    ok "integration_available fails when the CLI is absent"
fi
integration_require_tools cloudflare "the DNS check" || true
warnings_text="$(printf '%s\n' "${RESULT_WARNINGS[@]+"${RESULT_WARNINGS[@]}"}")"
case "${warnings_text}" in
    *"is not installed"*) ok "a missing CLI records check_skipped" ;;
    *) bad "a missing CLI must record check_skipped (got: ${warnings_text})" ;;
esac
export PATH="${save_path}"

# --- 2. Unknown provider ------------------------------------------------------

export PATH="${WORK}:${save_path}"
integration_reset
result_init "integration-selftest" "selftest"
if integration_available no-such-provider; then
    bad "an unknown provider must not be reported as available"
else
    ok "an unknown provider is not available"
fi
integration_require_tools no-such-provider "the unknown check" || true
warnings_text="$(printf '%s\n' "${RESULT_WARNINGS[@]+"${RESULT_WARNINGS[@]}"}")"
case "${warnings_text}" in
    *"is not offered by"*) ok "an unknown provider records check_skipped" ;;
    *) bad "an unknown provider must record check_skipped (got: ${warnings_text})" ;;
esac

# --- 3. A known provider with a satisfied tool list ---------------------------

result_init "integration-selftest" "selftest"
if integration_require_tools slack "the Slack check"; then
    if [[ ${#RESULT_WARNINGS[@]} -eq 0 ]]; then
        ok "a satisfied provider records no warning"
    else
        bad "a satisfied provider must record no warning (got: ${RESULT_WARNINGS[*]})"
    fi
else
    bad "slack should be available with 'sh' present"
fi

# --- 4. A known provider with a missing tool ----------------------------------

result_init "integration-selftest" "selftest"
if integration_require_tools github "the GitHub check"; then
    bad "github should report a missing tool"
else
    ok "a missing external tool is detected"
fi
warnings_text="$(printf '%s\n' "${RESULT_WARNINGS[@]+"${RESULT_WARNINGS[@]}"}")"
case "${warnings_text}" in
    *"${ABSENT_TOOL}"*) ok "the missing tool is named in the warning" ;;
    *) bad "the warning must name the missing tool (got: ${warnings_text})" ;;
esac
case "${warnings_text}" in
    *"${CANARY}"*) bad "a secret value leaked into warnings" ;;
    *) ok "no secret value in warnings" ;;
esac

# --- 5. Secret file: 0600, correct content, cleaned up ------------------------

result_init "integration-selftest" "selftest"
secret_file="$(integration_secret_file cloudflare.token)"
if [[ -n "${secret_file}" && -f "${secret_file}" ]]; then
    ok "integration_secret_file creates a file"
else
    bad "integration_secret_file did not create a file"
fi

mode="$(stat -c '%a' "${secret_file}" 2>/dev/null || stat -f '%Lp' "${secret_file}" 2>/dev/null || printf 'unknown')"
expect_eq "${mode}" "600" "the secret file is 0600"

content="$(cat "${secret_file}")"
expect_eq "${content}" "${CANARY}" "the secret file holds exactly the value"

integration_tmp_cleanup
if [[ -f "${secret_file}" ]]; then
    bad "integration_tmp_cleanup left the file behind"
else
    ok "integration_tmp_cleanup removes the file"
fi

# --- 6. A mutating verb without a gate ----------------------------------------

result_init "integration-selftest" "selftest"
: >"${WM_TEST_RECORD}"
set +e
integration_run_mutating cloudflare dns-upsert "CONFIRM DNS CHANGE" \
    --zone-id z1 --name a.example.com --type A --content 1.2.3.4 >/dev/null 2>&1
rc=$?
set -e
expect_eq "${rc}" "11" "an ungated mutation is refused with exit 11"
expect_eq "$(wc -c <"${WM_TEST_RECORD}" | tr -d ' ')" "0" "nothing was recorded upstream"

# --- 7. A mutating verb with the wrong gate -----------------------------------

result_init "integration-selftest" "selftest"
confirm_add "CONFIRM CUTOVER"
: >"${WM_TEST_RECORD}"
set +e
integration_run_mutating cloudflare dns-upsert "CONFIRM DNS CHANGE" --zone-id z1 >/dev/null 2>&1
rc=$?
set -e
expect_eq "${rc}" "11" "a mismatched gate is refused with exit 11"
expect_eq "$(wc -c <"${WM_TEST_RECORD}" | tr -d ' ')" "0" "a mismatched gate records nothing"

# --- 8. A mutating verb with the approved gate --------------------------------

result_init "integration-selftest" "selftest"
confirm_add "CONFIRM DNS CHANGE"
: >"${WM_TEST_RECORD}"
set +e
integration_run_mutating cloudflare dns-upsert "CONFIRM DNS CHANGE" \
    --zone-id z1 --name a.example.com --type A --content 1.2.3.4 >/dev/null 2>&1
rc=$?
set -e
expect_eq "${rc}" "0" "an approved gate runs the verb"
recorded="$(cat "${WM_TEST_RECORD}")"
case "${recorded}" in
    *"--confirm CONFIRM DNS CHANGE"*) ok "the gate is forwarded to the engine" ;;
    *) bad "the gate must be forwarded (recorded: ${recorded})" ;;
esac
case "${recorded}" in
    *"--json"*) ok "--json is always requested" ;;
    *) bad "--json must always be requested (recorded: ${recorded})" ;;
esac

# --- 9. A read-only verb needs no gate ----------------------------------------

result_init "integration-selftest" "selftest"
: >"${WM_TEST_RECORD}"
set +e
integration_run cloudflare dns-list --zone-id z1 >/dev/null 2>&1
rc=$?
set -e
expect_eq "${rc}" "0" "a read-only verb runs without a gate"
case "$(cat "${WM_TEST_RECORD}")" in
    *"--confirm"*) bad "a read-only verb must not invent a --confirm" ;;
    *) ok "a read-only verb adds no --confirm" ;;
esac

# --- 10. Readiness is stricter than availability ------------------------------
#
# `available` answers "can this engine do the provider"; `ready` answers "will a
# mutation succeed right now". A cutover must branch on the second, because the
# first would let it fail halfway through on a missing token.

result_init "integration-selftest" "selftest"
if integration_available cloudflare; then
    ok "cloudflare is available while its credential is missing"
else
    bad "cloudflare should be available: the engine offers it"
fi
if integration_ready cloudflare; then
    bad "cloudflare must not be ready while the probe returns NEEDS_AUTH"
else
    ok "cloudflare is not ready while the probe returns NEEDS_AUTH"
fi

result_init "integration-selftest" "selftest"
if integration_require_ready cloudflare "the DNS-01 challenge"; then
    bad "integration_require_ready must fail when the provider is not ready"
else
    ok "integration_require_ready fails when the provider is not ready"
fi
warnings_text="$(printf '%s\n' "${RESULT_WARNINGS[@]+"${RESULT_WARNINGS[@]}"}")"
case "${warnings_text}" in
    *"is not ready"*) ok "an unready provider records check_skipped" ;;
    *) bad "an unready provider must record check_skipped (got: ${warnings_text})" ;;
esac

export WM_TEST_STATUS_ACTIVE=1
integration_reset
if integration_ready cloudflare; then
    ok "cloudflare is ready once the probe reports OK"
else
    bad "cloudflare should be ready once the probe reports OK"
fi
result_init "integration-selftest" "selftest"
if integration_require_ready cloudflare "the DNS-01 challenge"; then
    if [[ ${#RESULT_WARNINGS[@]} -eq 0 ]]; then
        ok "a ready provider records no warning"
    else
        bad "a ready provider must record no warning (got: ${RESULT_WARNINGS[*]})"
    fi
else
    bad "integration_require_ready should succeed for a ready provider"
fi
unset WM_TEST_STATUS_ACTIVE
integration_reset

# --- 11. Manifest references: names, never values ------------------------------
#
# The accessors read a flattened dump, so this needs no TOML file. The point of
# the section is that a manifest yields *references* - a zone id, a channel, the
# name of a secret - and that the default secret name follows the provider.

MANIFEST_DUMP="$(printf '%s\n' \
    $'integrations.cloudflare.zone_id\t023e105f4ecef8ad9ca31a8372d0c353' \
    $'integrations.cloudflare.account\tacme' \
    $'integrations.cloudflare.secret\tmy.cf.token' \
    $'integrations.slack.channel\t#acme-alerts' \
    $'host\tacme-prod')"

expect_eq "$(manifest_integration cloudflare zone_id)" "023e105f4ecef8ad9ca31a8372d0c353" "manifest_integration reads a zone id"
expect_eq "$(manifest_integration cloudflare ttl 1)" "1" "manifest_integration falls back to the default"
expect_eq "$(manifest_integrations | tr '\n' ' ' | sed 's/ $//')" "cloudflare slack" "manifest_integrations lists every declared provider in order"
expect_eq "$(integration_ref slack channel)" "#acme-alerts" "integration_ref reads a channel reference"
expect_eq "$(integration_secret_name cloudflare)" "my.cf.token" "the declared secret name wins"
expect_eq "$(integration_secret_name github)" "github.token" "an undeclared provider defaults to <provider>.token"

if integration_declared cloudflare; then
    ok "integration_declared sees the declared provider"
else
    bad "integration_declared should see cloudflare"
fi
if integration_declared unlisted-provider; then
    bad "integration_declared must not invent an undeclared provider"
else
    ok "integration_declared rejects an undeclared provider"
fi

# --- 12. remote_quote: a value survives the round-trip -------------------------
#
# The migration replaces '${VAR}' in remote command strings with
# $(remote_quote "${VAR}"). The property that matters is that when the remote
# shell parses the produced token it yields exactly the original value, no
# matter what the value carries.

roundtrip_remote_quote() {
    local original="$1"
    local quoted
    quoted="$(remote_quote "${original}")"
    bash -c "printf '%s' ${quoted}"
}

expect_eq "$(roundtrip_remote_quote 'plain')" "plain" "remote_quote round-trips a plain value"
expect_eq "$(roundtrip_remote_quote "o'brien")" "o'brien" "remote_quote round-trips a single quote"
expect_eq "$(roundtrip_remote_quote 'has space')" "has space" "remote_quote round-trips a space"
expect_eq "$(roundtrip_remote_quote 'semi;colon')" "semi;colon" "remote_quote round-trips a semicolon"
expect_eq "$(roundtrip_remote_quote '$(id -u)')" '$(id -u)' "remote_quote round-trips a command substitution"
expect_eq "$(roundtrip_remote_quote 'glob*star')" "glob*star" "remote_quote round-trips a glob"
expect_eq "$(roundtrip_remote_quote 'back`tick')" 'back`tick' "remote_quote round-trips a backtick"
expect_eq "$(roundtrip_remote_quote '')" "" "remote_quote round-trips the empty string"
expect_eq "$(remote_quote 'a b')" "'a b'" "remote_quote wraps the value in single quotes"

# --- 13. require_gate_now: the mutation-time re-check --------------------------
#
# require_confirm approves up front; require_gate_now proves a mutating step is
# not reachable through a code path that skipped it. Same strictness, same exit.

result_init "integration-selftest" "selftest"
CONFIRM_VALUES=()
confirm_add "CONFIRM DEPLOY"
if require_gate_now "CONFIRM DEPLOY" "context"; then
    ok "require_gate_now passes when the gate is approved"
else
    bad "require_gate_now must pass when the gate is approved"
fi

set +e
CONFIRM_VALUES=()
( require_gate_now "CONFIRM DEPLOY" "context" ) >/dev/null 2>&1
rc=$?
set -e
if [[ "${rc}" -eq 11 ]]; then
    ok "require_gate_now exits 11 when the gate was never approved"
else
    bad "require_gate_now must exit 11 when the gate was never approved (got ${rc})"
fi

# --- 14. journal_sanitize: the `key=` and env-file rules ----------------------
#
# logging.md promises `key=...` and whole `KEY=value` lines are redacted. The
# broad env-line rule is checked too, because a journal must over-redact rather
# than leak.

expect_eq "$(printf '%s\n' '--key=abc123' | journal_sanitize)" "--key=***REDACTED***" "journal_sanitize redacts key= in a flag"
expect_eq "$(printf '%s\n' 'api_key=abc123' | journal_sanitize)" "***ENV FILE REDACTED***" "a KEY= line is redacted whole (the env rule wins)"
expect_eq "$(printf 'APP_KEY=base64:secret' | journal_sanitize)" "***ENV FILE REDACTED***" "journal_sanitize redacts a KEY=value line"
expect_eq "$(printf 'export DB_PASSWORD=sekrit' | journal_sanitize)" "export ***ENV FILE REDACTED***" "journal_sanitize keeps the export keyword"
expect_eq "$(printf 'plain text line' | journal_sanitize)" "plain text line" "journal_sanitize leaves prose alone"
expect_eq "$(printf 'Authorization: Bearer tok123' | journal_sanitize)" "Authorization: Bearer ***REDACTED***" "journal_sanitize redacts a bearer token"

# --- 15. ssh_handshake: a mutating preflight fails before mutating -------------
set +e
ssh_handshake "no-such-alias-for-selftest" >/dev/null 2>&1
HS_RC=$?
set -e
if [[ "${HS_RC}" -ne 0 ]]; then
    ok "ssh_handshake fails on an unreachable host"
else
    bad "ssh_handshake must fail on an unreachable host"
fi

# --- 16. manifest secret scan: references pass, credentials fail ---------------
MANIFEST_DUMP="$(printf '%s\n' \
    $'backup.repo\ts3:https://s3.amazonaws.com/bucket' \
    $'integrations.github.secret\tgithub.token' \
    $'host\tacme-prod')"
set +e
( _manifest_scan_secrets ) >/dev/null 2>&1
SCAN_RC=$?
set -e
if [[ "${SCAN_RC}" -eq 0 ]]; then
    ok "manifest secret scan passes a clean manifest"
else
    bad "a clean manifest must pass the secret scan (rc ${SCAN_RC})"
fi

MANIFEST_DUMP="$(printf '%s\n' $'backup.repo\tghp_0123456789abcdefghijklmnopqrstuvwx')"
set +e
( _manifest_scan_secrets ) >/dev/null 2>&1
SCAN_RC=$?
set -e
if [[ "${SCAN_RC}" -eq 5 ]]; then
    ok "manifest secret scan rejects a credential"
else
    bad "a credential in the manifest must exit 5 (rc ${SCAN_RC})"
fi

printf '\nintegration-selftest: %d passed, %d failed\n' "${PASS}" "${FAIL}"
if [[ "${FAIL}" -gt 0 ]]; then
    exit 1
fi
