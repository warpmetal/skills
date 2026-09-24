# Restic Setup

## Why Restic

- Single binary, no server component needed
- Client-side encryption (AES-256)
- Content-addressed deduplication (send only changed blocks)
- Built-in retention with `forget --prune`
- Supports S3, B2, Spaces, SFTP, local, and more

Preferred over hand-rolled `mysqldump | gzip | rclone` because retention and dedup
are where hand-rolled scripts rot quietly for months.

## Installation

```bash
# Debian/Ubuntu
apt-get install -y restic

# Or latest binary
curl -L https://github.com/restic/restic/releases/latest/download/restic_linux_amd64.bz2 \
  | bunzip2 > /usr/local/bin/restic
chmod +x /usr/local/bin/restic

restic version
```

## Repository Initialization

### S3 (AWS, MinIO, Wasabi)

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export RESTIC_REPOSITORY="s3:s3.amazonaws.com/mybucket/acme"
export RESTIC_PASSWORD="$(cat /etc/restic/acme.password)"

restic init
```

### Backblaze B2

```bash
export B2_ACCOUNT_ID="..."
export B2_ACCOUNT_KEY="..."
export RESTIC_REPOSITORY="b2:my-bucket:acme"
export RESTIC_PASSWORD="$(cat /etc/restic/acme.password)"

restic init
```

### DigitalOcean Spaces

Spaces is S3-compatible:
```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export RESTIC_REPOSITORY="s3:nyc3.digitaloceanspaces.com/mybucket/acme"
```

## Password File

Never pass the password directly in the command line (it appears in `ps aux`).
Use a password file:

```bash
# Create password file (600 permissions)
echo "$RESTIC_PASSWORD" > /etc/restic/acme.password
chmod 600 /etc/restic/acme.password
chown root:root /etc/restic/acme.password
```

Restic flags: `--password-file /etc/restic/acme.password`

## Environment File

```bash
# /etc/restic/acme.env
RESTIC_REPOSITORY="s3:s3.amazonaws.com/mybucket/acme"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
```

Source before running:
```bash
set -a; source /etc/restic/acme.env; set +a
```

## Verifying the Repository

```bash
restic --password-file /etc/restic/acme.password \
  -r "$RESTIC_REPOSITORY" snapshots

restic --password-file /etc/restic/acme.password \
  -r "$RESTIC_REPOSITORY" check
```

## Credentials Security

- Credentials live in `/etc/restic/` with `600` permissions
- Never committed to Git
- Never echoed in logs (sanitize per `../conventions/logging.md`)
- Key password stored off-host (see `key-escrow.md`)
