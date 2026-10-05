# Retention Policy

## Default Policy

```
7 daily snapshots     (one per day for the last 7 days)
4 weekly snapshots    (one per week for the last 4 weeks)
6 monthly snapshots   (one per month for the last 6 months)
```

This retains approximately 6 months of recovery points while keeping storage costs
reasonable through deduplication.

## Applying Retention with restic

```bash
# Forget old snapshots (mark for deletion)
restic forget \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --group-by host,tags \
  --dry-run  # always dry-run first

# Then prune (actually delete unreferenced data)
restic prune
```

Combined in one command:
```bash
restic forget \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --group-by host,tags \
  --prune
```

## Why Not Forget and Prune Separately?

`forget` only marks snapshots for deletion. `prune` is what reclaims the storage.
Running `forget --prune` does both atomically. If you forget but never prune, the
storage keeps growing indefinitely.

## Adjusting for Client Risk Profile

| Client type | Suggested retention |
|-------------|---------------------|
| Low-traffic blog | 7d / 2w / 3m |
| E-commerce site | 7d / 4w / 12m |
| SaaS / high data change | 14d / 8w / 12m |
| Compliance requirement | Per compliance spec |

Document the chosen policy in the client journal and manifest.

## Verifying Retention

```bash
# List snapshots that would be kept vs forgotten
restic forget \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --group-by host,tags \
  --dry-run \
  --verbose

# Check repo size before and after prune
restic stats --mode raw-data
```

## Integrating into Cron

Retention runs as part of every backup:
```bash
# In run-backup.sh, after successful backup:
restic forget \
  --keep-daily 7 \
  --keep-weekly 4 \
  --keep-monthly 6 \
  --prune \
  --quiet
```

## Storage Cost Estimation

Restic's dedup means successive daily backups of a live site typically add only
the changed data (new uploads, new DB rows). A site with 5GB of uploads and a
200MB DB might use:
- Initial snapshot: ~5.2 GB
- Each daily incremental: ~50–200 MB (depending on upload activity)
- 6-month retention: typically 8–15 GB total

Check actual size with:
```bash
restic stats --mode raw-data
```
