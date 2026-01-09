
-- Migration 0010: Alignment Golden Rule + Alert Dedup + Ops Polish
-- Idempotent script: Safe to run multiple times.

BEGIN;

--------------------------------------------------------------------------------
-- 1. Add Golden Rule columns to alignment_reports_v2
--------------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_reports_v2' AND column_name = 'golden_rule_json') THEN
        ALTER TABLE alignment_reports_v2 ADD COLUMN golden_rule_json jsonb DEFAULT '{}'::jsonb;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_reports_v2' AND column_name = 'scorer_version') THEN
        ALTER TABLE alignment_reports_v2 ADD COLUMN scorer_version text DEFAULT 'v2.4';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_reports_v2' AND column_name = 'llm_model') THEN
        ALTER TABLE alignment_reports_v2 ADD COLUMN llm_model text NULL;
    END IF;
END $$;

-- Add confidence_score constraint
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_alignment_reports_v2_confidence') THEN
        ALTER TABLE alignment_reports_v2 ADD CONSTRAINT chk_alignment_reports_v2_confidence 
            CHECK (confidence_score >= 0 AND confidence_score <= 100);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Index for querying by confidence
CREATE INDEX IF NOT EXISTS idx_alignment_reports_v2_confidence 
    ON alignment_reports_v2(project_id, confidence_score DESC);

--------------------------------------------------------------------------------
-- 2. Add Alert Deduplication support
--------------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_alerts' AND column_name = 'alert_fingerprint') THEN
        ALTER TABLE alignment_alerts ADD COLUMN alert_fingerprint text NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_alerts' AND column_name = 'suppressed_count') THEN
        ALTER TABLE alignment_alerts ADD COLUMN suppressed_count int DEFAULT 0;
    END IF;
END $$;

-- Index for fast fingerprint lookups (dedup will be handled in application with created_at check)
CREATE INDEX IF NOT EXISTS idx_alignment_alerts_fingerprint 
    ON alignment_alerts(project_id, alert_fingerprint, created_at DESC)
    WHERE alert_fingerprint IS NOT NULL;

--------------------------------------------------------------------------------
-- 3. Add observability columns to alignment_jobs
--------------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_jobs' AND column_name = 'correlation_id') THEN
        ALTER TABLE alignment_jobs ADD COLUMN correlation_id text NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_jobs' AND column_name = 'started_at') THEN
        ALTER TABLE alignment_jobs ADD COLUMN started_at timestamptz NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_jobs' AND column_name = 'finished_at') THEN
        ALTER TABLE alignment_jobs ADD COLUMN finished_at timestamptz NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_jobs' AND column_name = 'error_message_redacted') THEN
        ALTER TABLE alignment_jobs ADD COLUMN error_message_redacted text NULL;
    END IF;
END $$;

-- Index for correlation tracking
CREATE INDEX IF NOT EXISTS idx_alignment_jobs_correlation 
    ON alignment_jobs(correlation_id) WHERE correlation_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 4. Add last_sent_at to outbound_notifications (for UI display)
--------------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outbound_notifications' AND column_name = 'last_sent_at') THEN
        ALTER TABLE outbound_notifications ADD COLUMN last_sent_at timestamptz NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outbound_notifications' AND column_name = 'total_sent') THEN
        ALTER TABLE outbound_notifications ADD COLUMN total_sent int DEFAULT 0;
    END IF;
END $$;

--------------------------------------------------------------------------------
-- 5. Update RLS Policies (no changes needed - existing policies cover new columns)
--------------------------------------------------------------------------------
-- Existing policies on alignment_reports_v2, alignment_alerts, alignment_jobs, 
-- and outbound_notifications already use project_id for filtering, so new columns
-- are automatically covered by RLS.

-- Service role policies remain unchanged (full access)

COMMIT;
