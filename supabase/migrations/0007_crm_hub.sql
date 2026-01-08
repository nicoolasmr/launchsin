-- Migration: 0007_crm_hub
-- Description: Adds Read-Only CRM Tables, RLS Policies, and Helper Functions.

-- 1. Source Connections Update (Add Sync Metadata)
ALTER TABLE source_connections ADD COLUMN IF NOT EXISTS state_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE source_connections ADD COLUMN IF NOT EXISTS last_sync_at timestamptz NULL;
ALTER TABLE source_connections ADD COLUMN IF NOT EXISTS last_success_at timestamptz NULL;
ALTER TABLE source_connections ADD COLUMN IF NOT EXISTS last_error_at timestamptz NULL;
ALTER TABLE source_connections ADD COLUMN IF NOT EXISTS last_error_class text NULL;

-- 2. CRM Contacts Table (Materialized Latest State)
CREATE TABLE IF NOT EXISTS crm_contacts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES orgs(id),
    project_id uuid NOT NULL REFERENCES projects(id),
    source_connection_id uuid NOT NULL REFERENCES source_connections(id),
    external_id text NOT NULL,
    email_hash text NULL,
    phone_hash text NULL,
    full_name text NULL,
    lifecycle_stage text NULL,
    raw jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id, source_connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_sync ON crm_contacts(project_id, source_connection_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_project ON crm_contacts(project_id, occurred_at DESC);

-- 3. CRM Deals Table
CREATE TABLE IF NOT EXISTS crm_deals (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES orgs(id),
    project_id uuid NOT NULL REFERENCES projects(id),
    source_connection_id uuid NOT NULL REFERENCES source_connections(id),
    external_id text NOT NULL,
    deal_name text NULL,
    stage text NULL,
    amount numeric NULL,
    currency text NULL DEFAULT 'USD',
    raw jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id, source_connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_sync ON crm_deals(project_id, source_connection_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_deals_project ON crm_deals(project_id, stage);

-- 4. Enable RLS
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deals ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Policy: Viewers can SELECT if they belong to the project/org
DROP POLICY IF EXISTS "Viewers can view crm_contacts" ON crm_contacts;
CREATE POLICY "Viewers can view crm_contacts" ON crm_contacts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM org_members m
            JOIN projects p ON p.org_id = m.org_id
            WHERE m.user_id = auth.uid()
            AND m.org_id = crm_contacts.org_id
            AND p.id = crm_contacts.project_id
        )
    );

DROP POLICY IF EXISTS "Viewers can view crm_deals" ON crm_deals;
CREATE POLICY "Viewers can view crm_deals" ON crm_deals
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM org_members m
            JOIN projects p ON p.org_id = m.org_id
            WHERE m.user_id = auth.uid()
            AND m.org_id = crm_deals.org_id
            AND p.id = crm_deals.project_id
        )
    );

-- Policy: Only Admins/Owners (or Sync Service) can INSERT/UPDATE/DELETE.
-- Note: Sync Worker uses Service Role (bypass RLS), but for API safety we add this.
-- Assuming 'admin' and 'owner' are role strings.
DROP POLICY IF EXISTS "Admins can mutate crm_contacts" ON crm_contacts;
CREATE POLICY "Admins can mutate crm_contacts" ON crm_contacts
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM org_members m
            WHERE m.user_id = auth.uid()
            AND m.org_id = crm_contacts.org_id
            AND m.role IN ('admin', 'owner')
        )
    );

DROP POLICY IF EXISTS "Admins can mutate crm_deals" ON crm_deals;
CREATE POLICY "Admins can mutate crm_deals" ON crm_deals
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM org_members m
            WHERE m.user_id = auth.uid()
            AND m.org_id = crm_deals.org_id
            AND m.role IN ('admin', 'owner')
        )
    );

-- 6. Helper Functions (Read-Only)

-- get_crm_object_counts: Returns totals grouped by connection
CREATE OR REPLACE FUNCTION get_crm_object_counts(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_contacts_count bigint;
    v_deals_count bigint;
    v_result jsonb;
BEGIN
    -- Verify access (optional if RLS handles it, but function is Security Definer so we must check)
    IF NOT EXISTS (
        SELECT 1 FROM org_members m
        JOIN projects p ON p.org_id = m.org_id
        WHERE m.user_id = auth.uid() AND p.id = p_project_id
    ) THEN
        RAISE EXCEPTION 'Access Denied';
    END IF;

    SELECT count(*) INTO v_contacts_count FROM crm_contacts WHERE project_id = p_project_id;
    SELECT count(*) INTO v_deals_count FROM crm_deals WHERE project_id = p_project_id;

    v_result := jsonb_build_object(
        'contacts', v_contacts_count,
        'deals', v_deals_count
    );

    RETURN v_result;
END;
$$;

-- get_crm_lag_minutes: Returns minutes since last data point
CREATE OR REPLACE FUNCTION get_crm_lag_minutes(p_project_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_last_contact timestamptz;
    v_last_deal timestamptz;
    v_max_occurred timestamptz;
BEGIN
    -- Verify access
    IF NOT EXISTS (
        SELECT 1 FROM org_members m
        JOIN projects p ON p.org_id = m.org_id
        WHERE m.user_id = auth.uid() AND p.id = p_project_id
    ) THEN
        RAISE EXCEPTION 'Access Denied';
    END IF;

    SELECT max(occurred_at) INTO v_last_contact FROM crm_contacts WHERE project_id = p_project_id;
    SELECT max(occurred_at) INTO v_last_deal FROM crm_deals WHERE project_id = p_project_id;

    -- Get the max of the two
    IF v_last_contact IS NULL AND v_last_deal IS NULL THEN
        RETURN NULL;
    END IF;

    v_max_occurred := GREATEST(COALESCE(v_last_contact, '-infinity'::timestamptz), COALESCE(v_last_deal, '-infinity'::timestamptz));

    RETURN EXTRACT(EPOCH FROM (now() - v_max_occurred)) / 60;
END;
$$;
