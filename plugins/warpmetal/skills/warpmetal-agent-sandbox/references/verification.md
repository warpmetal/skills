# Verification gates

The sandbox is ready only when every gate below passes. Report the actual value
of each gate; never convert `pending`, `accepted`, or `unknown` into `READY`.

## Prerequisites, asserted on entry

These are owned by the `warpmetal` skill and are asserted, not re-derived, when
this skill starts. If one is false, stop and hand back rather than fixing it
here.

```text
WarpMetal CLI available
Supported Runtime
Runtime healthy
Sandbox running
Grant applied
Host key verified
SSH works
```

## Agent

- Requested agent installed.
- Verifiable version.
- Authentication completed.
- Documented working mode available.

Run the agent's official status check.

Cursor:

```sh
ssh -t wm-<sandbox_name> 'agent status'
```

Codex:

```sh
ssh wm-<sandbox_name> 'codex --version'
```

Claude:

```sh
ssh wm-<sandbox_name> 'claude --version'
```

Other agent: use the officially documented command.

The following must exist:

```text
agent installed
agent authenticated
workspace accessible
```

Do not declare `READY` if authentication has not been confirmed.

## GitHub

- `gh` available or Git authenticated through an official method.
- Valid GitHub authentication.
- Repository accessible.
- `origin` configured.

## Workspace

- Repository cloned.
- Workspace accessible.
- `git status` works.
- `git remote -v` works.
- `git ls-remote origin HEAD` works.

## Security

- No private key exposed.
- No token exposed.
- No credential versioned.
- No forwarding enabled.
- No owner key inside the sandbox.
- No WarpMetal state file read.

## Final status

```text
READY
```

Emit `READY` only when all gates pass.

If any component fails, report the component and its actual state.
