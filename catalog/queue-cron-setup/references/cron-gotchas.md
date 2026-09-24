# Cron Gotchas

Five problems that make cron jobs work "when run manually" but silently fail in production.

## 1. Minimal PATH

Cron runs with a stripped-down environment. The `PATH` is typically:
```
/usr/bin:/bin
```

Your user shell has `/usr/local/bin`, `~/.composer/vendor/bin`, etc. in PATH.
Cron does not.

**Fix: use absolute paths everywhere.**

```
# WRONG
* * * * * www-data php artisan schedule:run

# CORRECT
* * * * * www-data /usr/bin/php /var/www/acme/current/artisan schedule:run
```

How to find the right path:
```bash
which php        # /usr/bin/php
which node       # /usr/local/bin/node
which composer   # /usr/local/bin/composer
```

Alternatively, set PATH at the top of the crontab:
```
PATH=/usr/local/bin:/usr/bin:/bin
MAILTO=""
```

## 2. Cron Does Not Load `.env`

Shell profiles (`.bashrc`, `.profile`, `.bash_profile`) are not sourced by cron.
Environment variables set in those files are not available to cron jobs.

For Laravel: `artisan schedule:run` loads `.env` through the framework bootstrapper.
This works.

For raw scripts that rely on environment variables: they won't have them.

**Fix: source the env file in the script, or set variables in the crontab.**

```bash
#!/bin/bash
# load-env-and-run.sh
set -a
source /var/www/acme/shared/.env
set +a

exec /usr/bin/php /var/www/acme/current/artisan my:command
```

## 3. Unredirected Output Goes to Local Mail

If a cron job produces output (stdout or stderr) and there's no redirect, cron tries
to mail it to the local user. On most servers, local mail is not configured, so the
output silently disappears.

**Fix: redirect output explicitly.**

```
# WRONG: output disappears
* * * * * www-data /usr/bin/php artisan schedule:run

# WRONG: hides all output including errors
* * * * * www-data /usr/bin/php artisan schedule:run >/dev/null 2>&1

# CORRECT: log output, preserve errors
* * * * * www-data /usr/bin/php artisan schedule:run \
    >> /var/log/acme/scheduler.log 2>&1
```

Or suppress mail without hiding output:
```
MAILTO=""
```
at the top of the crontab (add logging separately).

## 4. Overlapping Long Runs

If a job takes longer than its interval, multiple instances pile up. A daily cleanup
that starts at 3am but runs for 90 minutes will overlap with the next run at 3am next day
if something goes wrong and it starts running hourly.

**Fix: use `flock` to prevent overlap.**

```bash
# -n: non-blocking (fail immediately if lock is held)
# -E 1: exit with code 1 if can't acquire lock (cron treats non-zero as failure)
*/5 * * * * www-data flock -n /tmp/acme-cleanup.lock \
    /usr/bin/php /var/www/acme/current/artisan cleanup:run >> /var/log/acme/cleanup.log 2>&1
```

For Laravel scheduled tasks, use `->withoutOverlapping()` in the schedule definition.

## 5. Cron Uses the System Timezone

Cron interprets schedule times in the **system timezone** (`/etc/timezone`),
not the app's timezone (`APP_TIMEZONE` in `.env`).

If your server is in UTC but the client's business is in EST, a cron at `0 3 * * *`
(3am UTC) runs at 10pm EST the previous day.

**Fix: check and document the system timezone.**

```bash
timedatectl status | grep "Time zone"
# or
cat /etc/timezone
```

For timezone-sensitive jobs (invoices, daily reports), use explicit UTC times and
document the relationship to business hours. Or set the system timezone to the client's
local timezone (not recommended for multi-client servers).

Laravel's scheduler respects `->timezone('America/New_York')` on individual tasks.
