# HSTS and Preload Risks

## What HSTS Does

HTTP Strict Transport Security tells browsers: "Never connect to this domain over HTTP.
Always use HTTPS, even before making the first request."

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

## Why This Is Dangerous

Once a browser has seen the HSTS header, it enforces HTTPS for `max-age` seconds.
There is no way to un-tell a browser. If:
- You let the cert expire, or
- You need to move back to HTTP, or
- A subdomain breaks under `includeSubDomains`

...affected users cannot reach the site until either their browser cache expires or
they manually clear HSTS state. Enterprise users may not be able to clear it.

## The Preload List Is Permanent

```nginx
# DO NOT add preload without understanding the consequences
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

`preload` submits the domain to a browser-shipped list (hstspreload.org). This list
is compiled into Chrome, Firefox, Safari, and Edge. It applies **before the first
connection** — so a bad cert or dropped HTTPS cannot be worked around by direct HTTP.

**Removal from the preload list takes months and is not guaranteed.**
Browsers ship the list in updates; until every user updates, the domain stays preloaded.

## When to Enable HSTS

Only enable HSTS when:
1. ✅ HTTPS is fully working and has been for several weeks
2. ✅ Auto-renewal is confirmed working (renewal drill passed)
3. ✅ ALL subdomains also serve HTTPS (if using `includeSubDomains`)
4. ✅ You have a monitoring alert on cert expiry at ≥14 days
5. ✅ The client understands HSTS cannot be reversed quickly

## Recommended Starting Config

Start with a short max-age to test:
```nginx
# Step 1: test with 1 hour
add_header Strict-Transport-Security "max-age=3600" always;

# Step 2: after 1 week, increase to 1 day
add_header Strict-Transport-Security "max-age=86400" always;

# Step 3: after 1 month of confirmed working, go to 1 year
add_header Strict-Transport-Security "max-age=31536000" always;

# Step 4: only then add includeSubDomains (if all subdomains are HTTPS)
# Step 5: only add preload if you truly never plan to disable HTTPS
```

## What This Skill Does

Before enabling HSTS with max-age > 86400 or `preload`, this skill:

1. Warns explicitly with the above risks
2. Confirms cert auto-renewal is working
3. Confirms monitoring is alerting at ≥14 days before expiry
4. Requires typed acknowledgment: `CONFIRM HSTS <client>`
5. Starts with a short max-age (3600) and documents the upgrade path

It refuses to enable `preload` without an additional `CONFIRM HSTS PRELOAD <client>`
and a second explicit warning that this is difficult to reverse.
