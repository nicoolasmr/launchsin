# Feature Flags Runbook

Operational guide for managing feature flags in LaunchSin.

## Common Keys

- `integrations_status_center`: (Default: `true`) Controls visibility of the Integration Hub dashboard.
- `ads_pages_alignment`: (Default: `false`) Gates the upcoming alignment intelligence module.

## Enabling a Flag for an Organization

To enable a specific feature for a client (Organization):

```sql
INSERT INTO feature_flags (org_id, key, enabled)
VALUES ('ORG_ID', 'ads_pages_alignment', true)
ON CONFLICT (org_id, key) DO UPDATE SET enabled = true;
```

## Global Fallbacks

Fallbacks are managed in `server/src/services/feature-flag.ts` via the `getDefaultValue` method. Changes to defaults require a code deployment.

## Troubleshooting

- **Flag Not Reflecting in UI**: Ensure the organization ID in the `feature_flags` table matches the user's active organization. Check RLS policies if the backend cannot fetch the flag.
- **Permission Denied**: Only `admin` or `owner` roles can manage flags via API (if management endpoints are exposed).
