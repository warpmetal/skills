# Health Checks

## Purpose

Verify that a deployment succeeded by polling the client's `health_url`. The health gate is the final step before marking a deployment `READY`.

## Configuration

The `health_url` comes from the client manifest (`~/.config/agency/clients/<client>.toml`).

Default health check parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `attempts` | 5 | Number of health check attempts |
| `interval` | 3 | Seconds between attempts |
| `timeout` | 10 | HTTP timeout per attempt (seconds) |
| `expected_status` | 200 | HTTP status code expected |
| `min_response_time` | 0 | Maximum acceptable response time in ms |

## Implementation

```bash
health_check() {
    local client="$1"
    local health_url="$2"
    local attempts="${3:-5}"
    local interval="${4:-3}"
    local passed=0
    local failed=0

    for i in $(seq 1 "$attempts"); do
        local start_time=$(date +%s%N)
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$health_url" 2>/dev/null || echo "000")
        local end_time=$(date +%s%N)
        local duration_ms=$(( (end_time - start_time) / 1000000 ))

        if [[ "$http_code" == "200" ]]; then
            echo "[$i/$attempts] Health check OK (${duration_ms}ms)"
            passed=$((passed + 1))
        else
            echo "[$i/$attempts] Health check FAILED (HTTP ${http_code}, ${duration_ms}ms)"
            failed=$((failed + 1))
        fi

        if [[ $i -lt $attempts ]]; then
            sleep "$interval"
        fi
    done

    if [[ $failed -gt 0 ]]; then
        echo "HEALTH_CHECK_FAILED: ${passed}/${attempts} passed"
        return 9  # Special exit code for health failure
    fi

    echo "HEALTH_CHECK_PASSED: ${passed}/${attempts} passed"
    return 0
}
```

## Health Check Patterns by Stack

### Laravel

```
health_url = "https://acme.com/health"
```

Laravel's `/health` route should:
1. Check database connectivity (`DB::connection()->getPdo()`)
2. Check queue connectivity (Redis/beanstalkd connection)
3. Check cache connectivity
4. Return 200 if all checks pass, 503 if any fail

### WordPress

```
health_url = "https://acme.com/wp-json/wp/v2/pages?per_page=1"
```

WordPress health check should verify:
1. REST API responds
2. Database queries work
3. PHP execution succeeds

### Node.js

```
health_url = "https://acme.com/health"
```

Node health check should verify:
1. Application process responds
2. Database connection works
3. External service connections are alive

### Static

```
health_url = "https://acme.com/"
```

Static site health check verifies:
1. Web server responds with 200
2. Content is served correctly (check a known HTML title or hash)
3. TLS certificate is valid

## Health Check Behavior

### During Deployment

- Health checks **only run after atomic swap** completes.
- The old release continues serving during the swap.
- If health checks fail, the skill attempts automatic rollback.

### Auto-Rollback

```
Health check fails → Rollback to previous release → Reload runtime → Report ROLLED_BACK
```

**Exception**: If migrations ran in this deployment, auto-rollback is refused.

### No-Rollback After Migration

If migrations were executed in the deployment, the skill:
1. Does NOT auto-rollback
2. Reports: "Migrations were executed. Rollback requires manual resolution."
3. Lists which migrations ran
4. Stays in `FAILED` state
5. Previous release remains available for manual rollback

## Health Check Output Format

```json
{
  "health_checks": {
    "url": "https://acme.com/health",
    "attempts": 5,
    "passed": 5,
    "failed": 0,
    "response_times_ms": [120, 115, 118, 122, 119],
    "status": "healthy"
  }
}
```

## Common Health Check Failures

| Failure | Diagnosis | Resolution |
|---------|-----------|------------|
| HTTP 502/503 | App runtime not responding | Check php-fpm/node process status |
| HTTP 500 | Application error | Check logs in `storage/logs/` |
| Connection refused | Port not bound | Verify nginx/Node process |
| TLS error | Certificate issue | Check cert expiry, chain |
| Timeout | Server overloaded or slow query | Check database connections, server load |
| Wrong response | Cached old content | Clear opcache, verify release activation |

## Integration with Monitoring

The `health_url` is also used by `server-monitoring` for external health checks. The same URL serves both deployment verification and uptime monitoring.