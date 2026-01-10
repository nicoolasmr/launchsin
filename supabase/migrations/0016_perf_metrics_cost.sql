-- ============================================================
-- Migration 0016: Performance Metrics + Cost Tracking
-- Sprint 2.6 PR #4 - Performance + Metrics
-- ============================================================
-- IDEMPOTENT: Safe to run multiple times
-- Dependencies: 0011_alignment_autofix_timeline_perf.sql

BEGIN;

-- ============================================================
-- A) ALIGNMENT CACHE METADATA
-- ============================================================
-- Add cache-related columns to alignment_reports_v2

ALTER TABLE alignment_reports_v2
    ADD COLUMN IF NOT EXISTS cached_from_report_id uuid,
    ADD COLUMN IF NOT EXISTS cache_key text,
    ADD COLUMN IF NOT EXISTS cached_at timestamptz,
    ADD COLUMN IF NOT EXISTS cache_expires_at timestamptz;

-- Index for cache lookup (tenant-safe, 7-day TTL)
CREATE INDEX IF NOT EXISTS idx_alignment_reports_cache_key_recent
    ON alignment_reports_v2(project_id, cache_key, created_at DESC)
    WHERE cache_key IS NOT NULL;

-- ============================================================
-- B) AI USAGE EVENTS TABLE
-- ============================================================
-- Tracks LLM usage and costs per org/project

CREATE TABLE IF NOT EXISTS ai_usage_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid,  -- optional: who triggered (for manual actions)
    
    -- Source and model
    source text NOT NULL,  -- 'alignment', 'crm', etc.
    model text NOT NULL,   -- 'gpt-4o', 'gpt-4o-mini', etc.
    
    -- Token usage
    tokens_prompt int NOT NULL DEFAULT 0,
    tokens_completion int NOT NULL DEFAULT 0,
    
    -- Cost in USD
    cost_usd numeric(12,6) NOT NULL DEFAULT 0,
    
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- C) INDEXES FOR AI USAGE EVENTS
-- ============================================================

-- Query by org + day (for org-level cost aggregation)
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_org_day
    ON ai_usage_events(org_id, created_at DESC);

-- Query by project + day (for project-level cost aggregation)
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_project_day
    ON ai_usage_events(project_id, created_at DESC);

-- ============================================================
-- D) RLS POLICIES FOR AI USAGE EVENTS
-- ============================================================

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

-- SELECT: Org members can read (viewer+)
DROP POLICY IF EXISTS ai_usage_events_select ON ai_usage_events;
CREATE POLICY ai_usage_events_select ON ai_usage_events
    FOR SELECT
    USING (
        org_id IN (
            SELECT om.org_id 
            FROM org_members om 
            WHERE om.user_id = auth.uid()
        )
    );

-- INSERT: Service role only (backend/worker inserts)
-- No policy for regular users = only service role can insert

-- UPDATE/DELETE: Blocked (immutable audit trail)
-- No policies = no one can update/delete

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these after migration to verify:

-- 1. Check cache columns exist
-- SELECT cached_from_report_id, cache_key, cached_at, cache_expires_at 
-- FROM alignment_reports_v2 LIMIT 1;

-- 2. Check ai_usage_events table exists
-- SELECT COUNT(*) FROM ai_usage_events;

-- 3. Check indexes
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename IN ('alignment_reports_v2', 'ai_usage_events');

-- 4. Check RLS enabled
-- SELECT relname, relrowsecurity 
-- FROM pg_class 
-- WHERE relname = 'ai_usage_events';
