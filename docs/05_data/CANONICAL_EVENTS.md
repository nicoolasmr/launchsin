# Canonical Events Data Model

Unified event schema for all integration sources (Hotmart, Meta Ads, Google Ads, CRM).

## Table: `canonical_events`

| Column | Type | Description |
|--------|------|-------------|
| `id` | `UUID` | Primary key |
| `org_id` | `UUID` | Organization reference |
| `project_id` | `UUID` | Project reference |
| `source_connection_id` | `UUID` | Source connector reference |
| `event_type` | `TEXT` | Event classification (see types below) |
| `event_time` | `TIMESTAMPTZ` | When the event occurred (source timestamp) |
| `idempotency_key` | `TEXT` | Unique key per source (prevents duplicates) |
| `actor_json` | `JSONB` | Actor data with PII as HMAC hashes |
| `entities_json` | `JSONB` | Entity references (campaign, ad, product, etc.) |
| `value_json` | `JSONB` | Value data (amount, currency, metrics) |
| `raw_ref_json` | `JSONB` | Raw event reference (NO secrets) |
| `ingested_at` | `TIMESTAMPTZ` | When ingested into LaunchSin |

## Event Types

| Type | Description | Example Source |
|------|-------------|----------------|
| `ad_impression` | Ad shown to user | Meta Ads, Google Ads |
| `ad_click` | User clicked ad | Meta Ads, Google Ads |
| `lead_created` | Form submission | Landing page, CRM |
| `checkout_started` | Cart initiated | Hotmart, Shopify |
| `purchase_completed` | Sale finalized | Hotmart, Stripe |
| `refund_created` | Refund issued | Hotmart, Stripe |
| `meeting_scheduled` | Calendar booking | Calendly, CRM |

## Idempotency

**Constraint:** `UNIQUE(source_connection_id, idempotency_key)`

**Key Generation:**
- Hotmart: `hotmart_{transaction_id}`
- Meta Ads: `meta_{ad_id}_{date}_{metric_type}`
- Custom: `{source}_{deterministic_hash}`

**Behavior:**
- Duplicate inserts are silently ignored (constraint violation)
- DLQ logs duplicates with `resolved_reason='duplicate'`

## PII Handling

**Rule:** Never store email/phone in plaintext.

**Implementation:**
```typescript
const emailHash = crypto
  .createHmac('sha256', ORG_HASH_KEY)
  .update(email.toLowerCase())
  .digest('hex');

actor_json = {
  email_hash: emailHash,
  phone_hash: phoneHash, // if available
  user_id: externalUserId // if available
};
```

## JSON Schema Examples

### `actor_json`
```json
{
  "email_hash": "a3f5b8c...",
  "phone_hash": "d9e2f1a...",
  "user_id": "usr_123"
}
```

### `entities_json`
```json
{
  "campaign_id": "camp_456",
  "ad_id": "ad_789",
  "product_id": "prod_abc",
  "page_url": "https://example.com/lp",
  "order_id": "ord_xyz"
}
```

### `value_json`
```json
{
  "amount": 99.90,
  "currency": "BRL",
  "status": "approved",
  "source_metrics": {
    "impressions": 1000,
    "clicks": 50,
    "ctr": 0.05
  }
}
```

### `raw_ref_json`
```json
{
  "source_event_id": "evt_hotmart_123",
  "source": "hotmart",
  "payload_version": "v2"
}
```

## Queries

### Events last 24h by type
```sql
SELECT event_type, COUNT(*) 
FROM canonical_events 
WHERE project_id = 'proj_123' 
AND event_time >= NOW() - INTERVAL '24 hours'
GROUP BY event_type;
```

### Event lag per connection
```sql
SELECT 
  sc.name,
  NOW() - MAX(ce.event_time) as lag
FROM canonical_events ce
JOIN source_connections sc ON sc.id = ce.source_connection_id
WHERE sc.project_id = 'proj_123'
GROUP BY sc.id, sc.name;
```

### Revenue last 7 days
```sql
SELECT 
  DATE(event_time) as date,
  SUM((value_json->>'amount')::numeric) as revenue
FROM canonical_events
WHERE project_id = 'proj_123'
AND event_type = 'purchase_completed'
AND event_time >= NOW() - INTERVAL '7 days'
GROUP BY DATE(event_time)
ORDER BY date;
```

## RLS Policies

- **SELECT**: Project members
- **INSERT**: ADMIN/OWNER only (or service role)
- **UPDATE/DELETE**: Not allowed (append-only)

## Helper Functions

### `get_project_event_stats(project_id)`
Returns event counts by type for last 24h.

### `get_connection_event_lag(connection_id)`
Returns time since last event for a connection.
