# Migrations

## Purpose

Database migrations are the non-atomic part of any deployment. This document defines the safety rules and procedures for running migrations during deploy.

## Why Migrations Are Dangerous

Migrations alter the database schema while the application is running. Unlike code changes (which are isolated in a release directory), database changes affect all connected processes simultaneously.

**Key problem**: If a migration fails or introduces a breaking change, rolling back code is not enough — the database is already altered.

## Expand/Contract Pattern

Every schema change follows this three-phase pattern:

### Phase 1: Expand (Deploy New Code)

```sql
-- Add new columns/tables
ALTER TABLE posts ADD COLUMN featured BOOLEAN DEFAULT false;
-- Backfill data
UPDATE posts SET featured = true WHERE created_at < '2026-01-01';
```

- New columns are nullable or have defaults (backward compatible)
- Old code continues to work
- New code can read and write new columns

### Phase 2: Migrate Code

- Deploy code that reads from both old and new columns
- Stop writing to the old column
- Application code handles both schemas

### Phase 3: Contract (Remove Old)

```sql
-- Only after Phase 2 is confirmed working
ALTER TABLE posts DROP COLUMN old_field;
```

- Drop old column/table
- Only after all running instances have been updated

## Migration Safety Rules

### Rule 1: Never Drop in Same Deploy as Stop Writing

```
WRONG:
  Deploy: ADD featured, DROP old_field  ← Rejected
  Reason: Some instances still writing to old_field

CORRECT:
  Deploy 1: ADD featured, backfill
  Deploy 2: Stop writing to old_field, use featured
  Deploy 3: DROP old_field
```

### Rule 2: Migration Failure = No Auto-Rollback

If migrations fail during deploy:
1. **Do NOT auto-rollback**
2. Report exactly which migrations ran
3. Report the error
4. Stay in `FAILED` state
5. Previous release remains available for **manual** rollback
6. Manual resolution required: either fix migration in old release or keep new schema

### Rule 3: `--force` Required

Migrations must use `--force` flag:
```bash
php artisan migrate --force
```

This prevents accidental migration runs in non-production environments.

### Rule 4: Pre-Flight Migration Check

Before deploy, check for pending migrations:
```bash
php artisan migrate:status
```

If migrations exist, warn the operator before proceeding.

## Migration Execution During Deploy

```bash
# Run migrations in new release directory
cd "$RELEASE_DIR"
php artisan migrate --force

# Check exit code
if [[ $? -ne 0 ]]; then
    echo "MIGRATION_FAILED"
    log_entry "EXECUTING" "Migration failed" "php artisan migrate --force" 1 0 "" "DEPLOYING" "FAILED"
    
    # Check if any migrations already applied
    applied=$(php artisan migrate:status --pretend 2>&1)
    
    echo "MIGRATIONS_APPLIED: ${applied}"
    exit 7  # Migration failure exit code
fi
```

## Migration List in Journal

After successful migration, log applied migrations:

```markdown
**Migrations Applied:**
- 2026_09_15_100000_add_featured_to_posts
- 2026_09_15_110000_create_notifications_table
```

This list is used if rollback is attempted later.

## Rollback After Migration

If a deployment includes migrations and needs rollback:

```
1. Skill refuses automatic rollback
2. Reports: "Migrations were executed: [list]. Manual resolution required."
3. Previous release remains available at releases/<previous_id>
4. Operator must:
   a. Either fix the migration issue and redeploy
   b. Or manually rollback database schema
   c. Or keep new code + fix migration forward
```

## Rollback Migration Safety

When rolling back to a previous release that also ran migrations:

1. Rollback does NOT undo database migrations
2. Previous release code may expect old schema
3. Operator must manually align database schema with rolled-back code

## Testing Migrations

### Dry Run

Before executing migrations on production:
```bash
php artisan migrate:pretend --force
```

This shows the SQL without executing it.

### Staging Environment

Always test migrations in staging before production:
1. Same database engine and version
2. Same data volume characteristics
3. Same PHP/runtime version

## Common Migration Issues

| Issue | Cause | Resolution |
|-------|-------|------------|
| Column already exists | Migrate called twice | Check migration status before running |
| Foreign key constraint | Referential integrity violation | Check data integrity before adding constraints |
| Timeout | Large table lock | Use `--step` for large tables |
| Collation mismatch | MySQL version difference | Standardize charset/collation |
| Deadlock | Concurrent migration | Retry with exponential backoff |
| Schema cache stale | `config:cache` not updated | Run `config:cache` after migration |