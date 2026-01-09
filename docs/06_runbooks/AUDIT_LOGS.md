# Audit Logs Runbook

## Overview
The `audit_logs` table provides an immutable trail of all user actions in the Command Center for compliance, debugging, and security auditing.

## Table Schema

```sql
CREATE TABLE audit_logs (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL,
    project_id uuid,
    actor_user_id uuid NOT NULL,
    action_type text NOT NULL,
    entity_type text,
    entity_id text,
    metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
```

## Action Types

| Action Type | Description | Entity Type | Requires |
|------------|-------------|-------------|----------|
| `GENERATE_FIX_PACK` | Generate tracking fix snippets | `fix_pack` | Admin/Owner |
| `VERIFY_TRACKING` | Queue tracking verification job | `alignment_job` | Admin/Owner |
| `TRIGGER_ALIGNMENT_CHECK` | Queue alignment check | `alignment_job` | Admin/Owner |
| `RESOLVE_ALERT` | Mark alert as resolved | `alignment_alert` | Admin/Owner |

## Useful Queries

### Recent Actions by Project
```sql
SELECT 
    al.action_type,
    al.entity_type,
    al.entity_id,
    al.metadata_json,
    al.created_at,
    u.email as actor_email
FROM audit_logs al
JOIN auth.users u ON u.id = al.actor_user_id
WHERE al.project_id = 'PROJECT_UUID'
ORDER BY al.created_at DESC
LIMIT 50;
```

### Actions by User
```sql
SELECT 
    al.action_type,
    p.name as project_name,
    al.created_at
FROM audit_logs al
JOIN projects p ON p.id = al.project_id
WHERE al.actor_user_id = 'USER_UUID'
ORDER BY al.created_at DESC;
```

### Action Frequency (last 7 days)
```sql
SELECT 
    action_type,
    COUNT(*) as count,
    DATE_TRUNC('day', created_at) as day
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY action_type, day
ORDER BY day DESC, count DESC;
```

### Failed Actions (check application logs)
```sql
-- Audit logs only record successful actions
-- Check application logs for failures
```

## Metadata Redaction

**CRITICAL**: `metadata_json` must NEVER contain:
- API keys (`api_key`, `sk-*`)
- Tokens (`token`, `Bearer *`)
- Passwords (`password`)
- Secrets (`secret`)

The `HomeActionsService.redactMetadata()` method automatically removes these patterns.

### Example Metadata
```json
{
  "page_url": "https://example.com/landing",
  "result": "success",
  "alert_id": "uuid"
}
```

### Forbidden Metadata
```json
{
  "api_key": "sk-1234",  // ❌ NEVER
  "token": "Bearer xyz", // ❌ NEVER
  "password": "secret"   // ❌ NEVER
}
```

## Retention Policy

**Current**: No automatic deletion (infinite retention)

**Recommended** (implement in future):
- Keep 90 days for compliance
- Archive to cold storage after 90 days
- Delete after 1 year (unless regulatory requirements)

```sql
-- Future: Delete old logs
DELETE FROM audit_logs
WHERE created_at < NOW() - INTERVAL '1 year';
```

## Troubleshooting

### No Audit Logs Appearing

**Check**:
1. User has admin/owner role?
   ```sql
   SELECT role FROM project_members 
   WHERE user_id = 'USER_UUID' AND project_id = 'PROJECT_UUID';
   ```

2. RLS policy allows insert?
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_insert';
   ```

3. Application logs for errors:
   ```bash
   grep "Failed to write audit log" server/logs/*.log
   ```

### Metadata Contains Secrets

**Action**: Immediately investigate and patch
1. Check `HomeActionsService.redactMetadata()`
2. Update redaction logic
3. Manually redact existing logs:
   ```sql
   UPDATE audit_logs
   SET metadata_json = '{}'::jsonb
   WHERE metadata_json::text LIKE '%api_key%';
   ```

### Performance Issues

**Symptoms**: Slow queries on audit_logs

**Solutions**:
1. Check indexes exist:
   ```sql
   SELECT indexname FROM pg_indexes 
   WHERE tablename = 'audit_logs';
   ```

2. Add composite index if needed:
   ```sql
   CREATE INDEX idx_audit_logs_actor_action_created 
   ON audit_logs(actor_user_id, action_type, created_at DESC);
   ```

3. Partition table by month (for very large datasets)

## Security

### RLS Policies

**SELECT**: Org members can read
```sql
CREATE POLICY audit_logs_select ON audit_logs
FOR SELECT USING (
    org_id IN (
        SELECT om.org_id FROM org_members om 
        WHERE om.user_id = auth.uid()
    )
);
```

**INSERT**: Admin/Owner only
```sql
CREATE POLICY audit_logs_insert ON audit_logs
FOR INSERT WITH CHECK (
    org_id IN (
        SELECT om.org_id FROM org_members om 
        WHERE om.user_id = auth.uid() 
        AND om.role IN ('admin', 'owner')
    )
);
```

**UPDATE/DELETE**: Blocked (no policies = immutable)

### Audit the Auditors

Monitor who accesses audit logs:
```sql
-- Enable pgAudit extension (if available)
-- Or use Supabase audit logs
```

## Best Practices

1. **Never delete audit logs** (unless retention policy)
2. **Always redact sensitive data** before writing
3. **Include correlation IDs** for tracing (optional)
4. **Monitor for anomalies** (unusual action patterns)
5. **Export regularly** for compliance backups

## Related Documentation
- [HOME_COMMAND_CENTER.md](../00_overview/HOME_COMMAND_CENTER.md)
- [RBAC.md](../03_architecture/RBAC.md)
