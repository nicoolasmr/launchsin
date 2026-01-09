# Performance & Observability Guide

## Performance Optimization

### Hash-Based Caching

**Concept**: Reuse alignment reports when ad content and page content haven't changed.

**Implementation** (documented for future):
```typescript
// In alignment worker
const adHash = sha256(ad.headline + ad.primary_text + ad.cta);
const pageHash = sha256(page.title + page.h1.join() + page.ctas.join());

// Check for recent report with same hashes
const { data: cachedReport } = await supabase
    .from('alignment_reports_v2')
    .select('*')
    .eq('project_id', projectId)
    .eq('ad_content_hash', adHash)
    .eq('page_content_hash', pageHash)
    .gte('created_at', sevenDaysAgo)
    .limit(1)
    .single();

if (cachedReport) {
    // Reuse score, mark as cached
    return { ...cachedReport, cached: true };
}
```

**Benefits**:
- Reduces OpenAI API calls (cost savings)
- Faster response times
- Lower worker load

**TTL**: 7 days (configurable)

---

## Observability Metrics

### Prometheus Metrics (Documented)

**Alignment Jobs**:
```
alignment_jobs_processed_total{status="success|failed"}
alignment_jobs_cached_total
alignment_jobs_duration_ms (histogram)
```

**Alerts**:
```
alignment_alerts_created_total{severity="critical|high|medium"}
alignment_alerts_suppressed_total
```

**Scraping**:
```
alignment_scrape_duration_ms (histogram)
alignment_llm_duration_ms (histogram)
```

### Example Queries

**Cache Hit Rate**:
```promql
rate(alignment_jobs_cached_total[5m]) / 
rate(alignment_jobs_processed_total[5m])
```

**P95 Latency**:
```promql
histogram_quantile(0.95, 
  rate(alignment_jobs_duration_ms_bucket[5m])
)
```

**Error Rate**:
```promql
rate(alignment_jobs_processed_total{status="failed"}[5m]) /
rate(alignment_jobs_processed_total[5m])
```

---

## SLO Targets

### Availability
- **Target**: 99.5% uptime
- **Measurement**: Successful job completion rate

### Latency
- **Target**: P95 < 60s (full alignment check)
- **Target**: P95 < 30s (tracking verify)

### Error Rate
- **Target**: < 1% failed jobs
- **Measurement**: Job status = 'failed'

---

## Cost Optimization

### Current Costs (Estimated)
- OpenAI API: ~$0.01 per alignment check
- Scraping: ~$0.001 per page
- Storage: ~$0.001 per report

### Optimization Strategies

1. **Caching** (7-day TTL):
   - Expected cache hit rate: 40-60%
   - Cost savings: ~$0.004 per cached check

2. **Batch Processing**:
   - Process multiple URLs per job
   - Amortize scraping overhead

3. **Smart Scheduling**:
   - Reduce frequency for stable pages
   - Increase for high-change pages

---

## Monitoring Dashboard

### Key Metrics to Display

**Health**:
- Jobs processed (last hour)
- Success rate
- Error rate

**Performance**:
- P50, P95, P99 latency
- Cache hit rate
- Queue depth

**Cost**:
- OpenAI API calls (daily)
- Estimated daily cost
- Cost per project

---

## Alerting Rules

### Critical Alerts

**High Error Rate**:
```yaml
alert: AlignmentHighErrorRate
expr: rate(alignment_jobs_processed_total{status="failed"}[5m]) > 0.05
for: 5m
severity: critical
```

**Queue Backup**:
```yaml
alert: AlignmentQueueBackup
expr: alignment_jobs_queued > 100
for: 10m
severity: warning
```

**Slow Processing**:
```yaml
alert: AlignmentSlowProcessing
expr: histogram_quantile(0.95, alignment_jobs_duration_ms) > 120000
for: 15m
severity: warning
```

---

## Performance Testing

### Load Test Scenario
```bash
# Generate 100 alignment jobs
for i in {1..100}; do
  curl -X POST /api/projects/test/integrations/alignment/jobs \
    -d '{"page_url": "https://example.com/page-'$i'"}'
done

# Monitor metrics
watch -n 1 'curl localhost:9090/metrics | grep alignment_'
```

### Expected Results
- P95 latency: < 60s
- Success rate: > 99%
- Cache hit rate: 40-60% (after warmup)

---

## Related Documentation
- [CI_GATES.md](./CI_GATES.md)
- [TRACKING_AUTOFIX.md](./TRACKING_AUTOFIX.md)
- [TIMELINE_DIFFS.md](./TIMELINE_DIFFS.md)
