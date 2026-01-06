# ADR-0001: Monorepo & Multi-tenant Architecture

## Context
LaunchSin requires a scalable, multi-tenant architecture with strong data isolation and AI-driven capabilities.

## Decision
We chose a monorepo structure to unify the client, server, and workers while maintaining clear boundaries.

### Key Pillars:
1. **Multi-tenancy**: Enforced at the database level using Supabase RLS. Application logic must always provide `tenant_id` context.
2. **SafeDTO**: Whitelist-only responses to prevent sensitive data leakage.
3. **Structured Logging**: JSON logs with recursive PII redaction.
4. **UI Contract**: Standardized component states (loading, empty, error) for consistent UX.

## Consequences
- High development velocity due to code sharing.
- Strict security gates (audit:pii) prevent accidental leaks.
- Simplified infra management with centralized k8s manifests.
