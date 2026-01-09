# Alignment Alerting - Slack/Teams Integration Guide

## Overview
The Alignment system can send real-time alerts to Slack or Microsoft Teams when critical issues are detected (low scores, tracking failures).

## Alert Triggers

Alerts are dispatched when:
1. **Alignment Score < 50** (Critical)
2. **Tracking Missing**: No Meta Pixel OR No UTM parameters

## Deduplication
To prevent spam, alerts are deduplicated using a SHA-256 fingerprint:

**Fingerprint Formula:**
```
hash(projectId | url | adId | alertType | day)
```

**Behavior:**
- Same alert on same day → Suppressed (increments `suppressed_count`)
- Different day → New alert sent
- Logged as `alert_suppressed=true` when deduplicated

## Setting Up Slack Notifications

### 1. Create Slack Incoming Webhook

1. Go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. Name: `LaunchSin Alerts`
4. Select your workspace
5. Navigate to **"Incoming Webhooks"**
6. Activate **"Incoming Webhooks"**
7. Click **"Add New Webhook to Workspace"**
8. Select channel (e.g., `#marketing-alerts`)
9. Copy the webhook URL (starts with `https://hooks.slack.com/services/...`)

### 2. Add to LaunchSin

**Via UI:**
1. Navigate to **Integrations → Alignment → Notifications**
2. Click **"Add Channel"**
3. Select **"Slack"**
4. Paste webhook URL
5. Click **"Save"**

**Via API:**
```bash
POST /api/projects/{projectId}/integrations/alignment/notifications
Authorization: Bearer {token}
Content-Type: application/json

{
  "channel": "Slack Marketing Alerts",
  "webhook_url": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX"
}
```

### 3. Test Webhook

Click **"Test Webhook"** button in UI to send a test message.

## Setting Up Microsoft Teams Notifications

### 1. Create Teams Incoming Webhook

1. Open Microsoft Teams
2. Navigate to the channel where you want alerts
3. Click **"..."** → **"Connectors"**
4. Search for **"Incoming Webhook"**
5. Click **"Configure"**
6. Name: `LaunchSin Alerts`
7. Upload icon (optional)
8. Click **"Create"**
9. Copy the webhook URL

### 2. Add to LaunchSin

Same process as Slack (use Teams webhook URL).

## Alert Format

**Slack/Teams Message:**
```
🚨 *LaunchSin Alert* 🚨

**Project:** abc-123-def
**Issue:** low_score
**Score:** 42
**URL:** https://example.com/landing
**Report:** https://app.launchsin.com/projects/abc-123/integrations/alignment?report=report-id
```

## Monitoring Alerts

### View Alert History
```sql
SELECT 
  type,
  severity,
  message,
  status,
  suppressed_count,
  created_at
FROM alignment_alerts
WHERE project_id = 'your-project-id'
ORDER BY created_at DESC
LIMIT 50;
```

### Check Suppression Rate
```sql
SELECT 
  type,
  COUNT(*) as total_alerts,
  SUM(suppressed_count) as total_suppressed,
  ROUND(100.0 * SUM(suppressed_count) / COUNT(*), 2) as suppression_rate_pct
FROM alignment_alerts
WHERE project_id = 'your-project-id'
GROUP BY type;
```

### View Webhook Stats
```sql
SELECT 
  channel,
  enabled,
  last_sent_at,
  total_sent
FROM outbound_notifications
WHERE project_id = 'your-project-id';
```

## Troubleshooting

### Webhook Not Sending

**Check 1: Enabled?**
```sql
SELECT * FROM outbound_notifications WHERE id = 'notif-id';
```
Ensure `enabled = true`

**Check 2: Webhook URL Valid?**
- Test manually with curl:
```bash
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test from LaunchSin"}'
```

**Check 3: Alert Deduplicated?**
```sql
SELECT * FROM alignment_alerts 
WHERE project_id = 'project-id' 
AND alert_fingerprint = 'fingerprint-hash'
AND created_at >= CURRENT_DATE;
```
If exists: alert was suppressed (check `suppressed_count`)

**Check 4: Worker Logs**
```bash
kubectl logs -f deployment/launchsin-workers -n production | grep "Webhook"
```
Look for:
- `Webhook sent to Slack`
- `Webhook dispatch failed`
- `Alert suppressed (dedup)`

### Too Many Alerts

**Increase Dedup Window:**
Currently dedup is per-day. To extend:
1. Modify `generateAlertFingerprint()` in `alignment-ops.ts`
2. Change day bucket to week: `const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))`

**Adjust Thresholds:**
1. Increase critical score threshold (currently < 50)
2. Edit `dispatchAlerts()` in `alignment-ops.ts`:
```typescript
const isCritical = report.score < 30; // More strict
```

**Disable Specific Alert Types:**
```sql
UPDATE outbound_notifications 
SET enabled = false 
WHERE channel = 'Slack Ops' 
AND project_id = 'project-id';
```

## Security

**Webhook URL Storage:**
- Stored in `secret_refs` table (encrypted)
- Never exposed in API responses (SafeDTO strips it)
- Only server/worker can decrypt

**RBAC:**
- Only admins/owners can add/edit notification channels
- Viewers/members cannot see webhook URLs

**Rate Limiting:**
- Dedup prevents spam
- Max 1 webhook per unique alert per day

## Best Practices

1. **Separate Channels**: Use different Slack channels for different severity levels
2. **Test First**: Always use "Test Webhook" before relying on alerts
3. **Monitor Suppression**: High suppression rate = recurring issue (fix root cause)
4. **Rotate Webhooks**: If webhook URL leaks, regenerate in Slack/Teams and update LaunchSin
5. **Alert Fatigue**: If too many alerts, increase score threshold or disable non-critical types

## API Reference

### GET /notifications
Returns all notification channels for a project (webhook URLs redacted).

### POST /notifications
Creates a new notification channel (admin/owner only).

**Request:**
```json
{
  "channel": "Slack Ops",
  "webhook_url": "https://hooks.slack.com/services/..."
}
```

**Response:**
```json
{
  "id": "uuid",
  "channel": "Slack Ops",
  "enabled": true,
  "created_at": "2026-01-08T19:00:00Z"
}
```
(Note: `webhook_url` is NOT returned)

### DELETE /notifications/:id
Deletes a notification channel (admin/owner only).
