import { jest } from '@jest/globals';
import OpenAI from 'openai';
import { AdContent, ScrapedContent } from '../../ai/alignment-engine.js';

// Auto mock OpenAI
jest.mock('openai');

describe('AlignmentEngine', () => {
    let mockCreate: jest.Mock<any>;
    let engine: any;

    beforeEach(async () => {
        // Clear mocks
        (OpenAI as unknown as jest.Mock).mockClear();

        // Setup mock implementation
        mockCreate = jest.fn() as jest.Mock<any>;
        (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
            chat: {
                completions: {
                    create: mockCreate
                }
            }
        }));

        // Dynamic import to ensure mock is used
        // We need to re-import or rely on new instance if class exported
        // alignment-engine.ts exports a singleton 'alignmentEngine'.
        // We should probably instantiate the CLASS directly if possible, but it wasn't exported directly in Step 2087?
        // Step 2087: export class AlignmentEngine ... export const alignmentEngine = new ...
        // So we CAN import the class.
        const { AlignmentEngine } = await import('../../ai/alignment-engine.js');
        engine = new AlignmentEngine();
    });

    const mockAd: AdContent = {
        headline: 'Lose weight fast',
        body: 'Try our new Keto pill',
        cta: 'Buy Now',
        creativeId: '123'
    };

    const mockPage: ScrapedContent = {
        url: 'https://example.com',
        title: 'Keto Diet Pills',
        h1: ['Best Keto Solutions'],
        h2: [],
        visibleText: 'This helper really helps you lose weight.',
        has_pixel: true
    };

    it('should return alignment analysis on success', async () => {
        // Mock Response
        mockCreate.mockResolvedValueOnce({
            id: 'test-id',
            choices: [{
                message: {
                    content: JSON.stringify({
                        score: 85,
                        findings: [{ type: 'message_match', status: 'pass', description: 'Good match' }],
                        summary: 'Aligned.'
                    })
                },
                finish_reason: 'stop'
            }],
            usage: { prompt_tokens: 100, completion_tokens: 50 }
        });

        const result = await engine.analyze(mockAd, mockPage);

        expect(result.score).toBe(85);
        expect(result.summary).toBe('Aligned.');
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('should handle JSON parse error', async () => {
        mockCreate.mockResolvedValueOnce({
            id: 'test-id',
            choices: [{
                message: {
                    content: 'Not a JSON string'
                },
                finish_reason: 'stop'
            }],
            usage: { prompt_tokens: 10, completion_tokens: 10 }
        });

        await expect(engine.analyze(mockAd, mockPage)).rejects.toThrow();
    });
});
