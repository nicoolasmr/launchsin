-- Migration: 0004_canonical_events.sql
-- Description: Canonical event model + idempotency + vault upgrade
-- Phase: Sprint 1.2 - Phase 20

-- ============================================================================
-- 1. CANONICAL EVENTS TABLE
-- ============================================================================
-- Unified event format for all sources (Hotmart, Meta Ads, Google Ads, CRM)
-- Guarantees idempotency via UNIQUE constraint on (source_connection_id, idempotency_key)

CREATE TABLE IF NOT EXISTS canonical_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_connection_id UUID NOT NULL REFERENCES source_connections(id) ON DELETE CASCADE,
    
    -- Event classification
    event_type TEXT NOT NULL, -- ad_impression, ad_click, lead_created, checkout_started, purchase_completed, refund_created, meeting_scheduled
    event_time TIMESTAMPTZ NOT NULL,
    
    -- Idempotency guarantee
    idempotency_key TEXT NOT NULL,
    
    -- Actor data (PII as HMAC hashes)
    actor_json JSONB NOT NULL DEFAULT '{}', -- { email_hash, phone_hash, user_id }
    
    -- Entity references
    entities_json JSONB NOT NULL DEFAULT '{}', -- { campaign_id, ad_id, product_id, page_url, order_id }
    
    -- Value data
    value_json JSONB NOT NULL DEFAULT '{}', -- { amount, currency, status, source_metrics }
    
    -- Raw event reference (NO secrets)
    raw_ref_json JSONB NOT NULL DEFAULT '{}', -- { source_event_id, source, payload_version }
    
    -- Metadata
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Idempotency constraint
    CONSTRAINT unique_event_per_source UNIQUE (source_connection_id, idempotency_key)
);

-- ============================================================================
-- 2. INDICES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_canonical_events_project_time 
    ON canonical_events(project_id, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_events_connection_time 
    ON canonical_events(source_connection_id, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_events_type_time 
    ON canonical_events(event_type, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_events_org_time 
    ON canonical_events(org_id, event_time DESC);

-- Optional: GIN index for JSONB queries (enable if needed)
-- CREATE INDEX IF NOT EXISTS idx_canonical_events_entities_gin 
--     ON canonical_events USING GIN (entities_json);

-- ============================================================================
-- 3. UPGRADE SECRET_REFS FOR KEY ROTATION
-- ============================================================================

-- Add key versioning for rotation tracking
DO $$ BEGIN
    ALTER TABLE secret_refs ADD COLUMN IF NOT EXISTS key_version INT DEFAULT 1;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- Add rotation timestamp for audit trail
DO $$ BEGIN
    ALTER TABLE secret_refs ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- Add encryption metadata (iv + tag for AES-256-GCM)
DO $$ BEGIN
    ALTER TABLE secret_refs ADD COLUMN IF NOT EXISTS encryption_iv TEXT;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE secret_refs ADD COLUMN IF NOT EXISTS encryption_tag TEXT;
EXCEPTION
    WHEN duplicate_column THEN NULL;
END $$;

-- Update comment
COMMENT ON TABLE secret_refs IS 'Encrypted secrets vault with AES-256-GCM. Never return encrypted_value in API responses.';

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE canonical_events ENABLE ROW LEVEL SECURITY;

-- SELECT: Project members can view events
DROP POLICY IF EXISTS "canonical_events_select_policy" ON canonical_events;
CREATE POLICY "canonical_events_select_policy" ON canonical_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM projects
            JOIN org_members ON org_members.org_id = projects.org_id
            WHERE projects.id = canonical_events.project_id
            AND org_members.user_id = auth.uid()
        )
    );

-- INSERT: Only ADMIN/OWNER can insert (or service role via RPC)
DROP POLICY IF EXISTS "canonical_events_insert_policy" ON canonical_events;
CREATE POLICY "canonical_events_insert_policy" ON canonical_events
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            JOIN org_members ON org_members.org_id = projects.org_id
            WHERE projects.id = canonical_events.project_id
            AND org_members.user_id = auth.uid()
            AND org_members.role IN ('admin', 'owner')
        )
    );

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to get event count by type for a project (last 24h)
CREATE OR REPLACE FUNCTION get_project_event_stats(p_project_id UUID)
RETURNS TABLE(event_type TEXT, count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ce.event_type,
        COUNT(*) as count
    FROM canonical_events ce
    WHERE ce.project_id = p_project_id
    AND ce.event_time >= NOW() - INTERVAL '24 hours'
    GROUP BY ce.event_type
    ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check event lag per connection
CREATE OR REPLACE FUNCTION get_connection_event_lag(p_connection_id UUID)
RETURNS INTERVAL AS $$
DECLARE
    last_event_time TIMESTAMPTZ;
BEGIN
    SELECT MAX(event_time) INTO last_event_time
    FROM canonical_events
    WHERE source_connection_id = p_connection_id;
    
    IF last_event_time IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN NOW() - last_event_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
