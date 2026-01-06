# Staging Environment Setup Guide

## Overview
The `staging` environment mirrors production but uses test data. It is used for final verification before release.

## 1. Database (Supabase)
1. Create a new Supabase project named `launchsin-staging`.
2. Retrieve the Reference ID and Database URL.
3. Link the project locally (optional):
   ```bash
   supabase link --project-ref <staging-ref-id>
   ```
4. Apply Migrations:
   ```bash
   supabase db push
   ```
   *This ensures `0006_alignment_ops.sql` is applied.*

## 2. Environment Variables
Create a `.env.staging` file (or configure in your Cloud Provider) with the following overrides:

```env
# Server
NODE_ENV=staging
PORT=3000
DATABASE_URL=postgres://postgres:[PASSWORD]@[HOST]:[PORT]/postgres
SUPABASE_URL=https://[STAGING-REF].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[STAGING-SERVICE-KEY]

# Security (Generate new keys for staging)
INTERNAL_API_KEY=[NEW-RANDOM-KEY]
SECRETS_ENCRYPTION_KEY=[NEW-RANDOM-KEY-32CHARS]

# Feature Flags
ALIGNMENT_ENABLED=true

# Workers
ALIGNMENT_POLL_INTERVAL_MS=60000 # 1 minute for faster testing
INTERNAL_API_URL=http://launchsin-server-staging:3000/api
```

```env
# Client
NEXT_PUBLIC_API_URL=https://api-staging.launchsin.com/api
NEXT_PUBLIC_SUPABASE_URL=https://[STAGING-REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[STAGING-ANON-KEY]
```

## 3. Deployment

### Server & Workers (Docker/K8s)
1. Build images:
   ```bash
   docker build -t launchsin-server:staging -f server/Dockerfile .
   docker build -t launchsin-workers:staging -f workers/Dockerfile .
   ```
2. Deploy to K8s using the `k8s` manifests, but apply Staging Overlay (if using Kustomize) or override namespace.
   *Example:*
   ```bash
   kubectl apply -f k8s/workers/deployment.yaml -n staging
   ```

### Client (Vercel/Next.js)
1. Connect Vercel project to `staging` branch.
2. Set Environment Variables in Vercel to match Section 2.
3. Deploy.

## 4. Verification
After deployment, run the Integration Health Check:
```bash
curl -H "X-Internal-Key: ..." https://api-staging.launchsin.com/api/internal/health
```
