
-- Migration 0009: Alignment Ops v2.3 (Reliability, Scheduling, Diffing, Alerts)
-- Idempotent script: Safe to run multiple times.

BEGIN;

--------------------------------------------------------------------------------
-- 1. Alter alignment_jobs for Leasing
--------------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_jobs' AND column_name = 'locked_by') THEN
        ALTER TABLE alignment_jobs ADD COLUMN locked_by text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_jobs' AND column_name = 'lock_expires_at') THEN
        ALTER TABLE alignment_jobs ADD COLUMN lock_expires_at timestamptz;
    END IF;
END $$;

-- Index for leasing lookup
CREATE INDEX IF NOT EXISTS idx_alignment_jobs_lease 
ON alignment_jobs(status, lock_expires_at) 
WHERE status = 'running';

--------------------------------------------------------------------------------
-- 2. Add job_id column to alignment_reports_v2 and ensure unique constraint
--------------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'alignment_reports_v2' AND column_name = 'job_id') THEN
        ALTER TABLE alignment_reports_v2 ADD COLUMN job_id uuid REFERENCES alignment_jobs(id) ON DELETE SET NULL;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_alignment_reports_v2_job_id') THEN
        ALTER TABLE alignment_reports_v2 ADD CONSTRAINT uq_alignment_reports_v2_job_id UNIQUE (job_id);
    END IF;
END $$;

--------------------------------------------------------------------------------
-- 3. Create alignment_schedules
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alignment_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    enabled boolean DEFAULT false,
    cadence text CHECK (cadence IN ('daily', 'weekly')) DEFAULT 'daily',
    timezone text DEFAULT 'America/Sao_Paulo',
    quiet_hours jsonb DEFAULT '{"start": "22:00", "end": "07:00"}',
    budget_daily_max_checks int DEFAULT 50,
    target_urls_json jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alignment_schedules_project ON alignment_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_alignment_schedules_enabled ON alignment_schedules(enabled) WHERE enabled = true;

-- RLS
ALTER TABLE alignment_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alignment_schedules_select" ON alignment_schedules;
CREATE POLICY "alignment_schedules_select" ON alignment_schedules
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM project_members WHERE project_id = alignment_schedules.project_id
    ));

DROP POLICY IF EXISTS "alignment_schedules_modify" ON alignment_schedules;
CREATE POLICY "alignment_schedules_modify" ON alignment_schedules
    FOR ALL USING (auth.uid() IN (
        SELECT user_id FROM project_members WHERE project_id = alignment_schedules.project_id AND role IN ('admin', 'owner')
    ));

-- Internal service access
DROP POLICY IF EXISTS "service_role_alignment_schedules" ON alignment_schedules;
CREATE POLICY "service_role_alignment_schedules" ON alignment_schedules
    FOR ALL TO service_role USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 4. Create page_snapshot_diffs
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS page_snapshot_diffs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    previous_snapshot_id uuid REFERENCES page_snapshots(id),
    current_snapshot_id uuid REFERENCES page_snapshots(id),
    diff_summary jsonb,
    severity text CHECK (severity IN ('low', 'medium', 'high')),
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_snapshot_diffs_project ON page_snapshot_diffs(project_id);
CREATE INDEX IF NOT EXISTS idx_page_snapshot_diffs_curr_snap ON page_snapshot_diffs(current_snapshot_id);

-- RLS
ALTER TABLE page_snapshot_diffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_snapshot_diffs_select" ON page_snapshot_diffs;
CREATE POLICY "page_snapshot_diffs_select" ON page_snapshot_diffs
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM project_members WHERE project_id = page_snapshot_diffs.project_id
    ));

DROP POLICY IF EXISTS "service_role_page_snapshot_diffs" ON page_snapshot_diffs;
CREATE POLICY "service_role_page_snapshot_diffs" ON page_snapshot_diffs
    FOR ALL TO service_role USING (true) WITH CHECK (true);


--------------------------------------------------------------------------------
-- 5. Create outbound_notifications
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbound_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    channel text CHECK (channel IN ('slack', 'teams')),
    webhook_secret_ref_id uuid REFERENCES secret_refs(id),
    enabled boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_notifications_project ON outbound_notifications(project_id);

-- RLS
ALTER TABLE outbound_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outbound_notifications_select" ON outbound_notifications;
CREATE POLICY "outbound_notifications_select" ON outbound_notifications
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM project_members WHERE project_id = outbound_notifications.project_id
    ));

DROP POLICY IF EXISTS "outbound_notifications_modify" ON outbound_notifications;
CREATE POLICY "outbound_notifications_modify" ON outbound_notifications
    FOR ALL USING (auth.uid() IN (
        SELECT user_id FROM project_members WHERE project_id = outbound_notifications.project_id AND role IN ('admin', 'owner')
    ));

DROP POLICY IF EXISTS "service_role_outbound_notifications" ON outbound_notifications;
CREATE POLICY "service_role_outbound_notifications" ON outbound_notifications
    FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
