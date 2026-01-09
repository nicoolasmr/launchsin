# Alignment Ops V2.3 Runbook

## Overview
The Alignment Ops V2.3 pipeline ensures that Ad Creatives match Landing Pages. It enhances reliability with DB-based leasing, introduces diff detection for pages, and provides configurable alerting.

## Core Services

### 1. Worker Loop (`AlignmentWorkerV2`)
- **Job Processing**: Picks up 'queued' jobs from `alignment_jobs`.
- **Leasing**: Uses `claimJobWithLease` (DB) + Redis project lock.
- **Heartbeat**: Extends lease every 30s.
- **Diffing**: Checks `page_snapshots` for changes vs previous.
- **Alerting**: Dispatches webhooks for low scores (<50) or tracking errors.

### 2. Scheduler (`schedulerLoop`)
- Runs every 5 minutes.
- Checks `alignment_schedules`.
- Respects **Quiet Hours** (Timezone aware) & **Daily Budget** (per Org).
- Enqueues jobs if eligible.

## Operational Procedures

### Troubleshooting Stuck Jobs
Jobs marked 'running' but past `lock_expires_at` are automatically reclaimed by the next available worker.
If a job is permanently stuck:
```sql
UPDATE alignment_jobs SET status = 'queued', locked_by = null, lock_expires_at = null WHERE id = 'JOB_ID';
```

### Adding Notification Channels
Admins can convert a Slack/Teams webhook into a secure notification channel via API/UI.
- **API**: `POST /api/projects/:id/integrations/alignment/notifications`
- **Payload**: `{ "channel": "Slack Ops", "webhook_url": "https://hooks.slack.com/..." }`

### API Headers & Security
- **Endpoints**: Protected by `requireProjectAccess` middleware.
- **Sensitive Data**: `leakGate` middleware blocks sensitive keys (`config_json`, `secret_ref`, etc.) from responses.
