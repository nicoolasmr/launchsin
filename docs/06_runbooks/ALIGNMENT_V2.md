# Runbook: Alignment Verification Center (v2)

## 1. Overview
The Alignment Verification Center ("Ads ↔ Pages") ensures consistency between Ad Creatives (Meta) and Landing Pages.
It uses an automated system to:
1. Fetch Ad Copy via Meta Graph API.
2. Scrape Landing Pages using **Playwright** (Headless Browser) running in Kubernetes Consumers.
3. Analyze alignment using Heuristics (Tracking, CTA) and LLM (GPT-4o) for Semantic Match.
4. Provide a "Glass Box" UI for evidence verification.

## 2. Architecture

### Database
- `alignment_jobs`: Queue for analysis requests.
- `alignment_reports_v2`: Results (Score 0-100, Evidence, Recommendations).
- `page_snapshots`: Evidence metadata (H1, Title, Pixels) + Screenshot path.
- `alignment_alerts`: Created when score < 70 or critical tracking misses.
- Storage Bucket: `alignment` (Private, Signed URLs only).

### Worker (`workers/src/jobs/alignment-worker-v2.ts`)
- **Mode**: `alignment_v2` (or `all`).
- **Logic**: Polls `alignment_jobs` (status='queued').
- **Locking**: Uses Redis for Leader Election (Global) and Per-Org throttling.
- **Engine**: Playwright (`chromium`) for scraping. OpenAI for scoring.
- **Budget**: Checks daily limit per org (Default 100/day).
- **Secrets**: Decrypts Meta Tokens on-the-fly (`secretsManager`).

### Server
- **API**: `/api/projects/:id/integrations/alignment/...`
- **Security**: Leak Gate middleware blocks any response containing secrets. SafeDTO removes internal IDs.
- **RBAC**: Admin/Owner for triggering checks/resolving alerts. Viewer for reading reports.

## 3. Operational Config
Env Vars (Worker):
- `WORKER_MODE=all` or `alignment_v2`
- `PLAYWRIGHT_HEADLESS=true` (Default true)
- `OPENAI_API_KEY`: Required for scoring.
- `SECRETS_ENCRYPTION_KEY`: For token decryption.
- `SUPABASE_SERVICE_ROLE_KEY`: For DB/Storage access.

## 4. Triggering Checks
### Manual (UI)
Go to **Integration Status Center** -> **Ads ↔ Pages** -> Click **Trigger Check**.
This enqueues a job.

### Manual (API)
```bash
POST /api/projects/:id/integrations/alignment/check
Headers: x-org-id: ...
Body: { "connectionId": "...", "ad_id": "...", "landing_url": "..." }
```

## 5. Troubleshooting

### Job Stuck in 'Queued'
- Check K8s Worker Logs: `kubectl logs -l app=worker`
- Ensure `WORKER_MODE` includes `alignment_v2`.
- Check Redis connection (Locking).

### Job Failed
- Check `alignment_jobs.status = 'failed'`.
- **Browser Errors**: "Target closed", "Timeout". Increase timeout or check if site blocks bots.
- **Budget**: "Budget Exceeded". Wait for next UTC day or increase limit.
- **Token Error**: "Invalid Access Token". Reconnect Meta Integration.

### Screenshots Not Loading
- Check `page_snapshots.screenshot_path`.
- Ensure Supabase Storage bucket `alignment` exists and is private.
- Check Server logs for Signed URL generation errors.

### Low Scores (< 50)
- **Tracking**: Check if Pixel/UTMs are actually on the page.
- **Content**: Check if Ad Promise matches Landing Page H1.
- **LLM**: Check `model_info` in DB for LLM failure/fallback usage.

## 6. Development
- Run Worker locally: `WORKER_MODE=alignment_v2 npm run dev` inside `workers/`.
- Run Server: `npm run dev` inside `server/`.
- Tests: `npm test` (Unit) or `npm run test:e2e server/tests/no-secrets-in-responses-alignment-v2.e2e.ts`.
