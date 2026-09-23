# Multi-agent mode and Git handoff

This skill is the base block for running several sandboxes against one
repository.

## Independence rules

Example:

```text
warpmetal-agent-sandbox
    |
    +-- planner-ui
    |      +-- agent
    |      +-- GitHub
    |      +-- repository
    |
    +-- coder
    |      +-- agent
    |      +-- GitHub
    |      +-- repository
    |
    +-- qa-review
           +-- agent
           +-- GitHub
           +-- repository
```

Each sandbox must have:

```text
independent identity
independent grant
independent key
independent agent credentials
independent GitHub credentials
independent workspace
```

Do not share a filesystem.

Do not share private keys.

Do not share tokens.

Transfer work through Git.

## Git handoff

When multiple sandboxes work on the same repository, use branches.

Example:

```sh
RUN_ID=<run-id>
git fetch origin
git switch -c "trio/planner-$RUN_ID"
```

Planner publishes the artifact:

```text
docs/plans/$RUN_ID.md
```

The artifact must contain:

```text
objectives
architecture
UI plan
acceptance criteria
risks
suggested tests
```

Publish:

```sh
git add "docs/plans/$RUN_ID.md"
git commit -m "plan: add $RUN_ID"
git push -u origin "trio/planner-$RUN_ID"
```

Coder starts from the plan:

```sh
RUN_ID=<run-id>
git fetch origin
git switch -c "trio/coder-$RUN_ID" "origin/trio/planner-$RUN_ID"
```

Implement:

```sh
git add -A
git commit -m "feat: implement $RUN_ID"
git push -u origin "trio/coder-$RUN_ID"
```

Create the PR:

```sh
gh pr create \
  --base main \
  --head "trio/coder-$RUN_ID" \
  --title "Implement $RUN_ID" \
  --body "Implementation based on docs/plans/$RUN_ID.md"
```

Coder does not merge its own PR by default.

QA can review:

```sh
RUN_ID=<run-id>
git fetch origin
git switch -c "trio/qa-$RUN_ID" "origin/trio/coder-$RUN_ID"
git diff "origin/trio/planner-$RUN_ID...origin/trio/coder-$RUN_ID"
```

QA runs available tests, lint, builds, and security review.

QA does not merge or rewrite others' changes without approval.

## Reuse, do not duplicate

A specialized workflow built on top of this skill must not duplicate the
bootstrap rules. It reuses this skill to:

```text
configure agent
configure GitHub
clone repository
verify workspace
```

and adds only its own logic:

```text
planner
coder
qa/review
```

That is what allows the bootstrap to be reused for one, two, or many agents.

## Out of scope

The roles named above (`planner-ui`, `coder`, `qa-review`) are placeholders for
a workflow built on top of this skill. They are not skills published in this
registry, and this skill does not define them. Treat them as an illustration of
composition, not as installable artifacts.
