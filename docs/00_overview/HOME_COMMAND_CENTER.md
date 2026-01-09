# Command Center Home - Complete Documentation

## Overview
The Command Center is LaunchSin's operational dashboard that provides real-time insights and **executable actions** for managing ad campaigns, tracking alignment, and maintaining system health.

**Key Features**:
- **Aggregated Metrics**: Projects, integrations health, alignment scores, CRM activity, ops health
- **Decision Feed**: Prioritized actionable items with executable buttons
- **Action Executor**: One-click execution of fixes and checks
- **Audit Trail**: Immutable log of all actions taken
- **Real-time Updates**: Auto-refresh after actions

---

## Architecture

### Backend API

#### GET /api/home/overview
Aggregates metrics across user's projects.

**Response (SafeDTO)**:
```json
{
  "total_projects": 5,
  "integrations_health": {
    "active": 8,
    "total": 10,
    "health_pct": 80
  },
  "alignment_summary": {
    "avg_score": 72,
    "critical_count": 2,
    "warning_count": 5,
    "last_run_at": "2026-01-09T18:00:00Z"
  },
  "crm_summary": {
    "contacts_count": 1250,
    "deals_count": 45
  },
  "ops_summary": {
    "dlq_pending": 3,
    "alerts_open": 7
  }
}
```

#### GET /api/home/decisions
Returns prioritized actionable items with **executable actions**.

**Response (SafeDTO)**:
```json
[
  {
    "id": "alignment-uuid",
    "type": "ALIGNMENT_CRITICAL",
    "severity": "critical",
    "title": "Low alignment score (42%)",
    "why": "Page https://example.com has critical misalignment with ad creative",
    "confidence": 42,
    "next_actions": [
      {
        "label": "Generate Fix Pack",
        "action_type": "GENERATE_FIX_PACK",
        "payload": { "page_url": "https://example.com" }
      },
      {
        "label": "Trigger Alignment Check",
        "action_type": "TRIGGER_ALIGNMENT_CHECK",
        "payload": { "page_url": "https://example.com" }
      }
    ],
    "deep_links": ["/projects/uuid/integrations/alignment?filter=critical"]
  }
]
```

#### POST /api/home/actions/execute
Executes an action with RBAC enforcement (Admin/Owner only).

**Request**:
```json
{
  "project_id": "uuid",
  "action_type": "GENERATE_FIX_PACK",
  "payload": { "page_url": "https://example.com" }
}
```

**Response (SafeDTO)**:
```json
{
  "ok": true,
  "audit_id": "uuid",
  "result": {
    "summary": "Fix pack generated for https://example.com",
    "deep_link": "/projects/uuid/integrations/alignment?tab=fixpacks"
  }
}
```

#### GET /api/home/actions/recent
Returns recent actions from audit log (Viewer+).

**Query**: `?project_id=uuid&limit=10`

**Response (SafeDTO)**:
```json
[
  {
    "id": "uuid",
    "action_type": "GENERATE_FIX_PACK",
    "entity_type": "fix_pack",
    "entity_id": "generated",
    "metadata": { "page_url": "https://example.com", "result": "success" },
    "created_at": "2026-01-09T18:30:00Z"
  }
]
```

---

## Action Types

### GENERATE_FIX_PACK
Generates tracking fix snippets (Meta Pixel, GTM, GA4, UTM).

**Payload**: `{ page_url: string }`

**Executor**: Reuses `trackingFixService.buildFixPack()`

**Result**: Fix pack created, deep link to Fix Packs tab

---

### VERIFY_TRACKING
Queues a tracking verification job.

**Payload**: `{ page_url: string }`

**Executor**: Creates `TRACKING_VERIFY` job in `alignment_jobs`

**Result**: Job queued, deep link to Alignment page

---

### TRIGGER_ALIGNMENT_CHECK
Queues an alignment check job.

**Payload**: `{ page_url: string }`

**Executor**: Creates `ALIGNMENT_CHECK` job in `alignment_jobs`

**Result**: Job queued, deep link to Alignment page

---

### RESOLVE_ALERT
Marks an alert as resolved.

**Payload**: `{ alert_id: string }`

**Executor**: Updates `alignment_alerts.status = 'resolved'`

**Result**: Alert resolved, deep link to Alignment page

---

## Security Architecture

### LeakGate
All home routes registered with `leakGate` middleware.

**Blocks**:
- API keys (`sk-*`, `Bearer *`)
- Secrets (`password`, `secret`, `api_key`)
- PII patterns (emails, phone numbers)

---

### SafeDTO
All responses use explicit whitelists.

**Overview Whitelist**:
- `total_projects`, `integrations_health`, `alignment_summary`, `crm_summary`, `ops_summary`

**Decisions Whitelist**:
- `id`, `type`, `severity`, `title`, `why`, `confidence`, `next_actions`, `deep_links`

**Actions Whitelist**:
- `ok`, `audit_id`, `result.summary`, `result.deep_link`

---

### RBAC

**Viewer+**: Can read overview + decisions + audit logs

**Admin/Owner**: Can execute actions (mutations)

**Enforcement**: Via `project_members` role check

---

### Tenant Scoping

**All queries filtered by**:
1. User's `org_id` (from `org_members`)
2. User's `project_ids` (from `project_members`)

**Cross-tenant isolation**: User A cannot see User B's data

---

### Audit Trail

**All actions logged to `audit_logs`**:
- `org_id`, `project_id`, `actor_user_id`
- `action_type`, `entity_type`, `entity_id`
- `metadata_json` (redacted - no secrets)
- `created_at`

**Metadata Redaction**:
Automatically removes: `api_key`, `token`, `secret`, `password`, `sk-*`, `Bearer *`

**RLS**:
- SELECT: Org members (viewer+)
- INSERT: Admin/Owner only
- UPDATE/DELETE: Blocked (immutable)

---

## Frontend UI

### Components

**HomePage** (`client/app/(app)/home/page.tsx`):
- KPI Cards (4 metrics)
- Decision Feed with executable buttons
- Recent Actions section
- CRM Activity summary

**Features**:
- ✅ Skeleton loaders (smooth loading)
- ✅ Error states (retry button)
- ✅ Empty states ("All Clear!")
- ✅ Action buttons (admin/owner only)
- ✅ Loading states (⏳ spinner on executing button)
- ✅ Toast notifications (success/error)
- ✅ Auto-refresh after action

### User Flow

1. User navigates to `/home`
2. Sees KPIs + Decision Feed
3. Clicks "Generate Fix Pack" button
4. Button shows loading spinner (⏳)
5. Action executes via POST `/api/home/actions/execute`
6. Success toast appears: "Fix pack generated for https://example.com"
7. Data auto-refreshes
8. Recent Actions section shows new entry

---

## Data Sources

### Projects
- **Table**: `projects`
- **Metric**: Total count per org

### Integrations Health
- **Table**: `source_connections`
- **Metrics**: Active/total connections, health %

### Alignment Summary
- **Table**: `alignment_reports_v2`
- **Metrics**: Avg score, critical/warning counts, last run

### CRM Summary
- **Tables**: `crm_contacts`, `crm_deals`
- **Metrics**: Counts

### Ops Summary
- **Tables**: `dlq_events`, `alignment_alerts`
- **Metrics**: Pending DLQ, open alerts

---

## Debugging

### Check Overview Data
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/home/overview
```

### Check Decisions
```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/home/decisions
```

### Execute Action
```bash
curl -X POST -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"uuid","action_type":"GENERATE_FIX_PACK","payload":{"page_url":"https://example.com"}}' \
  http://localhost:3000/api/home/actions/execute
```

### Check Audit Logs
```sql
SELECT 
  al.action_type,
  al.entity_type,
  al.metadata_json,
  al.created_at,
  u.email as actor_email
FROM audit_logs al
JOIN auth.users u ON u.id = al.actor_user_id
WHERE al.project_id = 'PROJECT_UUID'
ORDER BY al.created_at DESC
LIMIT 20;
```

### Check RLS
```sql
-- As specific user
SET request.jwt.claim.sub = 'USER_UUID';

SELECT * FROM audit_logs;
-- Should only see logs for user's org
```

---

## Related Documentation
- [AUDIT_LOGS.md](../06_runbooks/AUDIT_LOGS.md) - Audit trail runbook
- [RBAC.md](../03_architecture/RBAC.md) - Role-based access control
- [SAFE_DTO.md](../03_architecture/SAFE_DTO.md) - Data transfer objects
- [LEAK_GATE.md](../03_architecture/LEAK_GATE.md) - Secret detection
