# GitHub inside a WarpMetal sandbox

All of this runs inside the sandbox, over the SSH alias. Nothing here touches
the host's GitHub credentials.

## Verify GitHub CLI

Inside the sandbox:

```sh
ssh wm-<sandbox_name> 'gh --version'
ssh wm-<sandbox_name> 'gh auth status'
```

If `gh` does not exist, install it following the OS's official documentation and
ask for approval if the installation modifies the system.

Do not invent installation commands for an unknown OS.

## HTTPS authentication

If `github_auth=https`:

```sh
ssh -t wm-<sandbox_name> 'gh auth login --hostname github.com --git-protocol https'
ssh wm-<sandbox_name> 'gh auth setup-git'
ssh wm-<sandbox_name> 'gh auth status'
```

Authentication occurs inside the sandbox.

Do not ask for tokens in chat.

## SSH authentication

If `github_auth=ssh`:

Generate a key inside the sandbox:

```sh
ssh -t wm-<sandbox_name> 'ssh-keygen -t ed25519 -f ~/.ssh/github_ed25519 -C "warpmetal-sandbox"'
```

Register only the public key through the available official GitHub CLI flow:

```sh
ssh -t wm-<sandbox_name> 'gh ssh-key-add --type authentication ~/.ssh/github_ed25519.pub'
```

Never reuse a WarpMetal key as a GitHub key.

Never copy a private key outside the sandbox.

## Boundary

A GitHub credential created here is scoped to one sandbox and dies with it. It
is never shared with another sandbox, copied to the host, or reused as a
WarpMetal identity.
