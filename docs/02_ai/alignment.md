# AI Alignment Intelligence

AI-powered analysis of ad-to-landing page congruence using OpenAI GPT-4.

## Overview

The Alignment Intelligence system automatically detects misalignments between ad creatives and their landing pages, providing actionable recommendations to improve conversion rates.

## How It Works

1. **Ad Creative Extraction**: Fetches ad copy, headline, CTA from Meta Ads API
2. **Landing Page Scraping**: Analyzes page title, H1, CTAs, tracking pixels
3. **AI Analysis**: GPT-4 evaluates congruence across 4 dimensions
4. **Scoring**: Generates 0-100 score with detailed issue breakdown
5. **Recommendations**: Provides specific fixes for each issue

## Analysis Dimensions

| Dimension | Weight | Description |
|-----------|--------|-------------|
| Message Match | 35% | Does page content match ad promise? |
| Offer Match | 30% | Are pricing/product consistent? |
| CTA Consistency | 20% | Do CTAs align between ad and page? |
| Tracking Presence | 15% | Is proper tracking in place? |

## Score Interpretation

| Score | Status | Action Required |
|-------|--------|-----------------|
| 90-100 | Excellent | Monitor |
| 70-89 | Good | Minor optimizations |
| 50-69 | Fair | Review recommendations |
| 0-49 | Critical | Immediate action needed |

## Data Model

### `alignment_reports` Table

```sql
CREATE TABLE alignment_reports (
    id UUID PRIMARY KEY,
    org_id UUID,
    project_id UUID,
    source_connection_id UUID,
    ad_id TEXT,
    ad_name TEXT,
    landing_url TEXT,
    score INT CHECK (score >= 0 AND score <= 100),
    reasons_json JSONB, -- Array of issues
    evidence_json JSONB, -- Collected data
    analyzed_by TEXT DEFAULT 'gpt-4',
    created_at TIMESTAMPTZ
);
```

### Issue Types

- `message_mismatch`: Ad promise doesn't match page content
- `offer_mismatch`: Price/product inconsistency
- `cta_mismatch`: CTA text differs between ad and page
- `tracking_missing`: No pixel or UTM parameters

### Severity Levels

- `critical`: Immediate fix required (score impact: -30)
- `high`: Important issue (score impact: -20)
- `medium`: Should be addressed (score impact: -10)
- `low`: Minor optimization (score impact: -5)

## API Usage

### Trigger Alignment Check

```bash
POST /api/projects/{projectId}/integrations/{connectionId}/alignment/check
```

**Request:**
```json
{
  "ad_id": "123456789"
}
```

**Response:**
```json
{
  "report_id": "uuid",
  "score": 75,
  "issues": 2,
  "top_issue": "No tracking pixel detected on landing page"
}
```

### Get Alignment Reports

```bash
GET /api/projects/{projectId}/integrations/{connectionId}/alignment/reports?limit=20&min_score=0&max_score=70
```

**Response:**
```json
[
  {
    "id": "uuid",
    "ad_id": "123",
    "ad_name": "Summer Sale Ad",
    "landing_url": "https://example.com/sale",
    "score": 65,
    "reasons_json": [
      {
        "type": "message_mismatch",
        "severity": "high",
        "description": "Ad promises '50% off' but page shows '30% off'",
        "recommendation": "Update page headline to match ad offer"
      }
    ],
    "created_at": "2026-01-06T12:00:00Z"
  }
]
```

## AI Prompt Engineering

The system uses a structured prompt to ensure consistent analysis:

```
Analyze the alignment between this ad and its landing page:

**AD CREATIVE:**
- Headline: [ad headline]
- Body: [ad body]
- CTA: [ad CTA]

**LANDING PAGE:**
- Title: [page title]
- H1: [page H1]
- CTAs: [page CTAs]
- Has Pixel: [yes/no]
- Has UTM: [yes/no]

**OUTPUT FORMAT (JSON):**
{
  "message_match_score": <0-100>,
  "offer_match_score": <0-100>,
  "cta_match_score": <0-100>,
  "tracking_score": <0-100>,
  "issues": [...]
}
```

## Fallback Logic

If OpenAI API fails, the system uses heuristic scoring:

- **No pixel**: -20 points
- **No UTM**: -10 points
- **No CTA/form**: -30 points

## Cost Estimation

| Component | Cost per Check | Monthly (1,000 checks) |
|-----------|----------------|------------------------|
| OpenAI GPT-4 | ~$0.03 | ~$30 |
| Page scraping | $0 | $0 |
| **Total** | **$0.03** | **$30** |

## Limits & Best Practices

### Rate Limits

- OpenAI: 3,500 requests/min (GPT-4)
- Page scraping: No hard limit (respect robots.txt)

### Best Practices

1. **Cache results**: Don't re-analyze same ad+page combination
2. **Batch checks**: Run during off-peak hours
3. **Monitor costs**: Set budget alerts in OpenAI dashboard
4. **Review AI outputs**: Spot-check for accuracy

## Security & Privacy

### PII Handling

- No PII sent to OpenAI
- Only public ad copy and page content analyzed
- User data (email, phone) never included

### API Keys

- OpenAI API key stored in environment variables
- Never exposed in client-side code
- Rotated quarterly

## Troubleshooting

### Low accuracy scores

**Symptom:** AI consistently gives incorrect scores

**Solution:**
1. Review prompt engineering
2. Add more examples to system message
3. Increase temperature for creativity (currently 0.3)

### High costs

**Symptom:** OpenAI bill exceeds budget

**Solution:**
1. Enable result caching (UNIQUE constraint)
2. Use GPT-3.5-turbo for non-critical checks
3. Implement daily check limits per org

### Page scraping fails

**Symptom:** Can't extract page elements

**Solution:**
1. Check if page requires JavaScript (use Puppeteer)
2. Verify page is publicly accessible
3. Add retry logic with exponential backoff

## Roadmap

### v1.1 (Q1 2026)
- [ ] Visual analysis (screenshot comparison)
- [ ] A/B test suggestions
- [ ] Auto-pause low-scoring ads

### v2.0 (Q2 2026)
- [ ] Multi-language support
- [ ] Industry-specific scoring models
- [ ] Competitive analysis

## References

- [OpenAI API Docs](https://platform.openai.com/docs)
- [GPT-4 Pricing](https://openai.com/pricing)
- [Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
