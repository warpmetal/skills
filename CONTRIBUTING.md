# Contributing

## Ground rules

- `registry.json`, `catalog/`, `plugins/`, and the marketplace catalogs are **generated**. Never
  edit them by hand; change `skills/` or `scripts/` and run `npm run build`.
- Skill content is instruction-code executed by agents. Treat it with the same review rigor as
  executable code.
- Never commit secrets, tokens, machine-specific paths, or private URLs into skills or metadata.
- CI (`npm run verify`) must pass: schema, checksums, catalog drift, and the secret scan.

## Local workflow

```sh
npm ci
npm ci --prefix packages/skills-mcp
npm run build && npm run check
```

`npm run build` regenerates `registry.json`, the marketplace catalogs, the plugin directory, the
OpenCode catalog, and `packages/skills-mcp/snapshot/` (gitignored).

## Adding or changing a skill

1. `skills/<kebab-name>/SKILL.md` with frontmatter:

   ```markdown
   ---
   name: <kebab-name>
   description: One or two sentences that tell the model when to use this skill.
   ---
   ```

2. `skills/<kebab-name>/skill.json`:

   ```json
   {
     "name": "<kebab-name>",
     "version": "0.1.0",
     "description": "Same as the frontmatter description.",
     "roles": ["planner", "builder", "reviewer"],
     "hosts": ["omp", "opencode", "codex", "claude", "cursor", "agents"],
     "minimumWarpmetalCli": "0.9.0",
     "tags": ["example"]
   }
   ```

3. Bump `version` whenever the skill content changes. Registry releases keep per-skill versions in
   lockstep for now, so a change to any skill bumps the repository tag at release time.

## Content rules

- **No secrets.** No API keys, tokens, passwords, private URLs, or machine paths.
- **Bounded commands.** No destructive shell, no `curl | sh`, no package installs without explicit
  consent. Prefer the official CLI as the executable interface over ad hoc command recipes.
- **Truthful scoping.** Do not claim a provider capability the provider cannot enforce.
- **Small files.** Individual files over 1 MiB and skills over 8 MiB are rejected by the build.
- **Relative references.** Supporting files live beside `SKILL.md` and are read with paths relative
  to the skill directory.

## Pull requests

- One logical change per PR; include the regenerated artifacts from `npm run build`.
- Describe what changed in the skill instructions and why the model should behave differently.
- CODEOWNERS review is required, plus green `verify` on the PR.
- Release notes are generated from the tag; mention breaking instruction changes explicitly.

## Releases

Maintainers tag `vX.Y.Z`; the release workflow re-runs verification, publishes
`@warpmetal/skills-mcp` to npm with provenance, pushes multi-arch images to GHCR, deploys the
versioned catalog to GitHub Pages, and creates a GitHub release with the registry digest.
