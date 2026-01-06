# RLS Runbook - Row Level Security Testing

This guide explains how to verify that Row Level Security (RLS) is correctly isolating data between tenants and enforcing RBAC roles.

## 1. Policy Explanations

### `org_select_policy` (orgs)
- **Logic**: `EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = orgs.id AND org_members.user_id = auth.uid())`
- **Purpose**: Ensures users only see the name and ID of organizations they belong to. No cross-org discovery.

### `org_members_select_policy` (org_members)
- **Logic**: `EXISTS (SELECT 1 FROM org_members AS self WHERE self.org_id = org_members.org_id AND self.user_id = auth.uid())`
- **Purpose**: Users can see their teammates within an organization, but cannot list members of organizations they don't belong to.

### `projects_manage_policy` (projects)
- **Logic**: `EXISTS (SELECT 1 FROM org_members WHERE org_members.org_id = projects.org_id AND org_members.user_id = auth.uid() AND org_members.role IN ('owner', 'admin'))`
- **Purpose**: Restricts `INSERT`, `UPDATE`, and `DELETE` on projects to only Organization Owners and Admins.

## 2. Testing Isolation (Manual SQL)

To test isolation in the Supabase SQL Editor, use `SET request.jwt.claims` or `SET auth.uid`.

### User A (Owner of Org A)
```sql
-- Mock User A
SET auth.uid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Should see only Org A projects
SELECT * FROM projects;

-- Should be able to create a project in Org A
INSERT INTO projects (org_id, name) VALUES ('org-a-uuid', 'New Project');
```

### User B (Viewer of Org A)
```sql
-- Mock User B
SET auth.uid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Should see Org A projects
SELECT * FROM projects;

-- Should FAIL to create a project (RBAC check)
INSERT INTO projects (org_id, name) VALUES ('org-a-uuid', 'Hacker Project');
```

### User C (Owner of Org B)
```sql
-- Mock User C
SET auth.uid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Should NOT see Org A projects (Isolation check)
SELECT * FROM projects;

## 3. Integration Hub Isolation Tests

### Cross-Org Connection Leak Test
Verify that User C (Org B) cannot see Org A's source connections.
```sql
SET auth.uid = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; -- User C from Org B
SELECT * FROM source_connections; -- Should return 0 rows from Org A
```

### RBAC: Viewer Cannot Create Connection
```sql
SET auth.uid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; -- User B (Viewer in Org A)
INSERT INTO source_connections (org_id, project_id, type, name) 
VALUES ('org-a-uuid', 'project-a-uuid', 'hotmart', 'Stolen Connection');
-- Should FAIL with RLS/Permission error
```

### Secret Reference Privacy
Only Org Admins/Owners should be able to see `secret_refs`.
```sql
SET auth.uid = 'auth-uid-of-regular-member'; 
SELECT * FROM secret_refs; -- Should return 0 rows even if in the same Org
```
```
