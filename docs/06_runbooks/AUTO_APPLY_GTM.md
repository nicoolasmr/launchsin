# Auto-Apply GTM Runbook

## Overview
1-click fix application to Google Tag Manager with BigTech-level security: dry-run preview, automatic verification, secure rollback, and complete audit trail.

---

## Setup OAuth

### 1. Google Cloud Console

**Create OAuth 2.0 Credentials**:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select/create project
3. Navigate to **APIs & Services** > **Credentials**
4. Click **Create Credentials** > **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   - `https://yourdomain.com/api/oauth/gtm/callback`
   - `http://localhost:3000/api/oauth/gtm/callback` (dev)

**Enable APIs**:
- Tag Manager API

**Scopes Required**:
- `https://www.googleapis.com/auth/tagmanager.edit.containers`

**Save**:
- Client ID
- Client Secret (store in `secret_refs` table, AES-256)

### 2. Store Credentials

```sql
-- Insert OAuth credentials (service role)
INSERT INTO secret_refs (org_id, key_name, encrypted_value)
VALUES (
  'org-123',
  'gtm_oauth_client_secret',
  pgp_sym_encrypt('YOUR_CLIENT_SECRET', 'encryption_key')
);
```

---

## Create Apply Target

### 1. Connect GTM Account

**Via UI** (future):
- Navigate to **Integrations** > **GTM**
- Click **Connect GTM Account**
- OAuth flow → authorize

**Via API**:
```bash
POST /api/projects/:projectId/integrations/auto-apply/targets
Authorization: Bearer <token>
Content-Type: application/json

{
  "connection_id": "conn-uuid",
  "type": "GTM",
  "display_name": "Production GTM Container",
  "config_json": {
    "container_id": "GTM-XXXXXX",
    "workspace_id": "123",  // optional
    "environment": "production"  // optional
  }
}
```

**Response**:
```json
{
  "target": {
    "id": "target-uuid",
    "type": "GTM",
    "display_name": "Production GTM Container",
    "config_json": { "container_id": "GTM-XXXXXX" },
    "created_at": "2026-01-10T10:00:00Z"
  }
}
```

---

## Dry Run Workflow

### 1. Preview Changes

**Purpose**: See what will be applied WITHOUT making changes

**API**:
```bash
POST /api/projects/:projectId/integrations/auto-apply/apply
Authorization: Bearer <token>
Content-Type: application/json

{
  "fixpack_id": "fixpack-uuid",
  "target_id": "target-uuid",
  "mode": "GTM",
  "dry_run": true
}
```

**Response**:
```json
{
  "dry_run": true,
  "diff": {
    "tags_to_create": [
      "GTM Snippet (pageview)",
      "GA4 Config (G-XXXXXX)"
    ],
    "tags_to_update": [],
    "estimated_changes": 2
  }
}
```

### 2. Review Diff

**Check**:
- Tags to create/update
- Estimated changes count
- No unexpected modifications

---

## Apply Workflow

### 1. Execute Apply

**API**:
```bash
POST /api/projects/:projectId/integrations/auto-apply/apply
Authorization: Bearer <token>
Content-Type: application/json

{
  "fixpack_id": "fixpack-uuid",
  "target_id": "target-uuid",
  "mode": "GTM",
  "dry_run": false
}
```

**Response**:
```json
{
  "job_id": "job-uuid",
  "status": "queued",
  "created_at": "2026-01-10T10:00:00Z"
}
```

### 2. Monitor Job Status

**API**:
```bash
GET /api/projects/:projectId/integrations/auto-apply/jobs/:jobId
Authorization: Bearer <token>
```

**Response** (running):
```json
{
  "job": {
    "id": "job-uuid",
    "type": "APPLY_FIX",
    "status": "running",
    "created_at": "2026-01-10T10:00:00Z",
    "started_at": "2026-01-10T10:00:05Z"
  }
}
```

**Response** (completed):
```json
{
  "job": {
    "id": "job-uuid",
    "type": "APPLY_FIX",
    "status": "ok",
    "result_json": {
      "applied_tag_ids": ["tag-1", "tag-2"],
      "version": "123",
      "verify_job_id": "verify-uuid"
    },
    "created_at": "2026-01-10T10:00:00Z",
    "finished_at": "2026-01-10T10:00:30Z"
  }
}
```

### 3. Automatic Verification

**Triggered automatically** after apply:
- `verify_job_id` in `result_json`
- Check tracking implementation
- Validate GTM tags firing correctly

**Check verify status**:
```bash
GET /api/tracking/verify/jobs/:verifyJobId
```

---

## Rollback Workflow

### 1. Execute Rollback

**When**: Apply failed or user wants to revert

**API**:
```bash
POST /api/projects/:projectId/integrations/auto-apply/rollback
Authorization: Bearer <token>
Content-Type: application/json

{
  "apply_job_id": "job-uuid"
}
```

**Response**:
```json
{
  "job_id": "rollback-job-uuid",
  "status": "queued",
  "created_at": "2026-01-10T10:05:00Z"
}
```

### 2. Monitor Rollback

**API**:
```bash
GET /api/projects/:projectId/integrations/auto-apply/jobs/:rollbackJobId
```

**Response** (completed):
```json
{
  "job": {
    "id": "rollback-job-uuid",
    "type": "ROLLBACK_FIX",
    "status": "ok",
    "result_json": {
      "restored_version": "122",
      "verify_job_id": "verify-uuid-2"
    },
    "finished_at": "2026-01-10T10:05:30Z"
  }
}
```

### 3. Verify Rollback

**Automatic verification** triggered:
- Confirms previous state restored
- Validates tracking matches pre-apply state

---

## Troubleshooting

### OAuth Errors

**Error**: `invalid_grant` or `token_expired`

**Solution**:
1. Refresh OAuth token
2. Re-authorize GTM connection
3. Check token expiry in `secret_refs`

**Refresh token**:
```sql
-- Update refresh token (service role)
UPDATE secret_refs
SET encrypted_value = pgp_sym_encrypt('NEW_REFRESH_TOKEN', 'encryption_key')
WHERE key_name = 'gtm_oauth_refresh_token';
```

### Apply Job Stuck

**Error**: Job status = `running` for > 5 minutes

**Solution**:
1. Check worker logs
2. Verify GTM API connectivity
3. Check rate limits

**Manual intervention**:
```sql
-- Mark job as error (service role)
UPDATE apply_jobs
SET status = 'error',
    error_message_redacted = 'Timeout - manual intervention required',
    finished_at = now()
WHERE id = 'job-uuid';
```

### Rollback Failed

**Error**: Rollback job status = `error`

**Solution**:
1. Check `apply_snapshots` table for backup
2. Manually restore GTM version via GTM UI
3. Create new verify job

**Manual GTM restore**:
1. Go to GTM UI
2. Navigate to **Versions**
3. Find version before apply (check `apply_snapshots.snapshot_json`)
4. Click **Restore**

### Missing Snapshots

**Error**: No snapshot found for rollback

**Prevention**:
- Snapshots created automatically before apply
- Check `apply_snapshots` table

**Recovery**:
- Cannot rollback without snapshot
- Manually revert in GTM UI
- Document changes for audit

---

## Security Best Practices

### 1. Secrets Management
- **Never** hardcode tokens
- Store in `secret_refs` (AES-256)
- Rotate tokens regularly

### 2. RBAC
- Only Admin/Owner can apply/rollback
- Viewer can read status
- Enforce via server RBAC + RLS

### 3. Audit Trail
- All applies logged in `apply_jobs`
- Snapshots in `apply_snapshots`
- Audit logs track who/what/when

### 4. Dry Run First
- **Always** preview changes
- Review diff before apply
- Confirm estimated changes

---

## Related Documentation
- [HOME_COMMAND_CENTER.md](../00_overview/HOME_COMMAND_CENTER.md)
- [PERFORMANCE_METRICS.md](./PERFORMANCE_METRICS.md)
- [AUDIT_LOGS.md](./AUDIT_LOGS.md)
