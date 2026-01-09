-- ============================================================
-- Migration 0012: Audit Logs
-- Sprint 2.6 PR #2 - Action Executor + Audit Trail
-- ============================================================
-- IDEMPOTENT: Safe to run multiple times
-- Dependencies: 0011_alignment_autofix_timeline_perf.sql

BEGIN;

-- ============================================================
-- A) AUDIT_LOGS TABLE
-- ============================================================
-- Stores all user actions for compliance and debugging
-- CRITICAL: metadata_json must NEVER contain secrets/tokens

CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Actor
    actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Action details
    action_type text NOT NULL,
    -- Examples: GENERATE_FIX_PACK, VERIFY_TRACKING, TRIGGER_ALIGNMENT_CHECK, RESOLVE_ALERT
    
    entity_type text,
    -- Examples: fix_pack, alignment_job, alignment_alert
    
    entity_id text,
    -- UUID or identifier of affected entity
    
    -- Metadata (REDACTED - no secrets)
    metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Example: {"page_url": "https://example.com", "result": "success"}
    -- NEVER: {"api_key": "sk-...", "token": "Bearer ..."}
    
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- B) INDEXES
-- ============================================================

-- Query by project (most common)
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_created 
    ON audit_logs(project_id, created_at DESC)
    WHERE project_id IS NOT NULL;

-- Query by actor
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created 
    ON audit_logs(actor_user_id, created_at DESC);

-- ============================================================
-- C) RLS POLICIES
-- ============================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: Project members can read (viewer+)
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT
    USING (
        project_id IN (
            SELECT pm.project_id 
            FROM project_members pm 
            WHERE pm.user_id = auth.uid()
        )
    );

-- INSERT: Admin/Owner only (enforced in backend, but policy for safety)
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT pm.project_id 
            FROM project_members pm 
            WHERE pm.user_id = auth.uid() 
            AND pm.role IN ('admin', 'owner')
        )
    );

-- UPDATE/DELETE: Blocked (audit logs are immutable)
-- No policies = no one can update/delete

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these after migration to verify:

-- 1. Check table exists
-- SELECT COUNT(*) FROM audit_logs;

-- 2. Check indexes
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename = 'audit_logs';

-- 3. Check RLS enabled
-- SELECT relname, relrowsecurity 
-- FROM pg_class 
-- WHERE relname = 'audit_logs';

-- 4. Test insert (as admin)
-- INSERT INTO audit_logs (org_id, actor_user_id, action_type, metadata_json)
-- VALUES ('org-uuid', auth.uid(), 'TEST_ACTION', '{"test": true}'::jsonb);
