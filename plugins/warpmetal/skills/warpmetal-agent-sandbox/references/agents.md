# Agent bootstrap inside a WarpMetal sandbox

Everything here runs inside the sandbox, over the SSH alias, and nowhere else.

## Scope

WarpMetal does not install, authenticate, configure, or receive credentials for
any coding agent. Provider authentication and credentials are sandbox-owned and
persist only in the sandbox home. This skill drives the agent's own official
flow; it never invents one.

Never put an API key in the skill, logs, prompts, screenshots, shell history, or
versioned files.

## Detect what is installed

Inside the sandbox:

```sh
ssh wm-<sandbox_name> 'command -v agent || true; command -v codex || true; command -v claude || true; command -v antigravity || true'
```

Also verify the requested agent version when applicable.

Do not assume an entry point for an unknown agent.

## Cursor CLI

Expected entry point:

```text
agent
```

Verify:

```sh
ssh -t wm-<sandbox_name> 'agent status'
```

Login:

```sh
ssh -t wm-<sandbox_name> 'agent login'
```

Without automatically opening a browser:

```sh
ssh -t wm-<sandbox_name> 'NO_OPEN_BROWSER=1 agent login'
```

The user completes authentication in the browser.

Verify:

```sh
ssh -t wm-<sandbox_name> 'agent status'
```

Headless:

```sh
ssh wm-<sandbox_name> 'agent -p "Analyze this repository"'
```

Direct changes with `--force` require explicit authorization:

```sh
ssh wm-<sandbox_name> 'agent -p --force "Implement only the approved plan"'
```

For automation, an API key may be supplied through:

```text
CURSOR_API_KEY
```

## Codex

Verify:

```sh
ssh wm-<sandbox_name> 'codex --version'
```

Use the official login corresponding to the installed version.

Do not ask for tokens in chat.

With an authenticated installation:

```sh
ssh -t wm-<sandbox_name> codex
ssh wm-<sandbox_name> 'codex exec "Implement the approved plan"'
```

## Claude Code

Verify:

```sh
ssh wm-<sandbox_name> 'claude --version'
```

Complete official interactive authentication inside the sandbox.

Examples:

```sh
ssh -t wm-<sandbox_name> claude
ssh wm-<sandbox_name> 'claude -p "Review this branch"'
```

## Antigravity or another agent

Do not assume an entry point.

Procedure:

1. Detect the executable.
2. Run the official version command.
3. Read the official documentation for the installed version.
4. Identify the official login.
5. Complete authentication inside the sandbox.
6. Identify the documented interactive/headless mode.
7. Run the minimum verification command.
8. Keep credentials inside the sandbox.

Do not invent:

- flags
- commands
- paths
- environment variables
- authentication methods

If official documentation does not allow a safe flow to be determined, stop.

## Compatibility requirements

An agent is usable in this sandbox only when all of these hold:

```text
CLI or executable entry point inside the sandbox
documented authentication
documented interactive or headless mode
accessible local workspace
```

Expected entry points for the documented agents:

```text
Cursor CLI:   agent
Codex:        codex
Claude Code:  claude
Antigravity:  do not assume an entry point
```

If the agent does not meet these requirements, stop.

## Remote-IDE access is not supported

Cursor Desktop over Remote-SSH is not supported by an alias that requires
dynamic forwarding. Do not relax forwarding controls to make it work.

Use Cursor CLI inside the sandbox instead:

```sh
ssh -t wm-<sandbox_name> 'agent'
ssh wm-<sandbox_name> 'agent -p "<task>"'
```
