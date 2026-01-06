# API Endpoints Guide

## Authentication
All endpoints (except `/health`) require a Supabase JWT in the `Authorization: Bearer <token>` header.

| Endpoint | Method | Required Role | Description |
| :--- | :--- | :--- | :--- |
| `/api/health` | GET | None | Check system status. |
| `/api/projects` | GET | Viewer+ | List projects within the authenticated tenant. |
| `/api/projects/:id` | GET | Viewer+ | Fetch details for a specific project. |
| `/api/projects/:projectId/integrations` | GET | Viewer+ | List integrations for a project. |
| `/api/projects/:projectId/integrations` | POST | Admin+ | Create new integration (stores secrets in vault). |
| `/api/projects/:projectId/integrations/health` | GET | Viewer+ | Get project health score (0-100). |
| `/api/projects/:projectId/integrations/runs` | GET | Viewer+ | List data synchronization attempts. |
| `/api/projects/:projectId/integrations/dlq` | GET | Viewer+ | View Dead Letter Queue events. |
| `/api/projects/:projectId/integrations/alerts` | GET | Viewer+ | View active integration alerts. |
| `/api/projects/:projectId/integrations/:id/test` | POST | Admin+ | Trigger connection test (stub). |
| `/api/audit-logs` | GET | Admin+ | List organization-wide audit logs. |

## Data Safety (SafeDTO)
LaunchSin APIs **never** return raw database rows. All responses pass through a whitelist serializer to prevent accidental disclosure of:
- Internal IDs / Secrets
- Sensitive config keys
- PII not required for the view

## Error Codes
- `401 Unauthorized`: Missing or invalid token.
- `403 Forbidden`: Insufficient role (RBAC) or tenant mismatch.
- `500 Internal Error`: Unexpected server failure (logged internally with redaction).
