# CRM Hub Runbook (Sprint 2.1)

## Overview
The CRM Hub provides a read-only integration with HubSpot (v1) to ingest Contacts and Deals into a Canonical Schema. This data powers the 'Alignment' features and provides visibility into the sales pipeline directly within LaunchSin.

## Architecture
- **Connector**: `HubSpotConnector` (Server) implements `IConnector`. Handles OAuth2 and Incremental Sync.
- **Worker**: `HubSpotSyncWorker` (Workers) periodically polls for stale connections and triggers syncs via Internal API.
- **Database**: 
  - `crm_contacts`: Materialized view of contacts (PII hashed).
  - `crm_deals`: Materialized view of deals.
  - `source_connections`: Stores sync state (`state_json`) and config.
- **Security**: 
  - Secrets (Tokens) stored in `secrets_provider` (AES-256-GCM).
  - PII (Email/Phone) hashed using HMAC-SHA256 (Salted per Org).
  - RLS Policies enforce tenant isolation.

## Configuration
### Environment Variables
| Variable | Description | Required |
|---|---|---|
| `HUBSPOT_CLIENT_ID` | OAuth Client ID | Yes |
| `HUBSPOT_CLIENT_SECRET` | OAuth Client Secret | Yes |
| `HUBSPOT_SYNC_INTERVAL_MS` | Sync Frequency (Default: 1h) | No |
| `SECRETS_ENCRYPTION_KEY` | Key for Token Encryption | Yes |
| `PII_HASH_SALT` | Salt base for PII Hashing | Yes |

### Feature Flags
- `crm_hub`: Enables the CRM tab in Integrations Status Center.

## Operations
### Triggering a Manual Sync
1. Go to **Integrations > Status Center > Connections**.
2. Click "Sync Now" on the HubSpot card.
3. This creates a `sync_run` with status `pending`.
4. The Worker picks it up immediately (or next poll).

### Debugging Failed Syncs
- Check `last_error_class` and `last_error_at` in `source_connections` table.
- Logs: Search for `HubSpotConnector` or `HubSpotSyncWorker` in structured logs.
- Common Errors: 
  - `invalid_grant`: Refresh token expired or revoked. Re-connect via UI.
  - `rate_limit`: HubSpot API 429. Worker should backoff (future improvement).

## Disaster Recovery
- **Re-sync**: Update `last_sync_at` to `NULL` to force full re-sync.
- **Token Loss**: If secrets are lost, Users must re-authenticate via OAuth flow.
