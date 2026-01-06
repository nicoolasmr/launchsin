# CI Runbook - Quality & Security Gates

This document explains the automated guards protecting the LaunchSin repository. Every PR must pass these gates before being eligible for merge.

## 1. Quality Check (`npm run check`)
- **What it does**: Runs `tsc --noEmit` across all workspaces (client, server, workers).
- **Why it matters**: Ensures type safety and prevents runtime crashes due to undefined properties or mismatched types.
- **Fail Fix**: Fix the TypeScript errors reported in the CI log or run `npm run check` locally.

## 2. PII Security Audit (`npm run audit:pii`)
- **What it does**: Scans the codebase for potential PII (Hardcoded emails, phones, SSNs, credit cards).
- **Why it matters**: Compliance with GDPR/LGPD and preventing sensitive data from entering version control.
- **Fail Fix**: Remove the sensitive data from the code. If it's a false positive, move the string to an environment variable or `.env.example`.

## 3. Secret Leak Gate (`npm test` in server)
- **What it does**: Runs specialized tests that assert that API DTOs (Data Transfer Objects) never contain forbidden keywords like `token`, `secret`, or `password`.
- **Why it matters**: Prevents accidental exposure of credentials in API responses.
- **Fail Fix**: Ensure you are using `toSafeDTO` in `server/src/shared/safe-dto.ts` for all API responses.

## 4. Preflight Check
- **What it does**: Runs `server/scripts/preflight.ts` to ensure the runtime environment is correctly configured.
- **Why it matters**: Prevents "works on my machine" issues by verifying required ENV variables early.

---

### Running Gates Locally

Run all gates before pushing:
```bash
npm run check
npm run audit:pii
cd server && npm test
```
