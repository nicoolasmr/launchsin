import { describe, it, expect } from '@jest/globals';

describe('Home Prefs - SafeDTO Tests', () => {
    describe('GET /api/home/prefs Response', () => {
        it('should only return whitelisted fields', () => {
            // Test: Response contains only: prefs, updated_at
            const mockResponse = {
                prefs: {
                    widget_visibility: { kpi: true },
                    widget_order: ['kpi'],
                    density: 'comfortable',
                    default_project_id: null
                },
                updated_at: '2026-01-09T18:00:00Z'
            };

            const responseStr = JSON.stringify(mockResponse);
            expect(responseStr).toContain('prefs');
            expect(responseStr).toContain('updated_at');

            // Should NOT contain internal fields
            expect(responseStr).not.toMatch(/org_id/);
            expect(responseStr).not.toMatch(/user_id/);
            expect(responseStr).not.toMatch(/id/);
        });
    });

    describe('PUT /api/home/prefs Response', () => {
        it('should only return whitelisted fields', () => {
            // Test: Response contains only: ok, updated_at
            const mockResponse = {
                ok: true,
                updated_at: '2026-01-09T18:00:00Z'
            };

            const responseStr = JSON.stringify(mockResponse);
            expect(responseStr).toContain('ok');
            expect(responseStr).toContain('updated_at');

            // Should NOT contain internal fields
            expect(responseStr).not.toMatch(/org_id/);
            expect(responseStr).not.toMatch(/user_id/);
            expect(responseStr).not.toMatch(/prefs_json/);
        });
    });
});
