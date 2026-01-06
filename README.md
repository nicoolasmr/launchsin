# LaunchSin Monorepo

Enterprise-grade, multi-tenant, AI-driven infrastructure platform.

## Architecture
- **Client**: Next.js (App Router) + Tailwind + Design System
- **Server**: Node.js/TypeScript REST API
- **Workers**: Containerized background job processors
- **Database**: Supabase (PostgreSQL) with RLS for multi-tenancy
- **Infrastructure**: Docker + Kubernetes ready

## Structure
```
/
  client/                 # Frontend Next.js
  server/                 # Backend API
  workers/                # Background Jobs
  supabase/               # Migrations & RLS
  docs/                   # Comprehensive Documentation
  k8s/                    # Kubernetes Manifests
  scripts/                # CI/CD & Audit scripts
```

## Quickstart
1. `npm install` (root)
2. `npm run dev:client`
3. `npm run dev:server`

## CI Gates
- `npm run check`: Type checking
- `npm run audit:pii`: Scans for potential data leaks
- `npm run lint`: Code quality
- `npm test`: Automated tests

## Deployment
- **Frontend**: Vercel
- **Backend/Workers**: Kubernetes (refer to `/k8s`)
- **Database**: Supabase
