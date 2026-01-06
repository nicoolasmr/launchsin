# Local Setup Guide

## Requirements
- Node.js 18+
- Docker (for local PG/Supabase testing)
- Supabase CLI

## Steps
1. **Clone & Install**:
   ```bash
   npm install
   ```
2. **Setup Client**:
   ```bash
   cd client && npm install
   npm run dev
   ```
3. **Setup Server**:
   ```bash
   cd server && npm install
   npm run dev
   ```
4. **Setup Workers**:
   ```bash
   cd workers && npm install
   npm run dev
   ```
5. **Environment**:
   Copy `.env.example` to `.env` in each module.

## Gates Verification

### Quick Check (All Gates)
Run all gates with a single command:
```bash
./scripts/check-all.sh
```

### Individual Gates

#### TypeScript Compilation
```bash
npm run check:client   # Client TypeScript
npm run check:server   # Server TypeScript
npm run check:workers  # Workers TypeScript
```

#### PII Audit
Scans codebase for potential PII leaks (emails, phones, etc.):
```bash
npm run audit:pii
```

#### Leak Gate
Tests that no secrets/tokens appear in API responses:
```bash
cd server && npm test -- leak-gate.test.ts
```

#### E2E No-Secrets Test
End-to-end test covering all integration endpoints:
```bash
cd server && npm test -- no-secrets-in-responses.e2e.ts
```

### Pre-Commit Checklist
Before committing, ensure all gates pass:
- [ ] TypeScript compilation (client, server, workers)
- [ ] PII audit
- [ ] Leak gate
- [ ] E2E no-secrets test

**Tip:** Run `./scripts/check-all.sh` to verify everything at once.

## Database Migrations

### Apply Migrations Locally
```bash
cd supabase
supabase db reset  # Resets and applies all migrations
```

### Create New Migration
```bash
cd supabase
supabase migration new <migration_name>
```

### Verify Migration Idempotency
Run migration twice to ensure it's idempotent:
```bash
supabase db reset
supabase db reset  # Should succeed without errors
```
