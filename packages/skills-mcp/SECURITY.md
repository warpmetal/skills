# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately to the maintainers rather than in a
public issue. Include the tool name, the arguments used and the observed
envelope (status, `exit_code`, warnings) so the call can be reproduced. Do not
include approval tokens, identity paths or payloads: they are not needed to
reproduce a gate failure, and they are exactly what this server exists to keep
out of transcripts.

## Scope

This server sits between an MCP client and the WarpMetal CLI (including the
`wm_*` surface and provider `integration` tools). In scope:

- The approval gate: a token that can be replayed, reused for a different argv,
  forged, or accepted after expiry.
- The consequence gate: an `apply` that proceeds without the exact class its
  `plan` declared, or that spawns before the latch and the re-verification pass.
- The command registry: any way to reach a subcommand or a flag outside the
  reviewed set, including the server-owned safety constants (`--confirm`).
- Redaction and the audit log: a secret that reaches `data`, the text channel or
  `audit.jsonl`.
- Binary resolution and process spawning: injection, a shell, or a path that
  escapes the intended install.
- Provider tools: registering provider tools on the HTTP `content` profile, or
  leaking vault secrets into MCP transcripts / env scrubbing bypasses.

## Transport profiles

The server exposes two surfaces, and which one a client can reach is decided by the
transport rather than by the caller:

- **`full`** — stdio. The `skill_*` content tools, every `wm_*` CLI tool, and the provider
  tools (177 in total). stdio is a local, operator-controlled channel. Provider calls
  spawn `@warpmetal/cli` `integration` verbs; secrets stay in the WarpMetal vault, not in
  this process environment. Provider arguments are written to the CLI's stdin
  (`--args-stdin`), never to argv, so an argument that carries a value never reaches the
  process list; Atlassian Cloud credentials add a `jira.email` / `confluence.email` vault
  entry that is combined into `Basic base64(email:token)` in-process and redacted from output.
- **`content`** — the Streamable HTTP transport. The `skill_*` tools and the
  `skill://` resources only. The `wm_*` and provider tools are not registered at all on this
  profile, because the HTTP transport has no authentication and those tools can mutate real
  infrastructure / third-party accounts.

A way to reach a `wm_*` or provider tool over HTTP is a vulnerability. A way to make the
`content` profile serve something outside the loaded registry is one too.

### Provider mutations: destructive hints and the confirm gate

Two different things are easy to conflate for provider tools:

- `destructiveHint: true` is advertised on irreversible or costly mutations (payments,
  external publishing, billed infrastructure, permanent migrations). It is a signal for a
  client to obtain consent. It is **not** a guarantee that a client did.
- The `--confirm <gate>` flag the CLI requires is injected by this server for any mutating
  verb. It proves the server routed a mutation through the reviewed path; it does **not**
  prove that a human approved the specific call. Treat it as defence in depth, not as
  consent.

The server-side consent boundary is the client's. A client that calls a destructive provider
tool without asking its user has not been stopped by this server, and that is by design:
the MCP surface is where the human is, not inside the vault-backed CLI.

### Private registries

Internal skills are isolated by running a second instance against a second registry, not by a
visibility flag inside one registry. The HTTP transport still has no authentication of its own; an
internal instance is expected to sit behind an edge that authenticates the caller and restricts the
network.

The server can hold one credential: a bearer token (`--registry-token-file`, or
`WARPMETAL_SKILLS_REGISTRY_TOKEN`) that it sends as `Authorization: Bearer` on every manifest and file
request to an authenticated catalog.

What that guarantees:

- The token is sent only to the host named by `--registry`/`WARPMETAL_SKILLS_REGISTRY`, only as a
  header, and never as a query parameter. URLs appear in error strings and logs, so a token in the
  query string would leak with them.
- A `401`/`403` fails closed (`registry_unauthorized`). The server does not fall back to a cached or
  bundled registry, which could otherwise serve the wrong skills after a credential is rotated or
  revoked.
- The cache is partitioned by a short hash of the token, so two identities never share a cache entry
  and an unauthenticated load cannot read a privileged one. The token itself is never written to the
  cache, and the public catalog path carries no token at all.

What it does not do:

- It authenticates _the server to the catalog_, not the MCP caller. The edge still proves caller
  identity, and the server cannot distinguish one authenticated caller from another.
- It does not change the fallback order for a _network_ failure (as opposed to `401`/`403`): the server
  still prefers a stale cache and then the bundled public snapshot. A private instance running without
  a token can therefore serve public content while the internal catalog is unreachable.
- The boundary is the loaded registry: a name the registry does not declare is `not_found`.
- `/readyz` reports the registry version and skill count without authentication.

## Not a vulnerability

- An operator approving a plan that then does what it said.
- A provider rejecting a call with `NEEDS_AUTH` / `ERROR` after secrets are missing or wrong.
- A host scrubbing `TOKEN`/`SECRET` env vars from stdio MCP launches — use the vault and
  `--registry-token-file` instead of ambient credentials.
