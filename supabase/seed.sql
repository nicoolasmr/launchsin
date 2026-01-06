-- supabase/seed.sql
-- Sample multi-tenant data for development

-- Dummy users would normally be in auth.users
-- For seeding, we assume IDs or use placeholders if using Supabase CLI

-- 1. Create Orgs
INSERT INTO orgs (id, name) VALUES 
('00000000-0000-4000-a000-000000000001', 'Acme Corp'),
('00000000-0000-4000-a000-000000000002', 'Stark Industries')
ON CONFLICT (id) DO NOTHING;

-- 2. Create Projects
INSERT INTO projects (id, org_id, name) VALUES
('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'Project Phoenix'),
('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000001', 'Project Icarus'),
('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002', 'Arc Reactor')
ON CONFLICT (id) DO NOTHING;

-- 3. Memberships (Note: user_ids are typically from auth.users)
-- We'll use hardcoded UUIDs for demonstration/testing
-- User A (Owner of Acme): 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
-- User B (Member of Acme): 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
-- User C (Owner of Stark): 'cccccccc-cccc-cccc-cccc-cccccccccccc'

-- Org Memberships
-- User A -> Acme (Owner)
-- User B -> Acme (Viewer)
-- User C -> Stark (Owner)
-- User A -> Stark (Viewer) -- Cross-org case

/*
INSERT INTO org_members (org_id, user_id, role) VALUES
('00000000-0000-4000-a000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner'),
('00000000-0000-4000-a000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'viewer'),
('00000000-0000-4000-a000-000000000002', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'owner');
*/
