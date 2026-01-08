-- Migration: 0008_alignment_v2.sql
-- Description: Schema for Ads <-> Pages Verification Center (Alignment v2)

-- 1. Create 'alignment' storage bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('alignment', 'alignment', false)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy for Storage: DENY ALL by default (Server/Worker use Service Role)
-- If we need direct upload from client, we'd add policy here.
-- For now, screenshots come from Worker (Service Role). 

-- 2. Table: alignment_jobs
CREATE TABLE IF NOT EXISTS alignment_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_connection_id UUID REFERENCES source_connections(id) ON DELETE SET NULL,
    provider TEXT NOT NULL DEFAULT 'meta',
    ad_id TEXT NOT NULL,
    landing_url TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed')),
    requested_by UUID REFERENCES auth.users(id),
    budget_day DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alignment_jobs_project_created ON alignment_jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alignment_jobs_status ON alignment_jobs(status);

ALTER TABLE alignment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can view jobs" ON alignment_jobs;
CREATE POLICY "Project members can view jobs" ON alignment_jobs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = alignment_jobs.project_id
            AND project_members.user_id = auth.uid()
        )
    );

-- 3. Table: alignment_reports_v2
CREATE TABLE IF NOT EXISTS alignment_reports_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_connection_id UUID REFERENCES source_connections(id) ON DELETE SET NULL,
    ad_id TEXT,
    landing_url TEXT,
    score INT NOT NULL CHECK (score >= 0 AND score <= 100),
    dimensions JSONB NOT NULL DEFAULT '{}'::jsonb, -- message, offer, cta, tracking
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb, -- snippets, h1, pixels, utms
    recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
    confidence_score INT NOT NULL DEFAULT 100,
    model_info JSONB, -- llm_used, without secrets
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alignment_reports_v2_project_score ON alignment_reports_v2(project_id, score ASC);
CREATE INDEX IF NOT EXISTS idx_alignment_reports_v2_project_created ON alignment_reports_v2(project_id, created_at DESC);

ALTER TABLE alignment_reports_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can view reports" ON alignment_reports_v2;
CREATE POLICY "Project members can view reports" ON alignment_reports_v2
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = alignment_reports_v2.project_id
            AND project_members.user_id = auth.uid()
        )
    );

-- 4. Table: page_snapshots
CREATE TABLE IF NOT EXISTS page_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    content_text TEXT, -- Sanitized text content
    meta JSONB NOT NULL DEFAULT '{}'::jsonb, -- title, h1, ctas, redirect_chain, pixels
    screenshot_path TEXT, -- Path in 'alignment' bucket
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, url, fetched_at) -- Rough unique constraint, can rely on date casting in query if needed, or create expression index
);

-- Using simple index instead of date-based unique for now to verify implementation
CREATE INDEX IF NOT EXISTS idx_page_snapshots_project_url ON page_snapshots(project_id, url);

ALTER TABLE page_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can view snapshots" ON page_snapshots;
CREATE POLICY "Project members can view snapshots" ON page_snapshots
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = page_snapshots.project_id
            AND project_members.user_id = auth.uid()
        )
    );

-- 5. Table: ad_creatives_cache
CREATE TABLE IF NOT EXISTS ad_creatives_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_connection_id UUID,
    provider TEXT DEFAULT 'meta',
    ad_id TEXT NOT NULL,
    creative_json JSONB NOT NULL, -- Public copy only
    fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_cache_ad_id ON ad_creatives_cache(ad_id);

ALTER TABLE ad_creatives_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can view creative cache" ON ad_creatives_cache;
CREATE POLICY "Project members can view creative cache" ON ad_creatives_cache
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = ad_creatives_cache.project_id
            AND project_members.user_id = auth.uid()
        )
    );

-- 6. Table: alignment_alerts
CREATE TABLE IF NOT EXISTS alignment_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    severity TEXT CHECK (severity IN ('low', 'med', 'high')),
    type TEXT, -- tracking_missing, etc.
    message TEXT,
    report_id UUID REFERENCES alignment_reports_v2(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alignment_alerts_project_status ON alignment_alerts(project_id, status, created_at DESC);

ALTER TABLE alignment_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members can view alerts" ON alignment_alerts;
CREATE POLICY "Project members can view alerts" ON alignment_alerts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = alignment_alerts.project_id
            AND project_members.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admins can resolve alerts" ON alignment_alerts;
CREATE POLICY "Admins can resolve alerts" ON alignment_alerts
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM project_members
            WHERE project_members.project_id = alignment_alerts.project_id
            AND project_members.user_id = auth.uid()
            AND project_members.role IN ('owner', 'admin')
        )
    );
