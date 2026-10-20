---
name: example-internal
disable-model-invocation: true
description: Template for an internal-only WarpMetal skill. Replace this body with the real internal workflow; the registry build only requires the frontmatter name and description.
---

# example-internal

This placeholder exists so `npm run check` has something to build. Replace it with
a real internal skill, or delete it after adding yours.

Every skill is opt-in: the registry build requires `disable-model-invocation: true`,
because [safety.md](../../conventions/safety.md) forbids letting an agent auto-invoke
a skill that mutates anything. Keep the line when you replace this body.

## Steps

1. Describe the first internal action.
2. Describe the next action.

Keep supporting material in `references/` and read it only when the task needs it.
