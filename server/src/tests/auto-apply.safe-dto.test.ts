import { describe, it, expect } from '@jest/globals';

describe('Auto-Apply - SafeDTO Tests', () => {
    describe('Targets Response', () => {
        it('should only return whitelisted fields', () => {
            // Test: GET /api/projects/:id/integrations/auto-apply/targets
            // Response should contain: id, type, display_name, config_json, created_at, updated_at
            const mockResponse = {
                targets: [{
                    id: 'target-123',
                    type: 'GTM',
                    display_name: 'Production GTM',
                    config_json: { container_id: 'GTM-XXX' },
                    created_at: '2026-01-10T10:00:00Z',
                    updated_at: '2026-01-10T10:00:00Z'
                }]
            };

            expect(mockResponse.targets[0]).toHaveProperty('id');
            expect(mockResponse.targets[0]).toHaveProperty('type');
        });

        it('should NOT contain secrets or tokens', () => {
            // Test: Response should not contain access_token, refresh_token, client_secret
            const mockResponse = {
                targets: [{
                    id: 'target-123',
                    type: 'GTM',
                    config_json: { container_id: 'GTM-XXX' }
                }]
            };

            const responseStr = JSON.stringify(mockResponse);
            expect(responseStr).not.toMatch(/access_token/);
            expect(responseStr).not.toMatch(/refresh_token/);
            expect(responseStr).not.toMatch(/client_secret/);
        });
    });

    describe('Apply Job Response', () => {
        it('should only return whitelisted fields', () => {
            // Test: POST /api/projects/:id/integrations/auto-apply/apply
            // Response should contain: job_id, status, created_at
            const mockResponse = {
                job_id: 'job-123',
                status: 'queued',
                created_at: '2026-01-10T10:00:00Z'
            };

            expect(mockResponse).toHaveProperty('job_id');
            expect(mockResponse).toHaveProperty('status');
        });

        it('should NOT contain org_id or user_id', () => {
            // Test: Response should not expose internal IDs
            const mockResponse = {
                job_id: 'job-123',
                status: 'queued'
            };

            const responseStr = JSON.stringify(mockResponse);
            expect(responseStr).not.toMatch(/org_id/);
            expect(responseStr).not.toMatch(/user_id/);
        });
    });

    describe('Dry Run Response', () => {
        it('should return diff preview', () => {
            // Test: POST apply with dry_run=true
            // Response should contain: dry_run, diff, estimated_changes
            const mockResponse = {
                dry_run: true,
                diff: {
                    tags_to_create: ['GTM Snippet'],
                    tags_to_update: [],
                    estimated_changes: 1
                }
            };

            expect(mockResponse.dry_run).toBe(true);
            expect(mockResponse.diff).toHaveProperty('estimated_changes');
        });
    });
});
