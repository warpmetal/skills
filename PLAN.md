# Skills Registry + `@warpmetal/skills-mcp` — Implementation Plan

Status: design locked 2026-09-21; execution status is tracked in [`ROADMAP.md`](ROADMAP.md).
Revision: 2026-09-21, revision 2 (adds repo bootstrap, Docker, CI/CD); frozen as a design document.
Related plan: [`docs/coding-env-skill-plan.md`](docs/coding-env-skill-plan.md) (the `coding-env` skill and `warpmetal env` CLI).
Workstream: this repository (`warpmetal/skills`): the skill registry, every generated distribution channel, the `warpmetal` CLI, and the MCP server.

## 1. Context

Skills today are Agent Skills (`SKILL.md` + references) bundled inside the `warpmetal` npm package
and copied into host skill directories by `warpmetal agent install`. The ecosystem provides native
distribution channels that do not exist in this repo yet:

- **Claude Code / omp plugin marketplaces** — same catalog format. omp prefers
  `.omp-plugin/marketplace.json`, falls back to `.claude-plugin/marketplace.json`; installs become
  plugins containing skills, agents, commands, MCP servers.
- **Codex / ChatGPT plugin marketplace** — `.agents/plugins/marketplace.json`, mirroring the
  catalog format the Codex plugin system consumes.
- **OpenCode V2 HTTP catalogs** — a `skills` URL entry with `index.json` listing
  `{name, version, files}`, files served relative and same-origin.

MCP is a runtime tool protocol, not a package manager: pulling skills over MCP needs the MCP server
already configured and cannot advertise skills in the system prompt. It is still valuable for
on-demand discovery, so this plan includes a read-only server alongside the file-based channels.

Decision: `warpmetal/skills` becomes the single source of truth; the CLI and the MCP server consume
it; the MCP server is a standalone package released from the same repo.

## 2. Goals and non-goals

Goals:

- One registry (`registry.json`) from which every channel is generated: marketplace catalogs,
  Codex plugin marketplace, OpenCode catalog, npm snapshot, MCP server data.
- Host-native installs without the WarpMetal CLI: `omp plugin marketplace add warpmetal/skills`,
  Claude marketplace, Codex marketplace.
- Offline-capable, version-pinned consumption by the `warpmetal` CLI.
- A read-only skills MCP for on-demand discovery, shipped as an npm package and a multi-arch
  container image.
- Reproducible releases: GitHub Actions verifies, publishes to npm, pushes GHCR images, and deploys
  the immutable catalog.

Non-goals (v1): authenticated *transport* in this server, writing or installing skills over MCP,
auto-update, skill execution sandboxing, third-party skill submissions, paid skills, x402api-pay
bundling (it stays an external skill). Private/team registries are served by a second instance
loading a second registry; the isolation is the loaded registry, plus an optional bearer token the
server can send to an authenticated catalog (see §8).

## 3. Decisions (locked 2026-09-21)

| Area | Decision |
|---|---|
| Registry home | This repository (`warpmetal/skills`); releases are immutable tags |
| Repo | `git@github.com:warpmetal/skills.git`; created 2026-09-21, currently empty |
| Visibility / license | Public; `UNLICENSED` for v1; revisit licensing once skills stabilize |
| Channels | Ship host-native marketplace + catalog channels from the start |
| MCP | Build now; standalone package `@warpmetal/skills-mcp`; read-only |
| Registry resolution | Dynamic by default: consumers resolve `<catalog>/<tag>/registry.json` (tag defaults to `latest`), revalidate with ETag, fall back to cache, then to a bundled snapshot (marked stale). The CLI ships no registry or skill content; the MCP package and Docker image keep the last-resort bundle. |
| Skill layout | `skills/<name>/SKILL.md` with references; name = lowercase kebab-case; matches OpenCode/omp/Claude/Codex/DeepSeek Harness discovery |
| Versioning | Repo semver tags identify immutable releases; each skill carries its own semver, so a one-line fix ships without republishing everything. `name@version` installs arrive later with `releases.json` history. |
| Security | Checksums in the registry, generated catalogs only, checksum-verified reads and installs, explicit consent for updates, and `--tag`/`--registry` pinning for reproducibility. |
| Deployment | npm packages + multi-arch GHCR image + GitHub Pages catalog, all driven by GitHub Actions |

## 4. Repository layout

```
warpmetal/skills/
  PLAN.md                       # this plan, committed as the first document
  registry.json                 # source of truth (generated manifest, committed)
  registry.schema.json
  registry.internal.json        # internal registry manifest (committed, never published)
  skills/
    warpmetal/SKILL.md, references/...
    coding-env/SKILL.md, references/{roles,providers}/...
  internal-skills/              # internal-only skills; built into registry.internal.json
  plugins/warpmetal/            # Claude/omp-compatible plugin (skills + plugin.json)
  .omp-plugin/marketplace.json
  .claude-plugin/marketplace.json
  .agents/plugins/marketplace.json
  catalog/index.json            # OpenCode HTTP catalog
  packages/skills-mcp/          # @warpmetal/skills-mcp (standalone, bin: warpmetal-skills-mcp)
    Dockerfile                  # multi-stage, non-root, stdio + optional HTTP
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
| Dynamic resolution | `<catalog>/<tag>/registry.json` + files | warpmetal CLI, MCP server | resolve `latest` (ETag-cached); pin with `--tag`/`--registry`; installs locked locally |
| Agent Skills | `skills/<name>/SKILL.md` | OpenCode, omp, Codex, Cursor, DeepSeek Harness | copy or link into `.agents/skills` or the host's skill directory |
| MCP | `@warpmetal/skills-mcp` (npm + GHCR image) | any MCP host | host MCP config, snippets provided |

Catalog hosting: versioned static URL (`https://skills.warpmetal.com/<tag>/index.json`) backed by
GitHub Pages from this repo, with a `latest` alias that always resolves to the newest release.
Catalogs are immutable per tag. `raw.githubusercontent.com` is the fallback if Pages/domain setup is
delayed.

## 7. MCP server design (`@warpmetal/skills-mcp`)

- Node + TypeScript, official `@modelcontextprotocol/sdk`; `bin: warpmetal-skills-mcp`; stdio
  transport default; `--http` serves Streamable HTTP on `0.0.0.0:8080` with `GET /healthz` and
  `GET /readyz`.
- Data source: dynamic by default — `--registry <url|path>` or `WARPMETAL_SKILLS_REGISTRY`, otherwise
  `<catalog>/<tag>/registry.json` (tag defaults to `latest`) with ETag revalidation and a local
  cache; the bundled snapshot is an offline last resort reported as stale. Never writes.
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
- No auth in the server's own transport (public read-only). Private/team registries are isolated by
  running a second instance that loads a second registry (`--registry <path|url>` or
  `WARPMETAL_SKILLS_REGISTRY`), never by a visibility flag inside one registry. The internal skills
  live in this same repository under `internal-skills/`, built by `npm run build:internal` into
  `registry.internal.json` + git-ignored `snapshot.internal/`; the public build reads only `skills/`,
  so no internal name reaches `registry.json`, the generated channels, or the npm snapshot. The
  server can also authenticate to an internal catalog with a bearer token (`--registry-token-file` or
  `WARPMETAL_SKILLS_REGISTRY_TOKEN`): it is sent as `Authorization: Bearer` on every manifest and file
  request, only as a header (never in the query string, which error messages echo), the cache is
  partitioned by a hash of the token, and a `401`/`403` fails closed with `registry_unauthorized`
  instead of falling back to the public snapshot. The token exists only on the internal instance. The
  internal endpoint is still authenticated at the edge (a gateway in front of `/mcp`) because the
  HTTP transport has no authentication of its own.
- Supply chain: lockfile, pinned deps, provenance, no postinstall scripts; container images get OCI
  SBOM + provenance attestations.

## 9. Release and versioning

1. PRs merge with checksum + schema CI green.
2. Tag `vX.Y.Z` → `build-catalogs` → verify → publish `@warpmetal/skills` and
   `@warpmetal/skills-mcp` to npm → push multi-arch GHCR image → deploy Pages catalog → GitHub
   release with checksums.
3. Consumers pick the release up dynamically; no CLI or server republish is needed. The CLI tests
   pin a registry tag, and generated plugin copies change only when this repository's own plugin
   layout changes.

Backward compatibility: `warpmetal agent install` keeps working for existing users; the CLI resolves
the registry without changing the installed command surface.

## 10. Requirements and acceptance

| ID | Requirement | Observable acceptance | Verification |
|---|---|---|---|
| R1 | Single source of truth | Every channel is generated from `registry.json`; drift check fails on mismatch | CI |
| R2 | Host-native installs | omp, Claude Code, and Codex install a skill from `warpmetal/skills` without the WarpMetal CLI | live host canary |
| R3 | OpenCode catalog | A pinned catalog URL installs `coding-env` in OpenCode with correct ID and version | host test |
| R4 | Dynamic resolution with pinning | A registry release is visible without republishing the server or CLI; explicit `--registry`/`--tag` pins a snapshot; every read is checksum-verified | CLI/integration |
| R5 | MCP read-only | No MCP tool can write files, install, or read outside a skill directory | negative tests |
| R6 | Traversal safety | `skill://` and `skill_read` reject absolute/`..`/escaped paths | security tests |
| R7 | Offline fallback | When the catalog is unreachable the MCP serves the ETag cache, then the bundled snapshot, labeling the result stale | fault test |
| R8 | Integrity | Tampered skill file fails verification before publish/install | CI |
| R9 | Version truth | Every read and install reports the exact skill version and registry tag served, and installs record them in the lockfile; `--tag`/`--registry` pin | contract test |
| R10 | Secret safety | No credential, token, or machine path exists in registry, catalogs, or snapshots | scan |
| R11 | Backward compatibility | Existing `agent install` users see no behavior change | regression |
| R12 | Docs parity | Each channel has tested, copyable config snippets | docs test |
| R13 | Reproducible artifacts | `v*` tag produces npm packages, GHCR image, and Pages catalog with matching versions and attestations | release rehearsal |

## 11. Phases

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

**P3 — integration:** registry snapshot package, plugin test change, marketplace publication, Pages
catalog deployment, live host canaries, release notes.

## 12. Interfaces with `coding-env-skill-plan.md`

- The `coding-env` plan consumes only: skill directory layout, `registry.json` fields
  (`name`, `version`, `files`, `sha256`), and the published MCP snippets.
- The `coding-env` plan owns all `warpmetal env` behavior, host config writing, and credential
  handling; this plan owns content, distribution, and discovery.
- The CLI ships no registry or skill content; it resolves `<catalog>/<tag>/registry.json` (tag
  defaults to `latest`) at use time, revalidates with ETag, caches, verifies checksums, and records
  installed versions in a local lockfile. `--registry <path|url>`/`--tag` pin an exact snapshot.
- `warpmetal skill list/search/install/remove/update` command semantics are frozen by the
  `coding-env` plan; this repository owns the registry, its per-skill versions, and the hosted catalog.
- Resolution model: agents use this MCP server for discovery and reads; the CLI uses the same
  manifest over plain HTTPS (not MCP) so both paths cannot drift. A CLI MCP-client mode is only for
  private/authenticated registries later.
- Release-time `releases.json` provides update history; per-skill versions allow `name@version`
  installs later without changing the manifest schema.

## 13. Repo bootstrap, Docker, and CI/CD

### Bootstrap order (build-agent checklist)

1. Commit `PLAN.md` (this document) first, then the scaffold: README, `LICENSE` (UNLICENSED
   placeholder), `CODEOWNERS`, `.gitignore`, root tooling package (no npm workspaces; the MCP
   package keeps its own lockfile), `registry.schema.json`,
   `skills/`, `packages/skills-mcp/`, `scripts/`, `.github/workflows/`.
2. Seed `registry.json` with the two known skills (`warpmetal`, `coding-env`) and record checksums.
3. Protect `main`: require the `verify` workflow, require CODEOWNERS review, block force-push.
4. Verify environment prerequisites: `@warpmetal` npm scope ownership, npm trusted publishing,
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

## 14. Delivery status

Execution status (what is done, what is pending, and what is still open) is tracked in
[`ROADMAP.md`](ROADMAP.md). This document is the design the repository was built from and is
frozen as of 2026-09-21; the roadmap is the living status.

## Implementation notes (2026-09-21)

- Root tooling is a plain private package; `packages/skills-mcp` is independent with its own
  lockfile (simpler Docker builds than npm workspaces).
- The optional `@warpmetal/skills` npm snapshot package is dropped: consumers resolve the registry
  dynamically, and the MCP package bundles `packages/skills-mcp/snapshot/` only as an offline last
  resort, generated by `npm run build`.
- Docker build context is `packages/skills-mcp`; generate the snapshot first (CI runs
  `npm run build` before `docker build`).
- GitHub Pages publishes `/<tag>/` plus a `latest/` alias from `npm run pages`; the hosted HTTP MCP
  endpoint is not deployed yet.
- `npm run verify` checks schema, checksum coverage both ways, catalog drift, copied-file drift,
  and a secret scan. `verify.yml` additionally runs `git diff --exit-code` and a Docker smoke test.
- Live host validation against omp, Claude Code, Codex, and OpenCode remains P0 pending real
  installs, as does confirming `@warpmetal` npm scope access and enabling Pages.
