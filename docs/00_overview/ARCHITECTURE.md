# Architecture Overview

## Monorepo Layout
- **client/**: Next.js 14+ (App Router). Minimalist UI with a custom design system.
- **server/**: Express.js/TypeScript REST API. 100% modular, security-first.
- **workers/**: Containerized job processors.
- **supabase/**: PostgreSQL schema with mandatory RLS.
- **k8s/**: Cloud-native orchestration.

## Security Model
- **Authentication**: JWT validation via Supabase Auth.
- **RLS (Row Level Security)**: Data isolation is enforced at the database level.
- **RBAC**: Role hierarchy (Owner > Admin > Member > Viewer) enforced via server-side middleware.
- **SafeDTO**: Mandatory whitelisting for all API responses.
- **Audit Logging**: Recursive PII redaction (denylist) in all log streams.

## Technical Flows

### 1. Request Lifecycle
1. **Client** sends request with `Authorization: Bearer <JWT>`.
2. **Auth Middleware** decodes JWT, extracts `userId`, `tenantId`, and `role`.
3. **RBAC Middleware** checks if the user's role meets the minimum requirement for the endpoint.
4. **Business Logic** executes scoped queries (using `tenant_id`).
5. **SafeDTO Serializer** filters the result against a whitelist.
6. **Logger** records the event with sanitized metadata.

### 2. Multi-tenancy Isolation
Isolation is hybrid:
- **Application Level**: Scoped by `tenant_id` in code.
- **Database Level**: Enforced by Supabase RLS policies using `auth.uid()`.
