-- supabase/migrations/0001_core.sql
-- Core Multi-tenant Schema with RLS and RBAC

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABLES
-- Organizations
CREATE TABLE IF NOT EXISTS orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization Memberships (RBAC)
CREATE TABLE IF NOT EXISTS org_members (
  org_id UUID REFERENCES orgs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project Memberships
-- Using a simpler model where project access can be inherited from org or explicitly granted
CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- Simple role for project-specific access
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  result TEXT DEFAULT 'success',
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_org_id ON audit_log(org_id);

-- 4. RLS ENABLING
ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 5. POLICIES

-- ORGS
-- Anyone who is a member of the org can see it
DROP POLICY IF EXISTS "org_select_policy" ON orgs;
CREATE POLICY "org_select_policy" ON orgs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      WHERE org_members.org_id = orgs.id 
      AND org_members.user_id = auth.uid()
    )
  );

-- Only owners/admins can update org details
DROP POLICY IF EXISTS "org_update_policy" ON orgs;
CREATE POLICY "org_update_policy" ON orgs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      WHERE org_members.org_id = orgs.id 
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

-- ORG_MEMBERS
-- Members can see other members in the same org
DROP POLICY IF EXISTS "org_members_select_policy" ON org_members;
CREATE POLICY "org_members_select_policy" ON org_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members AS self
      WHERE self.org_id = org_members.org_id
      AND self.user_id = auth.uid()
    )
  );

-- Only owners/admins can manage memberships
DROP POLICY IF EXISTS "org_members_manage_policy" ON org_members;
CREATE POLICY "org_members_manage_policy" ON org_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM org_members AS self
      WHERE self.org_id = org_members.org_id
      AND self.user_id = auth.uid()
      AND self.role IN ('owner', 'admin')
    )
  );

-- PROJECTS
-- Users can see projects if they are org members
DROP POLICY IF EXISTS "projects_select_policy" ON projects;
CREATE POLICY "projects_select_policy" ON projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      WHERE org_members.org_id = projects.org_id 
      AND org_members.user_id = auth.uid()
    )
  );

-- Only org admins/owners can create/manage projects
DROP POLICY IF EXISTS "projects_manage_policy" ON projects;
CREATE POLICY "projects_manage_policy" ON projects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      WHERE org_members.org_id = projects.org_id 
      AND org_members.user_id = auth.uid()
      AND org_members.role IN ('owner', 'admin')
    )
  );

-- PROJECT_MEMBERS
DROP POLICY IF EXISTS "project_members_select_policy" ON project_members;
CREATE POLICY "project_members_select_policy" ON project_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      JOIN projects ON projects.org_id = org_members.org_id
      WHERE projects.id = project_members.project_id
      AND org_members.user_id = auth.uid()
    )
  );

-- AUDIT_LOG
-- Users can see audit logs for their orgs
DROP POLICY IF EXISTS "audit_log_select_policy" ON audit_log;
CREATE POLICY "audit_log_select_policy" ON audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members 
      WHERE org_members.org_id = audit_log.org_id 
      AND org_members.user_id = auth.uid()
    )
  );
