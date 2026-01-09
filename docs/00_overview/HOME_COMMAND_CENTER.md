# Command Center Home

## Overview
The Command Center Home is the operational dashboard for LaunchSin users. It provides a centralized view of key metrics, actionable decisions, and system health.

## Features

### 1. Overview Aggregators
**Endpoint**: `GET /api/home/overview`

Aggregates data from multiple sources:
- **Total Projects**: Count of projects in user's org
- **Integrations Health**: Active connections vs total, health percentage
- **Alignment Summary**: Average score, critical/warning counts, last run timestamp
- **CRM Summary**: Contacts and deals count (if CRM Hub active)
- **Ops Summary**: DLQ pending count, open alerts count

### 2. Decision Feed
**Endpoint**: `GET /api/home/decisions`

Prioritized list of actionable items:
- **Alignment Critical**: Pages with score < 50
- **Tracking Missing**: Missing tracking pixels
- **DLQ Accumulating**: > 10 events in DLQ
- **CRM Lag**: High sync lag (future)

Each decision includes:
- `type`: Decision category
- `severity`: critical/high/medium/low
- `title`: Short description
- `why`: Explanation
- `confidence`: Score (if applicable)
- `next_actions`: Suggested actions
- `deep_links`: Links to relevant pages

## Security Architecture

### SafeDTO Whitelist
All responses use explicit whitelisting:

**Overview Response**:
```typescript
{
  total_projects: number,
  integrations_health: { active, total, health_pct },
  alignment_summary: { avg_score, critical_count, warning_count, last_run_at },
  crm_summary: { contacts_count, deals_count },
  ops_summary: { dlq_pending, alerts_open }
}
```

**Decisions Response**:
```typescript
[{
  id: string,
  type: string,
  severity: 'critical' | 'high' | 'medium' | 'low',
  title: string,
  why: string,
  confidence: number | null,
  next_actions: string[],
  deep_links: string[]
}]
```

### LeakGate
Both endpoints protected by LeakGate middleware to prevent:
- API keys in responses
- Secrets in responses
- PII leakage

### Tenant Scoping
All queries are tenant-scoped:
1. Resolve `user_id` from auth token
2. Get `org_id` from `org_members`
3. Get `project_ids` from `project_members`
4. Filter all queries by `org_id` and `project_ids`

### RBAC
- **Viewer+**: Can read overview and decisions
- **Admin/Owner**: Same as viewer (no mutations in this feature)

## Data Sources

### Projects
- Table: `projects`
- Filter: `org_id = user's org`

### Integrations
- Table: `source_connections`
- Filter: `project_id IN user's projects`
- Metrics: Count by status

### Alignment
- Tables: `alignment_reports_v2`, `alignment_jobs`, `alignment_alerts`
- Filter: `project_id IN user's projects`
- Metrics: Avg score, critical count, warning count

### CRM
- Tables: `crm_contacts`, `crm_deals`
- Filter: `project_id IN user's projects`
- Metrics: Total counts

### Ops
- Tables: `dlq_events`, `alignment_alerts`
- Filter: `project_id IN user's projects`
- Metrics: Pending/open counts

## UI Components

### Home Page
- **Location**: `client/app/(app)/home/page.tsx`
- **Features**: Skeleton loaders, error states, empty states
- **Layout**: KPI cards + Decision feed + CRM summary

### Navigation
- **Sidebar**: "🏠 Home" as first item
- **Route**: `/home`

## Debugging

### Check Data
```sql
-- User's org
SELECT org_id FROM org_members WHERE user_id = 'xxx';

-- User's projects
SELECT project_id FROM project_members WHERE user_id = 'xxx';

-- Alignment summary
SELECT AVG(alignment_score), COUNT(*) 
FROM alignment_reports_v2 
WHERE project_id IN (...);
```

### API Testing
```bash
# Overview
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/home/overview

# Decisions
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/home/decisions
```

### Logs
```bash
# Server logs
grep "Home overview" server/logs/*.log
grep "Home decisions" server/logs/*.log
```

## Future Enhancements

### PR #2: Action Executor
- "Generate Fix Pack" button
- "Resolve Alert" action
- Audit log for actions

### PR #3: Personalization
- User preferences (`user_home_prefs` table)
- Customizable widgets
- Drag-and-drop layout

### PR #4: Performance
- Hash-based caching
- Prometheus metrics
- SLO dashboard

## Related Documentation
- [CI Gates](../06_runbooks/CI_GATES.md)
- [Tracking Auto-Fix](../06_runbooks/TRACKING_AUTOFIX.md)
- [Alignment Pipeline](../03_architecture/ALIGNMENT_PIPELINE.md)
