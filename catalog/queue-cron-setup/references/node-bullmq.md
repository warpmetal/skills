# Node / BullMQ Workers Under Systemd

## Setup

BullMQ workers are Node.js processes. The same systemd principles apply as for Laravel.

### Worker Script

```javascript
// /var/www/<client>/current/workers/queue.js
const { Worker } = require('bullmq');
const { createClient } = require('redis');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const worker = new Worker(
  'default',
  async (job) => {
    // job processing logic
    console.log(`Processing job ${job.id}: ${job.name}`);
    // ...
  },
  {
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2'),
  }
);

// SIGTERM handler — drain in-flight jobs before exiting
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker gracefully...');
  await worker.close();
  process.exit(0);
});

// Log events
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});
```

### Systemd Unit

```ini
# /etc/systemd/system/<client>-worker@.service

[Unit]
Description=<client> BullMQ worker instance %i
After=network.target redis.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/<client>/current

ExecStart=/usr/local/bin/node workers/queue.js

# Environment
EnvironmentFile=/var/www/<client>/shared/.env
Environment=WORKER_CONCURRENCY=2

Restart=always
RestartSec=5
TimeoutStopSec=60

StandardOutput=append:/var/log/<client>/worker-%i.log
StandardError=append:/var/log/<client>/worker-%i.log

[Install]
WantedBy=multi-user.target
```

**`TimeoutStopSec=60`**: Node's SIGTERM handler drains in-flight jobs. Adjust to match
your longest expected job duration.

## Concurrency

BullMQ handles concurrency internally per worker process. You can either:

- Run 1 process with high concurrency (`concurrency: 10`)
- Run N processes with lower concurrency (`concurrency: 2`, N instances)

For most small agency clients: 1-2 processes with `concurrency: 2-5`.

## Stale-Code Equivalent for Node

Unlike Laravel's `queue:restart`, Node doesn't have a built-in "finish current job and
restart" signal for BullMQ. The options:

1. **Rely on systemd restart** — deploy new code, systemctl restart workers. The SIGTERM
   handler drains in-flight jobs within `TimeoutStopSec`.

2. **Use a process manager signal** — with PM2 (alternative to systemd):
   ```bash
   pm2 reload <client>-worker
   ```
   PM2 has built-in zero-downtime reload for Node apps.

For agencies using systemd (recommended), deployment just restarts the workers:
```bash
# In deploy script:
systemctl restart "<client>-worker@*"
```

The SIGTERM handler ensures in-flight jobs complete before the process exits.

## Monitoring BullMQ Jobs

```javascript
// Check queue counts (for monitoring script)
const { Queue } = require('bullmq');

const queue = new Queue('default', { connection });
const counts = await queue.getJobCounts();
console.log(JSON.stringify(counts));
// { waiting: 0, active: 2, completed: 150, failed: 0, delayed: 3 }

// Oldest waiting job
const waitingJobs = await queue.getWaiting(0, 0); // just the first
if (waitingJobs.length > 0) {
    const age = Date.now() - waitingJobs[0].timestamp;
    console.log(`Oldest waiting job age: ${Math.floor(age/1000)}s`);
}
```
