# Security policy

## Reporting a vulnerability

Report suspected vulnerabilities privately to the maintainers rather than in a
public issue. Include the tool name, the arguments used and the observed
envelope (status, `exit_code`, warnings) so the call can be reproduced. Do not
include approval tokens, identity paths or payloads: they are not needed to
reproduce a gate failure, and they are exactly what this server exists to keep
out of transcripts.

## Scope

This server sits between an MCP client and the WarpMetal CLI. In scope:

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

## Transport profiles

The server exposes two surfaces, and which one a client can reach is decided by the
transport rather than by the caller:

- **`full`** — stdio. The `skill_*` content tools and every `wm_*` CLI tool (46 in
  total). stdio is a local, operator-controlled channel.
- **`content`** — the Streamable HTTP transport. The `skill_*` tools and the
  `skill://` resources only. The `wm_*` tools are not registered at all on this
  profile, because the HTTP transport has no authentication and those tools spawn
  a privileged binary and mutate real infrastructure.

A way to reach a `wm_*` tool over HTTP is a vulnerability. A way to make the
`content` profile serve something outside the loaded registry is one too.

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
