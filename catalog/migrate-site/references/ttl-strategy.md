# TTL Strategy

## The Problem

When you change a DNS A record, the old answer stays cached in resolvers and browsers
for the duration of the **previous TTL**. During that window, some users hit the old
server and some hit the new one.

If both servers are reading and writing to separate databases, you have a split-brain
situation: orders, signups, and updates are being written to two different databases.
When you finally consolidate, you have to decide which database "wins" — and someone
loses their data.

## The Solution: Lower TTL Early

Drop the A record TTL to 300s (5 minutes) **at least 24–48 hours before cutover**,
bounded by the current TTL.

**Example:**
- Current TTL: 86400 (24 hours)
- Lower to 300s on Monday morning
- By Tuesday morning, all resolver caches have expired the old answer
- Cutover Tuesday afternoon: maximum propagation delay is 5 minutes

**If you skip this step:**
- Current TTL: 86400
- Cutover attempted: traffic splits for up to 24 hours
- Split-brain database writes for up to 24 hours
- Incident

## How to Calculate When You Can Cut Over

```
earliest_cutover = time_TTL_was_lowered + old_TTL_in_seconds + buffer
```

Example:
- Old TTL: 3600 (1 hour)
- TTL lowered at: Monday 09:00 UTC
- Earliest safe cutover: Monday 10:00 UTC + buffer (ideally more like 2h)

If the old TTL was 86400:
- TTL lowered at: Monday 09:00 UTC
- Earliest safe cutover: Tuesday 09:00 UTC

## What If the Client Won't Allow Maintenance?

Even without maintenance mode, you can reduce the split-brain window by:
1. Lowering TTL well in advance (the key step)
2. Making the first sync as recent as possible (rsync delta right before DNS change)
3. Keeping the maintenance window short (freeze + DNS change only, not full sync)

The final sync (during freeze) must be fast. If the first bulk sync happened days ago
and uploads are large, the delta sync might take 30+ minutes. Plan accordingly.

## Checking TTL Before Cutover

```bash
# What does the current TTL resolve to?
dig A "$DOMAIN" | grep "IN.*A" | awk '{print $2, $5}'
# Format: TTL  IP
# Example: 300  1.2.3.4  ← 300s = good, ready for fast cutover

# What do authoritative NSs say?
NS=$(dig +short NS "$DOMAIN" | head -1)
dig A "$DOMAIN" "@$NS" | grep "IN.*A" | awk '{print $2, $5}'
```

## After Cutover: When to Lower Again

Once the site is stable on the new server, you can increase the TTL back to a normal
value (3600 or 86400):

```bash
# Wait at least 24h after cutover before increasing TTL
# This ensures you can quickly revert if a problem is discovered
```

During the low-TTL window (300s), DNS changes propagate in ~5 minutes, which makes
a quick revert to the old server feasible if needed.
