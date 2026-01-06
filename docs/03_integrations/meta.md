# Meta Ads Integration Guide

Complete setup guide for integrating Meta (Facebook) Ads with LaunchSin.

## Overview

The Meta Ads connector uses OAuth 2.0 for authentication and syncs campaign data, insights, and creative information via the Meta Marketing API.

**Permissions:** Read-only (no campaign mutations in v1)

## Prerequisites

- Meta Business Manager account
- Ad account with active campaigns
- Admin access to LaunchSin project

## Setup Steps

### 1. Create Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **My Apps** → **Create App**
3. Select **Business** type
4. Configure:
   - **App Name**: "LaunchSin Integration"
   - **Contact Email**: your@email.com
5. Click **Create App**

### 2. Configure App Settings

1. Go to **App Settings** → **Basic**
2. Copy **App ID** and **App Secret**
3. Add **OAuth Redirect URI**:
   - `https://yourdomain.com/api/oauth/meta/callback`
4. Go to **App Review** → **Permissions and Features**
5. Request permissions:
   - `ads_read` (auto-approved)
   - `ads_management` (for insights)
   - `business_management`

### 3. Configure LaunchSin Environment

Add to `.env`:
```bash
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
META_REDIRECT_URI=https://yourdomain.com/api/oauth/meta/callback
```

### 4. Create Connection in LaunchSin

1. Navigate to **Projects → [Your Project] → Integrations → Settings**
2. Click **+ Add Integration**
3. Select **Meta Ads**
4. Configure:
   - **Name**: "Meta Ads Production"
   - **Ad Account ID**: `act_123456789` (from Meta Ads Manager)
5. Click **Connect**
6. You'll be redirected to Meta for authorization
7. Grant permissions
8. Verify connection shows "Connected" status

## Data Sync

### Sync Frequency

- **Automatic**: Every 1 hour (configurable via `META_SYNC_INTERVAL_MS`)
- **Manual**: Click "Sync Now" in Settings tab (ADMIN only)

### Synced Data

| Entity | Fields | Update Frequency |
|--------|--------|------------------|
| Campaigns | ID, name, status, objective | Hourly |
| Ad Sets | ID, name, budget, status | Hourly |
| Ads | ID, name, creative, status | Hourly |
| Insights | Impressions, clicks, spend, CTR, CPC, CPM | Daily aggregates (last 7 days) |

### Event Mapping

| Meta Data | Canonical Event | Description |
|-----------|-----------------|-------------|
| Impressions | `ad_impression` | Daily aggregate |
| Clicks | `ad_click` | Daily aggregate |
| Spend | `ad_spend` | Daily aggregate (USD) |

## Canonical Event Schema

### Impression Event
```json
{
  "event_type": "ad_impression",
  "event_time": "2026-01-06T00:00:00Z",
  "entities_json": {
    "ad_account_id": "act_123"
  },
  "value_json": {
    "impressions": 10000,
    "cpm": 5.50
  }
}
```

### Click Event
```json
{
  "event_type": "ad_click",
  "entities_json": {
    "ad_account_id": "act_123"
  },
  "value_json": {
    "clicks": 500,
    "ctr": 0.05,
    "cpc": 1.10
  }
}
```

### Spend Event
```json
{
  "event_type": "ad_spend",
  "value_json": {
    "amount": 550.00,
    "currency": "USD"
  }
}
```

## Troubleshooting

### OAuth fails with "Invalid Redirect URI"

**Cause:** Redirect URI mismatch

**Solution:**
1. Verify `META_REDIRECT_URI` in `.env` matches Meta App settings
2. Ensure URI uses HTTPS in production
3. Check for trailing slashes

### "Access token invalid" error

**Cause:** Token expired or revoked

**Solution:**
1. Re-authorize connection (click "Reconnect" in Settings)
2. Check token expiration in `source_connections.config_json`
3. Verify app permissions in Meta App Review

### Rate limit exceeded

**Cause:** Too many API calls

**Solution:**
- Meta enforces 200 calls/hour per app
- Worker automatically backs off on rate limit
- Check logs for `RATE_LIMIT_EXCEEDED` errors
- Consider reducing sync frequency

### No data syncing

**Check sync runs:**
```sql
SELECT * FROM sync_runs 
WHERE connection_id = 'YOUR_CONNECTION_ID'
ORDER BY started_at DESC 
LIMIT 10;
```

**Verify worker is running:**
```bash
kubectl logs -f deployment/launchsin-workers | grep "Meta Sync"
```

**Common issues:**
- Ad account ID incorrect (must start with `act_`)
- No active campaigns in account
- Token expired (re-authorize)

## Security

### Token Storage

- Access tokens stored in `secret_refs` table
- Encrypted at rest (AES-256-GCM)
- Never exposed in API responses
- Automatic rotation on re-authorization

### Permissions

- **Read-only**: No campaign mutations
- **Scopes**: `ads_read`, `ads_management` (insights only)
- **RBAC**: Only ADMIN/OWNER can connect/disconnect

## Monitoring

### Sync health
```sql
SELECT 
  DATE(started_at) as date,
  COUNT(*) as runs,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful
FROM sync_runs
WHERE connection_id = 'YOUR_CONNECTION_ID'
AND started_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(started_at);
```

### Event volume
```sql
SELECT 
  event_type,
  COUNT(*) as events,
  SUM((value_json->>'impressions')::int) as total_impressions
FROM canonical_events
WHERE source_connection_id = 'YOUR_CONNECTION_ID'
AND event_time >= NOW() - INTERVAL '7 days'
GROUP BY event_type;
```

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| Marketing API | 200 calls | 1 hour |
| Insights API | 5 calls/sec | Per ad account |

**Mitigation:**
- Worker implements exponential backoff
- Batch requests where possible
- Cache insights data (daily aggregates)

## API Reference

- [Meta Marketing API](https://developers.facebook.com/docs/marketing-apis)
- [Insights API](https://developers.facebook.com/docs/marketing-api/insights)
- [OAuth Guide](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow)

## Support

For issues:
1. Check [Meta API Status](https://developers.facebook.com/status/)
2. Review LaunchSin logs with `correlation_id`
3. Verify app permissions in Meta App Dashboard
