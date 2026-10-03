# rsync Strategy

## The Right Flags

```bash
rsync -aHAXz \
  --exclude='.git' \
  --exclude='vendor' \
  --exclude='node_modules' \
  --exclude='releases' \
  --exclude='*.log' \
  --progress \
  "$SOURCE_HOST:$SITE_ROOT/shared/" \
  "$TARGET_ROOT/shared/"
```

### Flag Breakdown

| Flag | Purpose |
|------|---------|
| `-a` | Archive mode: recursive + symlinks + permissions + timestamps + owner + group |
| `-H` | Preserve hard links (important for some WordPress installations) |
| `-A` | Preserve ACLs |
| `-X` | Preserve extended attributes |
| `-z` | Compress data in transit (reduces bandwidth, increases CPU) |
| `--progress` | Show transfer progress (useful for large syncs) |

### Why Not Just `-r` or `-av`?

`-r` alone doesn't preserve permissions, timestamps, or ownership. After a plain `-r`
sync, every file appears "modified" in the next sync because timestamps differ.
PHP processes may not be able to read files if ownership/permissions are wrong.

## Two-Phase Sync Strategy

### Phase 1: Bulk Sync (While Site Is Live)

Run while the source is still serving traffic. This moves the bulk of the data
(uploads, large files) without requiring downtime.

```bash
# Bulk sync — can take minutes to hours for large sites
rsync -aHAXz \
  --exclude='.git' --exclude=vendor --exclude=node_modules \
  "$SOURCE_HOST:$SITE_ROOT/shared/" \
  "$TARGET_ROOT/shared/"
```

This will miss files created or modified during the sync, but that's OK —
the delta sync in Phase 2 (freeze) catches them quickly.

### Phase 2: Delta Sync (During Freeze)

After the source goes into maintenance mode, run the delta:

```bash
# Delta sync — only transfers changed/new files since last sync
# --checksum compares by content (not just timestamp), catching edge cases
rsync -aHAXz --checksum \
  --exclude='.git' --exclude=vendor --exclude=node_modules \
  "$SOURCE_HOST:$SITE_ROOT/shared/" \
  "$TARGET_ROOT/shared/"
```

The delta sync should be fast (seconds to minutes) because Phase 1 moved everything.

## Ownership and Permissions

### The Ownership Drift Problem

If rsync runs as `root` and the site should be owned by `www-data`, you get files
owned by `root` that `www-data` (the web server user) cannot write to.

Fix: run rsync with `--chown` or fix ownership after sync:

```bash
# Fix ownership on target after sync
ssh "$TARGET_HOST" "chown -R www-data:www-data $TARGET_ROOT/shared"
```

Or use `--rsync-path` to run rsync as the correct user on the source:

```bash
rsync -aHAXz -e ssh \
  --rsync-path="sudo -u www-data rsync" \
  "$SOURCE_HOST:$SITE_ROOT/shared/" \
  "$TARGET_ROOT/shared/"
```

### Checking Permissions After Sync

```bash
ssh "$TARGET_HOST" "ls -la $TARGET_ROOT/shared/public/uploads/ | head -10"
# Verify: owner is www-data, not root
```

## SSH Key for rsync

rsync uses SSH for remote transfers. Ensure the machine running rsync can SSH to both
source and target:

```bash
# Test from control machine
ssh "$SOURCE_HOST" "ls $SITE_ROOT/shared/"
ssh "$TARGET_HOST" "ls $TARGET_ROOT/"
```

If rsync runs on the target (pulling from source), ensure target can SSH to source.
If rsync runs on the control machine (pushing to target), ensure control can SSH to target.

## Estimating Transfer Time

```bash
# Dry-run to estimate size
rsync -aHAXzn \
  --exclude='.git' --exclude=vendor --exclude=node_modules \
  "$SOURCE_HOST:$SITE_ROOT/shared/" \
  "$TARGET_ROOT/shared/"
# Note the "total size is X" line
```

Rule of thumb: 100GB over a 1Gbps link with overhead ≈ 15–20 minutes.
Between cloud providers in different regions: expect 30–50% of line speed.
