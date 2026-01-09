-- ============================================================
-- Migration 0013: Audit Logs (MINIMAL)
-- Sprint 2.6 PR #2 - Action Executor + Audit Trail
-- ============================================================
-- ULTRA SIMPLE: No dependencies, no foreign keys, no complex RLS

BEGIN;

-- Drop existing table if any issues
DROP TABLE IF EXISTS audit_logs CASCADE;

-- Create simple audit logs table
CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    project_id uuid,
    actor_user_id uuid NOT NULL,
    action_type text NOT NULL,
    entity_type text,
    entity_id text,
    metadata_json jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

-- Simple indexes
CREATE INDEX idx_audit_logs_project ON audit_logs(project_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id, created_at DESC);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Simple RLS: users see their own actions
CREATE POLICY audit_logs_policy ON audit_logs
    FOR ALL
    USING (actor_user_id = auth.uid())
    WITH CHECK (actor_user_id = auth.uid());

COMMIT;

-- Done! Backend handles RBAC and tenant scoping.
