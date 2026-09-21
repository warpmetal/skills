# Skills Registry + `@warpmetal/skills-mcp` — Implementation Plan

Status: planning complete; implementation ready to execute from a build agent.
Revision: 2026-09-21, revision 2 (adds repo bootstrap, Docker, CI/CD).
Companion plan: [`docs/coding-env-skill-plan.md`](docs/coding-env-skill-plan.md) (the `coding-env` skill and `warpmetal env` CLI).
Workstream: new repository `warpmetal/skills` plus generated channels consumed by agent-kit.

## 1. Context

Skills today are Agent Skills (`SKILL.md` + references) bundled inside the `warpmetal` npm package
and copied into host skill directories by `warpmetal agent install`. The ecosystem provides native
distribution channels that do not exist in this repo yet:

- **Claude Code / omp plugin marketplaces** — same catalog format. omp prefers
  `.omp-plugin/marketplace.json`, falls back to `.claude-plugin/marketplace.json`; installs become
  plugins containing skills, agents, commands, MCP servers.
- **Codex / ChatGPT plugin marketplace** — `.agents/plugins/marketplace.json`; agent-kit already
  ships one for its single plugin.
- **OpenCode V2 HTTP catalogs** — a `skills` URL entry with `index.json` listing
  `{name, version, files}`, files served relative and same-origin.

MCP is a runtime tool protocol, not a package manager: pulling skills over MCP needs the MCP server
already configured and cannot advertise skills in the system prompt. It is still valuable for
on-demand discovery, so this plan includes a read-only server alongside the file-based channels.

Decision: `warpmetal/skills` becomes the single source of truth; agent-kit consumes a pinned
snapshot; the MCP server is a standalone package released from the same repo.

## 2. Goals and non-goals

Goals:

- One registry (`registry.json`) from which every channel is generated: marketplace catalogs,
  Codex plugin marketplace, OpenCode catalog, npm snapshot, MCP server data.
- Host-native installs without the WarpMetal CLI: `omp plugin marketplace add warpmetal/skills`,
  Claude marketplace, Codex marketplace.
- Offline-capable, version-pinned consumption by agent-kit.
- A read-only skills MCP for on-demand discovery, shipped as an npm package and a multi-arch
  container image.
- Reproducible releases: GitHub Actions verifies, publishes to npm, pushes GHCR images, and deploys
  the immutable catalog.
- Migration of the existing `warpmetal` skill out of agent-kit without breaking users.

Non-goals (v1): private/authenticated registries, writing or installing skills over MCP,
auto-update, skill execution sandboxing, third-party skill submissions, paid skills, x402api-pay
bundling (it stays an external skill).

## 3. Decisions (locked 2026-09-21)

| Area | Decision |
|---|---|
| Registry home | Separate repo `warpmetal/skills`; agent-kit pins a released tag |
| Repo | `git@github.com:warpmetal/skills.git`; created 2026-09-21, currently empty |
| Visibility / license | Public; `UNLICENSED` for v1 (matching agent-kit); revisit licensing once skills stabilize |
| Channels | Ship host-native marketplace + catalog channels from the start |
| MCP | Build now; standalone package `@warpmetal/skills-mcp`; read-only |
| CLI consumption | Pinned bundled snapshot by default; explicit `--registry <tag>`/`skill update` to pull |
| Skill layout | `skills/<name>/SKILL.md` with references; name = lowercase kebab-case; matches OpenCode/omp/Claude/Codex discovery |
| Versioning | Repo semver tags; `registryVersion` equals tag; per-skill versions in v1 kept in lockstep |
| Security | Checksums in registry, generated catalogs only, explicit installs, no unpinned `latest` |
| Deployment | npm packages + multi-arch GHCR image + GitHub Pages catalog, all driven by GitHub Actions |

## 4. Repository layout

```
warpmetal/skills/
  PLAN.md                       # this plan, committed as the first document
  registry.json                 # source of truth (generated manifest, committed)
  registry.schema.json
  skills/
    warpmetal/SKILL.md, references/...
    coding-env/SKILL.md, references/{roles,providers}/...
  plugins/warpmetal/            # Claude/omp-compatible plugin (skills + plugin.json)
  .omp-plugin/marketplace.json
  .claude-plugin/marketplace.json
  .agents/plugins/marketplace.json
  catalog/index.json            # OpenCode HTTP catalog
  packages/skills-mcp/          # @warpmetal/skills-mcp (standalone, bin: warpmetal-skills-mcp)
    Dockerfile                  # multi-stage, non-root, stdio + optional HTTP
  packages/skills-registry/     # optional: @warpmetal/skills npm snapshot for agent-kit pinning
  scripts/{build-registry,build-catalogs,verify,release}
  .github/workflows/{verify,release}.yml
  README.md, CONTRIBUTING.md, SECURITY.md, CODEOWNERS, .gitignore
```

Catalog files are generated; CI verifies they match `registry.json` and fails drift. The MCP server
and the npm snapshot read the same manifest.

## 5. registry.json schema v1

```json
{
  "schemaVersion": 1,
  "registryVersion": "1.0.0",
  "generatedAt": "2026-09-21T00:00:00Z",
  "skills": [
    {
      "name": "coding-env",
      "version": "0.1.0",
      "description": "Set up a coding environment: services, credentials, tools.",
      "path": "skills/coding-env",
      "roles": ["planner", "builder", "reviewer"],
      "hosts": ["omp", "opencode", "codex", "claude", "cursor", "dsh", "agents"],
      "minimumWarpmetalCli": "0.9.0",
      "tags": ["setup", "environment"],
      "files": [
        { "path": "SKILL.md", "sha256": "<hex>" },
        { "path": "references/roles/planner.md", "sha256": "<hex>" }
      ]
    }
  ]
}
```

Rules: names kebab-case, unique; versions semver; `files` sorted, relative, traversal-free; lowercase
hex checksums; per-file and total size caps; no secrets or machine paths; unknown fields preserved
for forward compatibility.

## 6. Distribution channels

| Channel | Artifact | Consumer | Install command |
|---|---|---|---|
| Claude/omp marketplace | `.omp-plugin/marketplace.json` + `.claude-plugin/marketplace.json`, plugins under `plugins/` | omp, Claude Code | `omp plugin marketplace add warpmetal/skills`; Claude marketplace add |
| Codex/ChatGPT | `.agents/plugins/marketplace.json` + plugin dirs | Codex plugin system | codex marketplace add (P0: exact syntax) |
| OpenCode catalog | `catalog/index.json` + files | OpenCode V2 `skills` URL entries | add URL to `opencode.json` `skills` |
| npm snapshot | `@warpmetal/skills` package (registry + skills) | agent-kit build/pinning | pinned exact version in agent-kit |
| MCP | `@warpmetal/skills-mcp` (npm + GHCR image) | any MCP host | host MCP config, snippets provided |

Catalog hosting: versioned static URL (`https://skills.warpmetal.com/<tag>/index.json`) backed by
GitHub Pages from this repo, with a `latest` alias that always resolves to the newest release.
Catalogs are immutable per tag. `raw.githubusercontent.com` is the fallback if Pages/domain setup is
delayed.

## 7. MCP server design (`@warpmetal/skills-mcp`)

- Node + TypeScript, official `@modelcontextprotocol/sdk`; `bin: warpmetal-skills-mcp`; stdio
  transport default; `--http` serves Streamable HTTP on `0.0.0.0:8080` with `GET /healthz` and
  `GET /readyz`.
- Data source: bundled registry snapshot by default; `--registry <url|path>` and `--tag <version>`
  for pinned remote reads; never writes.
- Tools:
  - `skill_list` — id, version, description, roles, hosts.
  - `skill_search` — ranked match over name/description/tags/roles; bounded result count.
  - `skill_read` — `SKILL.md` plus optional `file` within the skill directory.
- Resources: `skill://<name>` and `skill://<name>/<relative-path>` with traversal, absolute-path,
  and escaped-path rejection (mirrors omp's `skill://` guards).
- Limits: response size caps, file allowlist from `registry.json`, no secret access, no install
  tools, no shell.
- Caching: registry version + ETag; cache under `$XDG_CACHE_HOME/warpmetal/skills-mcp`; offline
  fallback to bundled snapshot with a visible stale marker.
- Errors: bounded taxonomy — `not_found`, `too_large`, `traversal_rejected`, `registry_unavailable`.
- Docs: ready-to-paste config snippets for omp (`~/.omp/agent/mcp.json`), OpenCode
  (`opencode mcp add`), Codex (`config.toml`), Claude (`.mcp.json`), Cursor (`.cursor/mcp.json`);
  the `coding-env` CLI may write these on request.

## 8. Trust and security

- CI verifies every file checksum in `registry.json`; catalogs and the npm snapshot are generated,
  never hand-edited.
- Release tags are signed (minisign/cosign); release notes publish registry digest and per-skill
  checksums.
- Skill review policy: PR template, content rules (no secrets, no destructive commands, bounded
  network use, declared tools/roles), CODEOWNERS review before merge.
- Prompt-injection disclosure: MCP-returned content is untrusted input; document that MCP reads are
  not file-reviewed at install time and recommend version pinning.
- No auth in v1 (public read-only). Private/team registries are a future plan.
- Supply chain: lockfile, pinned deps, provenance, no postinstall scripts; container images get OCI
  SBOM + provenance attestations.

## 9. Release and versioning

1. PRs merge with checksum + schema CI green.
2. Tag `vX.Y.Z` → `build-catalogs` → verify → publish `@warpmetal/skills` and
   `@warpmetal/skills-mcp` to npm → push multi-arch GHCR image → deploy Pages catalog → GitHub
   release with checksums.
3. agent-kit bump PR: update the pinned snapshot, regenerate its bundled `skills/` and plugin copy,
   run `test/plugin.test.js` (now checksum-based), release the CLI.

Backward compatibility: `warpmetal agent install` keeps working for existing users; the CLI reads
the snapshot indirection so the cutover is invisible.

## 10. Migration from agent-kit

- Move `agent-kit/skills/warpmetal` into the registry; keep the content byte-identical (checksums
  recorded).
- agent-kit's bundled `skills/` and `plugins/warpmetal/` become generated artifacts of the pinned
  `@warpmetal/skills` version.
- `src/install-skill.js` resolves a skill name to the snapshot directory (registry becomes the
  future remote source).
- `test/plugin.test.js` switches from "byte-identical source copy" to "checksum matches pinned
  registry tag".
- `package.json` `files` and `check` entries updated; prepack regenerates the snapshot.

## 11. Requirements and acceptance

| ID | Requirement | Observable acceptance | Verification |
|---|---|---|---|
| R1 | Single source of truth | Every channel is generated from `registry.json`; drift check fails on mismatch | CI |
| R2 | Host-native installs | omp, Claude Code, and Codex install a skill from `warpmetal/skills` without the WarpMetal CLI | live host canary |
| R3 | OpenCode catalog | A pinned catalog URL installs `coding-env` in OpenCode with correct ID and version | host test |
| R4 | Pinned consumption | agent-kit snapshot checksums equal the pinned tag; `skill update` requires an explicit version | CI + CLI test |
| R5 | MCP read-only | No MCP tool can write files, install, or read outside a skill directory | negative tests |
| R6 | Traversal safety | `skill://` and `skill_read` reject absolute/`..`/escaped paths | security tests |
| R7 | Offline fallback | MCP serves the bundled snapshot when the registry is unreachable and labels it stale | fault test |
| R8 | Integrity | Tampered skill file fails verification before publish/install | CI |
| R9 | Version truth | MCP and registry report the exact version served; no `latest` in install paths | contract test |
| R10 | Secret safety | No credential, token, or machine path exists in registry, catalogs, or snapshots | scan |
| R11 | Backward compatibility | Existing `agent install` users see no behavior change | regression |
| R12 | Docs parity | Each channel has tested, copyable config snippets | docs test |
| R13 | Reproducible artifacts | `v*` tag produces npm packages, GHCR image, and Pages catalog with matching versions and attestations | release rehearsal |

## 12. Phases

**P0 — spikes and format validation (evidence required):**
1. Validate marketplace catalogs against a real omp version and Claude Code (paths, plugin layout,
   install/enable flow).
2. Confirm Codex plugin marketplace add/install syntax and catalog path.
3. Confirm OpenCode catalog entry rules (named markdown vs `SKILL.md`, cache busting).
4. Confirm GitHub Pages + custom domain availability for `skills.warpmetal.com`, and npm trusted
   publishing (OIDC) for the `@warpmetal` scope.
5. Decide MCP SDK dependency and stdio lifecycle behavior under each host.

**P1 — registry repo:** create `warpmetal/skills` from the empty remote, scaffold + branch
protection + CODEOWNERS, registry schema, skill move, build/verify scripts, `verify.yml` drift and
secret checks, generated channel files, README/CONTRIBUTING/SECURITY, Dockerfile, release workflow.

**P2 — MCP server:** package, tools/resources, caching, limits, error taxonomy, negative security
tests, per-host documentation snippets, multi-arch image build and GHCR publishing, npm publish
with provenance.

**P3 — integration:** npm snapshot package, agent-kit pinning PR, plugin test change, marketplace
publication, Pages catalog deployment, live host canaries, release notes.

## 13. Interfaces with `coding-env-skill-plan.md`

- The companion plan consumes only: skill directory layout, `registry.json` fields
  (`name`, `version`, `files`, `sha256`), and the published MCP snippets.
- The companion plan owns all `warpmetal env` behavior, host config writing, and credential
  handling; this plan owns content, distribution, and discovery.
- Until migration completes, the companion plan uses `agent-kit/skills/<name>/` as its content
  source; no behavior differences may be observable to users.
- `warpmetal skill list/install/update` command semantics are frozen by the companion plan; the
  remote resolution is implemented here.

## 14. Repo bootstrap, Docker, and CI/CD

### Bootstrap order (build-agent checklist)

1. Clone `git@github.com:warpmetal/skills.git` as a sibling checkout; never nest it inside another
   working tree.
2. Commit `PLAN.md` (this document) first, then the scaffold: README, `LICENSE` (UNLICENSED
   placeholder), `CODEOWNERS`, `.gitignore`, root tooling package (no npm workspaces; the MCP
   package keeps its own lockfile), `registry.schema.json`,
   `skills/`, `packages/skills-mcp/`, `scripts/`, `.github/workflows/`.
3. Seed `registry.json` with the two known skills (`warpmetal`, `coding-env`) and record checksums.
4. Protect `main`: require the `verify` workflow, require CODEOWNERS review, block force-push.
5. Verify environment prerequisites: `@warpmetal` npm scope ownership, npm trusted publishing,
   GHCR write access, Pages enabled.

### Docker (MCP server)

`packages/skills-mcp/Dockerfile`, multi-stage:

- build: `node:22-alpine`, `npm ci`, typecheck + build.
- runtime: `node:22-alpine` (distroless optional later), non-root user, production deps only.
- `ENTRYPOINT ["node", "dist/index.js"]`; stdio by default; `--http` mode binds `0.0.0.0:8080` with
  `/healthz` and `/readyz`.
- Read-only filesystem friendly: writes only to `$XDG_CACHE_HOME` or an explicit `--cache-dir`;
  supports `--registry` and `--tag`.
- OCI labels (source, version, revision); SBOM + provenance attestations on release.
- Image: `ghcr.io/warpmetal/skills-mcp`, tags `X.Y.Z`, `X.Y`, `sha-<short>`, and `latest` on release
  only.
- `docker compose up` example for self-hosting; no credentials required (public read-only).

Docker is not required for laptop hosts (they use `npx`); it exists for remote/HTTP MCP,
self-hosting, and private deployments.

### GitHub Actions

| Workflow | Trigger | Jobs |
|---|---|---|
| `verify.yml` | pull_request, push to `main` | install, typecheck, unit tests, registry schema + checksum verification, catalog drift check, secret scan, Docker build + stdio handshake + HTTP health smoke |
| `release.yml` | tag `v*` | re-run verify; publish `@warpmetal/skills` and `@warpmetal/skills-mcp` to npm with provenance; build/push multi-arch GHCR image (`linux/amd64`,`linux/arm64`) with attestations; build catalogs; deploy GitHub Pages (immutable `/<tag>/` + `latest` alias); create GitHub Release with registry digest |

Permissions: default `contents: read`. Release job adds `id-token: write` (npm provenance,
attestations), `packages: write` (GHCR), and `pages: write` for the catalog deployment. Prefer npm
OIDC trusted publishing so no long-lived `NPM_TOKEN` exists; if unavailable in P0, use a scoped
automation token stored as a repository secret.

## 15. Delivery status (2026-09-21)

Completed in this repository:

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
- [x] 15 tests passing locally; green CI on pushes `c11dc49`, `fd4cd7b`, and `bfa70f3`.

Pending, requires org access or later workstreams:

- [ ] `@warpmetal` npm scope + trusted publishing; GitHub Pages enablement; branch protection
      requiring `verify`; CODEOWNERS team handle.
- [ ] Live host validation on real installs: omp, Claude Code, Codex, OpenCode, DeepSeek Harness.
- [ ] First `v*` tag to exercise the release pipeline end to end.
- [ ] `coding-env` skill content lands in `skills/` when the `warpmetal env` CLI ships
      ([companion plan](docs/coding-env-skill-plan.md)); agent-kit pins a released registry tag.
- [ ] Deferred: `@warpmetal/skills` npm snapshot package (agent-kit can pin the git tag meanwhile).

## 16. Open items

- Catalog host and URL scheme; whether to keep `raw.githubusercontent.com` as fallback.
- Whether `@warpmetal/skills` snapshot is an npm package or a build artifact vendored into
  agent-kit; decide in P1 based on agent-kit's release process.
- Signing tooling choice (minisign vs cosign) and whether to require it for v1.
- npm trusted publishing availability; GHCR/Pages permissions check.
- Runtime base image choice (alpine vs distroless) and HTTP mode auth story for self-hosted
  deployments.
- Whether a later private/team registry reuses the same schema (keep fields forward-compatible).
- Codex marketplace submission path and review requirements.

## Implementation notes (2026-09-21)

- Root tooling is a plain private package; `packages/skills-mcp` is independent with its own
  lockfile (simpler Docker builds than npm workspaces).
- The optional `@warpmetal/skills` npm snapshot package is deferred. agent-kit can pin this
  repository's tag; the MCP package bundles `packages/skills-mcp/snapshot/`, generated by
  `npm run build`.
- Docker build context is `packages/skills-mcp`; generate the snapshot first (CI runs
  `npm run build` before `docker build`).
- GitHub Pages publishes `/<tag>/` plus a `latest/` alias from `npm run pages`; the hosted HTTP MCP
  endpoint is not deployed yet.
- `npm run verify` checks schema, checksum coverage both ways, catalog drift, copied-file drift,
  and a secret scan. `verify.yml` additionally runs `git diff --exit-code` and a Docker smoke test.
- Live host validation against omp, Claude Code, Codex, and OpenCode remains P0 pending real
  installs, as does confirming `@warpmetal` npm scope access and enabling Pages.
