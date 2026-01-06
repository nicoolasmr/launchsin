# Event Ingest Runbook

Operational guide for debugging and monitoring canonical event ingestion.

## Architecture

```
External Source (Hotmart/Meta/etc.)
         ↓
    Webhook/API
         ↓
  EventIngestService
         ↓
  canonical_events table
         ↓
    (on error) → DLQ
```

## Monitoring

### Check event flow health

```sql
-- Events ingested in last hour
SELECT COUNT(*) FROM canonical_events 
WHERE ingested_at >= NOW() - INTERVAL '1 hour';

-- Events by source (last 24h)
SELECT 
  sc.name,
  sc.type,
  COUNT(*) as events
FROM canonical_events ce
JOIN source_connections sc ON sc.id = ce.source_connection_id
WHERE ce.event_time >= NOW() - INTERVAL '24 hours'
GROUP BY sc.id, sc.name, sc.type
ORDER BY events DESC;
```

### Detect lag

```sql
-- Connections with >5min lag
SELECT 
  sc.name,
  NOW() - MAX(ce.event_time) as lag
FROM canonical_events ce
JOIN source_connections sc ON sc.id = ce.source_connection_id
GROUP BY sc.id, sc.name
HAVING NOW() - MAX(ce.event_time) > INTERVAL '5 minutes';
```

### Check for duplicates (should be 0)

```sql
-- Attempts to insert duplicates (check DLQ)
SELECT COUNT(*) FROM dlq_events
WHERE error_class = 'DUPLICATE_EVENT'
AND created_at >= NOW() - INTERVAL '1 hour';
```

## Debugging

### Webhook not receiving events

1. **Check connection status:**
   ```sql
   SELECT id, name, is_active, config_json 
   FROM source_connections 
   WHERE id = 'conn_123';
   ```

2. **Verify webhook URL:**
   - Hotmart: `https://yourdomain.com/api/webhooks/hotmart/{connectionId}`
   - Check DNS resolution and SSL certificate

3. **Check server logs:**
   ```bash
   kubectl logs -f deployment/launchsin-server | grep "webhook"
   ```

### Events not appearing in UI

1. **Check RLS policies:**
   ```sql
   -- Run as user (not service role)
   SELECT COUNT(*) FROM canonical_events 
   WHERE project_id = 'proj_123';
   ```

2. **Verify user has project access:**
   ```sql
   SELECT * FROM org_members 
   WHERE user_id = auth.uid();
   ```

### High DLQ rate

1. **Check error patterns:**
   ```sql
   SELECT 
     error_class,
     COUNT(*) as count,
     MAX(last_error_message) as sample_error
   FROM dlq_events
   WHERE created_at >= NOW() - INTERVAL '1 hour'
   GROUP BY error_class
   ORDER BY count DESC;
   ```

2. **Common issues:**
   - `INVALID_HOTTOK`: Webhook secret mismatch
   - `MISSING_FIELD`: Source payload schema changed
   - `PII_HASH_ERROR`: Org hash key not configured

## Manual Intervention

### Replay DLQ events

```sql
-- Mark for retry
UPDATE dlq_events 
SET status = 'pending', 
    next_retry_at = NOW()
WHERE id = 'dlq_123';
```

### Force re-ingest (use with caution)

```sql
-- Delete duplicate constraint temporarily
BEGIN;
ALTER TABLE canonical_events DROP CONSTRAINT unique_event_per_source;
-- Insert events
-- ...
ALTER TABLE canonical_events ADD CONSTRAINT unique_event_per_source 
  UNIQUE (source_connection_id, idempotency_key);
COMMIT;
```

## Alerts

### Critical (PagerDuty)

- No events for >15min on active connection
- DLQ rate >10% of total events
- Event lag >30min

### Warning (Slack)

- DLQ rate >5%
- Event lag >10min
- Duplicate rate >1%

## Performance

### Slow queries

```sql
-- Check index usage
EXPLAIN ANALYZE
SELECT * FROM canonical_events
WHERE project_id = 'proj_123'
AND event_time >= NOW() - INTERVAL '7 days';
```

### Partition strategy (future)

For high-volume orgs (>1M events/day), consider partitioning by `event_time`:

```sql
-- Monthly partitions
CREATE TABLE canonical_events_2026_01 PARTITION OF canonical_events
FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

## Troubleshooting Checklist

- [ ] Connection is `is_active = true`
- [ ] Webhook URL is correct and accessible
- [ ] Hottok/API key is valid
- [ ] User has project membership
- [ ] RLS policies allow SELECT
- [ ] No constraint violations in logs
- [ ] DLQ worker is running
- [ ] Event time is not in future (>5min)
