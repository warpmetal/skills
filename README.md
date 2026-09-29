# WarpMetal Skills

Canonical registry for WarpMetal Agent Skills, plus every distribution channel generated from it:
host-native plugin marketplaces, an OpenCode HTTP catalog, dynamic resolution for the `warpmetal`
CLI, and the read-only `@warpmetal/skills-mcp` discovery server.

**One source of truth:** [`registry.json`](./registry.json) and [`skills/`](./skills). Every
channel is generated with `npm run build`; CI fails on drift with `npm run verify`.

## Layout

```
conventions/                   canonical shared library + contracts, copied into every skill
  lib/*.sh                     the bash libraries skills source (output, journal, confirm, integration, ...)
  *.md                         the contracts: outputs, approvals, safety, client-manifest, integrations
skills/                        canonical Agent Skills (SKILL.md + references)
  <name>/skill.json            skill metadata (version, description, roles, hosts, tags, integrations)
  <name>/conventions/          generated copy of conventions/; never edit these
registry.json                  generated manifest with per-file sha256 checksums
registry.schema.json           JSON Schema for the manifest
plugins/warpmetal/             generated Claude/omp-compatible plugin (skills + plugin.json)
.omp-plugin/marketplace.json   generated omp marketplace catalog
.claude-plugin/marketplace.json generated Claude Code marketplace catalog
.agents/plugins/marketplace.json generated Codex/ChatGPT plugin catalog
catalog/                       generated OpenCode HTTP catalog (index.json + mirrored files)
packages/skills-mcp/           @warpmetal/skills-mcp server (TypeScript, stdio + HTTP)
packages/warpmetal-cli/        @warpmetal/cli integration engine (vault + provider adapters)
scripts/                       build, verify, pages tooling
tools/                         bash policy validator and the integration library self-test
PLAN.md                        the implementation plan this repo was built from
```

## Commands

```sh
npm run build      # sync conventions, regenerate registry.json, catalogs, plugin, snapshot
npm run verify     # schema + checksums + drift + secret scan
npm test           # skills-mcp unit and protocol tests
npm run check      # build + verify + test
npm run pages      # build the versioned Pages artifact under public/

npm run sync:conventions   # copy conventions/ into every skill that ships it
npm run validate:skills    # conventions parity, resolver blocks, no inline provider calls
bash tools/check-all.sh    # the above, plus shell syntax and the integration library self-test
```

The MCP package and the integration engine each have their own lockfile:

```sh
npm ci --prefix packages/skills-mcp
npm ci --prefix packages/warpmetal-cli
npm --prefix packages/warpmetal-cli test
```

## Distribution channels

| Channel | Artifact | Install |
|---|---|---|
| MCP | `@warpmetal/skills-mcp` (npm + `ghcr.io/warpmetal/skills-mcp`) | MCP host config, see `packages/skills-mcp/README.md` |
| omp / Claude Code | `.omp-plugin/marketplace.json`, `.claude-plugin/marketplace.json` | `omp plugin marketplace add warpmetal/skills`; Claude marketplace add |
| Codex / ChatGPT | `.agents/plugins/marketplace.json` | add this repo as a plugin marketplace |
| DeepSeek Harness | `.agents/skills` / `.dsh/skills` Agent Skills layout; `dsh-mcp-client` for MCP | copy `skills/<name>` into `~/.agents/skills/`, or use the MCP entry below |
| OpenCode | `catalog/index.json` | add the catalog URL to `skills` in `opencode.json` |
| Any MCP host / local agent | stdio or Streamable HTTP MCP | `npx -y @warpmetal/skills-mcp` |
| warpmetal CLI | pinned snapshot | `warpmetal skill install <name>` |

Catalog URL scheme: `https://skills.warpmetal.com/<tag>/...`, with a `latest/` alias. Releases are
immutable; installs should pin a tag.

## Using it without publishing

Nothing in this repository requires a release to be useful; a public clone is enough.

- **Agent Skills hosts** (omp, OpenCode, Codex, Cursor, DeepSeek Harness): install straight from git
  with `omp plugin marketplace add warpmetal/skills`, or copy/link `skills/<name>` into
  `~/.agents/skills/`.
- **MCP hosts**: build once and point the host at the local entry with the repository registry:

  ```sh
  npm ci --prefix packages/skills-mcp
  npm --prefix packages/skills-mcp run build
  ```

  ```json
  {
    "mcpServers": {
      "warpmetal-skills": {
        "command": "node",
        "args": [
          "/path/to/skills/packages/skills-mcp/dist/index.js",
          "--registry",
          "/path/to/skills"
        ]
      }
    }
  }
  ```

- **Docker without GHCR**: `docker build -t skills-mcp packages/skills-mcp`, then run it with a
  checkout mounted read-only and `--registry /registry`.

Publishing (npm, GHCR, GitHub Pages) only matters when someone who does not clone this repository
needs a one-line install (`npx @warpmetal/skills-mcp`), a container image, or a hosted catalog URL.

## DeepSeek Harness, local, and open-source agents

DeepSeek Harness (`dsh`) reads Agent Skills natively: `<projectRoot>/.dsh/skills`,
`<projectRoot>/.agents/skills`, `<agentsHome>/skills`, and `<dshHome>/skills`, accepting directory
bundles (`<name>/SKILL.md`) or flat `<name>.md` files. Copy or link `skills/<name>` into
`~/.agents/skills/` for user scope; that same layout is read by OpenCode, omp, Codex, Cursor, and
other Agent Skills-compatible hosts.

Any MCP-capable agent — local or hosted — can read the registry through the MCP server instead.
DeepSeek Harness (`dsh-mcp-client`) entry:

```yaml
- id: mcp-warpmetal-skills
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: warpmetal-skills
    transport: stdio
    command: npx
    args: ['-y', '@warpmetal/skills-mcp']
```

Local model servers (Ollama, LM Studio, llama.cpp, vLLM) are model backends rather than skill
consumers; the harness around them uses one of the channels above. For air-gapped or self-hosted
setups, `npm run pages` produces a static catalog and `@warpmetal/skills-mcp` accepts
`--registry <path|url>` or `WARPMETAL_SKILLS_REGISTRY_URL`.

## Provider integrations

Some skills need to reach outside the server: a DNS record for a cutover, a chat
channel for an alert, a Git repository for a deploy. Those calls go through one
engine and one vault, never from a skill script directly.

```
skill script ──require_confirm──▶ conventions/lib/integration.sh ──▶ warpmetal integration … ──▶ provider
```

**The engine** is [`@warpmetal/cli`](./packages/warpmetal-cli), which installs the
`warpmetal` binary. It implements `warpmetal env` (the credential vault) and
`warpmetal integration` (the provider adapters) locally, and delegates every other
command verbatim to the published `warpmetal` package it pins. Two commands exist
that the published package does not have:

```sh
npm install -g @warpmetal/cli

warpmetal env store set cloudflare.token      # read from stdin, never argv
warpmetal env status --json
warpmetal integration list --json             # the authoritative catalog
warpmetal integration status cloudflare --json
warpmetal integration cloudflare dns-upsert --zone-id … --name … --type A --content … \
  --confirm "CONFIRM DNS CHANGE" --json
```

**The vault** stores one secret per namespaced name, encrypted with AES-256-GCM and
scrypt under `~/.config/warpmetal/env/`, or in the OS keychain when one is
available. A value leaves the vault through exactly one path —
`warpmetal env secret <name> --stdout` — and never appears in argv, in `--json`
output, in a journal entry, or in a log.

**The gates.** A mutating verb requires its own literal, checked twice: by
`integration_run_mutating` in bash and again by the engine.

| Provider | Verb | Gate |
|----------|------|------|
| `cloudflare` | `dns-upsert` | `CONFIRM DNS CHANGE` |
| `slack` | `notify` | `CONFIRM NOTIFY` |
| `github` | `repo-view` (read-only) | none |

**The manifest** stores references, never values:

```toml
[integrations.cloudflare]
zone_id = "023e105f4ecef8ad9ca31a8372d0c353"
secret  = "cloudflare.token"   # the name; the value lives in the vault
```

Which skills use which provider is declared in `skill.json` (`integrations`) and
validated against the engine catalog by `npm run validate:skills`. The full
contract — API, honest degradation, exit-code mapping, and the provider catalog —
is in [`conventions/integrations.md`](./conventions/integrations.md).

## Adding a skill

1. Scaffold with `npm run new:skill -- <kebab-name>` (or create the files manually):
   `skills/<kebab-name>/SKILL.md` with `name` and `description` frontmatter, plus
   `references/` for supporting files.
2. Add `skills/<kebab-name>/skill.json` with `name`, `version`, `description`, `roles`, `hosts`,
   `tags`, `minimumWarpmetalCli` when the skill drives the CLI, and `integrations` when it reaches
   a provider through the engine.
3. Run `npm run build && npm run check`; commit the regenerated artifacts.
4. Open a PR. CODEOWNERS review is required, and CI verifies checksums, drift, and the secret scan.

Content rules are in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Status

- Registry, channels, and the MCP server are implemented and verified; see the delivery status in
  [`PLAN.md`](./PLAN.md#delivery-status-2026-09-21).
- The integration engine (`@warpmetal/cli`: vault, provider adapters, gates) and the bash
  integration layer are implemented and verified offline; see
  [`conventions/integrations.md`](./conventions/integrations.md).
- `minimumWarpmetalCli` names the version of the `warpmetal` binary. It is `0.1.0` for the skills
  that declare `integrations`: `@warpmetal/cli` 0.1.0 is the first release with the `env` and
  `integration` namespaces, and the npm package `warpmetal` (0.8.x) does **not** have them, so
  install `@warpmetal/cli` when a skill declares an integration.
- Remaining before publishing: npm scope + trusted publishing, Pages enablement, branch protection,
  and live host validation against omp, Claude Code, Codex, OpenCode, and DeepSeek Harness.
- Each integration still needs one real-world walkthrough (a deploy, a DNS change, an alert) against
  a live provider; the offline suites use fixtures and stub providers by design.

## License

UNLICENSED. The source is publicly visible; no reuse rights are granted. See [LICENSE](./LICENSE).
