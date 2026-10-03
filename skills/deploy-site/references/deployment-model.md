# Deployment Model

## Release Structure

Every site follows this directory layout:

```
/var/www/acme/
├── current -> releases/20260916-140322-a1b2c3d
├── releases/
│   ├── 20260916-140322-a1b2c3d/
│   │   ├── .env (symlink to shared/.env)
│   │   ├── storage/ (symlink to shared/storage)
│   │   ├── public/uploads/ (symlink to shared/public/uploads)
│   │   ├── vendor/
│   │   ├── node_modules/
│   │   ├── public/
│   │   ├── storage/
│   │   └── ...
│   ├── 20260915-120000-bbbbbbb/
│   │   └── ... (previous release, available for rollback)
│   └── ... (up to N releases retained)
└── shared/
    ├── .env
    ├── storage/
    ├── public/uploads/
    └── ...
```

## Key Properties

1. **Never modify the active release.** Every deployment creates a new release directory.
2. **Atomic activation.** The `current` symlink is replaced atomically via `ln -sfn ...tmp && mv -Tf ...tmp ...current`.
3. **Previous release preserved.** The known-good release remains available for rollback.
4. **Shared paths are symlinks.** `.env`, `storage/`, `public/uploads/` live in `shared/` and are symlinked into each release.
5. **Prune to last 5 releases.** After successful deployment, remove oldest releases to prevent disk exhaustion.

## Release ID Format

```
<YYYYMMDD>-<HHMMSS>-<short-sha>
```

Example: `20260916-140322-a1b2c3d`

- Date/time: when deployment started
- Short SHA: first 7 chars of target commit
- Globally unique for that site

## Atomic Swap Mechanics

The critical operation is the symlink swap:

```bash
# Step 1: Create new symlink target (temporary)
ln -sfn "$NEW_RELEASE" "$SITE/current.tmp"

# Step 2: Atomically replace current symlink
mv -Tf "$SITE/current.tmp" "$SITE/current"
```

### Why `ln -sfn` Alone Is Wrong

```bash
# WRONG: If current exists as a directory symlink,
# this creates a symlink INSIDE the directory, not replacing it
ln -sfn new_release current
# Result: current -> new_release, but current/new_release -> new_release (broken)
```

### Why `mv -Tf` Works

The `-T` flag treats the target as a regular file/symlink, not a directory. This ensures the existing `current` symlink is replaced, not followed into.

## Bare Mirror

A bare Git mirror is maintained on the server to avoid cloning the full repo on every deploy:

```
/var/www/acme/.git/  (bare mirror)
```

Deploy steps:
1. `git --git-dir=/var/www/acme/.git fetch origin`
2. Checkout target commit into new release directory
3. The bare mirror persists across deploys, only receiving new objects

## State Transitions

```
RELEASE_CREATED (new dir exists, not yet active)
  → FETCHED (commit checked out)
    → READY (dependencies installed, built, migrations run)
      → ACTIVATED (symlink swap completed)
        → HEALTHY (health checks passed)
```

On failure at any stage:
```
RELEASE_CREATED → ORPHANED (cleanup in progress)
```

## Pruning Policy

After every successful deployment:
1. List releases sorted by date (oldest first)
2. Keep last 5 releases
3. Remove older ones
4. Log pruned releases in journal

Never prune if it would leave fewer than 2 releases (always keep current + previous for rollback).