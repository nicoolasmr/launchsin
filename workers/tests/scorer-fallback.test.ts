import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AlignmentScorerV2_4 } from '../src/domain/alignment-scorer-v2_4';

describe('Scorer Fallback - LLM Failure Handling', () => {
    let scorer: AlignmentScorerV2_4;

    beforeEach(() => {
        scorer = new AlignmentScorerV2_4();
    });

    describe('LLM Timeout', () => {
        it('should fallback to heuristics on timeout', async () => {
            // Mock OpenAI to timeout
            jest.spyOn(scorer as any, 'scoreLLM').mockImplementation(() => {
                return new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Timeout')), 100);
                });
            });

            const pageSnapshot = {
                url: 'https://example.com',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Buy Now'],
                contentText: 'fbq("track") utm_source=fb',
                meta: {}
            };

            const adContent = {
                id: 'ad123',
                headline: 'Test Ad',
                primary_text: 'Check this out',
                cta: 'Buy Now',
                image_url: null
            };

            const result = await scorer.score({ adContent, pageSnapshot }, 'ad123');

            expect(result.golden_rule).toBeDefined();
            expect(result.golden_rule.why.length).toBeGreaterThan(0);
            expect(result.golden_rule.confidence.reasons).toContain('llm_failed');
        });

        it('should still detect tracking via heuristics', async () => {
            jest.spyOn(scorer as any, 'scoreLLM').mockRejectedValue(new Error('Timeout'));

            const pageSnapshot = {
                url: 'https://example.com?utm_source=facebook',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Buy Now'],
                contentText: 'fbq("track", "PageView")',
                meta: {}
            };

            const adContent = {
                id: 'ad123',
                headline: 'Test Ad',
                primary_text: 'Check this out',
                cta: 'Buy Now',
                image_url: null
            };

            const result = await scorer.score({ adContent, pageSnapshot }, 'ad123');

            expect(result.evidence.tracking.has_pixel).toBe(true);
            expect(result.evidence.tracking.has_utm).toBe(true);
            expect(result.golden_rule.confidence.reasons).toContain('tracking_ok');
        });
    });

    describe('LLM Error', () => {
        it('should handle network errors gracefully', async () => {
            jest.spyOn(scorer as any, 'scoreLLM').mockRejectedValue(new Error('Network error'));

            const pageSnapshot = {
                url: 'https://example.com',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Buy Now'],
                contentText: 'Welcome',
                meta: {}
            };

            const adContent = {
                id: 'ad123',
                headline: 'Test Ad',
                primary_text: 'Check this out',
                cta: 'Buy Now',
                image_url: null
            };

            const result = await scorer.score({ adContent, pageSnapshot }, 'ad123');

            expect(result.golden_rule).toBeDefined();
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(100);
        });

        it('should handle API rate limits', async () => {
            jest.spyOn(scorer as any, 'scoreLLM').mockRejectedValue(new Error('Rate limit exceeded'));

            const pageSnapshot = {
                url: 'https://example.com',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Buy Now'],
                contentText: 'Welcome',
                meta: {}
            };

            const adContent = {
                id: 'ad123',
                headline: 'Test Ad',
                primary_text: 'Check this out',
                cta: 'Buy Now',
                image_url: null
            };

            const result = await scorer.score({ adContent, pageSnapshot }, 'ad123');

            expect(result.golden_rule).toBeDefined();
            expect(result.model_info.llm_used).toBeUndefined();
        });
    });

    describe('Confidence Degradation', () => {
        it('should reduce confidence when LLM fails', async () => {
            jest.spyOn(scorer as any, 'scoreLLM').mockRejectedValue(new Error('LLM failed'));

            const pageSnapshot = {
                url: 'https://example.com',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Buy Now'],
                contentText: 'Welcome to our site',
                meta: {}
            };

            const adContent = {
                id: 'ad123',
                headline: 'Test Ad',
                primary_text: 'Check this out',
                cta: 'Buy Now',
                image_url: null
            };

            const result = await scorer.score({ adContent, pageSnapshot }, 'ad123');

            // Confidence should be reduced by 20 points for LLM failure
            expect(result.confidence).toBeLessThan(85);
            expect(result.golden_rule.confidence.reasons).toContain('llm_failed');
        });

        it('should maintain minimum confidence with good heuristics', async () => {
            jest.spyOn(scorer as any, 'scoreLLM').mockRejectedValue(new Error('LLM failed'));

            const pageSnapshot = {
                url: 'https://example.com?utm_source=fb&utm_campaign=test',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Buy Now'],
                contentText: 'fbq("track") gtm.js Welcome',
                meta: {}
            };

            const adContent = {
                id: 'ad123',
                headline: 'Test Ad',
                primary_text: 'Check this out',
                cta: 'Buy Now',
                image_url: null
            };

            const result = await scorer.score({ adContent, pageSnapshot }, 'ad123');

            // Even without LLM, good heuristics should maintain decent confidence
            expect(result.confidence).toBeGreaterThan(60);
        });
    });

    describe('Heuristics-Only Mode', () => {
        it('should generate complete golden_rule_json from heuristics', async () => {
            jest.spyOn(scorer as any, 'scoreLLM').mockRejectedValue(new Error('LLM unavailable'));

            const pageSnapshot = {
                url: 'https://example.com',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Shop Now'],
                contentText: 'Welcome',
                meta: {}
            };

            const adContent = {
                id: 'ad123',
                headline: 'Test Ad',
                primary_text: 'Check this out',
                cta: 'Buy Now',
                image_url: null
            };

            const result = await scorer.score({ adContent, pageSnapshot }, 'ad123');

            expect(result.golden_rule.why).toBeDefined();
            expect(result.golden_rule.why.length).toBeGreaterThan(0);
            expect(result.golden_rule.confidence).toBeDefined();
            expect(result.golden_rule.next_actions).toBeDefined();
        });

        it('should detect CTA mismatch via heuristics', async () => {
            jest.spyOn(scorer as any, 'scoreLLM').mockRejectedValue(new Error('LLM unavailable'));

            const pageSnapshot = {
                url: 'https://example.com',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Learn More', 'Contact Us'],
                contentText: 'Welcome',
                meta: {}
            };

            const adContent = {
                id: 'ad123',
                headline: 'Test Ad',
                primary_text: 'Check this out',
                cta: 'Shop Now',
                image_url: null
            };

            const result = await scorer.score({ adContent, pageSnapshot }, 'ad123');

            const ctaMismatch = result.golden_rule.why.find(w =>
                w.signal.toLowerCase().includes('cta')
            );
            expect(ctaMismatch).toBeDefined();
        });
    });

    describe('Model Info Tracking', () => {
        it('should set llm_used to null on failure', async () => {
            jest.spyOn(scorer as any, 'scoreLLM').mockRejectedValue(new Error('LLM failed'));

            const pageSnapshot = {
                url: 'https://example.com',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Buy Now'],
                contentText: 'Welcome',
                meta: {}
            };

            const adContent = {
                id: 'ad123',
                headline: 'Test Ad',
                primary_text: 'Check this out',
                cta: 'Buy Now',
                image_url: null
            };

            const result = await scorer.score({ adContent, pageSnapshot }, 'ad123');

            expect(result.model_info.llm_used).toBeUndefined();
            expect(result.model_info.llm_used).toBeUndefined();
        });
    });
});
