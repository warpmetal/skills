# Post-Incident Note Template

## Purpose

Separate the thing that stops the bleeding from the thing that prevents recurrence.

Fill after triage emits DIAGNOSED or INCONCLUSIVE. Store under the run journal directory or append to the journal.

## Template

```markdown
# Post-Incident Note — <client>

**Date (UTC):** <YYYY-MM-DDTHH:MM:SZ>
**Operator:** <user>@<host>
**Skill:** site-down-triage
**Status:** DIAGNOSED | INCONCLUSIVE
**Layer:** <n> — <layer_name>

## What Users Felt

- <down | 502 | slow | intermittent>
- Started (approx): <time>
- Detected by: <client report | monitoring | operator>

## Evidence (inline)

- Layer <n>: <probe result>
- Key log lines:
  ```
  <sanitized excerpts>
  ```

## Diagnosis

<one paragraph>

## Minimal Fix (stop the bleeding)

- [ ] <action> — **proposed, not executed by triage**
- Approvals required: <CONFIRM … from other skills / human>
- Expected time to restore: <estimate>

## Root Cause — Fix Later

- <capacity | bad deploy | missing monitoring | DNS process | …>
- Follow-up owner:
- Follow-up skill: <handoff>
- Due:

## What We Did Not Do

- Did not restart services during triage
- Did not delete files
- Did not change DNS/TLS/config

## Handoff

- Next skill: <ssl-dns-fix | deploy-site | backup-restore | queue-cron-setup | server-monitoring | none>
- Signal attached: <layer + diagnosis>
```

## How `format-report.sh` Fills It

| Placeholder | Source |
|-------------|--------|
| `<client>` | `--client` |
| Status / Layer | Diagnosis JSON |
| Evidence | `evidence[]` |
| Diagnosis | `diagnosis` |
| Minimal Fix | `proposed_fix` |
| Root Cause | `root_cause_note` |
| Handoff | `handoff` |

## Rules

- Never put secrets in the note
- Keep evidence short (sanitize first)
- Always leave Minimal Fix unchecked until a human/other skill executes it
- Always fill Root Cause even if unknown (`TBD — need more data`)