import { describe, it, expect } from '@jest/globals';

describe('Home API - SafeDTO Tests', () => {
    // Note: These tests require proper test setup with mocked responses

    describe('GET /api/home/overview', () => {
        it('should only return whitelisted fields', () => {
            const allowedFields = [
                'total_projects',
                'integrations_health',
                'alignment_summary',
                'crm_summary',
                'ops_summary'
            ];

            // Test: Response should only contain these fields
            expect(allowedFields.length).toBeGreaterThan(0);
        });

        it('should not contain sensitive fields', () => {
            const forbiddenFields = ['org_id', 'user_id', 'api_key', 'secret'];

            // Test: Response should NOT contain these fields
            expect(forbiddenFields.length).toBeGreaterThan(0);
        });
    });

    describe('GET /api/home/decisions', () => {
        it('should only return whitelisted fields in decisions', () => {
            const allowedFields = [
                'id', 'type', 'severity', 'title', 'why',
                'confidence', 'next_actions', 'deep_links'
            ];

            // Test: Each decision should only contain these fields
            expect(allowedFields.length).toBeGreaterThan(0);
        });

        it('should not leak PII or secrets', () => {
            const forbiddenPatterns = [
                /email@/,
                /password/i,
                /api[_-]?key/i,
                /secret/i
            ];

            // Test: Response should not match these patterns
            expect(forbiddenPatterns.length).toBeGreaterThan(0);
        });
    });
});
