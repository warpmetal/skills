# Key Escrow

## The Risk

The restic repository key is used to encrypt all backup data. If the key exists
only on the server being backed up:

- Server gets destroyed → key is gone → backups are unreadable encrypted data
- Server gets compromised → attacker can also decrypt backups
- You change the restic password and lose the old one → all old snapshots inaccessible

**A backup encrypted with a key you no longer have is not a backup.
It is an encrypted archive of unknown contents.**

## What Escrow Means

The restic password (and optionally the repo URL + credentials) must exist somewhere
**other than the server being backed up**.

Acceptable escrow locations:
- Team password manager (1Password, Bitwarden, LastPass)
- A separate, dedicated secrets vault
- A physically separate encrypted document
- Another team member's secure storage

Not acceptable:
- Another file on the same server
- An unencrypted email
- A Slack message
- A comment in the repository

## What to Escrow

For each client:

```
Client: acme
Restic repo: s3:s3.amazonaws.com/mybucket/acme
Restic password: [the password]
S3 Access Key ID: [key]
S3 Secret Access Key: [secret]
Date escrowed: 2026-09-01
Escrowed by: [your name]
Escrow location: 1Password vault "Agency - Client Backups"
```

## The Escrow Gate

This skill refuses to emit `CONFIGURED` until the operator confirms the escrow location
with a non-empty string. The confirmation is recorded in the run journal (not the secret
itself, just the location).

```
Skill: "The restic password and repo credentials must be stored off-host before
        setup is considered complete. Where are they stored?
        (e.g., '1Password vault: Agency Clients / acme-backup')

        Type the location to confirm:"

Operator: "1Password vault: Agency Clients / acme-backup"

Skill: records "Key escrowed at: 1Password vault: Agency Clients / acme-backup"
       in the journal and proceeds.
```

## Verifying Escrow Works

The real test: can you restore using ONLY the escrowed credentials on a fresh machine?

Once a year (or after team changes), test:
1. Provision a fresh machine with no prior knowledge of the client
2. Using only the escrowed credentials, initialize the restic connection
3. List snapshots
4. Restore one file

If this fails, escrow is broken.

## Key Rotation

If the restic password must be changed:
1. Use `restic key add` to add the new password
2. Update escrow with the new password
3. Use `restic key remove` to remove the old password
4. Do NOT change the password and immediately remove the old key — verify new
   key works first (`restic snapshots` with new password)
