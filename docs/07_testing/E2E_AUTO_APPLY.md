# End-to-End Auto-Apply Test Guide

**Phase F6**: Manual E2E test for auto-apply GTM flow

---

## Prerequisites

### 1. Environment Setup
- ✅ GTM OAuth credentials configured:
  - `GTM_OAUTH_CLIENT_ID`
  - `GTM_OAUTH_CLIENT_SECRET`
  - `GTM_OAUTH_REDIRECT_URI`
  - `GTM_OAUTH_STATE_SECRET`
  - `SECRETS_ENCRYPTION_KEY`

### 2. Feature Flag
- ✅ Enable `auto_apply_v1=true` in environment or feature flags

### 3. User Role
- ✅ Admin or Owner role in test project

### 4. GTM Account
- ✅ Google Tag Manager account with at least one container
- ✅ Workspace available for testing

---

## Test Flow

### Step 1: Connect GTM ✅

**Action**:
1. Navigate to `/projects/{project_id}/integrations/gtm/connect`
2. Click "Connect GTM" button
3. Authorize in Google OAuth consent screen
4. Wait for redirect back to app

**Expected**:
- ✅ Redirect to Google OAuth
- ✅ OAuth consent screen appears
- ✅ After authorization, redirect to `/integrations/gtm/connect?success=true&connection_id={id}`
- ✅ Success message displayed

**Validation**:
```sql
-- Check source_connections
SELECT * FROM source_connections 
WHERE type = 'GTM' 
AND status = 'active' 
ORDER BY created_at DESC LIMIT 1;

-- Check secret_refs (tokens encrypted)
SELECT key_name, expires_at 
FROM secret_refs 
WHERE connection_id = '{connection_id}';

-- Check audit_logs
SELECT * FROM audit_logs 
WHERE action = 'GTM_CONNECT' 
ORDER BY created_at DESC LIMIT 1;
```

---

### Step 2: Select Target Configuration ✅

**Action**:
1. In Connect GTM page, select:
   - Account from dropdown
   - Container from dropdown
   - Workspace from dropdown
2. Click "Create Apply Target"

**Expected**:
- ✅ Dropdowns populated with real GTM data
- ✅ Target created successfully
- ✅ Redirect to integrations page with success message

**Validation**:
```sql
-- Check integration_apply_targets
SELECT * FROM integration_apply_targets 
WHERE type = 'GTM' 
AND project_id = '{project_id}' 
ORDER BY created_at DESC LIMIT 1;

-- Verify config_json contains:
-- - account_id
-- - container_id
-- - workspace_id
-- - container_public_id (GTM-XXXXX)
```

---

### Step 3: Generate Fix Pack ✅

**Action**:
1. Navigate to `/projects/{project_id}/tracking`
2. Run tracking verification on a page
3. Wait for issues to be detected
4. Fix pack should be auto-generated

**Expected**:
- ✅ Tracking issues detected (e.g., missing Meta Pixel, GA4)
- ✅ Fix pack created with proposed fixes
- ✅ Fix pack appears in `/projects/{project_id}/fix-packs`

**Validation**:
```sql
-- Check tracking_fix_packs
SELECT * FROM tracking_fix_packs 
WHERE project_id = '{project_id}' 
ORDER BY created_at DESC LIMIT 1;

-- Verify fixes_json contains:
-- - type (META_PIXEL, GA4, etc.)
-- - snippet (code to apply)
-- - description
```

---

### Step 4: Dry-Run Preview ✅

**Action**:
1. Navigate to `/projects/{project_id}/fix-packs`
2. Click "Apply Fix" button on a fix pack
3. Select GTM target from dropdown
4. Click "Preview Changes" (dry-run)

**Expected**:
- ✅ Modal opens with target selector
- ✅ Dry-run executes (no actual changes)
- ✅ Preview shows:
  - Tags to create (e.g., "LaunchSin - Meta Pixel")
  - Tags to update (if any)
  - Estimated changes count
- ✅ No job created in `apply_jobs` (dry-run only)

**Validation**:
```sql
-- Verify NO job created for dry-run
SELECT COUNT(*) FROM apply_jobs 
WHERE created_at > NOW() - INTERVAL '5 minutes';
-- Should be 0
```

---

### Step 5: Apply Fix ✅

**Action**:
1. After dry-run preview, click "Aplicar Agora"
2. Wait for job to process

**Expected**:
- ✅ Job created with status 'queued'
- ✅ Worker claims job (status → 'running')
- ✅ Snapshot created BEFORE apply
- ✅ Tags created/updated in GTM workspace
- ✅ Version created: "LaunchSin Apply {timestamp}"
- ✅ Verify job triggered automatically
- ✅ Job status → 'ok'
- ✅ Success message with job ID

**Validation**:
```sql
-- Check apply_jobs
SELECT * FROM apply_jobs 
WHERE type = 'APPLY_FIX' 
ORDER BY created_at DESC LIMIT 1;

-- Check apply_snapshots
SELECT * FROM apply_snapshots 
WHERE apply_job_id = '{job_id}';

-- Check result_json contains:
-- - applied_tag_ids
-- - created_version_id
-- - published (true/false)
-- - verify_job_id

-- Check verify_jobs
SELECT * FROM verify_jobs 
WHERE id = '{verify_job_id}';
```

**GTM Verification**:
1. Open GTM workspace in browser
2. Navigate to Tags section
3. Verify tags exist:
   - "LaunchSin - Meta Pixel" (if Meta fix applied)
   - "LaunchSin - GA4 Config" (if GA4 fix applied)
4. Check Versions section
5. Verify version created: "LaunchSin Apply {timestamp}"

---

### Step 6: Verify Tracking ✅

**Action**:
1. Wait for verify job to complete
2. Check verification results

**Expected**:
- ✅ Verify job status → 'ok'
- ✅ Tracking issues resolved
- ✅ Metrics incremented:
  - `auto_apply_jobs_total{type="APPLY_FIX", result="ok"}`
  - `auto_apply_verify_triggered_total`

**Validation**:
```sql
-- Check verify job result
SELECT * FROM verify_jobs 
WHERE id = '{verify_job_id}';

-- Check tracking issues resolved
SELECT * FROM tracking_issues 
WHERE page_url = '{page_url}' 
AND resolved_at IS NOT NULL;
```

---

### Step 7: Rollback ✅

**Action**:
1. In Fix Packs page, click "Rollback" button
2. Confirm rollback
3. Wait for rollback job to process

**Expected**:
- ✅ Rollback job created with status 'queued'
- ✅ Worker processes rollback
- ✅ Snapshot loaded
- ✅ Added tags deleted from GTM
- ✅ Version created: "LaunchSin Rollback {timestamp}"
- ✅ Verify job triggered
- ✅ Rollback job status → 'ok'

**Validation**:
```sql
-- Check rollback job
SELECT * FROM apply_jobs 
WHERE type = 'ROLLBACK_FIX' 
ORDER BY created_at DESC LIMIT 1;

-- Check result_json contains:
-- - restored_version
-- - deleted_tags
-- - verify_job_id

-- Check audit_logs
SELECT * FROM audit_logs 
WHERE action = 'ROLLBACK_FIX_GTM' 
ORDER BY created_at DESC LIMIT 1;
```

**GTM Verification**:
1. Open GTM workspace
2. Verify tags deleted:
   - "LaunchSin - Meta Pixel" (removed)
   - "LaunchSin - GA4 Config" (removed)
3. Check Versions section
4. Verify rollback version created

---

### Step 8: Verify Restoration ✅

**Action**:
1. Wait for verify job to complete
2. Check that tracking issues are back (as expected after rollback)

**Expected**:
- ✅ Verify job completes
- ✅ Tracking issues detected again (rollback successful)
- ✅ Metrics incremented:
  - `auto_apply_rollbacks_total`

---

## Success Criteria

- ✅ **OAuth**: GTM connected successfully
- ✅ **Target**: Apply target created
- ✅ **Fix Pack**: Generated with proposed fixes
- ✅ **Dry-Run**: Preview shows accurate diff
- ✅ **Apply**: Job processes successfully
- ✅ **Snapshot**: Created before apply
- ✅ **GTM Tags**: Created/updated correctly
- ✅ **Version**: Created in GTM
- ✅ **Verify**: Triggered automatically
- ✅ **Rollback**: Restores previous state
- ✅ **Audit Logs**: All actions logged
- ✅ **No PII**: Zero leaks in responses
- ✅ **No Errors**: Console/logs clean

---

## Known Limitations

### Without Real OAuth Credentials
- OAuth flow will fail (expected)
- Use stub/mock mode for development
- Real testing requires Google Cloud project

### Feature Flag Disabled
- Apply button won't appear
- Enable `auto_apply_v1=true` to test

### Worker Not Running
- Jobs will stay in 'queued' status
- Start worker: `npm run worker:dev`

---

## Troubleshooting

### OAuth Fails
- Check `GTM_OAUTH_CLIENT_ID` and `GTM_OAUTH_CLIENT_SECRET`
- Verify redirect URI matches Google Cloud Console
- Check state HMAC secret configured

### Worker Doesn't Process Jobs
- Verify worker is running
- Check worker logs for errors
- Ensure GTM client can access tokens from secret_refs

### GTM API Errors
- Check access token not expired
- Verify GTM API enabled in Google Cloud
- Check scopes: `tagmanager.edit.containers`

### Tags Not Created
- Check GTM workspace permissions
- Verify container ID correct
- Check worker logs for API errors

---

## Test Report Template

```markdown
# E2E Auto-Apply Test Report

**Date**: {date}
**Tester**: {name}
**Environment**: {staging/production}

## Results

- [ ] Step 1: Connect GTM
- [ ] Step 2: Select Target
- [ ] Step 3: Generate Fix Pack
- [ ] Step 4: Dry-Run Preview
- [ ] Step 5: Apply Fix
- [ ] Step 6: Verify Tracking
- [ ] Step 7: Rollback
- [ ] Step 8: Verify Restoration

## Issues Found

{list any issues}

## Screenshots

{attach screenshots}

## Conclusion

{PASS/FAIL with notes}
```

---

## Next Steps After E2E Pass

1. ✅ Deploy to staging
2. ✅ Run E2E test on staging
3. ✅ Enable feature flag for beta users
4. ✅ Monitor metrics and logs
5. ✅ Gradual rollout to production
6. ✅ Full production release

---

**End of E2E Test Guide**
