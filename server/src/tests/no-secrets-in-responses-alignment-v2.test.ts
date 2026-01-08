
import request from 'supertest';
import app from '../index';
import { alignmentServiceV2 } from '../services/alignment-service-v2';

// Mock dependencies
jest.mock('../services/alignment-service-v2');
jest.mock('../infra/db', () => ({
    supabase: {
        from: jest.fn(() => ({
            select: jest.fn(() => ({
                eq: jest.fn(() => ({ single: jest.fn(() => ({ data: {}, error: null })) }))
            }))
        })),
        auth: { getUser: jest.fn() }
    }
}));

jest.mock('../middleware/rbac', () => ({
    requireOrgRole: () => (req: any, res: any, next: any) => next(), // Bypass RBAC
    validateProjectAccess: (req: any, res: any, next: any) => next() // Bypass Project Access
}));
jest.mock('../middleware/auth', () => ({
    authMiddleware: (req: any, res: any, next: any) => {
        req.user = { id: 'u1', tenant_id: 'org1' };
        next();
    },
    requireProjectAccess: () => (req: any, res: any, next: any) => next(),
    requireInternalKey: (req: any, res: any, next: any) => next()
}));


const mockGetReport = alignmentServiceV2.getReport as jest.Mock;

describe('Alignment V2 - Leak Gate E2E', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should block response with generic secrets', async () => {
        // Mock service returning a secret
        mockGetReport.mockResolvedValue({
            id: 'r1',
            score: 90,
            model_info: {
                // This simulates a leak (e.g. key embedded in debug info)
                debug_trace: 'Using key sk-1234567890abcdef12345 in call'
            }
        });

        const res = await request(app)
            .get('/api/projects/p1/integrations/alignment/reports/r1')
            .set('Authorization', 'Bearer token');

        expect(res.status).toBe(500);
        expect(res.body.error).toContain('Security Error');
    });

    it('should block response with Access Token pattern', async () => {
        mockGetReport.mockResolvedValue({
            id: 'r1',
            // Simulating a raw Meta response leaked
            provider_response: {
                access_token: 'EAAb...'
            }
        });

        const res = await request(app)
            .get('/api/projects/p1/integrations/alignment/reports/r1');

        expect(res.status).toBe(500);
    });

    it('should allow clean responses', async () => {
        mockGetReport.mockResolvedValue({
            id: 'r1',
            score: 95,
            summary: 'Perfect match',
            model_info: { model: 'gpt-4o' } // Safe
        });

        const res = await request(app)
            .get('/api/projects/p1/integrations/alignment/reports/r1');

        expect(res.status).toBe(200);
        expect(res.body.score).toBe(95);
    });

});
