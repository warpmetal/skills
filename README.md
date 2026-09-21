# WarpMetal Skills

Canonical registry for WarpMetal Agent Skills, plus every distribution channel generated from it:
host-native plugin marketplaces, an OpenCode HTTP catalog, pinned snapshots for the `warpmetal`
CLI, and the read-only `@warpmetal/skills-mcp` discovery server.

**One source of truth:** [`registry.json`](./registry.json) and [`skills/`](./skills). Every
channel is generated with `npm run build`; CI fails on drift with `npm run verify`.

## Layout

```
skills/                        canonical Agent Skills (SKILL.md + references)
  <name>/skill.json            skill metadata (version, description, roles, hosts, tags)
registry.json                  generated manifest with per-file sha256 checksums
registry.schema.json           JSON Schema for the manifest
plugins/warpmetal/             generated Claude/omp-compatible plugin (skills + plugin.json)
.omp-plugin/marketplace.json   generated omp marketplace catalog
.claude-plugin/marketplace.json generated Claude Code marketplace catalog
.agents/plugins/marketplace.json generated Codex/ChatGPT plugin catalog
catalog/                       generated OpenCode HTTP catalog (index.json + mirrored files)
packages/skills-mcp/           @warpmetal/skills-mcp server (TypeScript, stdio + HTTP)
scripts/                       build, verify, pages tooling
PLAN.md                        the implementation plan this repo was built from
```

## Commands

```sh
npm run build      # regenerate registry.json, catalogs, plugin, snapshot
npm run verify     # schema + checksums + drift + secret scan
npm test           # skills-mcp unit and protocol tests
npm run check      # build + verify + test
npm run pages      # build the versioned Pages artifact under public/
```

The MCP package has its own lockfile:

```sh
npm ci --prefix packages/skills-mcp
npm --prefix packages/skills-mcp run build
```

## Distribution channels

| Channel | Artifact | Install |
|---|---|---|
| MCP | `@warpmetal/skills-mcp` (npm + `ghcr.io/warpmetal/skills-mcp`) | MCP host config, see `packages/skills-mcp/README.md` |
| omp / Claude Code | `.omp-plugin/marketplace.json`, `.claude-plugin/marketplace.json` | `omp plugin marketplace add warpmetal/skills`; Claude marketplace add |
| Codex / ChatGPT | `.agents/plugins/marketplace.json` | add this repo as a plugin marketplace |
| OpenCode | `catalog/index.json` | add the catalog URL to `skills` in `opencode.json` |
| warpmetal CLI | pinned snapshot | `warpmetal skill install <name>` (companion workstream) |

Catalog URL scheme: `https://skills.warpmetal.com/<tag>/...`, with a `latest/` alias. Releases are
immutable; installs should pin a tag.

## Adding a skill

1. Create `skills/<kebab-name>/SKILL.md` with `name` and `description` frontmatter, plus
   `references/` for supporting files.
2. Add `skills/<kebab-name>/skill.json` with `name`, `version`, `description`, `roles`, `hosts`,
   `tags`, and `minimumWarpmetalCli` when the skill drives the CLI.
3. Run `npm run build && npm run check`; commit the regenerated artifacts.
4. Open a PR. CODEOWNERS review is required, and CI verifies checksums, drift, and the secret scan.

Content rules are in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Status

- Registry, channels, and the MCP server are bootstrapping in this repository.
- The `coding-env` skill content arrives with its companion workstream
  (`coding-env-skill-plan.md`); this repo owns its distribution once it lands.
- Live validation against omp, Claude Code, Codex, and OpenCode is tracked in `PLAN.md` (P0).

## License

UNLICENSED. The source is publicly visible; no reuse rights are granted. See [LICENSE](./LICENSE).
