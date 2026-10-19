# Roadmap and delivery status

Execution status for this repository. The design rationale lives in [`PLAN.md`](PLAN.md)
and [`docs/coding-env-skill-plan.md`](docs/coding-env-skill-plan.md); this file tracks
what is done, what is pending, and what is still open.

Last updated: **2026-10-16**.

## Current state

- The skill registry, every generated distribution channel, the `@warpmetal/skills-mcp`
  server, and the `@warpmetal/cli` integration engine are implemented and verified offline.
- Workspace gates are green: `npm run build` + `npm run verify` (`verify: ok`, 9 skills);
  `packages/warpmetal-cli` runs **6,421 tests** (6,395 pass, 26 opt-in skips);
  `@warpmetal/skills-mcp` runs **193 tests** (189 pass, 4 opt-in skips); the registry tooling
  runs **33 tests** (`npm run test:scripts`); `tools/check-all.sh` and
  `tools/integration-selftest.sh` (35 assertions) pass.
- The MCP server exposes **1,377 tools on the `full` (stdio) profile** — 3 `skill_*`, 43 `wm_*`
  and 1,331 provider tools over 43 providers — and **3 on the `content` (HTTP) profile**. Which
  profile a client reaches is decided by the transport, not by the caller.
- The integration catalog behind `conventions/lib/integration.sh` carries **eight hand-written
  providers**: `cloudflare`, `github`, `slack`, `email`, `discord`, `vercel`, `sentry`, `stripe`.
  Every other catalog entry has a status-only adapter whose `run` refuses; its mutations go through
  the MCP tool catalog instead.
- Live provider evidence (vault to adapter to provider, no bridges) was produced in the lab
  for the baseline and for the five providers added in that pass. Those are the `live-verified`
  tier; everything else is `docs-confirmed` or `experimental`, and the tiers are defined in
  [`packages/skills-mcp/README.md`](packages/skills-mcp/README.md).
- A second, internal registry ships from the same repo: `internal-skills/` builds into
  `registry.internal.json` + git-ignored `snapshot.internal/`, served only by an authenticated
  `@warpmetal/skills-mcp` instance (bearer token) and never by the public catalog.
- The rules the repository states are enforced by the build, not by review: every `SKILL.md` must
  declare `disable-model-invocation: true`, every gate literal a script passes must exist in the
  `conventions/approvals.md` table, the secret scan covers `packages/` as well as the published
  content, and `registry.schema.json` refuses a `files[].path` containing `..`.

## Superseded decisions

Design decisions this repository reversed after recording them. [`PLAN.md`](PLAN.md) is frozen as a
design document, so the reversal is logged here and marked inline there.

### The MCP server is not read-only (reversed 2026-10-16)

`PLAN.md` locked the server as read-only and made it an acceptance criterion (R5). The server grew
two capabilities that contradict that, in two steps: `dcada4a` fused the `warpmetal` CLI surface
into `@warpmetal/skills-mcp` (43 `wm_*` tools, five of them irreversible), and the provider waves
(batches 1-18, from `eec9e98` onward) added 1,331 tools that call third-party APIs.

What replaced the guarantee:

- The `wm_*` and provider tools are **registered on stdio only**. The HTTP (`content`) profile
  registers the three `skill_*` tools and nothing else, so the unauthenticated transport cannot
  reach a mutation. That is the property the old R5 protected, moved from "no tool mutates" to "no
  unauthenticated route reaches a mutating tool".
- Irreversible verbs are gated by a named consequence and a single-use token bound to the resolved
  argv, re-verify their preconditions immediately before spawning, and consult a persistent
  `manual_review` latch.
- Both [`SECURITY.md`](SECURITY.md) and [`packages/skills-mcp/SECURITY.md`](packages/skills-mcp/SECURITY.md)
  state the limits of those gates: they prove the mutation went through the reviewed path, not that
  a human approved the specific call.

R5 was verified by "negative tests"; the replacement is verified by the profile tests
(`packages/skills-mcp/test/profiles.test.ts`) and the conformance suite's gate and latch cases.

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

Correctness pass, documentation and enforcement (added 2026-10-16):

- [x] The documents that described the server as read-only were corrected, and the reversal was
      logged under [Superseded decisions](#superseded-decisions) with the commits that caused it.
      Stale counts were corrected across `SECURITY.md`, `README.md`, `PLAN.md`, `ROADMAP.md`, and
      `packages/skills-mcp/package.json` (which advertised "131 tools, 42 providers" for a surface of
      1,331 across 43).
- [x] `disable-model-invocation: true` is required by the build for every `SKILL.md`, public and
      internal (`scripts/lib/build.mjs`). The one skill that lacked it, `warpmetal`, is the one that
      spends money — the rule now fails the build instead of relying on review.
- [x] The `conventions/approvals.md` gate table is enforced: a gate literal a script declares but the
      table does not list fails `npm run validate:skills`. `CONFIRM NOTIFY` was missing and is now
      recorded.
- [x] The secret scan covers `packages/`, because those packages are published. Exemptions are a
      per-line `secret-scan:allow <reason>` marker, and a marker without a reason is itself reported.
- [x] `registry.schema.json` refuses a `files[].path` containing `..`, so the manifest cannot express
      a traversal in the first place.
- [x] `scripts/` has a test suite at last (`npm run test:scripts`, 33 cases, wired into `verify.yml`):
      the frontmatter rule, the size limits, the gate table, the secret patterns, and the registry
      schema. The tooling that generates every artifact and backs `git diff --exit-code` had none.
- [x] Local skill reads are confined physically, not lexically: the resolved path is compared against
      the resolved registry root, so a symlink or Windows junction inside the registry cannot read
      outside it (`packages/skills-mcp/src/skills.ts`), with a junction regression test.
- [x] The README provider index is checked on every pull request. `gen:readme-index` had no `--check`
      wiring, so only the two scheduled drift jobs compared it, and they were in fact red: a
      hand-written paragraph about Plane sat *inside* the `provider-index` markers, which the
      generator deletes on every run. The paragraph was moved outside the markers and
      `check:readme-index` joined `check:providers-offline`.

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
- [ ] Cloudflare WAF/firewall adapters and automatic security updates. The adapter verbs are still DNS
      only; the MCP provider wave now covers zones, DNS, zone settings, cache and tokens (batch 14),
      R2, Workers, Queues, Pages, Workers KV, Vectorize, D1, Workflows and Hyperdrive (batch 15),
      Zero Trust (batch 16), observability, WAF and cache rules (batch 17), and Radar and the
      operational tools (batch 18).
- [x] The provider surface is verified against fixtures and, for a handful of providers, live. Wire the
      credential-free route probe (`npm run probe` in `packages/warpmetal-cli`, `MCP_PROBE=1`) into a
      scheduled workflow, record its per-tool verdict, and derive the `experimental` marker from it
      instead of the single hand-written entry in `src/providers/experimental.ts`.
- [ ] Derive the summary totals in `packages/skills-mcp/README.md` (1,377 / 43 / 1,331) and in the root
      `README.md` from the catalog. Only the block between the `provider-index` markers is generated
      today; the prose beside it is hand-written.
- [ ] Decide whether the secret scan should cover the whole tree rather than the trees that ship
      (`skills/`, `registry.json`, the generated channels, and `packages/`). A full scan of every
      tracked file was run by hand and came back clean apart from the three exempted fixtures, so the
      gap is small — but scanning the repository root directly would also read the git-ignored vendor
      dumps (`openapi.json`, 27 MB; `api-merged.json`), which makes the gate depend on what happens to
      be on the developer's disk. Closing this properly means scanning tracked files, which needs a
      source of truth for "tracked" that does not require git.

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
