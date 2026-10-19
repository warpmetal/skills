# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository
(`Security` → `Report a vulnerability`). Do not open a public issue for security problems.

Please include: affected component (MCP server, CLI and vault, build scripts, catalog, or a skill's
content), the version or commit, reproduction steps, and impact.

## Scope

- `@warpmetal/skills-mcp` and its Docker image
- `@warpmetal/cli`: the credential vault, the provider adapters, and the approval gates
- Build, verify, and release tooling in `scripts/` and `.github/workflows/`
- Registry integrity: checksums, generated catalogs, and snapshot drift
- Skill content that could cause an agent to run destructive or exfiltrating commands

## Design commitments

- **The MCP server has two surfaces, and the transport decides which one a client can reach.** Over
  stdio it is both the skills reader and an execution surface: three `skill_*` content tools, 43
  `wm_*` tools that spawn the `warpmetal` CLI, and 1,331 provider tools that call third-party APIs
  with credentials held by the WarpMetal vault. Over the Streamable HTTP transport (`--http`) the
  `wm_*` and provider tools are **not registered at all** — the profile serves the three `skill_*`
  tools and the `skill://` resources, and nothing else. A way to reach a `wm_*` or provider tool
  over HTTP is a vulnerability. The full contract is in
  [`packages/skills-mcp/SECURITY.md`](packages/skills-mcp/SECURITY.md).
- The HTTP transport has **no authentication of its own** and binds `127.0.0.1` by default. An
  instance that must be reachable from another host belongs behind an edge that authenticates the
  caller and restricts the network; the container image opts into `0.0.0.0` explicitly because a
  published port needs it.
- **Irreversible verbs are gated, and the gate is defence in depth rather than consent.** A
  mutating `wm_*` call requires a named consequence and a single-use approval token bound to the
  resolved argv, re-verifies its preconditions immediately before spawning, and consults a
  persistent `manual_review` latch. Provider mutations inject the CLI's own `--confirm` literal,
  which the engine checks again. What that proves is that the server routed a mutation through the
  reviewed path — not that a human approved the specific call. The consent boundary is the MCP
  client's, and a client that calls a destructive tool without asking its user has not been
  stopped by this server.
- Path handling rejects absolute paths, backslashes, and empty/`.`/`..` segments, resolves symlinks
  before reading, and checks every requested file against the manifest, so `registry.json` acts as
  an allowlist for reads.
- `registry.json` records a sha256 for every published file; the server verifies it on read and CI
  verifies it before release. Checksums establish that the bytes match the manifest, not that the
  manifest is trustworthy: a consumer that needs authenticity must pin a tag and review it.
- Published artifacts are immutable per tag; installs should pin a tag rather than tracking a
  moving branch.
- GitHub Actions are pinned to immutable commit SHAs, not mutable tags; `scripts/check-action-pins.mjs`
  (wired into CI) fails a workflow that references an action by tag.
- The registry never contains credentials or customer data.

## Prompt-injection note

Skill content retrieved over MCP is untrusted input at the point of use. Version pinning plus the
checksum manifest lets consumers review exactly what a tag contains; MCP reads are convenient but
are not a substitute for reviewing a skill before an agent follows it.

The same applies to a provider response: it is data returned by a third party, and this server does
not treat it as instructions.
