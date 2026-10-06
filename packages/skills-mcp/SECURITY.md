# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately to the maintainers rather than in a
public issue. Include the tool name, the arguments used and the observed
envelope (status, `exit_code`, warnings) so the call can be reproduced. Do not
include approval tokens, identity paths or payloads: they are not needed to
reproduce a gate failure, and they are exactly what this server exists to keep
out of transcripts.

## Scope

This server sits between an MCP client and (a) the WarpMetal CLI and (b) optionally
DigitalOcean Action Gateway. In scope:

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
- Action Gateway: leaking `DIGITALOCEAN_TOKEN`, registering AG tools on the HTTP
  `content` profile, or proxying provider secrets that should stay in DO Connections.

## Transport profiles

The server exposes two surfaces, and which one a client can reach is decided by the
transport rather than by the caller:

- **`full`** — stdio. The `skill_*` content tools, every `wm_*` CLI tool, and the Action Gateway
  tools (146 in total). stdio is a local, operator-controlled channel. AG calls use
  `DIGITALOCEAN_TOKEN` / `DIGITALOCEAN_AG_ACTOR_ID` from the environment; provider OAuth tokens stay
  in DigitalOcean Connections on the actor, not in this process.
- **`content`** — the Streamable HTTP transport. The `skill_*` tools and the
  `skill://` resources only. The `wm_*` and Action Gateway tools are not registered at all on this
  profile, because the HTTP transport has no authentication and those tools can mutate real
  infrastructure / third-party accounts.

A way to reach a `wm_*` or Action Gateway tool over HTTP is a vulnerability. A way to make the
`content` profile serve something outside the loaded registry is one too.

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

- It authenticates *the server to the catalog*, not the MCP caller. The edge still proves caller
  identity, and the server cannot distinguish one authenticated caller from another.
- It does not change the fallback order for a *network* failure (as opposed to `401`/`403`): the server
  still prefers a stale cache and then the bundled public snapshot. A private instance running without
  a token can therefore serve public content while the internal catalog is unreachable.
- The boundary is the loaded registry: a name the registry does not declare is `not_found`.
- `/readyz` reports the registry version and skill count without authentication.

## Not a vulnerability

Some behaviour is deliberate and is documented here so it is not reported as a
defect:

- `acknowledgedConsequence` does not prove a human read the effect. It proves the
  caller had the word, which makes a silent approval impossible rather than a lie
  detectable. The same limit applies to the approval token.
- The `manual_review` latch only knows what this server observed in its own state
  directory. An id reviewed through another tool is invisible to it.
- A retry after an unknown outcome is a second request for `sandbox delete`,
  `sandbox access revoke` and the lifecycle actions. Only `server power` and
  `server reload` send an `--idempotency-key`, because those are the two commands
  where the CLI's own help and the vendor's reference agree the flag exists.
- `runtime install` failing with `EPERM ... fsync` on Windows is a defect in the
  published CLI on that host, not in this server.
