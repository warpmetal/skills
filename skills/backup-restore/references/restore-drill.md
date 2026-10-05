# Restore Drill Procedure

A backup that has never been restored is a hypothesis, not a backup.
The restore drill proves the backup works before you need it at 2am.

## Schedule

Monthly is enough for most clients. The first drill should run within a week of
completing backup setup.

## Prerequisites

- A snapshot exists in the restic repo
- A scratch directory with sufficient free disk space
- A temporary database user with CREATE DATABASE privileges
- Access to production DB to compare row counts (read-only)

## Drill Steps

### 1. List Available Snapshots

```bash
restic snapshots --last 5
# Note the snapshot ID to restore (default: latest)
```

### 2. Create Scratch Directory

```bash
SCRATCH_DIR="/tmp/restore-drill-$CLIENT-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SCRATCH_DIR"
```

### 3. Restore Files to Scratch

```bash
restic restore "$SNAPSHOT_ID" --target "$SCRATCH_DIR"
# Or: restic restore latest --target "$SCRATCH_DIR"
```

### 4. Restore Database to Temporary DB

```bash
TEMP_DB="restore_drill_${CLIENT}_$(date +%Y%m%d%H%M%S)"

mysql -e "CREATE DATABASE $TEMP_DB CHARACTER SET utf8mb4;"
mysql -e "GRANT ALL ON $TEMP_DB.* TO '$DB_USER'@'localhost';"

# Find the DB dump in the scratch dir
find "$SCRATCH_DIR" -name "*.sql.gz" | head -1 \
  | xargs -I{} sh -c "zcat {} | mysql $TEMP_DB"
```

### 5. Verification Checks

#### 5a. Row Counts vs Production

```bash
# Get tables from temp DB
mysql "$TEMP_DB" -e "SHOW TABLES;" | tail -n +2 | while read TABLE; do
    RESTORED=$(mysql "$TEMP_DB" -sN -e "SELECT COUNT(*) FROM \`$TABLE\`;")
    PRODUCTION=$(mysql "$DB_NAME" -sN -e "SELECT COUNT(*) FROM \`$TABLE\`;" 2>/dev/null || echo "N/A")
    
    if [ "$PRODUCTION" != "N/A" ]; then
        # Allow 5% tolerance
        DIFF=$(( (PRODUCTION - RESTORED) * 100 / (PRODUCTION + 1) ))
        if [ "${DIFF#-}" -gt 5 ]; then
            echo "WARN: $TABLE restored=$RESTORED production=$PRODUCTION diff=${DIFF}%"
        else
            echo "PASS: $TABLE restored=$RESTORED production=$PRODUCTION"
        fi
    fi
done
```

#### 5b. App Boots Against Restored DB

```bash
# For Laravel: run the artisan command against the temp DB
cd "$SCRATCH_DIR/var/www/$CLIENT/shared"
DB_NAME="$TEMP_DB" php artisan migrate:status 2>&1 | head -5
```

#### 5c. Uploaded File Checksums

```bash
# Sample 10 random files from restored uploads
# Compare checksums against production
UPLOAD_DIR="$SCRATCH_DIR/var/www/$CLIENT/shared/public/uploads"
if [ -d "$UPLOAD_DIR" ]; then
    find "$UPLOAD_DIR" -type f | shuf | head -10 | while read RESTORED_FILE; do
        RELATIVE="${RESTORED_FILE#$SCRATCH_DIR}"
        PRODUCTION_FILE="$RELATIVE"
        
        if [ -f "$PRODUCTION_FILE" ]; then
            R_HASH=$(sha256sum "$RESTORED_FILE" | awk '{print $1}')
            P_HASH=$(sha256sum "$PRODUCTION_FILE" | awk '{print $1}')
            
            if [ "$R_HASH" = "$P_HASH" ]; then
                echo "PASS: $RELATIVE"
            else
                echo "FAIL: $RELATIVE (checksum mismatch)"
            fi
        fi
    done
fi
```

#### 5d. Newest Record Age

```bash
# Check the most recently created record in a key table
LATEST_RECORD=$(mysql "$TEMP_DB" -sN -e \
    "SELECT MAX(created_at) FROM users;" 2>/dev/null)
SNAPSHOT_TIME=$(restic snapshots "$SNAPSHOT_ID" --json | jq -r '.[0].time')

echo "Latest DB record: $LATEST_RECORD"
echo "Snapshot time: $SNAPSHOT_TIME"
# These should be within the backup frequency window (< 24h apart)
```

### 6. Tear Down

```bash
mysql -e "DROP DATABASE IF EXISTS $TEMP_DB;"
rm -rf "$SCRATCH_DIR"
```

### 7. Report

Emit JSON with pass/fail per check. Log to journal.
If any check fails, it is a `FAILED` drill — not a passing drill with warnings.

## What a Failing Drill Means

| Failure | Action |
|---------|--------|
| Row count > 5% off | Investigate: wrong backup target, truncate/delete on prod? |
| App won't boot | .env not backed up, or wrong DB connection |
| File checksum mismatch | rsync race condition, or backup excludes too much |
| Latest record too old | Backup not running nightly, or wrong snapshot selected |
