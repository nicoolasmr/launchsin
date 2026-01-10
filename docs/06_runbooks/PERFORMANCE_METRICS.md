# Performance Metrics & SLO Runbook

## Overview
LaunchSin's performance optimization and observability infrastructure with hash-based caching, Prometheus metrics, AI cost tracking, and SLO targets.

---

## Caching

### How It Works

**Hash-based caching** (7-day TTL):
- Cache key: `sha256(ad_content_hash + ':' + page_content_hash)`
- Lookup: Query `alignment_reports_v2` for matching cache_key within 7 days
- Hit: Create new report with `cached=true`, copy findings, skip LLM call
- Miss: Run LLM scorer, persist result

**Tenant-safe**:
- Cache lookup filtered by `project_id`
- No cross-tenant cache pollution

**Force refresh**:
- Pass `force_refresh=true` in job payload
- Bypasses cache, always runs LLM

### TTL (Time To Live)

**7 days** from `created_at`:
- `cache_expires_at = created_at + 7 days`
- After 7 days, cache is considered stale
- Next job will run LLM and create fresh cache

### Database Schema

```sql
ALTER TABLE alignment_reports_v2
    ADD COLUMN cached_from_report_id uuid,
    ADD COLUMN cache_key text,
    ADD COLUMN cached_at timestamptz,
    ADD COLUMN cache_expires_at timestamptz;
```

**Index**:
```sql
CREATE INDEX idx_alignment_reports_cache_key_recent
    ON alignment_reports_v2(project_id, cache_key, created_at DESC)
    WHERE cache_key IS NOT NULL;
```

---

## AI Cost Tracking

### ai_usage_events Table

```sql
CREATE TABLE ai_usage_events (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid,
    source text NOT NULL,  -- 'alignment'
    model text NOT NULL,   -- 'gpt-4o'
    tokens_prompt int NOT NULL,
    tokens_completion int NOT NULL,
    cost_usd numeric(12,6) NOT NULL,
    created_at timestamptz NOT NULL
);
```

**Indexes**:
- `idx_ai_usage_events_org_day` (org_id, created_at DESC)
- `idx_ai_usage_events_project_day` (project_id, created_at DESC)

**RLS**:
- SELECT: Org members (viewer+)
- INSERT: Service role only
- UPDATE/DELETE: Blocked (immutable)

### Cost Calculation

**Pricing** (configured via ENV):
```json
{
  "gpt-4o": {
    "prompt_per_1k": 0.01,
    "completion_per_1k": 0.03
  }
}
```

**Formula**:
```typescript
cost_usd = (tokens_prompt / 1000) * prompt_per_1k 
         + (tokens_completion / 1000) * completion_per_1k
```

### Home KPIs

**llm_cost_today_usd**:
```sql
SELECT SUM(cost_usd) FROM ai_usage_events
WHERE org_id = $1
  AND created_at >= CURRENT_DATE;
```

**llm_cost_7d_usd**:
```sql
SELECT SUM(cost_usd) FROM ai_usage_events
WHERE org_id = $1
  AND created_at >= NOW() - INTERVAL '7 days';
```

---

## Prometheus Metrics

### Endpoint

**GET /api/metrics**:
- Returns Prometheus-formatted metrics
- No authentication (standard scraping)
- No PII in labels
- No LeakGate (metrics don't contain secrets)

### Available Metrics

#### HTTP Metrics

**http_request_duration_ms** (histogram):
```promql
# Labels: method, route, status
# Buckets: 10, 50, 100, 200, 500, 1000, 2000, 5000 ms

# Example query: P95 latency
histogram_quantile(0.95, 
  rate(http_request_duration_ms_bucket[5m])
)
```

#### Alignment Metrics

**alignment_jobs_processed_total** (counter):
```promql
# Labels: result (ok | error)

# Example query: Success rate
rate(alignment_jobs_processed_total{result="ok"}[5m])
/ 
rate(alignment_jobs_processed_total[5m])
```

**alignment_jobs_cached_total** (counter):
```promql
# No labels

# Example query: Cache hit rate
rate(alignment_jobs_cached_total[5m])
/
rate(alignment_jobs_processed_total[5m])
```

**alignment_llm_cost_usd_total** (counter):
```promql
# No labels

# Example query: Cost per hour
rate(alignment_llm_cost_usd_total[1h]) * 3600
```

#### Home Action Metrics

**home_actions_executed_total** (counter):
```promql
# Labels: action_type, status (success | error)

# Example query: Action success rate
rate(home_actions_executed_total{status="success"}[5m])
/
rate(home_actions_executed_total[5m])
```

#### Audit Metrics

**audit_logs_written_total** (counter):
```promql
# No labels

# Example query: Audit log rate
rate(audit_logs_written_total[5m])
```

---

## SLO Targets

### Availability

**Target**: 99.5% uptime

**PromQL**:
```promql
# Availability over 30 days
(
  sum(rate(http_request_duration_ms_count{status=~"2.."}[30d]))
  /
  sum(rate(http_request_duration_ms_count[30d]))
) * 100
```

**Alert Rule**:
```yaml
- alert: LowAvailability
  expr: |
    (
      sum(rate(http_request_duration_ms_count{status=~"2.."}[5m]))
      /
      sum(rate(http_request_duration_ms_count[5m]))
    ) < 0.995
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Availability below 99.5%"
```

### P95 Latency

**Target**: < 60s for alignment jobs

**PromQL**:
```promql
# P95 latency for alignment endpoints
histogram_quantile(0.95,
  rate(http_request_duration_ms_bucket{route=~"/api/alignment.*"}[5m])
) / 1000  # Convert to seconds
```

**Alert Rule**:
```yaml
- alert: HighP95Latency
  expr: |
    histogram_quantile(0.95,
      rate(http_request_duration_ms_bucket{route=~"/api/alignment.*"}[5m])
    ) > 60000  # 60 seconds in ms
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "P95 latency above 60s"
```

### Error Rate

**Target**: < 1%

**PromQL**:
```promql
# Error rate over 5 minutes
(
  sum(rate(http_request_duration_ms_count{status=~"5.."}[5m]))
  /
  sum(rate(http_request_duration_ms_count[5m]))
) * 100
```

**Alert Rule**:
```yaml
- alert: HighErrorRate
  expr: |
    (
      sum(rate(http_request_duration_ms_count{status=~"5.."}[5m]))
      /
      sum(rate(http_request_duration_ms_count[5m]))
    ) > 0.01  # 1%
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Error rate above 1%"
```

### Cache Hit Rate

**Target**: > 70% for alignment jobs

**PromQL**:
```promql
# Cache hit rate over 24 hours
(
  sum(rate(alignment_jobs_cached_total[24h]))
  /
  sum(rate(alignment_jobs_processed_total[24h]))
) * 100
```

**Alert Rule**:
```yaml
- alert: LowCacheHitRate
  expr: |
    (
      sum(rate(alignment_jobs_cached_total[24h]))
      /
      sum(rate(alignment_jobs_processed_total[24h]))
    ) < 0.70  # 70%
  for: 1h
  labels:
    severity: info
  annotations:
    summary: "Cache hit rate below 70%"
```

---

## Useful PromQL Queries

### Request Rate
```promql
# Requests per second
rate(http_request_duration_ms_count[5m])
```

### Error Breakdown
```promql
# Errors by route
sum by (route) (
  rate(http_request_duration_ms_count{status=~"5.."}[5m])
)
```

### Cost Tracking
```promql
# LLM cost per day
increase(alignment_llm_cost_usd_total[1d])
```

### Cache Efficiency
```promql
# Cached vs total jobs
sum(rate(alignment_jobs_cached_total[1h]))
/
sum(rate(alignment_jobs_processed_total[1h]))
```

---

## Troubleshooting

### High Latency

**Diagnosis**:
```promql
# Slowest routes
topk(5,
  histogram_quantile(0.95,
    rate(http_request_duration_ms_bucket[5m])
  )
) by (route)
```

**Actions**:
1. Check database query performance
2. Review cache hit rate
3. Investigate external API calls

### Low Cache Hit Rate

**Diagnosis**:
```sql
SELECT 
  COUNT(*) FILTER (WHERE cached = true) as cached,
  COUNT(*) as total,
  (COUNT(*) FILTER (WHERE cached = true)::float / COUNT(*)) * 100 as hit_rate
FROM alignment_reports_v2
WHERE created_at >= NOW() - INTERVAL '24 hours';
```

**Actions**:
1. Check if cache_key is being computed correctly
2. Verify TTL (7 days) is appropriate
3. Review force_refresh usage

### High LLM Costs

**Diagnosis**:
```sql
SELECT 
  DATE(created_at) as day,
  SUM(cost_usd) as total_cost,
  COUNT(*) as calls,
  AVG(tokens_prompt + tokens_completion) as avg_tokens
FROM ai_usage_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;
```

**Actions**:
1. Increase cache hit rate
2. Review prompt engineering (reduce tokens)
3. Consider cheaper models for non-critical tasks

---

## Security

### Metrics Endpoint
- **No authentication**: Standard Prometheus scraping
- **No PII**: Labels contain only route patterns, not user data
- **No secrets**: Metrics don't expose API keys or tokens

### Cost Data
- **Tenant scoping**: RLS enforces org_id filtering
- **Read-only for users**: Only service role can insert
- **Immutable**: No UPDATE/DELETE policies

---

## Related Documentation
- [HOME_COMMAND_CENTER.md](../00_overview/HOME_COMMAND_CENTER.md)
- [AUDIT_LOGS.md](./AUDIT_LOGS.md)
- [HOME_PERSONALIZATION.md](./HOME_PERSONALIZATION.md)
