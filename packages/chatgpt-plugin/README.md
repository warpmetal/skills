# WarpMetal for ChatGPT

A desktop-only ChatGPT plugin that runs the WarpMetal MCP server locally over
`stdio` and exposes a read-only dashboard, composer mentions and a server
picker — with every change gated behind a plan/apply flow and explicit human
approval.

## Prerequisites

- Node.js `>= 22`.
- The `warpmetal` CLI, version `0.8.1` or newer, resolvable from `PATH` (or
  `WARPMETAL_CLI_JS`). The plugin fails closed and shows instructions if the CLI
  is missing or too old.
- ChatGPT Desktop (local MCP plugins are desktop-only).

## Install (local marketplace)

```sh
# from the repository root
npm run build:chatgpt-plugin       # generates plugins/warpmetal-chatgpt/
codex plugin marketplace add .     # add this repo as a marketplace
```

Restart ChatGPT Desktop, open the Plugins Directory, choose the repo marketplace,
and install the **WarpMetal** entry.

## Approval

The plugin ships read-only by default. To enable the change tools, set the
approval mode and allow the tools you want in your Codex config:

```toml
[plugins."warpmetal-chatgpt".mcp_servers.warpmetal]
default_tools_approval_mode = "prompt"
enabled_tools = [
  "skill_list", "skill_search", "skill_read",
  "wm_version", "wm_health", "wm_catalog", "wm_state_list", "wm_identity_list",
  "wm_server_get", "wm_sandbox_list", "wm_sandbox_get",
  "wm_task_list", "wm_task_get", "wm_task_wait",
  "wm_order_status", "wm_operation_get", "wm_runtime_get",
  "wm_sandbox_access_list", "wm_sandbox_access_get", "wm_manual_review_list",
  "warpmetal.dashboard", "search_mentions"
  # add specific wm_*_plan / wm_*_apply tools only after you have verified that
  # ChatGPT Desktop asks for confirmation before each apply
]
```

Verify in ChatGPT Desktop that every `*_apply` asks for confirmation before you
add it. The plugin's internal approval token is a server-side, single-use gate;
it is not a substitute for your confirmation.

## Privacy

The MCP process runs locally, but the tool inputs and results that ChatGPT uses
to answer may be sent to ChatGPT's service. Do not mention or select resources
whose identifiers you would not want in that conversation. The plugin never
ships vault contents, private keys, tokens, or payment artifacts, and it
redacts secrets from results.

## Limits

- No payments, purchases, wallet funding, or renewals.
- No third-party provider tools (GitHub, Notion, Stripe, …).
- No network listener: `stdio` only.

## Troubleshooting

- **Plugin installs but the dashboard says the CLI is unavailable** — install
  `warpmetal` (`npm install -g warpmetal`) and confirm `warpmetal --version`
  is `0.8.1` or newer.
- **No tools appear** — the MCP process must start from the installed copy; run
  `npm run build:chatgpt-plugin` again and restart ChatGPT Desktop.
- **A change did nothing** — the flow is plan → approve → apply; run the plan
  tool first and reuse its `approvalToken`.
