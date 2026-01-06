#!/usr/bin/env node

/**
 * PII Audit Script
 * Scans codebase for potential PII leaks in logs, responses, and storage
 */

const { execSync } = require('child_process');
const path = require('path');

const PII_PATTERNS = [
  // Direct PII fields that should never be logged
  { pattern: 'password[\'"]?\\s*:', description: 'Password field in object' },
  { pattern: 'ssn[\'"]?\\s*:', description: 'SSN field in object' },
  { pattern: 'creditCard[\'"]?\\s*:', description: 'Credit card field' },
  { pattern: 'email.*console\\.log', description: 'Email in console.log' },
  { pattern: 'phone.*console\\.log', description: 'Phone in console.log' },

  // Dangerous logging patterns
  { pattern: 'console\\.log\\(.*req\\.body', description: 'Logging entire request body' },
  { pattern: 'console\\.log\\(.*user\\)', description: 'Logging entire user object' },
  { pattern: 'logger\\..*\\(.*password', description: 'Password in logger' },

  // Response leaks
  { pattern: 'res\\.json\\(.*token', description: 'Token in response (use SafeDTO)' },
  { pattern: 'return.*apiKey', description: 'API key in return value' },
];

const EXCLUDE_DIRS = [
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
  'coverage'
];

console.log('🔍 Running PII Audit...\n');

let violations = 0;

PII_PATTERNS.forEach(({ pattern, description }) => {
  try {
    const excludeArgs = EXCLUDE_DIRS.map(dir => `--exclude-dir=${dir}`).join(' ');
    // Escape double quotes in pattern for shell execution
    const escapedPattern = pattern.replace(/"/g, '\\"');
    const cmd = `grep -rn -E "${escapedPattern}" ${excludeArgs} --exclude="*.test.ts" --exclude="*.test.js" --exclude="*.spec.ts" --exclude="*.spec.js" client/ server/ workers/ 2>/dev/null || true`;

    const result = execSync(cmd, { encoding: 'utf-8', cwd: path.join(__dirname, '..') });

    if (result.trim()) {
      console.log(`❌ VIOLATION: ${description}`);
      console.log(result);
      console.log('---\n');
      violations++;
    }
  } catch (error) {
    // grep returns non-zero when no matches found, which is what we want
  }
});

if (violations === 0) {
  console.log('✅ No PII violations detected\n');
  process.exit(0);
} else {
  console.log(`❌ Found ${violations} PII violation(s)\n`);
  console.log('REMEDIATION:');
  console.log('1. Use SafeDTO to whitelist safe fields in responses');
  console.log('2. Use structured logger with redaction for logs');
  console.log('3. Never log full user objects or request bodies');
  console.log('4. Mark sensitive operations with audit:pii gate\n');
  process.exit(1);
}
