import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AlignmentScorerV2_4 } from '../../src/ai/alignment-scorer-v2_4';

describe('Golden Rule Engine - AlignmentScorerV2_4', () => {
    let scorer: AlignmentScorerV2_4;

    beforeEach(() => {
        scorer = new AlignmentScorerV2_4();
    });

    describe('Heuristics', () => {
        it('should detect Meta Pixel presence', async () => {
            const pageSnapshot = {
                url: 'https://example.com',
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

            expect(result.evidence.tracking).toBeDefined();
            expect(result.evidence.tracking.meta_pixel).toBe(true);
        });

        it('should detect UTM parameters', async () => {
            const pageSnapshot = {
                url: 'https://example.com?utm_source=facebook&utm_campaign=test',
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

            expect(result.evidence.tracking).toBeDefined();
            expect(result.evidence.tracking.utm_present).toBe(true);
        });

        it('should detect CTA consistency', async () => {
            const pageSnapshot = {
                url: 'https://example.com',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Shop Now', 'Learn More'],
                contentText: 'Welcome to our site',
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

            expect(result.evidence.cta_match).toBe(true);
        });

        it('should detect offer keywords', async () => {
            const pageSnapshot = {
                url: 'https://example.com',
                title: 'Test Page',
                h1: ['50% OFF Sale'],
                ctas: ['Shop Now'],
                contentText: 'Get 50% discount on all items',
                meta: {}
            };

            const adContent = {
                id: 'ad123',
                headline: '50% OFF Everything',
                primary_text: 'Limited time offer',
                cta: 'Shop Now',
                image_url: null
            };

            const result = await scorer.score({ adContent, pageSnapshot }, 'ad123');

            expect(result.golden_rule.why.some(w => w.signal.toLowerCase().includes('offer'))).toBe(true);
        });
    });

    describe('PII Redaction', () => {
        it('should redact email addresses', () => {
            const text = 'Contact us at support@example.com for help';
            const redacted = (scorer as any).redactText(text);

            expect(redacted).not.toContain('support@example.com');
            expect(redacted).toContain('[EMAIL]');
        });

        it('should redact phone numbers', () => {
            const text = 'Call us at +1-555-123-4567';
            const redacted = (scorer as any).redactText(text);

            expect(redacted).not.toContain('+1-555-123-4567');
            expect(redacted).toContain('[PHONE]');
        });

        it('should redact long IDs', () => {
            const text = 'Your ID is abc123def456ghi789jkl012mno345pqr678';
            const redacted = (scorer as any).redactText(text);

            expect(redacted).toContain('[ID]');
        });
    });

    describe('LLM Fallback', () => {
        it('should generate golden_rule_json even if LLM fails', async () => {
            // Mock OpenAI to fail
            jest.spyOn(scorer as any, 'callLLM').mockRejectedValue(new Error('LLM timeout'));

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

            expect(result.golden_rule).toBeDefined();
            expect(result.golden_rule.why).toBeDefined();
            expect(result.golden_rule.confidence).toBeDefined();
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(100);
        });

        it('should have lower confidence when LLM fails', async () => {
            jest.spyOn(scorer as any, 'callLLM').mockRejectedValue(new Error('LLM timeout'));

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

            expect(result.golden_rule.confidence.reasons).toContain('llm_failed');
            expect(result.confidence).toBeLessThan(85);
        });
    });

    describe('Confidence Calculation', () => {
        it('should calculate confidence between 0-100', async () => {
            const pageSnapshot = {
                url: 'https://example.com',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Buy Now'],
                contentText: 'fbq("track", "PageView") - Welcome to our site with utm_source tracking',
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

            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(100);
        });

        it('should have high confidence with all signals present', async () => {
            const pageSnapshot = {
                url: 'https://example.com?utm_source=fb',
                title: 'Test Page',
                h1: ['Welcome'],
                ctas: ['Buy Now'],
                contentText: 'fbq("track", "PageView") gtm.js - Welcome to our site',
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

            expect(result.confidence).toBeGreaterThan(80);
            expect(result.golden_rule.confidence.reasons).toContain('tracking_ok');
            expect(result.golden_rule.confidence.reasons).toContain('scrape_ok');
        });
    });

    describe('Next Actions Generation', () => {
        it('should generate next actions for missing pixel', async () => {
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

            const hasPixelAction = result.golden_rule.next_actions.some(
                action => action.action.toLowerCase().includes('pixel')
            );
            expect(hasPixelAction).toBe(true);
        });
    });
});
