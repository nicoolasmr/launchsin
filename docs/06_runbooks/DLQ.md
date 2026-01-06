# DLQ Operational Runbook

This guide covers the operation, states, and verification of the Dead Letter Queue (DLQ) system.

## Lifecycle States

- **pending**: Ready to be processed or waiting for the next retry attempt according to the backoff schedule.
- **resolved**: Successfully processed.
- **dead**: Failed after maximum attempts (3) or passed the `dead_after` TTL. Requires manual intervention.

## Monitoring Locks (Single-Flight)

The DLQ worker uses PostgreSQL advisory locks to ensure that multiple instances do not process the same batch simultaneously.

### Verification SQL
To see if a lock is currently held:
```sql
SELECT pid, locktype, mode, granted, objid 
FROM pg_locks 
WHERE locktype = 'advisory';
```

## Manual Intervention (Dead Events)

If an event is in the `dead` state, it means auto-retry gave up.

1. Inspect the `last_error_message` in the `dlq_events` table.
2. Fix the underlying issue (e.g., update connector configuration or destination API).
3. Reset for retry:
```sql
UPDATE dlq_events 
SET status = 'pending', attempt_count = 0, next_retry_at = now() 
WHERE id = 'EVENT_ID';
```

## Troubleshooting

### High DLQ Lag
- Check worker logs for `Lock already held` messages (normal if frequent, but check if one instance is stuck).
- Verify the `DLQ_POLL_INTERVAL_MS` environment variable.
- Ensure the `DATABASE_URL` is correct and allows advisory locks (avoid pgbouncer in `transaction` mode for locks).
