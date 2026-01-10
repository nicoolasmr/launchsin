# Manual Smoke Test - Auto-Apply GTM

## Test Scenario (Phase H4)

**Objective**: Validate end-to-end auto-apply flow from fix creation to rollback

**Prerequisites**:
- GTM OAuth configured
- At least one GTM target created
- Feature flag `auto_apply_v1` enabled
- Admin/Owner role

---

## Test Steps

### 1. Create Fix Pack

**Action**:
1. Navigate to Fix Packs page
2. Create new fix pack with GTM tags
3. Verify fix pack created successfully

**Expected**:
- Fix pack appears in list
- "Apply Fix" button visible (if feature flag enabled)

---

### 2. Dry Run Preview

**Action**:
1. Click "Apply Fix" button
2. Select GTM target from dropdown
3. Click "Preview Changes"

**Expected**:
- Modal shows loading state
- Dry-run result displays:
  - Tags to create
  - Tags to update
  - Estimated changes count
- No actual changes made to GTM

**Validation**:
```bash
# Check apply_jobs table
SELECT * FROM apply_jobs WHERE status = 'queued' ORDER BY created_at DESC LIMIT 1;

# Should be empty (dry-run doesn't create jobs)
```

---

### 3. Apply Fix

**Action**:
1. Review dry-run preview
2. Click "Aplicar Agora" button
3. Wait for completion

**Expected**:
- Button shows "Applying..." with spinner
- Job created in database
- Worker processes job
- Success message displayed
- Job ID shown
- "View Verification" link visible
- "Rollback" button visible

**Validation**:
```bash
# Check apply_jobs table
SELECT id, type, status, result_json FROM apply_jobs 
WHERE type = 'APPLY_FIX' 
ORDER BY created_at DESC LIMIT 1;

# Expected: status = 'ok', result_json contains applied_tag_ids

# Check apply_snapshots table
SELECT * FROM apply_snapshots 
WHERE apply_job_id = '<job_id_from_above>';

# Expected: Snapshot created before apply
```

---

### 4. Verify Tracking

**Action**:
1. Click "View Verification" link
2. Review verification results

**Expected**:
- Redirects to tracking verify page
- Verification job triggered automatically
- GTM tags firing correctly

**Validation**:
```bash
# Check verify_jobs table (if exists)
SELECT * FROM verify_jobs 
WHERE correlation_id LIKE '%apply%' 
ORDER BY created_at DESC LIMIT 1;
```

---

### 5. Rollback

**Action**:
1. Return to apply modal or job status page
2. Click "Rollback" button
3. Confirm rollback

**Expected**:
- Rollback job created
- Worker processes rollback
- GTM restored to previous state
- Success message displayed

**Validation**:
```bash
# Check apply_jobs table
SELECT id, type, status, result_json FROM apply_jobs 
WHERE type = 'ROLLBACK_FIX' 
ORDER BY created_at DESC LIMIT 1;

# Expected: status = 'ok', result_json contains restored_version

# Check GTM (manual)
# - Previous tags removed
# - Container version restored
```

---

## Success Criteria

- [ ] Fix pack created successfully
- [ ] Dry-run preview shows accurate diff
- [ ] Apply creates job and processes successfully
- [ ] Snapshot created before apply
- [ ] GTM tags created/updated correctly
- [ ] Verification triggered automatically
- [ ] Rollback restores previous state
- [ ] All audit logs created
- [ ] No PII leaked in responses
- [ ] No errors in console/logs

---

## Rollback Procedure (If Test Fails)

1. **Manual GTM Rollback**:
   - Go to GTM UI
   - Navigate to Versions
   - Find version before test
   - Click "Restore"

2. **Clean Database**:
   ```sql
   -- Delete test jobs
   DELETE FROM apply_jobs WHERE created_at > NOW() - INTERVAL '1 hour';
   
   -- Delete test snapshots
   DELETE FROM apply_snapshots WHERE created_at > NOW() - INTERVAL '1 hour';
   ```

3. **Verify Clean State**:
   - Check GTM container
   - Check database tables
   - Check audit logs

---

## Known Limitations (STUB Implementation)

- OAuth not fully implemented (requires Google Cloud credentials)
- GTM API client is mock (no real API calls)
- Worker processes jobs but doesn't interact with GTM
- Metrics not integrated in workers

**To Enable Full Functionality**:
1. Add GTM OAuth credentials to environment
2. Implement GTM API client (server/src/integrations/gtm-client.ts)
3. Integrate metrics in workers
4. Test with real GTM container

---

## Related Documentation
- [AUTO_APPLY_GTM.md](../06_runbooks/AUTO_APPLY_GTM.md)
- [GTM Integration Guide](../03_integrations/gtm.md)
