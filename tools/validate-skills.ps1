# validate-skills.ps1 — Windows entry point for the skill policy checks.
#
# The PowerShell twin of tools/validate-skills.sh. Both delegate to
# scripts/validate-skills.mjs so there is exactly one implementation of the rules.
#
# Run from any working directory.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error 'node is required to run the skill validators'
    exit 127
}

& node (Join-Path $root 'scripts/validate-skills.mjs')
exit $LASTEXITCODE
