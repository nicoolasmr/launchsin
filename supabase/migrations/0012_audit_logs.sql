-- ============================================================
-- Migration 0012: Audit Logs (SIMPLIFIED)
-- Sprint 2.6 PR #2 - Action Executor + Audit Trail
-- ============================================================
-- IDEMPOTENT: Safe to run multiple times
-- NO DEPENDENCIES: Standalone table

BEGIN;

-- ============================================================
-- A) AUDIT_LOGS TABLE (NO FOREIGN KEYS)
-- ============================================================
-- Stores all user actions for compliance and debugging
-- CRITICAL: metadata_json must NEVER contain secrets/tokens

CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    project_id uuid,
    
    -- Actor
    actor_user_id uuid NOT NULL,
    
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
    ON audit_logs(project_id, created_at DESC);

-- Query by actor
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created 
    ON audit_logs(actor_user_id, created_at DESC);

-- ============================================================
-- C) RLS POLICIES (SIMPLIFIED)
-- ============================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: Allow all authenticated users to read their own actions
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT
    USING (actor_user_id = auth.uid());

-- INSERT: Allow all authenticated users to insert
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT
    WITH CHECK (actor_user_id = auth.uid());

-- UPDATE/DELETE: Blocked (audit logs are immutable)
-- No policies = no one can update/delete

COMMIT;

-- ============================================================
-- NOTES
-- ============================================================
-- This migration creates a standalone audit_logs table with:
-- - NO foreign key constraints (to avoid dependency issues)
-- - Simple RLS based on actor_user_id only
-- - Backend will enforce additional RBAC and tenant scoping
-- - org_id and project_id stored for filtering but not enforced by DB
