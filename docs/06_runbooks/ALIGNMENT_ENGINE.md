# Alignment Engine Runbook

## Overview
The **Alignment Intelligence Engine** is a core component that analyzes the semantic congruence between Ad Creatives (Meta Ads) and Landing Pages using LLMs (GPT-4o). It runs as a scheduled background job and also supports ad-hoc checks via the Admin UI.

## Architecture

1.  **AlignmentWorker** (`workers/src/jobs/alignment-worker.ts`)
    *   Polls `alignment_settings` for projects with `enabled=true`.
    *   Checks `cadence` (daily/weekly) against last run.
    *   Triggers the Server Internal API via `POST /internal/alignment/project/:id/batch-run`.
    *   **Locking**: Uses Redis Global Lock to ensure only one worker processes scheduling.

2.  **AlignmentOrchestrator** (`server/src/services/alignment-orchestrator.ts`)
    *   Receives Batch Trigger.
    *   Checks Project Budget (Monthly limits).
    *   Fetches Active Ads from Meta (via `MetaAdsConnector`).
    *   Decrypts Secrets (Access Tokens) via `SecretsProvider`.
    *   Scrapes Landing Page using `PageScraper` (Puppeteer).
    *   Calls `AlignmentEngine` for Analysis.
    *   Saves Report to `alignment_reports`.

3.  **AlignmentEngine** (`server/src/ai/alignment-engine.ts`)
    *   Constructs LLM Prompt with Ad Copy + Scraped Content.
    *   Uses GPT-4o (`gpt-4o`) for analysis.
    *   Returns Score, Findings, and Summary.

4.  **PageScraper** (`server/src/ai/page-scraper.ts`)
    *   Uses Headless Chrome (Puppeteer) to render pages.
    *   Extracts Title, H1, H2, Visible Text, Pixel Presence, UTMs.

## Configuration

### Environment Variables
| Variable | Description |
| :--- | :--- |
| `OPENAI_API_KEY` | Required for GPT-4o analysis. |
| `ALIGNMENT_POLL_INTERVAL_MS` | Polling frequency for worker (Default: 3600000 = 1h). |
| `WORKER_MODE` | Set to `all` or `alignment` to enable the worker. |
| `INTERNAL_API_URL` | Check URL for worker to call (e.g., `http://server:3000/api`). |
| `INTERNAL_API_KEY` | Shared secret for internal API auth. |

### Database Settings (`alignment_settings`)
*   `enabled`: Boolean.
*   `cadence`: 'daily' or 'weekly'.
*   `max_checks_per_day`: Limit to control costs (Default 50).
*   `monthly_budget_usd`: Hard cap on spent (approx cost tracking).

## Operational Procedures

### 1. Trigger Manual Check (Ad-Hoc)
Use the Admin UI > Integrations > Alignment Tab, or call API:
```bash
POST /api/projects/:projectId/integrations/alignment/check
Headers: Authorization: Bearer <user_token>
Body: { "landing_url": "...", "headline": "...", "body": "..." }
```

### 2. Force Batch Run (Internal)
```bash
curl -X POST http://localhost:3000/api/internal/alignment/project/<projectId>/batch-run \
  -H "X-Internal-Key: <key>" \
  -d '{"orgId": "<orgId>"}'
```

### 3. Debugging Scraper Issues
Check logs for `Page scraping failed`. Common causes:
*   Timeout (Page load > 30s).
*   Bot Blocking (User-Agent string may need rotation).
*   Memory Limits (Puppeteer is memory hungry).

### 4. Monitoring Costs
Alignment runs store estimated cost in `alignment_runs`.
Monitor `alignment_checks_total` Prometheus metric.

## Troubleshooting

*   **Worker not starting**: Check `WORKER_MODE` env var.
*   **"Token not found"**: Ensure Meta connection is active and secrets are stored in `secret_refs`.
*   **"Budget exceeded"**: Check `alignment_settings.monthly_budget_usd`.
*   **LLM Errors**: Check `OPENAI_API_KEY` and quota.
