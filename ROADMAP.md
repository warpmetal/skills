# Roadmap and delivery status

Execution status for this repository. The design rationale lives in [`PLAN.md`](PLAN.md)
and [`docs/coding-env-skill-plan.md`](docs/coding-env-skill-plan.md); this file tracks
what is done, what is pending, and what is still open.

Last updated: **2026-10-03**.

## Current state

- The skill registry, every generated distribution channel, the `@warpmetal/skills-mcp`
  server, and the `@warpmetal/cli` integration engine are implemented and verified offline.
- Workspace gates are green: `npm run build` + `npm run verify` (`verify: ok`, 9 skills);
  `packages/warpmetal-cli` runs **79 tests** (78 pass, 1 Windows file-mode skip);
  `@warpmetal/skills-mcp` runs **147 tests** (143 pass, 4 skip); `tools/check-all.sh` and
  `tools/integration-selftest.sh` (35 assertions) pass.
- The integration catalog carries **eight providers**: `cloudflare`, `github`, `slack`,
  `email`, `discord`, `vercel`, `sentry`, `stripe`.
- Live provider evidence (vault to adapter to provider, no bridges) was produced in the lab
  for the baseline and for the five providers added in this pass.
- A second, internal registry ships from the same repo: `internal-skills/` builds into
  `registry.internal.json` + git-ignored `snapshot.internal/`, served only by an authenticated
  `@warpmetal/skills-mcp` instance (bearer token) and never by the public catalog.

## Completed

Repository scaffolding and registry:

- [x] Repository bootstrap: public `warpmetal/skills`, `PLAN.md`, README, CONTRIBUTING, SECURITY,
      LICENSE (UNLICENSED), CODEOWNERS, CI workflows.
- [x] Registry v1: `registry.json` + `registry.schema.json`, per-file sha256, `warpmetal` skill
      migrated with recorded checksums.
- [x] Generated channels: `.omp-plugin/` and `.claude-plugin/` marketplaces, `.agents/plugins/`
      Codex catalog, `plugins/warpmetal/` plugin, `catalog/` OpenCode catalog, MCP snapshot.
- [x] `@warpmetal/skills-mcp`: `skill_list`, `skill_search`, `skill_read`, `skill://` resources,
      checksum verification on read, path/size guards, stdio + Streamable HTTP, remote
      `--registry`/`--tag` with ETag cache and offline fallback.
- [x] Docker: multi-stage non-root image (node:22-alpine); local build, `--version`, `/healthz`,
      and `/readyz` smoke tests pass.
- [x] CI/CD: `verify.yml` (schema, checksums, drift, secret scan, tests, Docker smoke) and
      `release.yml` (npm provenance, multi-arch GHCR image, Pages catalog, GitHub release).
- [x] DeepSeek Harness channel: skills roots and `dsh-mcp-client` snippet documented, `dsh` and
      `mcp` host metadata on the skill.
- [x] Dynamic registry resolution: `latest` by default over the catalog host, ETag revalidation,
      cache next, bundled snapshot last (marked stale); 19 tests including remote and cache paths.
- [x] `releases.json` history generated at release time for update checks and version lookups.
- [x] Green CI on every push.

Provider integrations (added 2026-09-28, extended 2026-10-03):

- [x] `packages/warpmetal-cli` (`@warpmetal/cli`): a superset `warpmetal` binary that implements
      `env` and `integration` locally and delegates every other command verbatim to the pinned
      upstream package (`warpmetal-upstream: npm:warpmetal@0.8.12`), so there is no fork.
- [x] Credential vault: AES-256-GCM + scrypt file backend under `~/.config/warpmetal/env/` with
      `0600`/`0700` and write-then-rename, plus an optional `@napi-rs/keyring` backend. One
      emission path only: `warpmetal env secret <name> --stdout`.
- [x] Provider adapters with non-mutating status probes, honest degradation, idempotent writes,
      and per-verb gate literals checked both in bash and in the engine. The catalog is now
      `cloudflare`, `github`, `slack`, `email`, `discord`, `vercel`, `sentry`, `stripe`.
- [x] `conventions/lib/integration.sh`: resolution, honest `check_skipped` degradation, `0600`
      secret files with a PID-keyed cleanup registry, and `integration_run_mutating`.
- [x] Wiring: `migrate-site` cutover applies the A record through Cloudflare, `ssl-dns-fix` obtains
      DNS-01 credentials from the vault, `server-monitoring` resolves the Kuma key from the vault and
      can prove the Slack path, `deploy-site` verifies repository access.
- [x] Manifest `[integrations.<provider>]` references (zone id, account, secret *name*), never values.
- [x] `integrations` in `registry.schema.json`, the registry build, the MCP server, and
      `npm run validate:skills` (a declared provider must exist in the engine catalog).
- [x] Tests: CLI unit suite (79 tests, 1 Windows-mode skip), 35 integration-library assertions, and
      `conventions/` copies that are generated and drift-checked.
- [x] CI: `verify.yml` installs, typechecks, and tests the engine and runs `tools/check-all.sh`;
      `release.yml` publishes `@warpmetal/cli` and attaches its tarball to the GitHub release.

Private skills via an authenticated registry (added 2026-10-02, Option 2):

- [x] `internal-skills/` in this repo: public in git but never served by the public catalog. A second
      registry is built with `npm run build:internal` into `registry.internal.json` +
      git-ignored `snapshot.internal/`; `npm run verify:internal` checks the schema, checksums both
      ways, snapshot parity, a secret scan, and that no internal skill name appears in the public
      `registry.json` (the isolation guard).
- [x] `buildRegistryModel` takes an optional `skillsDir` (default `skills/`), so one toolchain builds
      both registries; the per-skill `path` stays `skills/<name>` as the server requires.
- [x] MCP bearer-token auth: `Authorization: Bearer` on manifest and file fetches, cache partitioned
      by a token hash, `registry_unauthorized` on `401`/`403` (fails closed), and
      `--registry-token-file` for hosts (DeepSeek Harness) that scrub `*TOKEN*` variables.
- [x] CI: `verify.yml` builds and verifies the internal registry, and `git diff --exit-code` covers
      `registry.internal.json`; nothing internal is published.

## Pending

Requires org access or later workstreams:

- [ ] `@warpmetal` npm scope + trusted publishing; GitHub Pages enablement; branch protection
      requiring `verify`; CODEOWNERS team handle.
- [ ] Live host validation on real installs: omp, Claude Code, Codex, OpenCode, DeepSeek Harness.
- [ ] First `v*` tag to exercise the release pipeline end to end.
- [ ] `coding-env` skill content lands in `skills/`; the `warpmetal env` engine it wraps now exists
      in `packages/warpmetal-cli` (vault, `store`/`secret`/`status`/`doctor`/`revoke`), while
      `setup`/`plan`/`apply` and host-config writing remain in that workstream.
      See [`docs/coding-env-skill-plan.md`](docs/coding-env-skill-plan.md).
- [ ] CLI registry client, lockfile, and explicit update semantics land with the `coding-env` workstream.
- [ ] Cloudflare WAF/firewall adapters and automatic security updates (later batch; this release is
      DNS only).

## Decided

- No `@warpmetal/skills` snapshot package: consumers resolve the registry dynamically and pin
  registry tags plus a local lockfile. The MCP package bundles `packages/skills-mcp/snapshot/`
  only as an offline last resort.

## Open items

- Catalog host and URL scheme; whether to keep `raw.githubusercontent.com` as fallback.
- Signing tooling choice (minisign vs cosign) and whether to require it for v1.
- npm trusted publishing availability; GHCR/Pages permissions check.
- Runtime base image choice (alpine vs distroless) and HTTP mode auth story for self-hosted
  deployments.
- Resolved: a private/team registry reuses `schemaVersion: 1` unchanged. Visibility is not a schema
  field; isolation comes from which registry a process loads, so the same schema, build tooling and
  server serve both the public and a private registry.
- Codex marketplace submission path and review requirements.
