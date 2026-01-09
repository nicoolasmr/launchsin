# Alignment Schedules - Configuration Guide

## Overview
Schedules automate alignment checks on a recurring basis, respecting quiet hours and daily budgets to control costs and avoid disruption.

## Creating a Schedule

### Via UI
1. Navigate to **Integrations → Alignment → Schedules**
2. Click **"New Schedule"**
3. Configure:
   - **Cadence**: Daily or Weekly
   - **Target URLs**: List of landing pages to check
   - **Budget**: Max checks per day (1-1000)
   - **Quiet Hours**: Time window to skip checks
   - **Timezone**: For quiet hours calculation
4. Click **"Create"**

### Via API
```bash
POST /api/projects/{projectId}/integrations/alignment/schedules
Authorization: Bearer {token}
Content-Type: application/json

{
  "cadence": "daily",
  "timezone": "America/Sao_Paulo",
  "quiet_hours": {
    "enabled": true,
    "start": "22:00",
    "end": "07:00"
  },
  "budget_daily_max_checks": 100,
  "target_urls_json": [
    "https://example.com/landing-1",
    "https://example.com/landing-2"
  ],
  "enabled": true
}
```

## Editing a Schedule

### Via UI
1. Click **"Edit"** button on schedule row (admin/owner only)
2. Modify fields
3. Click **"Save"**

### Via API
```bash
PATCH /api/projects/{projectId}/integrations/alignment/schedules/{scheduleId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "budget_daily_max_checks": 150,
  "enabled": false
}
```

## Configuration Options

### Cadence
- **Daily**: Runs once per day (checks `last_run` to avoid duplicates within 23 hours)
- **Weekly**: Runs once per week (checks `last_run` to avoid duplicates within 160 hours)

### Quiet Hours
Prevents checks during specified time windows (e.g., overnight, weekends).

**Format:**
```json
{
  "enabled": true,
  "start": "22:00",  // 24-hour format
  "end": "07:00"     // 24-hour format
}
```

**Timezone-Aware:**
- Uses `Intl.DateTimeFormat` to convert current time to target timezone
- Handles overnight ranges (e.g., 22:00 to 07:00)

**Example:**
- Timezone: `America/New_York`
- Quiet Hours: 22:00 - 07:00
- Current UTC time: 02:00 (= 21:00 NY) → **Not quiet**
- Current UTC time: 06:00 (= 01:00 NY) → **Quiet** (check skipped)

### Budget (Daily Max Checks)
Limits the number of checks per organization per day to control costs.

**Validation:**
- Min: 1
- Max: 1000
- Default: 50

**Enforcement:**
- Worker queries `alignment_jobs` for today's checks
- If count >= budget: skips scheduling
- Resets at midnight (org timezone)

### Target URLs
List of landing pages to check against ads.

**Format:**
```json
["https://example.com/page1", "https://example.com/page2"]
```

**Behavior:**
- Each URL creates a separate job
- Jobs are enqueued if budget allows
- URLs are matched against ad `landing_url` field

## Troubleshooting

### Schedule Not Running

**Check 1: Enabled?**
```sql
SELECT * FROM alignment_schedules WHERE id = 'schedule-id';
```
Ensure `enabled = true`

**Check 2: Quiet Hours?**
- Verify current time in target timezone
- Check if within quiet hours window

**Check 3: Budget Exceeded?**
```sql
SELECT COUNT(*) FROM alignment_jobs 
WHERE org_id = 'org-id' 
AND created_at >= CURRENT_DATE;
```
Compare with `budget_daily_max_checks`

**Check 4: Last Run Too Recent?**
```sql
SELECT created_at FROM alignment_jobs 
WHERE project_id = 'project-id' 
ORDER BY created_at DESC LIMIT 1;
```
- Daily: Must be >23 hours ago
- Weekly: Must be >160 hours ago

### Jobs Not Processing

**Check Worker Status:**
```bash
kubectl logs -f deployment/launchsin-workers -n production
```
Look for:
- `Running Scheduler...`
- `Skipping schedule {id} due to quiet hours`
- `Skipping schedule {id} due to budget limit`

**Check Job Status:**
```sql
SELECT status, COUNT(*) FROM alignment_jobs 
WHERE project_id = 'project-id' 
GROUP BY status;
```

**Stuck Jobs:**
```sql
SELECT * FROM alignment_jobs 
WHERE status = 'running' 
AND lock_expires_at < NOW();
```
These will be auto-reclaimed by workers.

## Best Practices

1. **Start Small**: Begin with budget of 10-20 checks/day
2. **Use Quiet Hours**: Avoid peak traffic times (reduces page load impact)
3. **Monitor Costs**: Each check = 1 Playwright session + 1 LLM call (~$0.02)
4. **Target Critical Pages**: Don't check every page, focus on high-traffic landing pages
5. **Weekly for Stable Pages**: Use daily only for pages that change frequently

## Security

- **RBAC**: Only admins/owners can create/edit schedules
- **RLS**: Schedules are project-scoped (org isolation)
- **Rate Limiting**: Budget prevents runaway costs
- **Quiet Hours**: Prevents disruption during maintenance windows

## API Reference

### GET /schedules
Returns all schedules for a project (sanitized via SafeDTO).

### POST /schedules
Creates a new schedule (admin/owner only).

### PATCH /schedules/:id
Updates an existing schedule (admin/owner only).

### DELETE /schedules/:id
Deletes a schedule (admin/owner only).
