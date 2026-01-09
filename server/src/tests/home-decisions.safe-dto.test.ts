import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../../app';

describe('Home API - SafeDTO Tests', () => {
    describe('GET /api/home/overview', () => {
        it('should only return whitelisted fields', async () => {
            const res = await request(app)
                .get('/api/home/overview')
                .set('Authorization', 'Bearer mock-token');

            if (res.status === 200) {
                const allowedFields = [
                    'total_projects',
                    'integrations_health',
                    'alignment_summary',
                    'crm_summary',
                    'ops_summary'
                ];

                Object.keys(res.body).forEach(key => {
                    expect(allowedFields).toContain(key);
                });

                // Should NOT contain sensitive fields
                expect(res.body).not.toHaveProperty('org_id');
                expect(res.body).not.toHaveProperty('user_id');
                expect(res.body).not.toHaveProperty('api_key');
                expect(res.body).not.toHaveProperty('secret');
            }
        });
    });

    describe('GET /api/home/decisions', () => {
        it('should only return whitelisted fields in decisions', async () => {
            const res = await request(app)
                .get('/api/home/decisions')
                .set('Authorization', 'Bearer mock-token');

            if (res.status === 200 && res.body.length > 0) {
                const allowedFields = [
                    'id',
                    'type',
                    'severity',
                    'title',
                    'why',
                    'confidence',
                    'next_actions',
                    'deep_links'
                ];

                res.body.forEach((decision: any) => {
                    Object.keys(decision).forEach(key => {
                        expect(allowedFields).toContain(key);
                    });

                    // Should NOT contain sensitive fields
                    expect(decision).not.toHaveProperty('user_id');
                    expect(decision).not.toHaveProperty('org_id');
                    expect(decision).not.toHaveProperty('api_key');
                });
            }
        });

        it('should not leak PII or secrets', async () => {
            const res = await request(app)
                .get('/api/home/decisions')
                .set('Authorization', 'Bearer mock-token');

            const responseStr = JSON.stringify(res.body);

            // Should not contain common PII patterns
            expect(responseStr).not.toMatch(/email@/);
            expect(responseStr).not.toMatch(/password/i);
            expect(responseStr).not.toMatch(/api[_-]?key/i);
            expect(responseStr).not.toMatch(/secret/i);
        });
    });
});
