# Security

## Purpose

This document defines the security requirements and behaviors enforced by `deploy-site`.

## SSH Behavior

### Host Key Verification

```bash
# NEVER do this:
ssh-keyscan <host>  # Bypasses known_hosts verification

# ALWAYS do this:
ssh -o StrictHostKeyChecking=yes <host> 'command'
```

- `StrictHostKeyChecking=yes` enforced at all times
- Stop on host key mismatch
- Never accept unknown host keys
- Never disable verification

### Connection Parameters

```bash
ssh -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile=~/.ssh/known_hosts \
    -o ConnectTimeout=10 \
    -o ServerAliveInterval=30 \
    -o ForwardAgent=no \
    -o PasswordAuthentication=no \
    -o KbdInteractiveAuthentication=no \
    <host> 'command'
```

| Parameter | Value | Reason |
|-----------|-------|--------|
| `StrictHostKeyChecking` | `yes` | Reject unknown hosts |
| `ConnectTimeout` | 10s | Prevent hanging connections |
| `ServerAliveInterval` | 30s | Detect dead connections |
| `ForwardAgent` | `no` | No agent forwarding |
| `PasswordAuthentication` | `no` | Key-only auth |
| `KbdInteractive` | `no` | No keyboard-interactive |

### Deploy Keys

- Dedicated deploy key per client
- Not the developer's personal SSH key
- Stored on server in `~/.ssh/authorized_keys`
- Rotated on a schedule (quarterly recommended)

## Secret Protection

### Never in Manifests

Client manifest files (`~/.config/agency/clients/<client>.toml`) must not contain secrets.

```toml
# WRONG
db_password = "s3cr3t"
api_key = "sk-..."

# CORRECT
db = { engine = "mysql", name = "acme", user = "acme" }
# Password lives in shared/.env on server
```

### Never in Logs

All output sanitized before writing to run journal:

| Pattern | Replacement |
|---------|-------------|
| `password=...` | `password=***REDACTED***` |
| `token=...` | `token=***REDACTED***` |
| `key=...` | `key=***REDACTED***` |
| `secret=...` | `secret=***REDACTED***` |
| `Authorization: Bearer ...` | `Authorization: Bearer ***REDACTED***` |
| `.env` contents | `***ENV FILE REDACTED***` |
| Private keys | `***PRIVATE KEY REDACTED***` |

### Never Printed to stdout/stderr

```bash
# WRONG
echo "Deploying with password: $DB_PASSWORD"

# CORRECT
echo "Deploying..."
```

## .env Handling

`.env` never enters Git. It lives on the server in `shared/.env`.

```
/var/www/acme/shared/.env   ← Never committed
/var/www/acme/releases/<id>/.env  ← Symlink to shared/.env
```

Deployment procedure:
1. Symlink `shared/.env` into new release
2. Never copy or sync `.env` from local machine
3. `.env` permissions: `600`, owned by `deploy_user`

## Git Safety

### Exact Commit Required

```bash
# Resolve ref to exact SHA
git --git-dir="$MIRROR" rev-parse "$TARGET_REF"
```

- Never deploy a branch name alone
- Deploy resolved SHA to `current`
- Record SHA in journal

### Dirty Tree Check

```bash
git --git-dir="$REPO_DIR" status --porcelain
# Must be empty
```

### Unpushed Ref Check

```bash
git --git-dir="$MIRROR" log origin/main..HEAD --oneline
# Must be empty (target commit is on remote)
```

### No Force Push

Skills never push to remote. Deploy is read-only from Git perspective (fetch only).

## Command Injection Prevention

All shell variables quoted. No interpolated commands executed.

```bash
# WRONG
eval "git checkout $COMMIT"

# CORRECT
git --git-dir="$MIRROR" checkout "$COMMIT" -- .
```

```bash
# WRONG
ssh "$HOST" "$(cat script.sh)"

# CORRECT
ssh "$HOST" 'bash -s' < script.sh
```

## Path Traversal Prevention

All paths validated:
- `site_root` must be absolute (`/var/www/...`)
- No `..` components
- No symlinks in path
- No relative paths

```bash
validate_path() {
    local path="$1"
    [[ "$path" =~ ^/ ]] || { echo "ERROR: Path must be absolute"; exit 5; }
    [[ "$path" != *".."* ]] || { echo "ERROR: Path traversal detected"; exit 5; }
}
```

## File Permissions

| Path | Owner | Permissions |
|------|-------|-------------|
| `shared/.env` | `deploy_user` | `600` |
| `shared/storage/` | `deploy_user` | `755` |
| `releases/*/` | `deploy_user` | `755` |
| `current/` | `deploy_user` | `755` |
| `current.tmp/` | `deploy_user` | `755` |
| `site_root/` | `deploy_user` | `755` |

## Lock File Security

```bash
LOCKFILE="/tmp/deploy-${CLIENT}.lock"
# Created with:
exec 9>"$LOCKFILE"
flock -n 9 || { echo "ERROR: Another deployment in progress"; exit 12; }
```

- Lock file in `/tmp` (cleared on reboot)
- Lock held from plan generation through health gate
- Released on success, rollback, or stop
- Lock file not world-writable

## Security Review Checklist

Before any skill is deployed to production, verify:

- [ ] No secrets in client manifest
- [ ] No secrets in run journal
- [ ] No secrets in stdout/stderr
- [ ] All shell variables quoted
- [ ] No `eval` or interpolated commands
- [ ] SSH host key verification enforced
- [ ] Agent forwarding disabled
- [ ] Password auth disabled
- [ ] `.env` never committed
- [ ] Paths validated (absolute, no `..`)
- [ ] Deploy key dedicated per client
- [ ] Lock file prevents concurrent deploys
- [ ] No `rm -rf` on any path
- [ ] No `sudo` or root escalation
- [ ] Commands logged but output sanitized