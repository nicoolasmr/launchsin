# CI Gates Runbook

## Overview
LaunchSin uses automated CI gates to ensure code quality and prevent regressions. All code must pass lint, typecheck, tests, and coverage thresholds before merging.

## Local Testing

### Run All Checks
```bash
# From root
npm run check          # Lint + typecheck all workspaces
npm run test:ci        # Run all tests with coverage
```

### Individual Workspace Testing
```bash
# Server
cd server
npm test -- --coverage

# Workers
cd workers  
npm test -- --coverage
```

### Coverage Thresholds
- **Server**: 80% lines, 80% statements, 75% functions, 70% branches
- **Workers**: 70% lines, 70% statements, 65% functions, 60% branches

## GitHub Actions CI

### Workflow File
`.github/workflows/ci.yml`

### Triggers
- Push to `main`, `develop`, `staging`
- Pull requests to `main`, `develop`, `staging`

### Steps
1. **Checkout** - Clone repository
2. **Setup Node** - Install Node.js 20
3. **Install** - `npm install`
4. **Lint** - `npm run check`
5. **PII Audit** - `npm run audit:pii`
6. **Server Tests** - With coverage gates
7. **Workers Tests** - With coverage gates
8. **Upload Coverage** - To Codecov

### Postgres Service
CI runs with ephemeral Postgres 15:
- Host: `localhost:5432`
- Database: `launchsin_test`
- User: `postgres`
- Password: `postgres`

## Troubleshooting

### Coverage Below Threshold
```
Error: Coverage for lines (75%) does not meet threshold (80%)
```

**Solution**: Add tests to increase coverage or adjust thresholds if justified.

### Test Failures
```
FAIL src/tests/leak-gate.test.ts
```

**Solution**: Fix failing tests. LeakGate tests are critical security gates.

### TypeScript Errors
```
Error: src/routes/api/tracking-fix.ts(16,5): error TS2304
```

**Solution**: Run `npm run check` locally to see all errors.

### Postgres Connection Issues
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution**: Ensure Postgres service is healthy in CI. Check workflow logs.

## Coverage Reports

### Local
After running tests with `--coverage`:
```bash
# Server
open server/coverage/lcov-report/index.html

# Workers
open workers/coverage/lcov-report/index.html
```

### CI
Coverage reports uploaded to Codecov automatically.

## Best Practices

1. **Run locally first**: Always run `npm run test:ci` before pushing
2. **Fix LeakGate tests**: Never bypass security tests
3. **Maintain coverage**: Add tests for new code
4. **Review CI logs**: Check GitHub Actions for detailed errors

## Emergency Bypass

**DO NOT** bypass CI gates except in extreme emergencies (production down).

If absolutely necessary:
1. Get approval from tech lead
2. Create hotfix branch
3. Document reason in commit message
4. Create follow-up PR to fix tests

## Related Documentation
- [TRACKING_AUTOFIX.md](./TRACKING_AUTOFIX.md)
- [ALIGNMENT_PIPELINE.md](../03_architecture/ALIGNMENT_PIPELINE.md)
