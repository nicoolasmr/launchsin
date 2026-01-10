# GTM Integration Guide

## Overview
Google Tag Manager (GTM) integration for LaunchSin enables automated tag management and tracking implementation.

---

## Prerequisites

### 1. Google Cloud Project
- Active Google Cloud project
- Billing enabled
- Tag Manager API enabled

### 2. OAuth 2.0 Credentials
- Client ID
- Client Secret
- Redirect URI configured

### 3. GTM Container
- Existing GTM container
- Container ID (GTM-XXXXXX)
- Workspace access

---

## OAuth Setup

### Step 1: Enable Tag Manager API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** > **Library**
4. Search for "Tag Manager API"
5. Click **Enable**

### Step 2: Create OAuth Credentials

1. Navigate to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `LaunchSin GTM Integration`
5. Authorized redirect URIs:
   ```
   https://yourdomain.com/api/oauth/gtm/callback
   http://localhost:3000/api/oauth/gtm/callback (dev)
   ```
6. Click **Create**
7. Save **Client ID** and **Client Secret**

### Step 3: Configure Scopes

Required OAuth scopes:
```
https://www.googleapis.com/auth/tagmanager.edit.containers
https://www.googleapis.com/auth/tagmanager.readonly (optional)
```

---

## Integration Flow

### 1. Authorization

**Endpoint**: `GET /api/oauth/gtm/authorize`

**Flow**:
1. User clicks "Connect GTM"
2. Redirect to Google OAuth consent screen
3. User authorizes scopes
4. Google redirects to callback with authorization code
5. Exchange code for access token + refresh token
6. Store tokens in `secret_refs` (AES-256 encrypted)

### 2. Token Storage

```sql
-- Store access token
INSERT INTO secret_refs (org_id, key_name, encrypted_value)
VALUES (
  'org-uuid',
  'gtm_oauth_access_token',
  pgp_sym_encrypt('ACCESS_TOKEN', 'encryption_key')
);

-- Store refresh token
INSERT INTO secret_refs (org_id, key_name, encrypted_value)
VALUES (
  'org-uuid',
  'gtm_oauth_refresh_token',
  pgp_sym_encrypt('REFRESH_TOKEN', 'encryption_key')
);
```

### 3. Token Refresh

**When**: Access token expires (typically 1 hour)

**Flow**:
1. Detect 401 Unauthorized from GTM API
2. Fetch refresh token from `secret_refs`
3. POST to `https://oauth2.googleapis.com/token`
4. Update access token in `secret_refs`
5. Retry original request

---

## GTM API Usage

### List Containers

```typescript
GET https://tagmanager.googleapis.com/tagmanager/v2/accounts/{accountId}/containers
Authorization: Bearer {access_token}
```

### Get Workspace

```typescript
GET https://tagmanager.googleapis.com/tagmanager/v2/accounts/{accountId}/containers/{containerId}/workspaces/{workspaceId}
Authorization: Bearer {access_token}
```

### Create Tag

```typescript
POST https://tagmanager.googleapis.com/tagmanager/v2/accounts/{accountId}/containers/{containerId}/workspaces/{workspaceId}/tags
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "name": "GA4 Config",
  "type": "gaawc",
  "parameter": [
    {
      "type": "template",
      "key": "measurementId",
      "value": "G-XXXXXXXXXX"
    }
  ],
  "firingTriggerId": ["2147479553"]
}
```

### Create Version

```typescript
POST https://tagmanager.googleapis.com/tagmanager/v2/accounts/{accountId}/containers/{containerId}/workspaces/{workspaceId}/create_version
Authorization: Bearer {access_token}
```

---

## Security Best Practices

### 1. Token Management
- **Never** log tokens
- Store in `secret_refs` (AES-256)
- Rotate refresh tokens every 6 months
- Revoke on user disconnect

### 2. Scope Minimization
- Only request necessary scopes
- Use `edit.containers` (not `manage.accounts`)
- Avoid `delete` scopes

### 3. Rate Limiting
- GTM API: 1000 requests/day/user
- Implement exponential backoff
- Cache container/workspace data

### 4. Error Handling
- Handle 401 (refresh token)
- Handle 403 (insufficient permissions)
- Handle 429 (rate limit)
- Log errors (redacted)

---

## Common Issues

### Issue: "insufficient_permissions"

**Cause**: User didn't grant required scopes

**Solution**:
1. Re-authorize with correct scopes
2. Verify OAuth consent screen configuration
3. Check user's GTM account permissions

### Issue: "invalid_grant" on token refresh

**Cause**: Refresh token expired or revoked

**Solution**:
1. User must re-authorize
2. Delete old tokens from `secret_refs`
3. Initiate new OAuth flow

### Issue: "quota_exceeded"

**Cause**: Exceeded daily API quota

**Solution**:
1. Implement caching (container/workspace data)
2. Batch operations
3. Request quota increase from Google

---

## Testing

### Manual Test Flow

1. **Authorize**:
   ```bash
   curl "http://localhost:3000/api/oauth/gtm/authorize"
   ```

2. **List Containers**:
   ```bash
   curl -H "Authorization: Bearer ACCESS_TOKEN" \
     "https://tagmanager.googleapis.com/tagmanager/v2/accounts/ACCOUNT_ID/containers"
   ```

3. **Create Tag** (via LaunchSin API):
   ```bash
   POST /api/projects/:id/integrations/auto-apply/apply
   {
     "fixpack_id": "uuid",
     "target_id": "uuid",
     "mode": "GTM",
     "dry_run": true
   }
   ```

---

## Related Documentation
- [AUTO_APPLY_GTM.md](../06_runbooks/AUTO_APPLY_GTM.md)
- [Google Tag Manager API Reference](https://developers.google.com/tag-platform/tag-manager/api/v2)
- [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
