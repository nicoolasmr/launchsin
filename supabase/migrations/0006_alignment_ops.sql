-- Migration: Alignment Operations Schema
-- Description: Tables and functions to support operational alignment intelligence
-- Author: Antigravity
-- Date: 2026-01-06

-- ============================================================================
-- TABLE: alignment_settings
-- Purpose: Per-project configuration for alignment checks
-- ============================================================================
CREATE TABLE IF NOT EXISTS alignment_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Operational settings
    enabled BOOLEAN DEFAULT FALSE,
    cadence TEXT CHECK (cadence IN ('daily', 'weekly')) DEFAULT 'weekly',
    max_checks_per_day INT DEFAULT 50,
    min_score_alert_threshold INT DEFAULT 70,
    quiet_hours_json JSONB NULL, -- { "start": "22:00", "end": "08:00", "timezone": "America/Sao_Paulo" }
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(project_id)
);

-- Index for org-level queries
CREATE INDEX IF NOT EXISTS idx_alignment_settings_org ON alignment_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_alignment_settings_enabled ON alignment_settings(enabled) WHERE enabled = TRUE;

-- ============================================================================
-- TABLE: alignment_runs
-- Purpose: Audit trail for all alignment check operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS alignment_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_connection_id UUID NULL REFERENCES source_connections(id) ON DELETE SET NULL,
    
    -- Run metadata
    mode TEXT CHECK (mode IN ('manual', 'scheduled')) NOT NULL,
    status TEXT CHECK (status IN ('running', 'success', 'failed')) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ NULL,
    
    -- Metrics
    checks_count INT DEFAULT 0,
    failures_count INT DEFAULT 0,
    cost_estimated NUMERIC(10, 4) NULL, -- Estimated OpenAI API cost in USD
    
    -- Observability
    correlation_id TEXT NULL, -- For distributed tracing
    last_error TEXT NULL
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_alignment_runs_project ON alignment_runs(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_alignment_runs_org ON alignment_runs(org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_alignment_runs_status ON alignment_runs(status) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_alignment_runs_correlation ON alignment_runs(correlation_id) WHERE correlation_id IS NOT NULL;

-- ============================================================================
-- TABLE: alignment_cache
-- Purpose: TTL-based cache to reduce OpenAI API costs
-- ============================================================================
CREATE TABLE IF NOT EXISTS alignment_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Cache key and data
    cache_key TEXT NOT NULL, -- SHA256(ad_id + landing_url + creative_hash + page_hash + prompt_version)
    expires_at TIMESTAMPTZ NOT NULL,
    payload_json JSONB NOT NULL, -- Cached alignment result
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(project_id, cache_key)
);

-- Index for cache lookups
CREATE INDEX IF NOT EXISTS idx_alignment_cache_lookup ON alignment_cache(project_id, cache_key, expires_at);
CREATE INDEX IF NOT EXISTS idx_alignment_cache_expiry ON alignment_cache(expires_at);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE alignment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE alignment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alignment_cache ENABLE ROW LEVEL SECURITY;

-- alignment_settings policies
CREATE POLICY alignment_settings_select ON alignment_settings
    FOR SELECT
    USING (
        org_id IN (
            SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
        )
        AND project_id IN (
            SELECT pm.project_id FROM project_members pm WHERE pm.user_id = auth.uid()
        )
    );

CREATE POLICY alignment_settings_insert ON alignment_settings
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT om.org_id FROM org_members om 
            WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'owner')
        )
        AND project_id IN (
            SELECT pm.project_id FROM project_members pm 
            WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'owner')
        )
    );

CREATE POLICY alignment_settings_update ON alignment_settings
    FOR UPDATE
    USING (
        org_id IN (
            SELECT om.org_id FROM org_members om 
            WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'owner')
        )
        AND project_id IN (
            SELECT pm.project_id FROM project_members pm 
            WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'owner')
        )
    );

CREATE POLICY alignment_settings_delete ON alignment_settings
    FOR DELETE
    USING (
        org_id IN (
            SELECT om.org_id FROM org_members om 
            WHERE om.user_id = auth.uid() AND om.role = 'owner'
        )
    );

-- alignment_runs policies
CREATE POLICY alignment_runs_select ON alignment_runs
    FOR SELECT
    USING (
        org_id IN (
            SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
        )
        AND project_id IN (
            SELECT pm.project_id FROM project_members pm WHERE pm.user_id = auth.uid()
        )
    );

CREATE POLICY alignment_runs_insert ON alignment_runs
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT om.org_id FROM org_members om 
            WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'owner')
        )
        AND project_id IN (
            SELECT pm.project_id FROM project_members pm 
            WHERE pm.user_id = auth.uid() AND pm.role IN ('admin', 'owner')
        )
    );

CREATE POLICY alignment_runs_update ON alignment_runs
    FOR UPDATE
    USING (
        org_id IN (
            SELECT om.org_id FROM org_members om 
            WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'owner')
        )
    );

-- alignment_cache policies (same as runs)
CREATE POLICY alignment_cache_select ON alignment_cache
    FOR SELECT
    USING (
        org_id IN (
            SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
        )
        AND project_id IN (
            SELECT pm.project_id FROM project_members pm WHERE pm.user_id = auth.uid()
        )
    );

CREATE POLICY alignment_cache_insert ON alignment_cache
    FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
        )
        AND project_id IN (
            SELECT pm.project_id FROM project_members pm WHERE pm.user_id = auth.uid()
        )
    );

CREATE POLICY alignment_cache_delete ON alignment_cache
    FOR DELETE
    USING (
        org_id IN (
            SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid()
        )
    );

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Drop existing functions to ensure idempotency
DROP FUNCTION IF EXISTS get_project_alignment_summary(UUID);
DROP FUNCTION IF EXISTS get_alignment_health_inputs(UUID);

-- Function: Get project alignment summary (7-day metrics)
CREATE OR REPLACE FUNCTION get_project_alignment_summary(p_project_id UUID)
RETURNS TABLE (
    score_avg_7d NUMERIC,
    below_threshold_count INT,
    top_issues TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(AVG(ar.score), 0)::NUMERIC AS score_avg_7d,
        COUNT(*) FILTER (
            WHERE ar.score < (
                SELECT min_score_alert_threshold 
                FROM alignment_settings 
                WHERE project_id = p_project_id
            )
        )::INT AS below_threshold_count,
        ARRAY_AGG(DISTINCT ar.reasons[1] ORDER BY ar.reasons[1]) FILTER (WHERE ar.reasons IS NOT NULL) AS top_issues
    FROM alignment_reports ar
    WHERE ar.project_id = p_project_id
      AND ar.created_at >= NOW() - INTERVAL '7 days'
    GROUP BY ar.project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get alignment health inputs (for Health Score calculation)
CREATE OR REPLACE FUNCTION get_alignment_health_inputs(p_project_id UUID)
RETURNS TABLE (
    last_run_at TIMESTAMPTZ,
    avg_score_7d NUMERIC,
    failed_runs_count INT,
    cache_hit_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        MAX(ar_runs.started_at) AS last_run_at,
        COALESCE(AVG(ar_reports.score), 0)::NUMERIC AS avg_score_7d,
        COUNT(*) FILTER (WHERE ar_runs.status = 'failed')::INT AS failed_runs_count,
        CASE 
            WHEN COUNT(*) > 0 THEN 
                (COUNT(*) FILTER (WHERE ac.id IS NOT NULL)::NUMERIC / COUNT(*)::NUMERIC)
            ELSE 0
        END AS cache_hit_rate
    FROM alignment_runs ar_runs
    LEFT JOIN alignment_reports ar_reports ON ar_reports.project_id = ar_runs.project_id
        AND ar_reports.created_at >= NOW() - INTERVAL '7 days'
    LEFT JOIN alignment_cache ac ON ac.project_id = ar_runs.project_id
        AND ac.expires_at > NOW()
    WHERE ar_runs.project_id = p_project_id
      AND ar_runs.started_at >= NOW() - INTERVAL '7 days'
    GROUP BY ar_runs.project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Drop existing trigger function
DROP FUNCTION IF EXISTS update_alignment_settings_updated_at() CASCADE;

-- Trigger: Update updated_at on alignment_settings
CREATE OR REPLACE FUNCTION update_alignment_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_alignment_settings_updated_at
    BEFORE UPDATE ON alignment_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_alignment_settings_updated_at();

-- ============================================================================
-- CLEANUP FUNCTION (for expired cache)
-- ============================================================================

-- Drop existing cleanup function
DROP FUNCTION IF EXISTS cleanup_expired_alignment_cache();

-- Function: Clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_alignment_cache()
RETURNS INT AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM alignment_cache
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: This function should be called periodically by a cron job or worker
-- Example: SELECT cleanup_expired_alignment_cache();
