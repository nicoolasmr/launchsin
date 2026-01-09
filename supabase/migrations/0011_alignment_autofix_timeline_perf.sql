-- ============================================================
-- Migration 0011: Alignment Auto-Fix + Timeline + Performance
-- Sprint 2.5 - CI Real + Auto-Fix Tracking + Change Timeline
-- ============================================================
-- IDEMPOTENT: Safe to run multiple times
-- Dependencies: 0010_alignment_golden_rule.sql

BEGIN;

-- ============================================================
-- A) TRACKING FIX PACKS
-- ============================================================
-- Stores generated fix snippets (Meta Pixel, GTM, GA4)
-- Users can download and manually apply to their sites

CREATE TABLE IF NOT EXISTS tracking_fix_packs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    page_url text NOT NULL,
    
    -- What was detected (or missing)
    detected jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Example: {"meta_pixel": false, "gtm": false, "ga4": true, "utm_params": true}
    
    -- Fix recommendations
    fixes jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Example: [
    --   {
    --     "type": "META_PIXEL",
    --     "severity": "critical",
    --     "instructions": "Paste before </head>",
    --     "snippet_html": "<script>...</script>",
    --     "snippet_nextjs": "<Script strategy='afterInteractive'>...</Script>",
    --     "verification": "After publishing, run 'Verify Fix' to confirm pixel_found=true."
    --   }
    -- ]
    
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_tracking_fix_packs_project 
    ON tracking_fix_packs(project_id, created_at DESC);

-- RLS: Project-scoped (viewer read, admin/owner create)
ALTER TABLE tracking_fix_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_fix_packs_viewer_read ON tracking_fix_packs;
CREATE POLICY tracking_fix_packs_viewer_read ON tracking_fix_packs
    FOR SELECT
    USING (
        project_id IN (
            SELECT pm.project_id 
            FROM project_members pm 
            WHERE pm.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS tracking_fix_packs_admin_create ON tracking_fix_packs;
CREATE POLICY tracking_fix_packs_admin_create ON tracking_fix_packs
    FOR INSERT
    WITH CHECK (
        project_id IN (
            SELECT pm.project_id 
            FROM project_members pm 
            WHERE pm.user_id = auth.uid() 
            AND pm.role IN ('admin', 'owner')
        )
    );

-- ============================================================
-- B) PAGE SNAPSHOT DIFFS (Change Timeline)
-- ============================================================
-- Table already exists from migration 0009
-- Just ensure RLS is enabled and add policies

-- RLS: Viewer read
ALTER TABLE page_snapshot_diffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS page_snapshot_diffs_viewer_read ON page_snapshot_diffs;
CREATE POLICY page_snapshot_diffs_viewer_read ON page_snapshot_diffs
    FOR SELECT
    USING (
        project_id IN (
            SELECT pm.project_id 
            FROM project_members pm 
            WHERE pm.user_id = auth.uid()
        )
    );

-- ============================================================
-- C) PERFORMANCE CACHE (Hash-based reuse)
-- ============================================================
-- Add hash columns to alignment_reports_v2 for cache lookup

ALTER TABLE alignment_reports_v2 
    ADD COLUMN IF NOT EXISTS ad_content_hash text,
    ADD COLUMN IF NOT EXISTS page_content_hash text,
    ADD COLUMN IF NOT EXISTS cached boolean DEFAULT false;

-- Index for cache lookup (not unique - multiple reports can have same hash)
CREATE INDEX IF NOT EXISTS idx_alignment_reports_cache 
    ON alignment_reports_v2(project_id, ad_content_hash, page_content_hash, created_at DESC)
    WHERE ad_content_hash IS NOT NULL AND page_content_hash IS NOT NULL;

-- ============================================================
-- D) DEDUP HARDENING (DB-safe unique constraint)
-- ============================================================
-- Add day_bucket_utc for deterministic dedup

ALTER TABLE alignment_alerts 
    ADD COLUMN IF NOT EXISTS day_bucket_utc date;

-- Backfill existing rows (set to created_at date in UTC)
UPDATE alignment_alerts 
SET day_bucket_utc = (created_at AT TIME ZONE 'UTC')::date
WHERE day_bucket_utc IS NULL;

-- Make NOT NULL after backfill
ALTER TABLE alignment_alerts 
    ALTER COLUMN day_bucket_utc SET NOT NULL;

-- Drop old index if exists (from 0010)
DROP INDEX IF EXISTS idx_alignment_alerts_fingerprint;

-- Create unique constraint for DB-safe dedup
-- This prevents race conditions by enforcing uniqueness at DB level
CREATE UNIQUE INDEX IF NOT EXISTS uq_alignment_alerts_dedup 
    ON alignment_alerts(project_id, alert_fingerprint, day_bucket_utc)
    WHERE alert_fingerprint IS NOT NULL;

-- Regular index for queries without fingerprint
CREATE INDEX IF NOT EXISTS idx_alignment_alerts_project_date 
    ON alignment_alerts(project_id, created_at DESC);

-- ============================================================
-- E) UPDATE RLS POLICIES (ensure new columns covered)
-- ============================================================

-- alignment_reports_v2: already has RLS, just verify new columns are covered
-- (existing policies apply to all columns by default)

-- alignment_alerts: already has RLS, verify
-- (existing policies apply to all columns by default)

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================
-- Run these after migration to verify:

-- 1. Check tracking_fix_packs table exists
-- SELECT COUNT(*) FROM tracking_fix_packs;

-- 2. Check page_snapshot_diffs table exists
-- SELECT COUNT(*) FROM page_snapshot_diffs;

-- 3. Check new columns exist
-- SELECT ad_content_hash, page_content_hash, cached 
-- FROM alignment_reports_v2 LIMIT 1;

-- 4. Check day_bucket_utc exists and is NOT NULL
-- SELECT day_bucket_utc FROM alignment_alerts LIMIT 1;

-- 5. Verify unique constraint
-- SELECT indexname FROM pg_indexes 
-- WHERE tablename = 'alignment_alerts' 
-- AND indexname = 'uq_alignment_alerts_dedup';
