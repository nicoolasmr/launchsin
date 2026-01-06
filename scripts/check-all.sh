#!/bin/bash
set -e

echo "🔍 Running all LaunchSin gates..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

# TypeScript checks
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📘 TypeScript Compilation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Checking client..."
if npm run check:client; then
  echo -e "${GREEN}✓ Client TypeScript OK${NC}"
else
  echo -e "${RED}✗ Client TypeScript FAILED${NC}"
  FAILED=1
fi

echo ""
echo "Checking server..."
if npm run check:server; then
  echo -e "${GREEN}✓ Server TypeScript OK${NC}"
else
  echo -e "${RED}✗ Server TypeScript FAILED${NC}"
  FAILED=1
fi

echo ""
echo "Checking workers..."
if npm run check:workers; then
  echo -e "${GREEN}✓ Workers TypeScript OK${NC}"
else
  echo -e "${RED}✗ Workers TypeScript FAILED${NC}"
  FAILED=1
fi

# PII Audit
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔒 PII Audit"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if npm run audit:pii; then
  echo -e "${GREEN}✓ PII Audit PASSED${NC}"
else
  echo -e "${RED}✗ PII Audit FAILED${NC}"
  FAILED=1
fi

# Leak Gate (if test exists)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚨 Leak Gate"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f "server/src/tests/leak-gate.test.ts" ]; then
  if cd server && npm test -- leak-gate.test.ts && cd ..; then
    echo -e "${GREEN}✓ Leak Gate PASSED${NC}"
  else
    echo -e "${RED}✗ Leak Gate FAILED${NC}"
    FAILED=1
  fi
else
  echo -e "${YELLOW}⚠ Leak Gate test not found (skipping)${NC}"
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All gates PASSED${NC}"
  exit 0
else
  echo -e "${RED}✗ Some gates FAILED${NC}"
  exit 1
fi
