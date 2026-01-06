-- Migration: 0005_alignment_intelligence.sql
-- Description: AI-powered ad-to-page alignment analysis
-- Phase: Sprint 1.2 - Phase 23

-- ============================================================================
-- 1. ALIGNMENT REPORTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS alignment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_connection_id UUID NOT NULL REFERENCES source_connections(id) ON DELETE CASCADE,
    
    -- Ad and page references
    ad_id TEXT NOT NULL,
    ad_name TEXT,
    landing_url TEXT NOT NULL,
    
    -- Analysis results
    score INT NOT NULL CHECK (score >= 0 AND score <= 100),
    
    -- Detailed findings (array of issue objects)
    reasons_json JSONB NOT NULL DEFAULT '[]',
    -- Example: [{"type": "message_mismatch", "severity": "high", "description": "Ad promises X but page shows Y"}]
    
    -- Evidence collected
    evidence_json JSONB NOT NULL DEFAULT '{}',
    -- Example: {"ad_copy": "...", "page_title": "...", "page_h1": "...", "has_pixel": true, "has_utm": true}
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    analyzed_by TEXT DEFAULT 'gpt-4', -- AI model used
    
    -- Index for lookups
    CONSTRAINT unique_alignment_check UNIQUE (source_connection_id, ad_id, landing_url)
);

-- ============================================================================
-- 2. INDICES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_alignment_reports_project 
    ON alignment_reports(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alignment_reports_connection 
    ON alignment_reports(source_connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alignment_reports_score 
    ON alignment_reports(score) WHERE score < 70; -- Low scores for alerts

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

ALTER TABLE alignment_reports ENABLE ROW LEVEL SECURITY;

-- SELECT: Project members can view reports
DROP POLICY IF EXISTS "alignment_reports_select_policy" ON alignment_reports;
CREATE POLICY "alignment_reports_select_policy" ON alignment_reports
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM projects
            JOIN org_members ON org_members.org_id = projects.org_id
            WHERE projects.id = alignment_reports.project_id
            AND org_members.user_id = auth.uid()
        )
    );

-- INSERT: Only ADMIN/OWNER (or service role for automated checks)
DROP POLICY IF EXISTS "alignment_reports_insert_policy" ON alignment_reports;
CREATE POLICY "alignment_reports_insert_policy" ON alignment_reports
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            JOIN org_members ON org_members.org_id = projects.org_id
            WHERE projects.id = alignment_reports.project_id
            AND org_members.user_id = auth.uid()
            AND org_members.role IN ('admin', 'owner')
        )
    );

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Get alignment summary for a project
CREATE OR REPLACE FUNCTION get_project_alignment_summary(p_project_id UUID)
RETURNS TABLE(
    total_checks BIGINT,
    avg_score NUMERIC,
    low_score_count BIGINT,
    critical_issues BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_checks,
        ROUND(AVG(score), 1) as avg_score,
        COUNT(*) FILTER (WHERE score < 70) as low_score_count,
        COUNT(*) FILTER (WHERE score < 50) as critical_issues
    FROM alignment_reports
    WHERE project_id = p_project_id
    AND created_at >= NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get top alignment issues for a connection
CREATE OR REPLACE FUNCTION get_top_alignment_issues(
    p_connection_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS TABLE(
    ad_id TEXT,
    ad_name TEXT,
    landing_url TEXT,
    score INT,
    top_issue TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ar.ad_id,
        ar.ad_name,
        ar.landing_url,
        ar.score,
        (ar.reasons_json->0->>'description')::TEXT as top_issue,
        ar.created_at
    FROM alignment_reports ar
    WHERE ar.source_connection_id = p_connection_id
    AND ar.score < 70
    ORDER BY ar.score ASC, ar.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
