# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository
(`Security` → `Report a vulnerability`). Do not open a public issue for security problems.

Please include: affected component (MCP server, build scripts, catalog, or a skill's content), the
version or commit, reproduction steps, and impact.

## Scope

- `@warpmetal/skills-mcp` and its Docker image
- Build, verify, and release tooling in `scripts/` and `.github/workflows/`
- Registry integrity: checksums, generated catalogs, and snapshot drift
- Skill content that could cause an agent to run destructive or exfiltrating commands

## Design commitments

- The MCP server is read-only. It exposes no tool that writes files, installs software, or executes
  shell commands.
- Path handling rejects absolute paths and traversal outside a skill directory.
- `registry.json` records a sha256 for every published file; CI verifies before release.
- Published artifacts are immutable per tag; installs should pin a tag rather than tracking a
  moving branch.
- The registry never contains credentials or customer data.

## Prompt-injection note

Skill content retrieved over MCP is untrusted input at the point of use. Version pinning plus the
checksum manifest lets consumers review exactly what a tag contains; MCP reads are convenient but
are not a substitute for reviewing a skill before an agent follows it.
