# Anti-Goals: What Not to Alert On

## The Core Problem

Every alert that fires without requiring action makes the next real one less likely
to be read. Alert fatigue is the primary reason monitoring fails in practice.

The owner stops reading alerts → a real alert fires → nobody acts → incident.

## Do Not Alert On These

### CPU Percentage

**Why not:** A server at 95% CPU during a batch job is fine. A server at 30% CPU
that's returning 504s is an incident. CPU percentage does not correlate with user impact.

**Alert on instead:** Response time > threshold, HTTP 5xx rate, site down.

### Memory Percentage

**Why not:** Linux uses all available memory for disk cache. A server at 90% memory
usage is completely normal and healthy. Memory percentage on Linux is meaningless
as an alert signal.

**Alert on instead:** OOM kill events (the kernel killed a process to reclaim memory —
that is always bad), sustained swap-in activity.

### Load Average (In Isolation)

**Why not:** Load average is the number of processes waiting for CPU or disk, averaged
over 1/5/15 minutes. Without context (number of CPUs, type of load), it tells you nothing.
A load of 4.0 on a 32-core server is idle. A load of 4.0 on a single-core VPS is a problem.

**Alert on instead:** The user-facing symptom: site is slow or down.

### Disk Write/Read Rate

**Why not:** A spike in disk writes during a log rotation, DB vacuum, or backup is
expected. Sustained high write rate on a healthy server is not an alert.

**Alert on instead:** Disk **space** (you'll run out), disk **inodes** (different kind
of full), disk write **latency** (if writes are taking seconds, something is wrong).

### Network Traffic Spikes

**Why not:** A traffic spike usually means the site is popular, not broken.

**Alert on instead:** HTTP 5xx rate (the traffic is failing), response time degradation.

### Process Count

**Why not:** Number of processes varies constantly. php-fpm spawns and kills workers
continuously under normal operation.

**Alert on instead:** Service liveness (is nginx/php-fpm/mysql running?), not process count.

## What to Alert On (The Right Signals)

Alert on things a user can feel:

| User experience | Alert signal |
|----------------|-------------|
| Site is down | HTTP check failing (external) |
| Site is slow | Response time > threshold (external) |
| Something keeps crashing | OOM kill, service restart events |
| Running out of resources | Disk > 90%, inode > 90%, projected full in 48h |
| Security issue | Failed SSH attempts (digest only) |
| Queue is backing up | Oldest-job age > threshold |
| Backup is silently failing | Dead-man's switch missed |
| Cert about to expire | Days until expiry < threshold |
| Domain about to expire | Whois expiry < threshold |

## The Practical Test

Before adding any alert, ask:
> "If this alert fires at 2am, what action do I take?"

If the answer is "nothing, I'll check it in the morning," it's a digest alert.
If the answer is "I don't know what to do," the alert shouldn't exist yet.
If the answer is "call the client and start `site-down-triage`," it's a page.
