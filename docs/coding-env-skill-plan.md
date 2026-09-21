# coding-env Skill + `warpmetal env` — Implementation Plan

Status: planning complete; implementation not started (registry-side prerequisites are in place).
Revision: 2026-09-21, revision 1.
Companion plan: [`PLAN.md`](../PLAN.md) (skill registry repo, distribution channels, MCP server).
Workstream: WarpMetal agent-kit (`agent-kit/`, its own git repo, published as npm `warpmetal`, Node >= 20, currently zero runtime dependencies).

## 1. Context

`agent-kit` ships the `warpmetal` CLI and one portable skill (`skills/warpmetal`), installed with
`warpmetal agent install --target codex|claude|all [--scope user|project]`. This plan adds the
coding-environment product:

- an interactive first-run script for users who have no agent installed yet;
- a deterministic `warpmetal env` command family shared by the script, agents, and CI;
- the `coding-env` Agent Skill with role profiles (planner / builder / reviewer).

Contracts to preserve and reconcile:

- `AGENT_CLI_ACCOUNT_INTEGRATIONS_PLAN.md` — broker/vault, per-sandbox grants, role templates
  `coder`/`reviewer`/`qa`, install-before-auth, signed tool bundles. The local credential store
  here is the interim tier until that broker exists.
- `planning/sandbox-agents-and-optional-app-maintenance.md` — Agent Boxes, order-time tool intent,
  and reserved command names. Do not repurpose `warpmetal agent install`, `integration setup`, or
  `agent setup`.
- The CLI's existing invariants: `--json` everywhere, idempotency keys, `--confirm` for mutating
  commands, no bearer values in argv, private state under `~/.config/warpmetal` with `0600`/`0700`.

## 2. Decisions (locked 2026-09-21)

| Area | Decision |
|---|---|
| Product shape | `warpmetal env setup` script is the first-run front door; the skill is an optional agent wrapper over the same engine |
| Skill name | `coding-env`; roles `planner`, `builder`, `reviewer` (qa later) |
| CLI namespace | `warpmetal env plan \| apply \| status \| doctor \| revoke \| store \| secret` |
| Agent hosts | omp (recommended orchestrator), OpenCode, Codex, Claude Code, Cursor, DeepSeek Harness (`dsh`), generic `.agents/skills` |
| Composition (omp) | driver → `modelRoles.default`/`plan`; subagents → `modelRoles.smol`/`task` + optional `.omp/agents/*.md`; reviewer → `modelRoles.advisor` |
| Services v1 | GitHub, GitLab, Jira/Atlassian, Multica, Linear, Slack, Postgres/Supabase |
| Credentials | Three classes (provider session / stored secret / host OAuth); keychain-first via optional `@napi-rs/keyring`, AES-256-GCM + scrypt file vault fallback |
| Runtimes | Detect-only; install only missing helpers (pnpm, uv, composer) after consent; never override present versions; PHP support stated honestly |
| Install policy | Agent hosts and tools only via brew / bun / npm / mise; never `curl \| sh` |
| Bootstrap | `npx warpmetal env setup`; Agent Box image later preinstalls the CLI as a signed bundle |
| No agent found | Offer in-flow installs via detected package managers after consent |
| State | `~/.config/warpmetal/env/` — separate from payment-critical `state.json` |
| New deps | optional `@napi-rs/keyring`; pure-JS `yaml` (omp config merge) |
| Skill delivery | Pinned bundle of a registry tag by default; explicit update later (companion plan) |

## 3. User journeys

1. **Cold start (no agent).** `npx warpmetal env setup` → detect environment → load prior state and
   provisioning intent → detect hosts → if none: offer package-manager installs → continue with
   role, services, composition → show plan → authenticate → install missing tools → write host
   configs → `doctor` → print next steps.
2. **Agent-driven.** User tells their agent "set up my coding env". The `coding-env` skill collects
   the same answers conversationally, then runs `warpmetal env plan`/`apply` non-interactively with
   `--json`.
3. **Provisioned box.** First boot wrote `env/intent.json` (selected hosts, role, services). Setup
   preloads those answers and asks only what is missing, showing "from provisioning: …" with
   override.
4. **Resume.** Any exit is resumable: state is saved, already-applied steps are skipped, and
   `env status` reports exactly what is pending.
5. **Power user / CI.** `env plan --json` → inspect → `env apply --plan-file <f> --confirm APPLY`.

## 4. Architecture

```
agent-kit/src/env/
  setup.js            interactive orchestrator (readline, hidden input, no extra deps)
  detect.js           environment + host detection, host registry
  plan.js             manifest builder (role, services, composition, diff)
  apply.js            idempotent executor over typed steps
  doctor.js           verification + safe status
  store.js            credential store facade
  backends/keychain.js  @napi-rs/keyring wrapper (optional import)
  backends/file.js      AES-256-GCM + scrypt vault
  secret.js           read-only `env secret <name> --stdout`
  adapters/*.js       one per service
  hosts/*.js          one per agent host (config writers)
```

CLI wiring: `src/cli.js` dispatch, help text, `src/args.js` additions, `package.json` `check` and
`files` updates, tests under `test/env-*.test.js` (node:test, following existing conventions).

Runtime layout (same on laptop and inside an Agent Box, under the user's `$HOME`):

```
~/.config/warpmetal/env/
  state.json          applied state: hosts, services, versions, pending steps
  plans/<planId>.json non-secret plan manifests
  vault.enc           encrypted secrets (file backend only)
  shims/run-mcp-<service>   launcher shims for hosts without command indirection
  intent.json         read-only, written by provisioning (never written by this CLI)
```

## 5. CLI reference

| Command | Purpose |
|---|---|
| `env setup [--json] [--answers <file>]` | Interactive first run; `--json` non-interactive mode |
| `env plan --role <r> --services <list> [--driver <sel>] [--subagents <sel>] [--advisor <sel>] [--json]` | Non-mutating manifest, written to `plans/` |
| `env apply --plan-file <f> [--confirm APPLY] [--dry-run] [--json]` | Idempotent execution |
| `env status [--json]` | What is configured, what is pending, backend in use |
| `env doctor [--json]` | Tool/auth/MCP verification; no secrets in output |
| `env revoke --service <name> [--confirm REVOKE] [--json]` | Remove a service's credentials and config |
| `env store status \| rotate [--json]` | Backend info, key rotation |
| `env secret <name> --stdout` | Read-only secret emission for host config indirection; never logged |
| `env host list [--json]` | Detection detail: installed / configured / signed in |
| `skill list \| show \| install \| update` | Skill manager (content source owned by companion plan) |

Exit codes: `0` ok; `2` usage/config error; `3` needs agent host; `4` needs provider auth;
`5` apply failed; `6` integrity/unsupported platform.

Global rules: `--json` output is secret-redacted; mutating commands require `--confirm`; no secret
ever appears in argv, plan files, state, logs, or human output.

## 6. Host matrix

| Host | Skill install path (user / project) | Config writer target |
|---|---|---|
| omp | `.agents/skills/coding-env/` (+ native `.omp` root, P0-verified) | `~/.omp/agent/config.yml` (`modelRoles`), `~/.omp/agent/models.yml`, `~/.omp/agent/mcp.json`, `~/.omp/agent/agents/*.md` |
| OpenCode | `~/.config/opencode/skills/` / `.opencode/skills/` | prefer `opencode mcp add`; else `mcp.servers` in `opencode.json(c)` |
| Codex | `~/.codex/skills/coding-env/` / `.codex/skills/coding-env/` | `~/.codex/config.toml` `[mcp_servers.*]` |
| Claude Code | `~/.claude/skills/coding-env/` / `.claude/skills/coding-env/` | project `.mcp.json`; user scope via `claude mcp add` |
| Cursor | `~/.cursor/skills/coding-env/` / `.cursor/skills/coding-env/` (also `.agents/skills`) | `.cursor/mcp.json` |
| DeepSeek Harness | P0 spike | P0 spike |
| Generic / portable | `~/.agents/skills/coding-env/` / `.agents/skills/coding-env/` | root `mcp.json` fallback |

Detection reports three honest levels per host: **installed** (binary on PATH), **configured**
(config dir/file present), **signed in** (only when a documented non-secret probe exists;
otherwise "unknown"). Probes must never read credential file contents.

MCP server names are namespaced per host (`warpmetal-github` etc.) because omp auto-imports other
hosts' configs and first definition wins.

## 7. Service adapters

| Service | Default delivery | Auth modes | Role narrowing | Doctor check |
|---|---|---|---|---|
| GitHub | `gh` CLI + GitHub MCP | `gh auth login` session, or fine-grained PAT (stored) | token permissions (read-only for planner/reviewer) | `gh auth status`, API ping |
| GitLab | `glab` + GitLab MCP | `glab auth login`, or PAT (stored) | `read_api` for planner/reviewer | `glab auth status` |
| Jira/Atlassian | Atlassian remote MCP; optional CLI fallback | host OAuth, or API token (stored) | project role; token scopes are coarse — declared | MCP reachability / `myself` call |
| Multica | `multica` CLI + its skill | CLI login/token (session or stored) | workspace member role | CLI version + whoami |
| Linear | remote MCP or API key | host OAuth, or stored key | workspace permissions | MCP/GraphQL probe |
| Slack | Slack MCP | host OAuth (user token) or stored token | token scopes | MCP reachability |
| Postgres/Supabase | connection string + Postgres MCP via shim | stored secret (read-only role recommended) | DB role grants | `select 1` via MCP or `psql` |

Each adapter declares: required tools, auth modes with truthful scoping statement, config files it
writes, verification command, revoke behavior, and a redacted error map. Adapters never invent
scoping the provider cannot enforce.

## 8. Credential model

Three classes, never conflated in output:

1. **Provider session** — created by the provider's own login (`gh auth login`, `glab auth login`,
   `multica login`). The CLI detects and reports; it never reads or copies the token.
2. **Stored secret** — API keys/tokens encrypted by this CLI. Keychain backend first
   (`@napi-rs/keyring`, optional dependency); AES-256-GCM + scrypt vault otherwise. Read via
   `env secret <name> --stdout` (short-lived, no TTY requirement, never logged).
3. **Host OAuth** — remote MCP servers that authorize inside the agent host. The CLI writes the
   server entry; the host owns the token and the CLI reports "configured, awaiting sign-in".

Injection rules:

- omp configs use omp's `!command` indirection: `"!warpmetal env secret deepseek --stdout"`.
- Other hosts use generated shims `env/shims/run-mcp-<service>` that read the store and exec the
  MCP process; configs reference the shim path, never a literal secret.
- Secrets are accepted only on stdin with hidden input; never as arguments.
- Vault parameters: `scrypt` N=2^15, r=8, p=1 (documented, versioned header); AES-256-GCM with
  random 96-bit nonce; authenticated context binds service name and generation.
- `env store rotate` re-encrypts; `env revoke` removes keys and host entries and reports provider-side
  revocation as confirmed / unsupported / uncertain (never claims more).

## 9. Composition (omp)

`env plan --driver openai-codex/gpt-5.5 --subagents deepseek/deepseek-v4-flash --advisor anthropic/...`
resolves to:

```yaml
modelRoles:
  default: openai-codex/gpt-5.5
  smol: deepseek/deepseek-v4-flash
  task: deepseek/deepseek-v4-flash
  advisor: anthropic/...
```

- YAML merge preserves unrelated keys and comments; writes are atomic with a backup.
- Auth: OAuth-backed providers stay host-owned (user runs `omp` → `/login`); API-key providers read
  from the store via `!warpmetal env secret <provider> --stdout` in `models.yml`/`config.yml`.
- Optional custom agents (`.omp/agents/reviewer.md` etc.) only when the role profile calls for it.
- Role profile defaults: planner → driver + deepseek subagents; builder → same plus repo push;
  reviewer → `advisor` set to a strong model, read-only toolset.

## 10. Requirements and acceptance

| ID | Requirement | Observable acceptance | Verification |
|---|---|---|---|
| R1 | Cold start without agents | Fresh machine: setup detects no host, offers installs, exits 3 with saved state; re-run resumes at detection | packaged CLI journey |
| R2 | Script and skill parity | Same answers produce byte-identical plan manifests through both paths | integration |
| R3 | Idempotent apply | Second `apply` makes no changes and reports already-applied | integration |
| R4 | Secret containment | Secret-canary test finds no secret in plans, state, configs, shims, logs, or `--json` output | security |
| R5 | Honest detection | Installed/configured/signed-in never overclaimed; probes never read credential files | unit + inspection |
| R6 | Host writers preserve foreign config | Unknown keys/comments retained; atomic write; backup on change | fixture tests |
| R7 | Role scoping is token-level | Reviewer/planner receive only read-scoped tokens where the provider supports it; otherwise the limitation is printed | contract |
| R8 | omp composition | `modelRoles` written/merged, `!command` secret resolves, `/login` cases reported as needs-auth | integration |
| R9 | Detect-only runtimes | No version manager installed silently; missing helpers listed with the exact consented install command | integration |
| R10 | Revocation | Revoke removes local material and reports upstream status truthfully | fault test |
| R11 | Provisioning intent | `intent.json` preloads answers and is never written by the CLI | unit |
| R12 | Exit-code contract | 3/4/5 are stable and machine-readable in `--json` | CLI test |
| R13 | Backward compatibility | Existing commands, state schema, and `agent install` unchanged | regression |
| R14 | Sandbox-safe | All writes under `$HOME`; works with read-only root, non-root, noexec `/tmp`, no keychain | sandbox smoke |

## 11. Phases

**P0 — spikes (each ends in written evidence):**
1. omp config surface pinned to a specific omp version: native skill root, `config.yml` merge,
   `mcp.json`, agent files.
2. `dsh` config surface; if none, record `unsupported` with exact reason.
3. Host MCP write semantics: prefer host CLI where non-interactive; namespacing; duplicate handling.
4. Keychain availability matrix (macOS, Linux desktop, headless sandbox, WSL); fallback behavior.
5. Service auth truth table for the seven adapters, including scoping limitations.
6. PHP/toolchain detection statement for the sandbox image.
7. Provisioning-intent contract with backend owners (`env/intent.json` schema and writer).

**P1 — foundation:** `detect.js`, `setup.js`, `plan.js`, `store.js` + backends, `secret.js`, CLI
wiring + help + exit codes + `check`/`files`, tests. No service adapters yet; `apply` supports
reversible local steps only.

**P2 — product:** host writers (omp, OpenCode, Codex, Claude, Cursor, generic; dsh per P0), all
seven service adapters, composition writer, `doctor`/`revoke`/`store rotate`, `--skill` install
extension.

**P3 — skill and release:** `skills/coding-env/` content + role/provider references, README/help,
companion-plan snapshot integration, plugin copy sync, release checks, Agent Box image preinstall
handoff.

## 12. Testing

Node `node:test` with injected `HOME`/`XDG`/`PATH` fixtures. Golden files for every host config
writer. Negative tests: traversal, malformed vault, corrupt state, non-TTY setup, interrupted
apply. Secret-canary assertions on every artifact. No network in unit tests; live provider probes
are manual/CI-gated with disposable credentials.

## 13. Interfaces with the registry plan

### Skill resolution model (decided 2026-09-21)

Two consumers, two transports, one manifest:

- **Agents in a session** use `@warpmetal/skills-mcp` for discovery and reads. MCP is the right
  protocol there because hosts manage server lifecycles and the model needs on-demand lookup.
- **The `warpmetal` CLI** (`skill list/show/install/update`) reads the static registry directly:
  `registry.json` plus files from the catalog URL, a pinned tag, or `--registry <path>`, with
  checksum verification before writing. No MCP client dependency, deterministic installs, offline
  from a path or cache, and package-manager-shaped behavior.
- Both share `registry.json`, the checksum manifest, and the skill layout, so results cannot drift.
  `skill search` matches the fields already in the manifest (name, tags, description, roles,
  hosts) instead of depending on the server.

A CLI MCP-client mode is justified only for private or authenticated registries, where a server
acts as an adapter; it is not part of v1.

- Skill content source is indirection-based: today `agent-kit/skills/<name>/`; after the companion
  migration, a generated snapshot of a pinned registry tag. CLI code must not care which.
- Fields consumed from `registry.json`: `name`, `version`, `files`, `sha256`.
- `skill list/install/update` is part of this plan's CLI surface; the remote source is owned by the
  companion plan. Until it exists, only bundled skills are installable.
- If the user opts into on-demand skill discovery, `env apply` may write a `@warpmetal/skills-mcp`
  entry using the snippets the companion plan publishes; the server package is owned there.

## 14. Open items

- `dsh` support level; omp native skill root; Windows scope (POSIX-first suggested).
- Provisioning-intent file owner and schema freeze; who writes `intent.json` at first boot.
- Claude user-level MCP write method (`claude mcp add` vs `.mcp.json`).
- Final PHP statement per sandbox image.
- Whether `env setup` may offer host installs when no package manager exists (report-only).

## 15. Delivery status (2026-09-21)

Registry-side prerequisites completed in this repository (see [`PLAN.md`](../PLAN.md#delivery-status-2026-09-21)):

- [x] Distribution channels exist for every target host, including DeepSeek Harness
      (`.agents/skills`, `dsh-mcp-client`) and any MCP-capable local agent.
- [x] `@warpmetal/skills-mcp` publishes skill discovery and reads independent of the CLI.
- [x] Skill content layout (`skills/<name>/SKILL.md` + references) and registry checksums are
      ready to accept `coding-env`.

Not started, in dependency order:

- [ ] `warpmetal env` implementation in `agent-kit` (`setup`, `plan`, `apply`, `status`, `doctor`,
      `revoke`, `store`, `secret`) and the `agent install --skill` extension.
- [ ] P0 spikes: omp/dsh config surfaces, provisioning-intent contract, keyring availability,
      service auth truth table.
- [ ] `coding-env` skill content published to `skills/coding-env/` once the CLI minimum version
      exists, so installed skills never reference missing commands.
- [ ] agent-kit pins a released registry tag for its bundled snapshot.
