# Feature Flags Data Model

Core table for managing organization-level feature toggles.

## Table: `feature_flags`

| Column | Type | Description |
| --- | --- | --- |
| `id` | `UUID` | Primary Key. |
| `org_id` | `UUID` | Reference to `orgs(id)`. |
| `key` | `TEXT` | Unique key per organization (e.g., `ads_pages_alignment`). |
| `enabled` | `BOOLEAN` | Current state of the flag. |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | Last update timestamp (auto-managed by trigger). |

## RLS Policies

- **SELECT**: Users can only see flags for organizations they are members of.
- **ALL**: Only users with `admin` or `owner` roles in the organization can modify flags.

## Usage in Server

```typescript
const isEnabled = await featureFlagService.isEnabled(orgId, 'ads_pages_alignment');
```

## Usage in Client (UI)

Flags are fetched via the integrations or project configuration endpoints and used to hide/show UI components or gate actions.
