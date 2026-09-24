# Client Manifest — Deploy Context

The canonical schema, field definitions, validation rules, and examples live in
[`../conventions/client-manifest.md`](../conventions/client-manifest.md).
That document is the single source of truth. **Do not duplicate the schema here** —
duplicated copies drift and have previously diverged from the parser.

This page only records *which fields the deploy-site scripts read* and what they
mean during a deploy.

## Fields read by deploy-site

| Field | Read by | Meaning during deploy |
|-------|---------|------------------------|
| `host` | all scripts | SSH alias resolved to a hostname; the deploy target |
| `site_root` | all except `health-check.sh` | Absolute path on the remote host holding `releases/`, `shared/`, `current` |
| `domain` | `inspect.sh`, `deploy.sh` | Used for TLS/vhost verification, not for DNS changes |
| `stack` | most scripts | Selects build and runtime steps; also gates `php`/`db` requirements |
| `health_url` | `deploy.sh`, `health-check.sh`, `verify.sh` | HTTPS URL polled after the atomic swap |
| `repo_url` | `deploy.sh` | Git remote fetched on the server |
| `branch` | `deploy.sh` | Default ref when `--ref` is not passed |
| `php` | `deploy.sh` | Required for `laravel` and `wordpress` stacks |
| `db` | `deploy.sh` | `db.engine`, `db.name`, `db.user` — never a password |
| `deploy_user` | `deploy.sh` | Remote user owning release files |
| `worker_unit` | `deploy.sh`, `rollback.sh` | systemd **template** unit for queue workers; the worker instances are `<worker_unit>1`, `<worker_unit>2`, … |
| `app_unit` | `inspect.sh`, `verify.sh`, `deploy.sh`, `rollback.sh` | systemd unit for a Node application, restarted after the swap |

## Unit names are never hardcoded

`worker_unit` and `app_unit` are optional top-level keys. When omitted,
`conventions/lib/manifest.sh::manifest_load` fills in defaults derived from the
client name:

```
worker_unit  ->  <client>-worker@
app_unit     ->  <client>-app
```

`deploy.sh` only restarts a worker when `WORKER_UNIT` is non-empty, and emits a
`warning` in its JSON output if a `laravel` stack is deployed with no worker unit —
it never guesses a unit name.

## Release retention

`keep_releases` is **not** manifest-driven. `deploy.sh` prunes to the last
`KEEP_RELEASES` releases (currently a constant, default `5`). If per-client
retention is needed, add the key to the schema in `conventions/client-manifest.md`
first and read it via `manifest_get` — do not hardcode a second value.

## Rules that still apply

- Never put passwords, tokens, or private keys in the manifest.
- `host` must be an SSH alias from `~/.ssh/config`, never a raw IP.
- `site_root` must be absolute and site-specific.
- `health_url` must use `https://`.

Parsing is performed exclusively by `conventions/lib/manifest.sh`
(`manifest_require`, `manifest_get`, `manifest_load`). Do not hand-parse TOML in a
skill script.
