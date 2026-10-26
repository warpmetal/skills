# WarpMetal for DeepSeek Harness

An installable DSH bundle that connects DeepSeek Harness to WarpMetal: the
WarpMetal MCP server runs locally over `stdio`, the nine WarpMetal Agent Skills
load from the same package instead of being copied around, and WarpMetal tool
results render as their own conversation row.

## What it mounts

| Row | Package | What it adds |
|---|---|---|
| `warpmetal-local` | `@warpmetal/dsh-plugin` | the `warpmetalLocal` service: where the bundled server is, and how to run it |
| `warpmetal-skills` | `@warpmetal/dsh-plugin/skills` | a native skill provider over the nine bundled skills |
| `mcp-warpmetal` | `@deepseek-ai/dsh-mcp-client` | the MCP server, as `mcp__warpmetal__*` tools |
| (browser) | `@warpmetal/dsh-plugin/client` | the WarpMetal row for eight read tools, in the `tool.call.toolview` slot |

The MCP surface is the same 46 tools the ChatGPT plugin serves: the three
`skill_*` content tools and 43 `wm_*` CLI tools. Those 43 are 19 reads plus 12
plan/apply pairs over server, sandbox and runtime lifecycle — there is no
payment, purchase, refill or renewal tool on this surface, no provider tools, and
no network listener.

The skills are the canonical ones from this repository, not a chat-surface
subset: they document the `warpmetal` CLI in full, including payments and
renewals, because a harness with a shell can run it. They are user-invocable only
(see below), so the human decides when that happens.

## Requirements

- A Node runtime for the MCP server, resolved in this order: an explicit
  override (`WARPMETAL_DSH_NODE`, then `DSH_NODE`), then the harness's own Node
  — `process.execPath` under the CLI and web hosts, and
  `resources/runtime/primary-runtime/dependencies/node/bin/node` next to the
  Electron binary on the desktop, which is exactly why `process.execPath` is
  never used there — and finally `node` on `PATH` as a last resort.
- DeepSeek Harness `>= 0.2.0-rc.2 < 0.3.0` (declared as `engines.dsh`).
- The `warpmetal` CLI for the tools to be useful (`wm_*` calls fail visibly when
  it is missing).

## Install

```sh
# from a checkout of warpmetal/skills
npm run build:dsh-plugin
dsh plugin --profile desktop add ./plugins/warpmetal-dsh
```

`dsh plugin add` links the checkout and appends the bundle to the profile's
`dsh.profile.bundles`. Restart the profile: the package manifest and the client
package metadata are cached per process.

Verify the composition without booting — on any profile except `desktop`, which
the Electron application reserves for itself (`error: profile "desktop" is
managed exclusively by the Electron application`; there, the composed rows are
visible from the app's own Plugins page):

```sh
dsh --profile <name> --dump-config     # look for the three rows above
```

To keep the running app untouched while trying it out, install into a scratch
profile instead (`dsh --profile warpmetal-test ...`).

## Skills are user-invoked, not model-invoked

Every WarpMetal `SKILL.md` declares `disable-model-invocation: true`, which is
this repository's own safety convention (an agent must not start a mutating
skill unasked). The provider projects that field instead of overriding it, so:

- the nine skills appear as **user-invocable** entries (slash-command surface),
  and they do **not** enter the model's `<available_skills>` catalog;
- the model reaches the same content through the MCP `skill_list` /
  `skill_search` / `skill_read` tools, which are ordinary tool calls a host can
  gate.

A user's own copy in `.dsh/skills` or `.agents/skills` always wins a duplicate
name: the bundle registers its skills at rank 700 and the local roots sit at
100–600.

## UI in DeepSeek Harness

Eight read tools replace the host's generic tool row with a WarpMetal card:

| Tool | Shows |
|---|---|
| `wm_health` | envelope status and the CLI's own summary line |
| `wm_state_list`, `wm_sandbox_list` | up to 20 `id · state` pairs |
| `wm_task_list` | up to 10 `taskId · status`, plus `stale` |
| `wm_server_get`, `wm_sandbox_get`, `wm_order_status`, `wm_operation_get` | the single object's id and state |

The card also surfaces the envelope's warnings, highlights `manual_review`, and
keeps the raw JSON behind a disclosure. The other 38 tools — the three
`skill_*` tools and the remaining `wm_*` ones — keep the host's generic row: they
show arguments and output already, and a smaller carded surface is easier to keep
correct.

Two things this deliberately is **not**:

- **Not an HTML page in an iframe.** The shipped UI reference forbids it — an
  iframe document receives neither the host's theme tokens nor `ctx.locale`.
- **Not a panel.** A panel needs a client-callable host data path (a session
  command behind `ctx.remote.commands`), which is not publicly documented for
  this release; the card gets everything from the tool result already recorded in
  the session, so it also survives fork, resume and replay.

Implementation notes, for whoever touches `client.js`:

- It is a hand-written `window.__ModuleLoader__.load` factory: React comes from
  the browser module table, and there is no build step. `npm run
  check:dsh-plugin` loads it in a `vm` sandbox and rejects a bundle that is not
  exactly one factory, that imports a Harness client package, or that touches
  `document.body`, `innerHTML`, `eval` or an iframe.
- Styling uses only `--dsw-alias-*`, `--dsw-radius-*` and
  `--dsw-font-markdown-*` tokens, so a renamed token degrades the look instead of
  breaking the row.
- The projection is total: an unreadable result renders a one-line row. A
  component that throws leaves the slot entry blank in the host, which is why
  nothing in the render path may throw.
- Changing `client.js` requires rebuilding the artifact **and** restarting the
  profile: the client roster is built per process.

## Approval

Nothing here bypasses DSH's own consent seam. Changes go through the server's
plan → apply flow (a single-use token bound to the exact argv), and every tool
call is decided by `ctx.approval` before it runs:

- `ask` (the default) — the host prompts, and only `allowed-once` proceeds;
- `never` — every ask resolves to `rejected`, deterministically, which is the
  right stance for CI and unattended runs.

The plugin never ships vault contents, private keys, tokens or payment
artifacts, and the server redacts secrets from results. Tool inputs and results
still enter the conversation, so do not select resources whose identifiers you
would not want in that transcript.

## Limits

- No payment, purchase, refill or renewal **tool**: the MCP surface has 19 reads
  and 12 plan/apply lifecycle pairs, and nothing else. The skill documents the
  CLI's payment flow for a human who invokes it.
- No third-party provider tools.
- No network listener: `stdio` only.
- 46 tool schemas are in the model's tool list while the server is connected;
  that is the cost of the surface, and it is why this profile is used instead of
  the 1,377-tool `full` one.

## Troubleshooting

- **The rows never appear** — on any profile but `desktop`, `dsh --dump-config`
  lists them; the desktop profile is app-managed, so check the app's Plugins page
  instead. If the bundle is absent from `dsh.profile.bundles`, run
  `dsh plugin add` again; if the MCP row is there but waiting, its
  `inject: [warpmetalLocal]` never activated, which means the first row failed to
  load (check the startup log).
- **`mcp__warpmetal__*` tools are missing** — the MCP process could not start.
  The plugin launches the harness's own Node, so this normally means that path
  moved: set `DSH_NODE` to an absolute Node ≥ 22. The server keeps its last tool
  list and retries with backoff; the failure is logged with the reason.
- **The card is a generic row** — the tool row is registered by `client.js`, which
  the host loads once per process from `dsh.client`; rebuild the artifact and
  restart the profile. The MCP tools keep working either way, since the card is
  presentation only.
- **The dashboard in the ChatGPT plugin is absent here** — DSH does not implement
  MCP Apps (`ui://`); that surface is a ChatGPT-only artifact.
- **A change did nothing** — the flow is plan → approve → apply. Run the plan
  tool first and reuse its `approvalToken`.
- **Every turn fails with `Invalid schema for function ... is not a regex`** —
  the provider rejected the tool list itself, before the model ran: a `pattern`
  in one of the 46 schemas uses a regex escape its engine does not implement
  (`\0` did this on DeepSeek; see `PROVIDER_ESCAPES` in
  `packages/skills-mcp/test/conformance.test.ts`). The harness cannot be fixed
  from its configuration — the schema is the server's. Rebuild the bundle
  (`npm --prefix packages/skills-mcp run build && npm run build:dsh-plugin`) and
  restart the profile. Disabling the `mcp-warpmetal` row unblocks the session but
  removes every `wm_*` tool; the skills still work, and the `warpmetal` CLI can be
  run directly from a shell.

## Caretaker notes

The artifact is generated (`npm run build:dsh-plugin`), not committed: it embeds
the compiled MCP server and its production dependencies. `npm run
check:dsh-plugin` validates the generated package offline — manifest, patch
shape, registry parity with `registry.json`, and the absence of checkout paths or
credential-shaped environment entries.

It cannot be rebuilt while an installed profile is running: the MCP server is
spawned with the artifact directory as its working directory, so Windows keeps
that directory locked and `rm` fails with `EBUSY`. Quit the app (or stop the
profile) first; the build prints exactly that instead of a stack trace.

`private: true` is deliberate while the package is still installed from a path;
the npm publish (and with it the plugin-market index) is a later phase.
