# Tracking Auto-Fix Runbook

## Overview
The Auto-Fix system generates actionable code snippets to fix missing tracking pixels and parameters on landing pages.

## Supported Tracking Types

1. **Meta Pixel** (Facebook/Instagram Ads)
2. **Google Tag Manager** (GTM)
3. **Google Analytics 4** (GA4)
4. **UTM Parameters**

## API Endpoints

### Generate Fix Pack
```http
POST /api/projects/:id/integrations/alignment/fixpack
Content-Type: application/json

{
  "page_url": "https://example.com/landing",
  "snapshot_id": "optional-uuid",
  "context": {
    "platformHints": {
      "metaPixelId": "123456789",
      "gtmId": "GTM-XXXXXX",
      "ga4Id": "G-XXXXXXXXXX"
    }
  }
}
```

**Response**:
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "page_url": "https://example.com/landing",
  "detected": {
    "meta_pixel": false,
    "gtm": false,
    "ga4": true,
    "utm_params": false
  },
  "fixes": [
    {
      "type": "META_PIXEL",
      "severity": "critical",
      "instructions": "Paste before </head>",
      "snippet_html": "<script>...</script>",
      "snippet_nextjs": "<Script>...</Script>",
      "verification": "Run 'Verify Fix' after publishing"
    }
  ]
}
```

### List Fix Packs
```http
GET /api/projects/:id/integrations/alignment/fixpacks?page_url=https://example.com
```

### Verify Tracking
```http
POST /api/projects/:id/integrations/alignment/verify-tracking
Content-Type: application/json

{
  "page_url": "https://example.com/landing"
}
```

Creates a `TRACKING_VERIFY` job that scrapes the page and checks for tracking.

## How It Works

1. **Detection**: System scrapes landing page and detects missing tracking
2. **Generation**: `trackingFixService.buildFixPack()` creates fix recommendations
3. **Storage**: Fix pack saved to `tracking_fix_packs` table
4. **User Action**: User copies snippet and applies to their site
5. **Verification**: User triggers verify job to confirm fix

## Fix Pack Structure

### Meta Pixel
- **HTML**: Standard `<script>` tag with `fbq()` initialization
- **Next.js**: `<Script strategy="afterInteractive">` component
- **Verification**: Meta Pixel Helper extension or "Verify Fix" button

### Google Tag Manager
- **HTML**: GTM container script (head) + noscript (body)
- **Next.js**: `<Script>` component + `<noscript>` iframe
- **Verification**: GTM Preview mode or Tag Assistant

### Google Analytics 4
- **HTML**: gtag.js script
- **Next.js**: `<Script>` components for gtag
- **Verification**: GA4 real-time reports

### UTM Parameters
- **Example URL**: Shows properly formatted UTM params
- **Verification**: Check analytics platform for campaign data

## Security

### LeakGate Protection
All fix pack responses are scanned by LeakGate to prevent:
- API keys in snippets
- Secret tokens
- PII data

### Placeholder IDs
If platform IDs not provided:
- Meta Pixel: `YOUR_PIXEL_ID`
- GTM: `GTM-XXXXXX`
- GA4: `G-XXXXXXXXXX`

User must replace placeholders with real IDs.

## Troubleshooting

### Fix Pack Not Generated
**Symptom**: POST /fixpack returns 404

**Solution**: Ensure page has been scraped at least once. Run alignment job first.

### Snippet Not Working
**Symptom**: Pixel still not detected after applying fix

**Checklist**:
1. Replaced placeholder IDs with real IDs?
2. Snippet placed in correct location (head vs body)?
3. Page published/deployed?
4. Cache cleared?
5. Used "Verify Fix" to re-check?

### Verification Job Stuck
**Symptom**: Verify job stays in "pending" status

**Solution**: Check worker logs. Job should complete in 30-60 seconds.

## Best Practices

1. **Provide Platform IDs**: Include `platformHints` in request for accurate snippets
2. **Test in Staging**: Apply fixes to staging environment first
3. **Use Verification**: Always run "Verify Fix" after publishing
4. **Check Browser Tools**: Use Meta Pixel Helper, GTM Preview, GA Debugger

## Database Schema

### tracking_fix_packs
```sql
CREATE TABLE tracking_fix_packs (
    id uuid PRIMARY KEY,
    org_id uuid NOT NULL,
    project_id uuid NOT NULL,
    page_url text NOT NULL,
    detected jsonb NOT NULL,
    fixes jsonb NOT NULL,
    created_by uuid,
    created_at timestamptz DEFAULT now()
);
```

### RLS Policies
- **Viewer**: Can read fix packs for their projects
- **Admin/Owner**: Can create fix packs

## Related Documentation
- [CI_GATES.md](./CI_GATES.md)
- [ALIGNMENT_PIPELINE.md](../03_architecture/ALIGNMENT_PIPELINE.md)
