# Offsite Requirements

## What "Offsite" Actually Means

"Offsite" means the backup survives the failure mode that destroys the primary.

| Failure mode | What it takes out |
|-------------|-------------------|
| File system corruption | Same disk backups |
| Server destroyed (fire, hardware failure) | Same-server backups |
| Provider incident (outage, accidental deletion) | Same-provider backups in same region |
| Account suspended or compromised | Same-account backups anywhere |
| Region-level event | Same-region backups |

A backup in the same DigitalOcean account as the server does NOT survive an account
suspension. A backup in DigitalOcean Spaces when the server is on DigitalOcean Droplets
is better, but still vulnerable to account-level issues.

## Minimum Requirement

Backups must be in:
- A **different account** than the server (ideally a different email/login)
- Preferably a **different provider** than the server

**Acceptable combinations:**

| Server | Backup repo |
|--------|-------------|
| DigitalOcean | AWS S3, Backblaze B2, Wasabi |
| Linode / Akamai | DigitalOcean Spaces, AWS S3 |
| AWS EC2 | Backblaze B2, Wasabi, DigitalOcean Spaces |
| Any VPS | Backblaze B2 (cheapest, reliable, different provider) |

**Marginal (same provider, different region):**
Same-provider backups in a different region survive a region event but not an account
suspension. Accept as a minimum if cost is the primary constraint, but document the risk.

## Backblaze B2 Recommendation

For small agency clients, Backblaze B2 is the default recommendation:
- $6/TB/month (10× cheaper than S3)
- Different provider than most VPS hosts
- S3-compatible API (works with restic's S3 backend)
- 10 GB free forever

```bash
export B2_ACCOUNT_ID="..."
export B2_ACCOUNT_KEY="..."
export RESTIC_REPOSITORY="b2:my-bucket:acme"
```

## The Same-Server Failure Mode

The worst (and most common) bad pattern:
```bash
# WRONG: backup on the same server
restic backup /var/www/acme -r /mnt/backup/acme
```

If the server is destroyed, the backup directory is also destroyed. This is not a backup.

## Verifying Offsite Independence

Ask these questions during setup:
1. Can you access the backup if the server's SSH credentials are compromised?
2. Can you access the backup if the hosting account is suspended?
3. Can you restore from the backup on a fresh server at a different provider?

If any answer is "no," the backup does not meet offsite requirements.

## Account Separation

Create a dedicated account for backup storage:
- Separate email address (e.g., `backups@agency.com`)
- Separate billing
- IAM user with read/write only to backup buckets (not delete)
- Key stored in escrow (see `key-escrow.md`)

An IAM policy that allows only `PutObject` and `GetObject` (not `DeleteObject`) provides
an extra layer: even if the backup credentials are compromised, attackers can add data
but not delete existing snapshots.
