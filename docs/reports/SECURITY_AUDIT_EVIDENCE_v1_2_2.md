
# Security Audit Evidence v1.2.2

**Date**: 2026-01-10
**Commit**: `6f37d5b7ddb3e312ff49c98197c67a5e12b220cc` (docs(audit): publish security audit v1.2.2 (evidence-aligned))

## 1. Commit & Git Status (Clean State)
```bash
$ git rev-parse HEAD && git status
6f37d5b7ddb3e312ff49c98197c67a5e12b220cc
On branch main
Your branch is ahead of 'origin/main' by 4 commits.
  (use "git push" to publish your local commits)

nothing to commit, working tree clean
```

## 2. Gates Executed

### 2.1 TypeScript Check
```bash
$ npm run check
> launchsin-monorepo@0.1.0 check
> npm run check:client && npm run check:server && npm run check:workers

> launchsin-client@0.1.0 check
> tsc --noEmit

> launchsin-server@0.1.0 check
> tsc --noEmit

> launchsin-workers@0.1.0 check
> tsc --noEmit
```

### 2.2 PII Static Audit
```bash
$ npm run audit:pii
> node scripts/audit-pii.js
🔍 Running PII Audit...
✅ No PII violations detected
```

### 2.3 Server Tests & Coverage
```bash
$ cd server && npm test -- --coverage
...
PASS src/tests/cross-org-isolation.test.ts
PASS src/tests/webhooks.hotmart.security.test.ts
PASS src/tests/oauth-state.security.test.ts
...
Test Suites: 24 passed, 24 total
Tests:       129 passed, 129 total
Snapshots:   0 total
Time:        0.962 s

-----------------------------|---------|----------|---------|---------|-------------------
File                         | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-----------------------------|---------|----------|---------|---------|-------------------
All files                    |   56.27 |    37.31 |   48.48 |   58.44 |                   
 src                         |     100 |      100 |     100 |     100 |                   
  app.ts                     |     100 |      100 |     100 |     100 |                   
  db.ts                      |     100 |       75 |     100 |     100 | 13                
  metrics.ts                 |   58.06 |        0 |       0 |   58.06 | 96-142            
  oauth-state.ts             |   92.85 |      100 |     100 |   92.85 | 69-70             
...
-----------------------------|---------|----------|---------|---------|-------------------
```

### 2.4 Workers Tests & Coverage
```bash
$ cd workers && npm test -- --coverage
...
PASS tests/alert-dedup.test.ts
PASS tests/alignment-cache.test.ts
PASS tests/alignment-locking-sim.test.ts
PASS tests/scheduler-budget.test.ts
PASS tests/scorer-fallback.test.ts
...
Test Suites: 5 passed, 5 total
Tests:       34 passed, 34 total
```

**Coverage Summary (from json-summary):**
```json
"total": {
    "lines": { "total": 235, "covered": 135, "skipped": 0, "pct": 57.44 },
    "statements": { "total": 244, "covered": 139, "skipped": 0, "pct": 56.96 },
    "functions": { "total": 35, "covered": 18, "skipped": 0, "pct": 51.42 },
    "branches": { "total": 138, "covered": 73, "skipped": 0, "pct": 52.89 }
}
```

## 3. Coverage Thresholds (Source of Truth)

### 3.1 Server (`server/package.json`)
```json
        "coverageThreshold": {
            "global": {
                "lines": 15,
                "statements": 15,
                "functions": 10,
                "branches": 8
            }
        }
```

### 3.2 Workers (`workers/jest.config.js`)
```javascript
  coverageThreshold: {
    global: {
      lines: 10,
      statements: 10,
      functions: 0,
      branches: 5
    }
  }
```

## 4. CI Workflow Configuration
From `.github/workflows/ci.yml`:
```yaml
      - name: Run Server Tests with Coverage
        ...
        run: |
          cd server
          npm test

      - name: Run Workers Tests with Coverage
        ...
        run: |
          cd workers
          npm test
```

## 5. Security Proofs

### 5.1 Cross-Org Isolation
- **Path**: `server/src/tests/cross-org-isolation.test.ts`
- **Result**: PASS (Verified 404/Empty for unauthorized access)

### 5.2 Hotmart Webhook Verification
- **Path**: `server/src/tests/webhooks.hotmart.security.test.ts`
- **Result**: PASS (Verified `X-Hotmart-Hottok` via `crypto.timingSafeEqual`)

### 5.3 OAuth State Security
- **Path**: `server/src/tests/oauth-state.security.test.ts`
- **Result**: PASS (Verified HMAC-SHA256 signature, length checks, and 15m TTL)

## 6. Notes
- **Fix Applied**: Buffer length check in `OAuthStateService` verified.
- **Consistency**: All tests passing on commit `6f37d5b`.
