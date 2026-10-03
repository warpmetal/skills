# Cutover Verification Checklist

Run this after changing DNS. Every item must pass before declaring the migration complete.
A "partial pass" is not a pass.

## Before Starting

- [ ] DNS change was applied (A/AAAA records updated)
- [ ] TTL was lowered to 300s at least 24h ago
- [ ] Source server is still running (do not shut it down during verification)
- [ ] You have a local /etc/hosts override removed (testing against real DNS now)

## Core Functionality

- [ ] **Home page renders** — HTTP 200, correct content visible
- [ ] **Key landing pages render** — product pages, pricing, contact
- [ ] **Login works** — admin and user login flows
- [ ] **Navigation is intact** — no broken internal links
- [ ] **404 page returns 404** — not a generic server error

## Forms and Transactions

- [ ] **Contact form submits** — form submission goes through, confirmation shown
- [ ] **Registration form works** — if applicable
- [ ] **Checkout process** — if e-commerce, go through a test purchase
- [ ] **Form validation** — required fields, email format checks
- [ ] **CSRF protection active** — forms reject without correct token

## Files and Media

- [ ] **Images load** — no broken image icons on key pages
- [ ] **File upload works** — if the site has user uploads
- [ ] **Uploads go to correct location** — verify file appears in target's upload dir
- [ ] **Download links work** — if the site has downloadable files

## Scheduled Tasks and Queues

- [ ] **Scheduler fires on target** — check `schedule:run` is in crontab on target
- [ ] **Source cron is disabled** — `crontab -l -u www-data` on source returns no entries
- [ ] **Queue workers running on target** — `systemctl status <client>-worker@*`
- [ ] **Queue workers NOT on source** — stopped after freeze
- [ ] **No jobs stuck in queue** — oldest-job age < 5 minutes

## Email

- [ ] **Transactional email sends** — trigger a password reset email
- [ ] **Email arrives in inbox** — not spam
- [ ] **Check spam folder** — explicitly, not just "not in inbox"
- [ ] **From address correct** — not the old server's address
- [ ] **SPF/DKIM passes** — check email headers for `dkim=pass`, `spf=pass`

## External Integrations

- [ ] **Payment webhooks reach new host** — trigger a test webhook from payment provider
- [ ] **API callbacks updated** — any third-party services notified of new IP/URL
- [ ] **OAuth redirect URIs updated** — if using social login
- [ ] **RSS/sitemap still accessible** — for any subscribers or scrapers

## Security and Configuration

- [ ] **HTTPS enforced** — HTTP redirects to HTTPS
- [ ] **SSL cert valid** — `openssl s_client` confirms cert for the domain
- [ ] **No certificate warnings** — in Chrome, Safari, Firefox
- [ ] **No mixed content** — DevTools shows no HTTP resources on HTTPS page
- [ ] **`robots.txt` unchanged** — `curl https://acme.com/robots.txt`
- [ ] **Redirects preserved** — any 301s that existed still redirect to same targets
- [ ] **Admin area protected** — `/wp-admin`, `/admin`, etc. require login

## Performance

- [ ] **Response time acceptable** — comparable to source (within 2×)
- [ ] **No timeout errors** — pages load completely
- [ ] **App logs clean** — no PHP fatal errors in first 10 minutes

## Final Checks

- [ ] **Source server still live** — verified it responds (for rollback window)
- [ ] **Backup configured on target** — `backup-restore --client <name> --action status`
- [ ] **Monitoring active on target** — `server-monitoring --client <name> --action status`
- [ ] **Team notified** — note migration complete in run journal and team channel

## If Any Check Fails

Do not declare the migration complete. Options:
1. Fix the issue on the target
2. Revert DNS to source (possible if TTL is still 300s)
3. Investigate and determine if the issue existed pre-migration

Document every failed check and its resolution in the run journal.
