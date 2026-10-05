# internal-skills

Internal-only WarpMetal Agent Skills. This directory is the second registry: it
is built into `registry.internal.json` and served by a dedicated
`@warpmetal/skills-mcp` instance, never by the public catalog.

## What "private" means here

This repository is public, so the content under `internal-skills/` is visible in
git. "Private" means **not served by the public MCP/catalog**, not confidential:

- The public build reads only `skills/`, so nothing here reaches `registry.json`,
  `catalog/`, `plugins/`, GitHub Pages, or the npm package.
- The internal registry (`registry.internal.json`) is generated into
  `snapshot.internal/`, which is git-ignored and published only to the internal
  authenticated catalog.

If the content must be confidential, it cannot live in this public repository;
use a private repository or a private submodule instead.

## Layout and build

```
internal-skills/<name>/SKILL.md        # frontmatter: name + description
internal-skills/<name>/skill.json      # name, version, description, roles, hosts, tags
internal-skills/<name>/references/...   # supporting material
```

```sh
npm run build:internal     # writes registry.internal.json + snapshot.internal/
npm run verify:internal    # schema, checksums, snapshot parity, secret scan
npm run new:skill -- <name>   # scaffold into skills/; move it here for an internal skill
```

The per-skill `path` is always `skills/<name>` even though the source directory is
`internal-skills/<name>`, because that is the only layout the MCP server accepts.
`build-internal-registry.mjs` copies the files to `snapshot.internal/skills/<name>`
so the bundle matches.

## Serving it

The internal instance loads the bundle with `--registry`, or fetches the
published manifest with an `Authorization: Bearer` token:

```sh
# Local bundle (no endpoint, no token)
node dist/index.js --http --registry /path/to/snapshot.internal

# Authenticated remote catalog
node dist/index.js --http \
  --registry https://<internal-catalog>/registry.internal.json \
  --registry-token-file /run/secrets/registry.token
```

The token exists only on the internal instance. The public instance must never
receive it, or the public endpoint could serve these skills.

Failure semantics differ by source: a `401`/`403` from the catalog fails closed,
but a plain network failure still falls back to the cache and then the bundled
**public** snapshot (marked stale). If this instance must never serve public
content, mount the bundle on a local path (`--registry /path/to/snapshot.internal`)
instead of pointing at a URL.
