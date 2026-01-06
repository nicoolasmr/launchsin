# Alignment Operations Runbook

## Overview
Alignment Intelligence validates ad creatives against landing pages to ensure message consistency, safety, and brand compliance.
It runs in two modes:
1. **Manual/On-Demand**: Triggered via API or UI (when implemented).
2. **Scheduled/Batch**: Automated background checks via `AlignmentWorker`.

## internal Components
- **AlignmentEngine** (`server/src/ai/alignment-engine.ts`): Core analysis logic (OpenAI + PII + Cache).
- **AlignmentSettingsService** (`server/src/services/alignment-settings.ts`): Manages config & budgets.
- **AlignmentOrchestrator** (`server/src/services/alignment-orchestrator.ts`): Batches checks per project.
- **AlignmentWorker** (`workers/src/jobs/alignment-worker.ts`): Scheduler that triggers batches via Internal API.

## Configuration
Managed via `alignment_settings` table.
- `enabled`: Boolean.
- `cadence`: 'daily' | 'weekly'.
- `max_checks_per_day`: Integer limit (Budget Control).
- `min_score_threshold`: Score below which alerts fire.

### Enabling for a Project
```sql
INSERT INTO alignment_settings (org_id, project_id, enabled, cadence, max_checks_per_day)
VALUES ('org-uuid', 'proj-uuid', true, 'daily', 50);
```

## Monitoring & Troubleshooting

### Viewing Runs
Query `alignment_runs` table:
```sql
SELECT * FROM alignment_runs WHERE project_id = '...' ORDER BY created_at DESC;
```
- `status`: 'success' | 'failed'
- `last_error`: details of failure.

### Alerts
Alerts are generated in `integration_alerts` table with type `alignment_...`.
- `alignment_score_low`: Score < threshold.
- `alignment_budget_exceeded`: Daily limit hit.

### Worker Scheduling
The `AlignmentWorker` polls every 5 minutes (configurable via `ALIGNMENT_POLL_INTERVAL_MS`).
It calls `POST /api/internal/alignment/project/:id/batch-run`.
Check Worker logs for "Triggering alignment check..."

## Secrets & Env
- `OPENAI_API_KEY`: Required for analysis.
- `INTERNAL_API_KEY`: Required for Worker -> Server communication.
