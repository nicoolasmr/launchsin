# Home Personalization Runbook

## Overview
Users can personalize their Command Center Home with custom widget visibility, layout order, and density preferences.

**Privacy**: Each user has private preferences (self-only RLS). Admins cannot read other users' preferences.

---

## Preferences Schema

### prefs_json Structure
```json
{
  "widget_visibility": {
    "kpi": true,
    "decisions": true,
    "alignment": true,
    "crm": true,
    "ops": true,
    "recent_actions": true
  },
  "widget_order": ["kpi", "decisions", "alignment", "crm", "ops", "recent_actions"],
  "density": "comfortable",
  "default_project_id": null
}
```

### Fields

**widget_visibility** (object):
- `kpi`: Show/hide KPI cards
- `decisions`: Show/hide Decisions & Actions feed
- `alignment`: Show/hide Alignment Summary
- `crm`: Show/hide CRM Activity
- `ops`: Show/hide Ops Health
- `recent_actions`: Show/hide Recent Actions feed

**widget_order** (array):
- Order of widgets from top to bottom
- Must contain all widget keys
- Max 10 items

**density** (enum):
- `comfortable`: More spacing, better readability (default)
- `compact`: Less spacing, more information

**default_project_id** (string | null):
- UUID of default project (future use)
- Currently not used

---

## Defaults

If user has no preferences, these defaults are applied:

```typescript
{
  widget_visibility: {
    kpi: true,
    decisions: true,
    alignment: true,
    crm: true,
    ops: true,
    recent_actions: true
  },
  widget_order: ['kpi', 'decisions', 'alignment', 'crm', 'ops', 'recent_actions'],
  density: 'comfortable',
  default_project_id: null
}
```

---

## API Endpoints

### GET /api/home/prefs

**Response**:
```json
{
  "prefs": { ... },
  "updated_at": "2026-01-09T18:00:00Z"
}
```

**Behavior**:
- Returns user's preferences
- If no preferences exist, returns defaults (without creating DB record)
- Self-only RLS enforced

---

### PUT /api/home/prefs

**Request**:
```json
{
  "prefs": {
    "widget_visibility": { "kpi": false },
    "density": "compact"
  }
}
```

**Response**:
```json
{
  "ok": true,
  "updated_at": "2026-01-09T18:00:00Z"
}
```

**Behavior**:
- Upserts preferences (merges with existing)
- Validates with Zod schema
- Creates audit log (action_type: HOME_PREFS_UPDATE)
- Self-only RLS enforced

---

## Database

### Table: user_home_prefs

```sql
CREATE TABLE user_home_prefs (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    prefs_json jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (org_id, user_id)
);
```

### RLS Policies

**SELECT**: `user_id = auth.uid()`

**INSERT**: `user_id = auth.uid()`

**UPDATE**: `user_id = auth.uid()`

**DELETE**: Blocked (no policy)

---

## Troubleshooting

### User sees defaults instead of saved preferences

**Diagnosis**:
```sql
SELECT * FROM user_home_prefs 
WHERE user_id = 'USER_UUID' AND org_id = 'ORG_UUID';
```

**Possible causes**:
1. User never saved preferences
2. RLS blocking access (check `auth.uid()`)
3. Wrong org_id

---

### Preferences not saving

**Diagnosis**:
1. Check audit logs:
```sql
SELECT * FROM audit_logs 
WHERE action_type = 'HOME_PREFS_UPDATE' 
AND actor_user_id = 'USER_UUID'
ORDER BY created_at DESC LIMIT 5;
```

2. Check validation errors in server logs

**Possible causes**:
1. Zod validation failing (invalid prefs structure)
2. RLS blocking INSERT/UPDATE
3. No org membership

---

### How to reset user preferences

**Option 1**: User clicks "Restore Defaults" in UI (future feature)

**Option 2**: Manual SQL (admin only):
```sql
DELETE FROM user_home_prefs 
WHERE user_id = 'USER_UUID' AND org_id = 'ORG_UUID';
```

---

## Security

### Self-Only RLS
- Users can ONLY read/write their own preferences
- Admins CANNOT read other users' preferences
- Privacy-first design

### Audit Logging
- All PUT operations logged to `audit_logs`
- Metadata contains only `updated_fields` (not values)
- No sensitive data in logs

### Validation
- Zod schema enforces structure
- Max array length: 10 items
- Enum validation for density

---

## Best Practices

1. **Always merge with existing prefs**: Don't replace entire object
2. **Validate before saving**: Use Zod schema
3. **Respect privacy**: Never expose other users' prefs
4. **Audit all changes**: Log to `audit_logs`
5. **Provide defaults**: Never break UI if prefs missing

---

## Related Documentation
- [HOME_COMMAND_CENTER.md](../00_overview/HOME_COMMAND_CENTER.md)
- [AUDIT_LOGS.md](./AUDIT_LOGS.md)
