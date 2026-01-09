# Alignment Golden Rule - Technical Guide

## Overview
The Golden Rule is the core intelligence layer of the Alignment Verification Center. It provides structured, actionable insights about ad-to-landing-page misalignments using a combination of heuristics and LLM analysis.

## Contract

Every alignment report generates a `golden_rule_json` object with the following structure:

```typescript
{
  why: [
    {
      signal: "Meta Pixel missing",
      impact: "high" | "medium" | "low",
      evidence: ["No Facebook Pixel detected", "Cannot track conversions"]
    }
  ],
  sources: {
    ad: {
      provider: "meta",
      ad_id: "123456789",
      creative_fields: ["headline", "primary_text", "cta"]
    },
    page: {
      url: "https://example.com/landing",
      snapshot_id: "uuid",
      fields: ["title", "h1", "ctas", "pixels", "utms"]
    }
  },
  period: {
    checked_at: "2026-01-08T19:00:00Z"
  },
  confidence: {
    score: 85,
    reasons: ["llm_ok", "scrape_ok", "tracking_ok"]
  },
  next_actions: [
    {
      action: "Install Meta Pixel on landing page",
      eta: "30m",
      owner: "dev",
      link_to_ui: "/settings/tracking"
    }
  ]
}
```

## Scoring Logic

### 1. Heuristics (Always Runs)

**Tracking Detection:**
- Meta Pixel: Searches for `fbq(`, `facebook pixel`, or meta tags
- UTM Parameters: Checks URL for `utm_` parameters
- Google Tag Manager: Looks for `gtm.js` or `googletagmanager`

**CTA Consistency:**
- Compares ad CTA with page CTAs (case-insensitive substring matching)
- Flags mismatch if no overlap found

**Offer Detection:**
- Keywords: `discount`, `off`, `%`, `free`, `trial`, `limited`, `offer`
- Flags if ad mentions offer but page doesn't

### 2. LLM Analysis (GPT-4o with Fallback)

**Input:**
- Redacted ad text (max 2000 chars, PII removed)
- Redacted page text (max 2000 chars, PII removed)

**Timeout:** 10 seconds

**Fallback:** If LLM fails, Golden Rule is still generated from heuristics alone

**Output:** Up to 3 additional signals with evidence

### 3. Confidence Calculation

```
Base Score: 100
- LLM failed: -20
- Low text (<200 chars): -15
+ Scrape successful: reason "scrape_ok"
+ Tracking present: reason "tracking_ok"
+ LLM successful: reason "llm_ok"

Final: max(0, min(100, score))
```

## PII Redaction

Before sending any text to LLM:
- Emails: `user@example.com` → `[EMAIL]`
- Phones: `+1-555-123-4567` → `[PHONE]`
- Long IDs: `abc123def456ghi789...` → `[ID]`

## Signal Prioritization

Signals are sorted by impact (high → medium → low) and limited to top 5.

**Impact Levels:**
- **High**: Critical issues affecting conversion (missing pixel, offer mismatch)
- **Medium**: Important but not blocking (UTM missing, CTA mismatch)
- **Low**: Minor inconsistencies (text variations)

## Next Actions Playbook

| Signal | Action | ETA | Owner |
|--------|--------|-----|-------|
| Meta Pixel missing | Install Meta Pixel on landing page | 30m | dev |
| UTM parameters missing | Add UTM parameters to ad destination URL | 10m | marketing |
| CTA mismatch | Align CTA text between ad and landing page | 15m | marketing |
| Offer not found | Ensure landing page displays advertised offer | 20m | marketing |

## Examples

### Example 1: Critical Tracking Issue

```json
{
  "why": [
    {
      "signal": "Meta Pixel missing",
      "impact": "high",
      "evidence": [
        "No Facebook Pixel detected on landing page",
        "Cannot track conversions"
      ]
    },
    {
      "signal": "UTM parameters missing",
      "impact": "medium",
      "evidence": [
        "Landing URL has no UTM parameters",
        "Cannot attribute traffic source"
      ]
    }
  ],
  "confidence": {
    "score": 85,
    "reasons": ["llm_ok", "scrape_ok"]
  },
  "next_actions": [
    {
      "action": "Install Meta Pixel on landing page",
      "eta": "30m",
      "owner": "dev",
      "link_to_ui": "/settings/tracking"
    }
  ]
}
```

### Example 2: LLM Fallback (Heuristics Only)

```json
{
  "why": [
    {
      "signal": "CTA mismatch",
      "impact": "medium",
      "evidence": [
        "Ad CTA: \"Shop Now\"",
        "Page CTAs: Learn More, Contact Us"
      ]
    }
  ],
  "confidence": {
    "score": 65,
    "reasons": ["llm_failed", "scrape_ok", "low_text"]
  },
  "next_actions": [
    {
      "action": "Align CTA text between ad and landing page",
      "eta": "15m",
      "owner": "marketing"
    }
  ]
}
```

## Troubleshooting

**Q: Why is confidence score low?**
- Check `confidence.reasons` array
- `llm_failed`: OpenAI timeout or error
- `low_text`: Page content < 200 chars (scrape issue?)
- Missing `tracking_ok`: No pixel/UTM detected

**Q: Why are there no next_actions?**
- Only generated for known signal types
- Custom signals from LLM may not have playbook entries

**Q: Can I customize the playbook?**
- Yes, edit `generateNextActions()` in `alignment-scorer-v2_4.ts`
- Add new signal → action mappings

## Security Notes

- **Never** store raw HTML or full page content
- **Always** redact PII before LLM calls
- **Never** expose `llm_model` or internal prompts via SafeDTO
- Golden Rule JSON is safe for client exposure (no secrets)
