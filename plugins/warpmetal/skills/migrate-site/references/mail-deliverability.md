# Mail Deliverability After Migration

## The Problem

A new server IP has no sending reputation. ISPs and spam filters use IP reputation
built over months or years to decide whether to deliver or reject email.

After a migration, outbound email from the new server may:
- Land in spam for some recipients
- Be silently rejected (no bounce, no delivery)
- Pass fine for Gmail but fail for corporate Microsoft 365 servers

**This is the single most common post-migration complaint.** It typically surfaces
2–5 days after cutover because transactional email (invoices, receipts, notifications)
has delayed or batched delivery patterns that make the problem show up later.

## Pre-Migration Checklist

### 1. Update SPF Record

SPF specifies which IPs are allowed to send email for the domain:

```dns
# Current (includes old IP)
acme.com. 300 IN TXT "v=spf1 ip4:1.2.3.4 include:mailgun.org ~all"

# After migration (replace old IP with new IP)
acme.com. 300 IN TXT "v=spf1 ip4:5.6.7.8 include:mailgun.org ~all"
```

Update SPF **before** sending from the new server. An SPF fail is a direct deliverability hit.

### 2. Move or Regenerate DKIM Keys

DKIM keys are tied to the mail sending infrastructure. If mail is sent via a transactional
service (Mailgun, Postmark, SendGrid), no key migration is needed — update the config to
use the same service on the new server.

If using Postfix directly:
```bash
# Regenerate DKIM keys on new server
opendkim-genkey -t -s mail -d acme.com
# Add new public key to DNS: mail._domainkey.acme.com TXT "v=DKIM1; k=rsa; p=..."
# Keep old key valid for at least 72h during migration (old server still sending)
```

### 3. Use a Transactional Mail Relay (Recommended)

Instead of sending from the server's IP, route through a relay:
- Mailgun, Postmark, SendGrid, Amazon SES

**Benefits:**
- Relay has established IP reputation
- No need to warm up a new IP
- SPF/DKIM handled by the relay
- No new server configuration needed

```toml
# .env on new server
MAIL_HOST=smtp.mailgun.org
MAIL_PORT=587
MAIL_USERNAME=postmaster@mg.acme.com
MAIL_PASSWORD=relay-api-key
```

If the client was already using a relay: verify the SMTP credentials work on the
new server before cutover.

## Warming Up a New IP (If Not Using a Relay)

If sending directly from the server IP without a relay, the new IP needs to build
reputation gradually:

Week 1: send ≤ 500 emails/day
Week 2: send ≤ 2,000 emails/day
Week 3: send ≤ 10,000 emails/day
Week 4+: normal volume

During the warmup period, monitor bounce rates and spam complaints in mail logs.

## Post-Migration Verification

```bash
# Send a test email and check delivery + headers
echo "Test from new server $(date)" | mail -s "Migration test" test@gmail.com

# Check mail logs for delivery/rejection
tail -50 /var/log/mail.log | grep -iE 'sent|bounced|reject|defer'

# Test SPF/DKIM/DMARC alignment
# Send to: check-auth2@verifier.port25.com
# Reply will include authentication results
```

**Always check spam folder** of the test recipient. A message that "sent without error"
in the logs may be in spam on the other end.

## Common Failure Modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Message rejected" | SPF fail (old IP in SPF) | Update SPF record |
| Mail in spam | Low IP reputation | Use relay or warm up IP |
| DKIM fail | Old keys in DNS | Update DKIM records |
| Mail delivered, then bounced | Reputation issue with specific ISP | Monitor; use relay |
| No mail sent at all | SMTP config wrong on new server | Check .env, test SMTP |
