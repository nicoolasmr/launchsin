# Alignment Ops V2.3 Schema
Date: 2024-05-23

## Tables

### `alignment_jobs`
Tracks processing of alignment checks.
- `id` (uuid): PK
- `status`: queued | running | succeeded | failed
- `locked_by` (text): Worker instance ID for leasing
- `lock_expires_at` (timestamptz): Lease expiration
- `landing_url` (text): Target URL
- `ad_id` (text): Meta Ad ID or 'scheduled_check'

### `alignment_schedules`
Defines recurring checks.
- `id` (uuid): PK
- `cadence`: daily | weekly
- `timezone`: e.g. 'America/Sao_Paulo'
- `quiet_hours` (jsonb): `{ enabled: bool, start: "HH:mm", end: "HH:mm" }`
- `budget_daily_max_checks` (int): Limit per day
- `target_urls_json` (jsonb): Array of URLs to check
- `enabled` (bool)

### `page_snapshot_diffs`
Records changes between scans.
- `id` (uuid): PK
- `previous_snapshot_id` (uuid)
- `current_snapshot_id` (uuid)
- `diff_summary` (jsonb): `{ title: {from, to}, h1: {...} }`
- `severity`: low | medium | high

### `outbound_notifications`
Configures webhook alerts.
- `id` (uuid): PK
- `channel` (text): Label (e.g. "Slack Warnings")
- `webhook_secret_ref_id` (uuid): FK to `secret_refs` containing the URL
- `enabled` (bool)

## Security
- **RLS**: Enabled on all tables. Tenants (Org/Project) can only access their rows.
- **Secrets**: Webhooks stored in `secret_refs` (encrypted/obfuscated logic).
