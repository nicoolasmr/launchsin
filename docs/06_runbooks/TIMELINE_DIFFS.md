# Timeline Diffs Runbook

## Overview
The Timeline feature tracks changes to landing pages over time, showing before/after comparisons of title, H1, CTAs, and tracking pixels.

## How It Works

### 1. Diff Generation
When a new page snapshot is created, the system:
1. Finds the previous snapshot for the same URL
2. Compares title, H1, CTAs, tracking pixels
3. Generates a diff JSON with old/new values
4. Saves to `page_snapshot_diffs` table

### 2. Timeline API
```http
GET /api/projects/:id/integrations/alignment/timeline?page_url=https://example.com
```

Returns list of changes with:
- `diff_summary`: Human-readable summary
- `diff_json`: Structured diff data
- `prev_snapshot`: Previous snapshot data
- `next_snapshot`: New snapshot data

### 3. Timeline UI
Navigate to: **Alignment → Timeline tab**

Features:
- Filter by page URL
- View change history
- Compare before/after
- See tracking changes

## Diff Structure

```json
{
  "title": {
    "old": "Buy Now - Special Offer",
    "new": "Limited Time Sale"
  },
  "h1": {
    "old": ["Welcome"],
    "new": ["Welcome Back"]
  },
  "ctas": {
    "old": ["Buy Now", "Learn More"],
    "new": ["Shop Now", "Get Started"]
  },
  "tracking": {
    "meta_pixel": {
      "old": false,
      "new": true
    }
  }
}
```

## Use Cases

### 1. Track A/B Test Changes
Monitor when landing page copy changes:
- Title variations
- H1 headlines
- CTA button text

### 2. Verify Tracking Implementation
Confirm tracking pixels added/removed:
- Meta Pixel installation
- GTM deployment
- GA4 setup

### 3. Audit Compliance
Track changes for compliance:
- Privacy policy updates
- Terms of service changes
- Cookie consent modifications

## Troubleshooting

### No Diffs Showing
**Symptom**: Timeline is empty

**Solutions**:
1. Ensure page has been scraped at least twice
2. Check snapshots exist in `page_snapshots` table
3. Verify same URL used (exact match required)

### Diff Not Generated
**Symptom**: New snapshot created but no diff

**Check**:
```sql
SELECT COUNT(*) FROM page_snapshots 
WHERE url = 'https://example.com' 
ORDER BY created_at DESC LIMIT 2;
```

Should return 2+ rows.

### Compare Modal Empty
**Symptom**: Compare shows "N/A" for all fields

**Solution**: Snapshots may not have extracted data. Re-run alignment job.

## Database Schema

### page_snapshot_diffs
```sql
CREATE TABLE page_snapshot_diffs (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    prev_snapshot_id uuid,
    next_snapshot_id uuid,
    diff_json jsonb NOT NULL,
    diff_summary text,
    created_at timestamptz DEFAULT now()
);
```

### Indexes
- `(project_id, created_at DESC)` - Timeline queries
- `(prev_snapshot_id, next_snapshot_id)` - Snapshot lookups

## Best Practices

1. **Regular Scraping**: Schedule alignment jobs to capture changes
2. **URL Consistency**: Use exact same URL (including query params)
3. **Retention**: Archive old diffs after 90 days
4. **Monitoring**: Alert on unexpected changes

## Related Documentation
- [CI_GATES.md](./CI_GATES.md)
- [TRACKING_AUTOFIX.md](./TRACKING_AUTOFIX.md)
- [ALIGNMENT_PIPELINE.md](../03_architecture/ALIGNMENT_PIPELINE.md)
