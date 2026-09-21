# @warpmetal/skills-mcp

Read-only MCP server for discovering and reading WarpMetal Agent Skills. It serves the registry
manifest (`registry.json`) with checksum verification and the same `skill://` URI semantics the
hosts already use.

## Transports

- **stdio** (default) — for local MCP hosts
- **Streamable HTTP** — `--http`, with `POST /mcp`, `GET /healthz`, and `GET /readyz`

## Run

```sh
# Bundled snapshot (published package ships one)
npx -y @warpmetal/skills-mcp

# Pinned registry tag
npx -y @warpmetal/skills-mcp --tag v1.2.3

# Local registry directory (development)
node dist/index.js --registry /path/to/skills

# HTTP
npx -y @warpmetal/skills-mcp --http --host 0.0.0.0 --port 8080
```

Docker:

```sh
docker run --rm -it ghcr.io/warpmetal/skills-mcp:latest
docker run --rm -p 8080:8080 ghcr.io/warpmetal/skills-mcp:latest --http
curl -fsS http://127.0.0.1:8080/readyz
```

Without publishing, run the same server from a checkout:

```sh
npm ci && npm run build
node dist/index.js --registry /path/to/skills
```

and point any host config at `node /path/to/skills/packages/skills-mcp/dist/index.js --registry
/path/to/skills`. The GHCR image is a convenience, not a requirement.

## Tools

| Tool | Purpose |
|---|---|
| `skill_list` | List skills with version, description, roles, hosts, and files; optional `role`/`host` filters |
| `skill_search` | Rank skills by name, tag, description, role, and host matches; bounded `limit` |
| `skill_read` | Read `SKILL.md` or a listed supporting file; checksum verified before returning |

Resources: `skill://<name>` and `skill://<name>/<relative-path>`. Absolute paths, `..` traversal,
escaped paths, and unlisted files are rejected. The server never writes, installs, or executes
anything.

## Host configuration

omp (`~/.omp/agent/mcp.json`):

```json
{
  "mcpServers": {
    "warpmetal-skills": {
      "command": "npx",
      "args": ["-y", "@warpmetal/skills-mcp"]
    }
  }
}
```

OpenCode:

```sh
opencode mcp add warpmetal-skills -- npx -y @warpmetal/skills-mcp
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.warpmetal-skills]
command = "npx"
args = ["-y", "@warpmetal/skills-mcp"]
```

Claude Code (`.mcp.json`):

```json
{
  "mcpServers": {
    "warpmetal-skills": {
      "command": "npx",
      "args": ["-y", "@warpmetal/skills-mcp"]
    }
  }
}
```

Cursor (`.cursor/mcp.json`): the same `mcpServers` shape as Claude Code.

DeepSeek Harness (`dsh-mcp-client` entry):

```yaml
- id: mcp-warpmetal-skills
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: warpmetal-skills
    transport: stdio
    command: npx
    args: ['-y', '@warpmetal/skills-mcp']
```

dsh scrubs ambient variables matching `KEY|PASSWORD|SECRET|TOKEN` before launching stdio servers;
this server needs no credentials, so it works unchanged. Switch to `transport: streamable-http`
with `url` to use a self-hosted container instead.

Remote HTTP (any host that supports Streamable HTTP):

```json
{
  "mcpServers": {
    "warpmetal-skills": { "type": "http", "url": "https://skills.warpmetal.com/mcp" }
  }
}
```

The hosted HTTP endpoint is not deployed yet; run the container yourself until it is.

## Options

| Flag | Meaning |
|---|---|
| `--registry <url\|path>` | Load `registry.json` from a URL or local directory |
| `--tag <version>` | Load a pinned tag from the catalog host |
| `--offline` | Never fetch; use cache or the bundled snapshot |
| `--cache-dir <path>` | Override the registry cache directory |
| `--http`, `--host`, `--port` | HTTP transport settings |
| `--version`, `--help` | Print version or help |

Environment: `WARPMETAL_SKILLS_REGISTRY`, `WARPMETAL_SKILLS_REGISTRY_URL`,
`WARPMETAL_SKILLS_HOST`, `PORT`, `XDG_CACHE_HOME`.

## Development

```sh
npm ci
npm run build
npm test        # unit + stdio + HTTP protocol tests
```

Snapshot generation lives in the repository root: `npm run build` (root) writes
`packages/skills-mcp/snapshot/` before packing or publishing.
