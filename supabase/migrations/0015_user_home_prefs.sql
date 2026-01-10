-- ============================================================
-- Migration 0015: User Home Preferences
-- Sprint 2.6 PR #3 - Home Personalization
-- ============================================================
-- IDEMPOTENT: Safe to run multiple times
-- Dependencies: None (standalone)

BEGIN;

-- ============================================================
-- A) USER_HOME_PREFS TABLE
-- ============================================================
-- Stores user-specific preferences for Command Center Home
-- PRIVACY: Each user can only read/write their own preferences

CREATE TABLE IF NOT EXISTS user_home_prefs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    
    -- Preferences JSON
    prefs_json jsonb NOT NULL DEFAULT '{
        "widget_visibility": {
            "kpi": true,
            "decisions": true,
            "alignment": true,
            "crm": true,
            "ops": true,
            "recent_actions": true
        },
        "widget_order": ["kpi", "decisions", "alignment", "crm", "ops", "recent_actions"],
        "density": "comfortable",
        "default_project_id": null
    }'::jsonb,
    
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    -- Unique constraint: one preference set per user per org
    CONSTRAINT user_home_prefs_org_user_unique UNIQUE (org_id, user_id)
);

-- ============================================================
-- B) INDEXES
-- ============================================================

-- Query by org + user (most common)
CREATE INDEX IF NOT EXISTS idx_user_home_prefs_org_user 
    ON user_home_prefs(org_id, user_id);

-- ============================================================
-- C) TRIGGER: Auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_user_home_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_home_prefs_updated_at ON user_home_prefs;
CREATE TRIGGER trigger_update_user_home_prefs_updated_at
    BEFORE UPDATE ON user_home_prefs
    FOR EACH ROW
    EXECUTE FUNCTION update_user_home_prefs_updated_at();

-- ============================================================
-- D) RLS POLICIES (SELF-ONLY)
-- ============================================================

ALTER TABLE user_home_prefs ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can only read their own preferences
DROP POLICY IF EXISTS user_home_prefs_select ON user_home_prefs;
CREATE POLICY user_home_prefs_select ON user_home_prefs
    FOR SELECT
    USING (user_id = auth.uid());

-- INSERT: Users can only create their own preferences
DROP POLICY IF EXISTS user_home_prefs_insert ON user_home_prefs;
CREATE POLICY user_home_prefs_insert ON user_home_prefs
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- UPDATE: Users can only update their own preferences
DROP POLICY IF EXISTS user_home_prefs_update ON user_home_prefs;
CREATE POLICY user_home_prefs_update ON user_home_prefs
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- DELETE: Blocked (prevent accidental loss)
-- No policy = no one can delete

COMMIT;

-- ============================================================
-- NOTES
-- ============================================================
-- This migration creates user_home_prefs table with:
-- - Self-only RLS (user can only access their own preferences)
-- - Default preferences in prefs_json
-- - Auto-updating updated_at timestamp
-- - Unique constraint per org + user
-- - No admin override (privacy-first)
