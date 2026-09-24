# Uptime Kuma Setup

## What Is Uptime Kuma

Self-hosted uptime monitoring. Runs as a Node.js process behind nginx.
Provides external HTTP checks, status pages, and notifications to Slack/Telegram/email/PagerDuty.

**Critical requirement:** Run Uptime Kuma on a **separate server** from the sites being monitored.
A monitor running on the same box as the site reports nothing when that box dies.

## Installation (Separate Monitor VPS)

### Via Docker (recommended)

```bash
docker run -d \
  --restart=always \
  -p 3001:3001 \
  -v uptime-kuma:/app/data \
  --name uptime-kuma \
  louislam/uptime-kuma:1
```

### Via Node (if no Docker)

```bash
npm install -g pm2
git clone https://github.com/louislam/uptime-kuma.git
cd uptime-kuma
npm run setup
pm2 start server/server.js --name uptime-kuma
pm2 startup && pm2 save
```

Expose via nginx reverse proxy on the monitoring host.

## Uptime Kuma API

Uptime Kuma exposes a Socket.IO API and a REST API (v1.23+). Use the REST API
for programmatic setup from `setup-monitoring.sh`.

### Authentication

```bash
# Get API key from UI: Settings → API Keys → Create
UPTIME_KUMA_URL="http://mon-vps:3001"
API_KEY="uk2_..."
```

### Add an HTTP Monitor

```bash
curl -s -X POST "$UPTIME_KUMA_URL/api/monitors" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "http",
    "name": "acme-http",
    "url": "https://acme.com/health",
    "interval": 60,
    "retryInterval": 60,
    "maxretries": 2,
    "notificationIDList": [1],
    "accepted_statuscodes": [["200-299"]]
  }'
```

### Monitor Types

| Type | Use For |
|------|---------|
| `http` | External HTTP/HTTPS check |
| `ping` | ICMP ping |
| `port` | TCP port check |
| `dns` | DNS resolution |
| `certificate` | TLS cert expiry |
| `keyword` | HTTP response body contains keyword |

### Cert Expiry Monitor

```bash
curl -s -X POST "$UPTIME_KUMA_URL/api/monitors" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "certificate",
    "name": "acme-cert-expiry",
    "hostname": "acme.com",
    "port": 443,
    "interval": 3600,
    "expiryNotification": true,
    "notificationIDList": [1]
  }'
```

## Notification Channels

Configure in UI under Settings → Notifications:
- **Slack**: incoming webhook URL
- **Telegram**: bot token + chat ID
- **PagerDuty**: integration key
- **Email**: SMTP config

Assign notification channels to monitors. Use two channel IDs: one for page (immediate),
one for digest (daily summary via a scheduled notification rule).

## Status Pages

Create a client-facing status page for each client:
- Public URL: `https://status.agency.com/acme`
- Shows: uptime percentage, incident history, current status
- Clients can self-serve instead of emailing "is the site down?"
