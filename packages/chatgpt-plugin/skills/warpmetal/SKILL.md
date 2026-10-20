---
name: warpmetal
disable-model-invocation: true
description: Manage and observe WarpMetal VPS servers and Agent Runtime sandboxes with the official warpmetal CLI. Use when a shell-capable agent needs live VPS and sandbox discovery, server state, server and sandbox management, per-agent SSH access, or revocation. Payments, purchases, wallet funding and renewals are out of scope for this plugin.
---

# WarpMetal

Use the `warpmetal` CLI as the executable interface. Do not reconstruct its
credential, idempotency, exact-body retry, SSH signing, or polling behavior
with ad hoc HTTP commands.

## Start safely

1. Run `warpmetal --version` and require version `0.8.1` or newer for this
   plugin. If it is missing or older, explain the compatibility requirement,
   ask before installing or upgrading software, and use only the official npm
   package from `https://www.npmjs.com/package/warpmetal`.
2. Use `--json` for every agent-driven command.
3. Read [references/safety.md](references/safety.md) before using an SSH
   identity or changing a server.
4. Read [references/cli-reference.md](references/cli-reference.md) when choosing
   a command or interpreting an exit code.
5. Read [references/runtime.md](references/runtime.md) before requesting,
   installing, accessing, expiring, or deleting Agent Runtime sandboxes.

Never read, print, summarize, upload, or commit the WarpMetal state file,
x402api keystore, password file, payment request envelope, or payment artifact.
Never read an SSH private-key file. Pass private paths only to commands designed
to use them.

## Out of scope: money

This plugin exposes no payment surface. It cannot prepare an order, authorize a
payment, fund a wallet, or renew a paid term. If a task needs money, stop and say
so; use the full WarpMetal CLI and skill instead of improvising with HTTP.

## Operations

Prefer read-only tools first (`wm_state_list`, `wm_server_get`,
`wm_sandbox_list`, `wm_task_list`, `wm_health`, `wm_version`). To change
something, follow the plan/apply pair: run the matching `*_plan` tool, show its
`approval.effect` to the human, obtain approval, and only then call the matching
`*_apply` tool with the exact `approvalToken` and `acknowledgedConsequence` the
plan named. A pending or accepted task is not completed; poll it. A
`manual_review` result is terminal for that operation: do not retry the
mutation, only observe it.
