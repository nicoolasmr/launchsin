import { describe, it, expect } from '@jest/globals';
import { leakGate } from '../../src/middleware/leak-gate';
import { Request, Response, NextFunction } from 'express';

describe('LeakGate - Enhanced Pattern Detection', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let jsonSpy: jest.Mock;

    beforeEach(() => {
        mockReq = {
            originalUrl: '/api/test'
        };

        jsonSpy = jest.fn();
        mockRes = {
            json: jsonSpy,
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };

        mockNext = jest.fn();
    });

    describe('Bearer Token Detection', () => {
        it('should block Bearer tokens in response', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                authorization: 'Bearer sk-abc123def456ghi789'
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: expect.stringContaining('sensitive data')
                })
            );
        });

        it('should block inline Bearer tokens', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                message: 'Use this token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });
    });

    describe('OpenAI Key Detection', () => {
        it('should block OpenAI API keys', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                api_key: 'sk-abc123def456ghi789jkl012mno345'
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });

        it('should block OpenAI keys in nested objects', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                config: {
                    openai: {
                        key: 'sk-proj-abc123def456ghi789jkl012'
                    }
                }
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });
    });

    describe('Slack Token Detection', () => {
        it('should block Slack bot tokens', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                slack_token: 'xoxb-1234-5678-FAKE-TOKEN-FOR-TESTING'
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });

        it('should block Slack user tokens', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                token: 'xoxp-1234-5678-FAKE-USER-TOKEN'
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });
    });

    describe('GitHub Token Detection', () => {
        it('should block GitHub personal access tokens', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                github_token: 'ghp_abc123def456ghi789jkl012mno345pqr'
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });

        it('should block GitHub OAuth tokens', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                oauth_token: 'gho_abc123def456ghi789jkl012mno345pqr'
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });
    });

    describe('Forbidden Keys', () => {
        it('should block webhook_url key', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                webhook_url: 'https://hooks.slack.com/services/T00/B00/XXX'
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });

        it('should block secret_id_ref key', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                secret_id_ref: 'secret-123-456'
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });

        it('should block authorization key', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                authorization: 'some-secret-value'
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).toHaveBeenCalledWith(500);
        });
    });

    describe('Safe Responses', () => {
        it('should allow safe responses', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                id: 'schedule-123',
                cadence: 'daily',
                enabled: true,
                budget_daily_max_checks: 100
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).not.toHaveBeenCalled();
            expect(jsonSpy).toHaveBeenCalledWith(testData);
        });

        it('should allow public fields', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                project_id: 'proj-123',
                schedule_id: 'sched-456',
                channel: 'Slack Marketing',
                enabled: true
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).not.toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle null values', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                value: null
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should handle undefined values', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                value: undefined
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should handle arrays', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                schedules: [
                    { id: '1', enabled: true },
                    { id: '2', enabled: false }
                ]
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should handle deeply nested objects', () => {
            leakGate(mockReq as Request, mockRes as Response, mockNext);

            const testData = {
                level1: {
                    level2: {
                        level3: {
                            safe_value: 'test'
                        }
                    }
                }
            };

            (mockRes.json as any)(testData);

            expect(mockRes.status).not.toHaveBeenCalled();
        });
    });
});
