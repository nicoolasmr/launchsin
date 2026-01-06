# Data Dictionary - Core Schema

## Tables

### `orgs`
Stores top-level organization/tenant entities.
- `id`: UUID (PK).
- `name`: Text. Name of the organization.
- `created_at`: Timestamp.

### `org_members`
Maps users to organizations with specific roles.
- `org_id`: UUID (FK -> `orgs.id`).
- `user_id`: UUID (FK -> `auth.users.id`).
- `role`: Enum (`owner`, `admin`, `member`, `viewer`).
- `created_at`: Timestamp.

### `projects`
Projects belonging to an organization.
- `id`: UUID (PK).
- `org_id`: UUID (FK -> `orgs.id`).
- `name`: Text.
- `created_at`: Timestamp.

### `project_members`
Granular access control at the project level.
- `project_id`: UUID (FK -> `projects.id`).
- `user_id`: UUID (FK -> `auth.users.id`).
- `role`: Text.
- `created_at`: Timestamp.

### `audit_log`
Immutable record of system actions.
- `id`: UUID (PK).
- `org_id`: UUID (FK).
- `project_id`: UUID (FK).
- `actor_user_id`: UUID (FK).
- `action`: Text (e.g., 'CREATE_PROJECT', 'UPDATE_MEMBER').
- `entity_type`: Text.
- `entity_id`: UUID.
- `result`: Text ('success', 'failure').
- `metadata_json`: JSONB.
- `created_at`: Timestamp.

## Integration Hub Tables

### `source_connections`
External integrations configured for a project.
- `id`: UUID (PK).
- `org_id`: UUID (FK).
- `project_id`: UUID (FK).
- `type`: Text ('hotmart', 'meta_ads', etc.).
- `name`: Text.
- `config_json`: JSONB.
- `is_active`: Boolean.

### `sync_runs`
Log of synchronization attempts.
- `id`: UUID (PK).
- `connection_id`: UUID (FK).
- `status`: Text ('success', 'failed', etc.).
- `started_at`: Timestamp.
- `finished_at`: Timestamp.
- `error_message`: Text.

### `dlq_events`
Fail-safe queue for failed integration events.
- `id`: UUID (PK).
- `connection_id`: UUID (FK).
- `payload_json`: JSONB.
- `status`: Text ('pending', 'resolved').
- `retry_count`: Integer.

### `integration_alerts`
Health monitoring alerts for integrations.
- `id`: UUID (PK).
- `project_id`: UUID (FK).
- `severity`: Text ('critical', 'warning', 'info').
- `message`: Text.

### `secret_refs`
Safe references to server-side encrypted secrets.
- `id`: UUID (PK).
- `org_id`: UUID (FK).
- `key_name`: Text.
- `secret_id_ref`: Text.
