-- ============================================================
-- Migration 0017: Auto-Apply GTM (1-Click Fix Application)
-- Sprint 2.7 - Auto-Apply Fixes via Integrations
-- ============================================================
-- IDEMPOTENT: Safe to run multiple times
-- Dependencies: 0016_perf_metrics_cost.sql

BEGIN;

-- ============================================================
-- A) INTEGRATION APPLY TARGETS
-- ============================================================
-- Stores GTM containers/workspaces that can receive auto-applied fixes

CREATE TABLE IF NOT EXISTS integration_apply_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    connection_id uuid NOT NULL, -- FK to source_connections
    
    -- Target type and display
    type text NOT NULL, -- 'GTM' (v1), future: 'VERCEL', 'GITHUB'
    display_name text NOT NULL,
    
    -- Configuration (NO SECRETS - secrets in secret_refs)
    config_json jsonb NOT NULL, -- { container_id, workspace_id, environment }
    
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_apply_targets_project_type
    ON integration_apply_targets(project_id, type);

-- ============================================================
-- B) APPLY JOBS
-- ============================================================
-- Tracks apply/rollback job execution

CREATE TABLE IF NOT EXISTS apply_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid, -- Who triggered (null for automated)
    
    -- Job type and status
    type text NOT NULL, -- 'APPLY_FIX' | 'ROLLBACK_FIX'
    status text NOT NULL, -- 'queued' | 'running' | 'ok' | 'error'
    
    -- Payload and results
    payload_json jsonb NOT NULL, -- { fixpack_id, target_id, mode, dry_run }
    result_json jsonb, -- { applied_tag_ids, version, verify_job_id, diff }
    
    -- Correlation and timing
    correlation_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz,
    
    -- Error handling
    error_message_redacted text -- Redacted error (no secrets)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_apply_jobs_project_created
    ON apply_jobs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_apply_jobs_status
    ON apply_jobs(status, created_at DESC)
    WHERE status IN ('queued', 'running');

-- ============================================================
-- C) APPLY SNAPSHOTS
-- ============================================================
-- Stores GTM state before apply (for rollback)

CREATE TABLE IF NOT EXISTS apply_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    target_id uuid NOT NULL, -- FK to integration_apply_targets
    apply_job_id uuid, -- Optional: link to apply_job
    
    -- Snapshot type and data
    snapshot_type text NOT NULL, -- 'GTM_WORKSPACE_STATE' | 'GTM_CONTAINER_VERSION'
    snapshot_json jsonb NOT NULL, -- Minimal data for rollback
    
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_apply_snapshots_target_created
    ON apply_snapshots(target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_apply_snapshots_job
    ON apply_snapshots(apply_job_id)
    WHERE apply_job_id IS NOT NULL;

-- ============================================================
-- D) RLS POLICIES
-- ============================================================

-- integration_apply_targets
ALTER TABLE integration_apply_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_apply_targets_select ON integration_apply_targets;
CREATE POLICY integration_apply_targets_select ON integration_apply_targets
    FOR SELECT
    USING (
        org_id IN (
            SELECT om.org_id 
            FROM org_members om 
            WHERE om.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS integration_apply_targets_insert ON integration_apply_targets;
CREATE POLICY integration_apply_targets_insert ON integration_apply_targets
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT om.org_id 
            FROM org_members om 
            WHERE om.user_id = auth.uid()
            AND om.role IN ('admin', 'owner')
        )
    );

DROP POLICY IF EXISTS integration_apply_targets_update ON integration_apply_targets;
CREATE POLICY integration_apply_targets_update ON integration_apply_targets
    FOR UPDATE
    USING (
        org_id IN (
            SELECT om.org_id 
            FROM org_members om 
            WHERE om.user_id = auth.uid()
            AND om.role IN ('admin', 'owner')
        )
    );

DROP POLICY IF EXISTS integration_apply_targets_delete ON integration_apply_targets;
CREATE POLICY integration_apply_targets_delete ON integration_apply_targets
    FOR DELETE
    USING (
        org_id IN (
            SELECT om.org_id 
            FROM org_members om 
            WHERE om.user_id = auth.uid()
            AND om.role IN ('admin', 'owner')
        )
    );

-- apply_jobs
ALTER TABLE apply_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apply_jobs_select ON apply_jobs;
CREATE POLICY apply_jobs_select ON apply_jobs
    FOR SELECT
    USING (
        org_id IN (
            SELECT om.org_id 
            FROM org_members om 
            WHERE om.user_id = auth.uid()
        )
    );

-- INSERT: Admin/Owner only (enforced via server RBAC, but RLS as backup)
DROP POLICY IF EXISTS apply_jobs_insert ON apply_jobs;
CREATE POLICY apply_jobs_insert ON apply_jobs
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT om.org_id 
            FROM org_members om 
            WHERE om.user_id = auth.uid()
            AND om.role IN ('admin', 'owner')
        )
    );

-- UPDATE/DELETE: Blocked (jobs are immutable after creation)
-- No policies = no one can update/delete

-- apply_snapshots
ALTER TABLE apply_snapshots ENABLE ROW LEVEL SECURITY;

-- SELECT: Viewer+ can read (for audit/rollback visibility)
DROP POLICY IF EXISTS apply_snapshots_select ON apply_snapshots;
CREATE POLICY apply_snapshots_select ON apply_snapshots
    FOR SELECT
    USING (
        org_id IN (
            SELECT om.org_id 
            FROM org_members om 
            WHERE om.user_id = auth.uid()
        )
    );

-- INSERT: Service role only (worker creates snapshots)
-- No policy for regular users = only service role can insert

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these after migration to verify:

-- 1. Check tables exist
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_name IN ('integration_apply_targets', 'apply_jobs', 'apply_snapshots');

-- 2. Check indexes
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename IN ('integration_apply_targets', 'apply_jobs', 'apply_snapshots');

-- 3. Check RLS enabled
-- SELECT relname, relrowsecurity 
-- FROM pg_class 
-- WHERE relname IN ('integration_apply_targets', 'apply_jobs', 'apply_snapshots');

-- 4. Check policies
-- SELECT tablename, policyname, cmd 
-- FROM pg_policies 
-- WHERE tablename IN ('integration_apply_targets', 'apply_jobs', 'apply_snapshots');
