-- supabase/migrations/0002_integrations_core.sql
-- Integration Hub Core: Connections, Sync Runs, DLQ, Alerts, and Secret References

-- 1. TABLES

-- Source Connections
CREATE TABLE IF NOT EXISTS source_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'hotmart', 'meta_ads', 'google_ads', etc.
  name TEXT NOT NULL,
  config_json JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync Runs
CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES source_connections(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- 'pending', 'running', 'success', 'failed', 'partial'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  stats_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dead Letter Queue (DLQ) Events
CREATE TABLE IF NOT EXISTS dlq_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES source_connections(id) ON DELETE CASCADE,
  payload_json JSONB NOT NULL,
  error_message TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'retrying', 'resolved', 'ignored'
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Integration Alerts
CREATE TABLE IF NOT EXISTS integration_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  severity TEXT NOT NULL, -- 'critical', 'warning', 'info'
  message TEXT NOT NULL,
  is_resolved BOOLEAN DEFAULT false,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Secret References (References to server-side encrypted secrets)
CREATE TABLE IF NOT EXISTS secret_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  secret_id_ref TEXT NOT NULL, -- Hash or ID in external Secret Manager / Server-side Vault
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, key_name)
);

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_source_connections_project_id ON source_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_source_connections_org_id ON source_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_connection_id ON sync_runs(connection_id);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_dlq_events_connection_id ON dlq_events(connection_id);
CREATE INDEX IF NOT EXISTS idx_dlq_events_status ON dlq_events(status);
CREATE INDEX IF NOT EXISTS idx_integration_alerts_project_id ON integration_alerts(project_id);

-- 3. RLS ENABLING
ALTER TABLE source_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlq_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_refs ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES

-- Helper Function for Org Membership Check (Optional but cleaner)
-- Using raw SQL as per 0001_core.sql for consistency

-- SOURCE_CONNECTIONS
-- Select: Org members can see connections
DROP POLICY IF EXISTS "source_connections_select_policy" ON source_connections;
CREATE POLICY "source_connections_select_policy" ON source_connections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      WHERE org_members.org_id = source_connections.org_id 
      AND org_members.user_id = auth.uid()
    )
  );

-- Manage: Only Org Owners/Admins can manage connections
DROP POLICY IF EXISTS "source_connections_manage_policy" ON source_connections;
CREATE POLICY "source_connections_manage_policy" ON source_connections
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      WHERE org_members.org_id = source_connections.org_id 
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

-- SYNC_RUNS
DROP POLICY IF EXISTS "sync_runs_select_policy" ON sync_runs;
CREATE POLICY "sync_runs_select_policy" ON sync_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM source_connections
      JOIN org_members ON org_members.org_id = source_connections.org_id
      WHERE source_connections.id = sync_runs.connection_id
      AND org_members.user_id = auth.uid()
    )
  );

-- DLQ_EVENTS
DROP POLICY IF EXISTS "dlq_events_select_policy" ON dlq_events;
CREATE POLICY "dlq_events_select_policy" ON dlq_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM source_connections
      JOIN org_members ON org_members.org_id = source_connections.org_id
      WHERE source_connections.id = dlq_events.connection_id
      AND org_members.user_id = auth.uid()
    )
  );

-- INTEGRATION_ALERTS
DROP POLICY IF EXISTS "integration_alerts_select_policy" ON integration_alerts;
CREATE POLICY "integration_alerts_select_policy" ON integration_alerts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      JOIN org_members ON org_members.org_id = projects.org_id
      WHERE projects.id = integration_alerts.project_id
      AND org_members.user_id = auth.uid()
    )
  );

-- SECRET_REFS
-- Only Owners/Admins can see secret references
DROP POLICY IF EXISTS "secret_refs_select_policy" ON secret_refs;
CREATE POLICY "secret_refs_select_policy" ON secret_refs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      WHERE org_members.org_id = secret_refs.org_id 
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );
