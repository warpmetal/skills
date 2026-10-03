# Cron Deduplication During Migration

## The Risk

If cron jobs run on both the source and the target server simultaneously:

| Job type | Consequence |
|----------|-------------|
| Send daily newsletter | 2× emails sent to every subscriber |
| Process invoices | 2× invoices generated and charged |
| Send order confirmations | Customers receive 2× confirmations |
| Expire user sessions | Both servers expire sessions on their own DB |
| Sync to external API | 2× API calls, potential rate limit hit |
| Queue scheduler | Jobs dispatched twice |
| DB cleanup | Both servers delete old records (likely same records, harmless but wasteful) |
| Webhook delivery | 2× webhooks to payment processor, 2× fulfillment |

The double-email and double-charge cases are customer-facing disasters that are
embarrassing and sometimes legally/financially significant.

## When to Disable Source Cron

**At the freeze phase. Not before. Not during cutover.**

| Phase | Source cron status |
|-------|--------------------|
| Inventory | Running |
| Prepare target | Running |
| First sync | Running |
| **Freeze** | **DISABLED** |
| Cutover | Disabled |
| Verify | Disabled |
| Decommission | Disabled (server gone) |

Why not earlier? Because the site is still live on the source during phases 1–3.
Disabling cron early means scheduled tasks stop running for the duration of the migration.

Why not at cutover? Because the cutover is just a DNS change. Traffic may still hit
the source for up to the old TTL (minutes if TTL was lowered, hours if not).
If source cron runs during this window and target cron also runs, you have duplicates.

## How to Disable Source Cron at Freeze

```bash
# Save crontab before disabling (for reference)
ssh "$SOURCE_HOST" "crontab -l -u www-data > /tmp/crontab-www-data-backup.txt"
ssh "$SOURCE_HOST" "crontab -l -u root > /tmp/crontab-root-backup.txt"

# Disable by removing all entries
ssh "$SOURCE_HOST" "crontab -r -u www-data"

# If other users have relevant cron entries:
ssh "$SOURCE_HOST" "crontab -r -u deploy 2>/dev/null || true"

# Disable /etc/cron.d entries
ssh "$SOURCE_HOST" "mv /etc/cron.d/$CLIENT /etc/cron.d/$CLIENT.disabled"

# Stop queue workers on source
ssh "$SOURCE_HOST" "systemctl stop '$CLIENT-worker@*'"
ssh "$SOURCE_HOST" "systemctl disable '$CLIENT-worker@*'"
```

Verify:
```bash
ssh "$SOURCE_HOST" "crontab -l -u www-data 2>&1"
# Expected: "no crontab for www-data"

ssh "$SOURCE_HOST" "systemctl status '$CLIENT-worker@*'"
# Expected: inactive (dead)
```

## Re-enabling If Migration Is Aborted

If the migration is aborted before cutover and the source must resume normal operation:

```bash
# Restore crontab from backup
ssh "$SOURCE_HOST" "crontab /tmp/crontab-www-data-backup.txt -u www-data"

# Re-enable /etc/cron.d entry
ssh "$SOURCE_HOST" "mv /etc/cron.d/$CLIENT.disabled /etc/cron.d/$CLIENT"

# Restart workers
ssh "$SOURCE_HOST" "systemctl enable --now '$CLIENT-worker@'{1,2}"
```

Document any jobs that may have been missed during the freeze window and whether
they need to be manually triggered.

## After Decommission

The source cron is already disabled. Before decommissioning:
1. Confirm target cron is running correctly (verify phase)
2. Confirm no jobs were missed during the window (check logs)
3. Document the window in the client journal
