# Hotmart Integration Guide

Complete setup guide for integrating Hotmart with LaunchSin.

## Overview

The Hotmart connector receives webhook events for sales, refunds, and chargebacks, automatically mapping them to canonical events with idempotency guarantees.

## Prerequisites

- Active Hotmart account with products
- Admin access to LaunchSin project
- Webhook secret from Hotmart dashboard

## Setup Steps

### 1. Create Connection in LaunchSin

1. Navigate to **Projects → [Your Project] → Integrations → Settings**
2. Click **+ Add Integration**
3. Select **Hotmart**
4. Configure:
   - **Name**: "Hotmart Production"
   - **Hotmart Secret**: (from Hotmart dashboard)
5. Click **Save**
6. Copy the **Webhook URL** displayed

### 2. Configure Webhook in Hotmart

1. Log in to [Hotmart Dashboard](https://app.hotmart.com)
2. Go to **Tools → Webhooks**
3. Click **Add Webhook**
4. Configure:
   - **URL**: `https://yourdomain.com/api/webhooks/hotmart/{connectionId}`
   - **Events**: Select all (PURCHASE_COMPLETE, PURCHASE_REFUNDED, etc.)
   - **Version**: V2 (recommended)
5. Click **Save**

### 3. Test Webhook

**Option A: Hotmart Test Event**
1. In Hotmart dashboard, click **Send Test Event**
2. Check LaunchSin Status Center → Sync Runs
3. Verify event appears in canonical_events

**Option B: Manual cURL**
```bash
curl -X POST https://yourdomain.com/api/webhooks/hotmart/{connectionId} \
  -H "Content-Type: application/json" \
  -H "X-Hotmart-Hottok: YOUR_SIGNATURE" \
  -d @test_payload.json
```

## Event Mapping

| Hotmart Event | Canonical Event | Description |
|---------------|-----------------|-------------|
| `PURCHASE_COMPLETE` | `purchase_completed` | Sale approved |
| `PURCHASE_APPROVED` | `purchase_completed` | Payment confirmed |
| `PURCHASE_REFUNDED` | `refund_created` | Refund issued |
| `PURCHASE_CHARGEBACK` | `refund_created` | Chargeback filed |
| `PURCHASE_CANCELED` | `checkout_started` | Canceled checkout |

## Data Mapping

### Actor (PII Hashed)
```json
{
  "email_hash": "a3f5b8c...",
  "phone_hash": "d9e2f1a..." // if available
}
```

### Entities
```json
{
  "product_id": "12345",
  "product_name": "My Course",
  "order_id": "HP123456789",
  "payment_type": "CREDIT_CARD"
}
```

### Value
```json
{
  "amount": 99.90,
  "currency": "BRL",
  "status": "approved"
}
```

## Troubleshooting

### Webhook not receiving events

**Check connection status:**
```sql
SELECT id, name, is_active, config_json 
FROM source_connections 
WHERE type = 'hotmart';
```

**Verify webhook URL in Hotmart:**
- Ensure URL is publicly accessible (no localhost)
- Check SSL certificate is valid
- Verify `connectionId` matches LaunchSin

### 401 Unauthorized

**Cause:** Invalid hottok signature

**Solution:**
1. Verify `hotmart_secret` in connection config matches Hotmart dashboard
2. Check webhook version (V2 recommended)
3. Ensure payload is not modified in transit (proxies, CDN)

### Events not appearing

**Check DLQ:**
```sql
SELECT * FROM dlq_events 
WHERE connection_id = 'YOUR_CONNECTION_ID'
ORDER BY created_at DESC 
LIMIT 10;
```

**Common errors:**
- `MISSING_SECRET`: Hotmart secret not configured
- `INSERT_FAILED`: Database constraint violation
- `UNEXPECTED_ERROR`: Check server logs

### Duplicate events

**Expected behavior:** Duplicates are silently ignored via idempotency constraint.

**Verify:**
```sql
SELECT COUNT(*) FROM canonical_events 
WHERE source_connection_id = 'YOUR_CONNECTION_ID'
AND idempotency_key = 'hotmart_HP123456789_PURCHASE_COMPLETE';
-- Should return 1
```

## Security

### Hottok Validation

All webhooks are validated using HMAC-SHA256:

```typescript
const expectedHottok = crypto
  .createHmac('sha256', hotmartSecret)
  .update(rawPayload)
  .digest('hex');
```

**Never disable hottok validation in production.**

### PII Protection

- Email and phone are HMAC-hashed before storage
- Original values never persisted in database
- Hashes are org-specific (cannot correlate across orgs)

## Monitoring

### Event volume
```sql
SELECT 
  DATE(event_time) as date,
  COUNT(*) as events
FROM canonical_events
WHERE source_connection_id = 'YOUR_CONNECTION_ID'
AND event_time >= NOW() - INTERVAL '7 days'
GROUP BY DATE(event_time)
ORDER BY date;
```

### Revenue tracking
```sql
SELECT 
  SUM((value_json->>'amount')::numeric) as total_revenue,
  (value_json->>'currency') as currency
FROM canonical_events
WHERE source_connection_id = 'YOUR_CONNECTION_ID'
AND event_type = 'purchase_completed'
AND event_time >= NOW() - INTERVAL '30 days'
GROUP BY (value_json->>'currency');
```

## Rate Limits

Hotmart does not enforce strict rate limits on webhooks, but LaunchSin implements:
- Max 100 concurrent webhook requests per connection
- DLQ for failed events (auto-retry with backoff)

## Support

For issues:
1. Check [Hotmart API Docs](https://developers.hotmart.com/docs/pt-BR/v1/webhooks/)
2. Review LaunchSin logs: `kubectl logs -f deployment/launchsin-server`
3. Contact support with `correlation_id` from logs
