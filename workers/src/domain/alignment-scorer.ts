
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { MetaAdCreative } from '../infra/meta-creative-fetch';
import { ExtractedPage } from '../infra/page-extractor';

export interface ScoredResult {
    score: number;
    dimensions: {
        message_match: number;
        offer_match: number;
        cta_match: number;
        tracking_health: number;
    };
    evidence: any;
    recommendations: string[];
    confidence: number;
    model_info?: any;
    summary: string;
}

export class AlignmentScorer {
    private openai: OpenAI;

    constructor() {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy' });
    }

    async score(ad: MetaAdCreative, page: ExtractedPage): Promise<ScoredResult> {
        // 1. Heuristics (Tracking & CTA)
        const trackingScore = this.calculateTrackingScore(page);
        const ctaScore = this.calculateCtaHeuristic(ad.cta, page.ctas);

        // 2. LLM Analysis (Semantic)
        let semResult = { score: 50, summary: 'Analysis failed', detailed_scores: { message: 50, offer: 50 }, recommendations: [] };

        try {
            semResult = await this.analyzeWithLLM(ad, page);
        } catch (error: any) {
            logger.error('LLM Analysis failed, using fallback', { error: error.message });
        }

        // 3. Weighting
        // Tracking: 20%, CTA: 10%, Message: 40%, Offer: 30%
        const finalScore = Math.round(
            (trackingScore * 0.2) +
            (ctaScore * 0.1) +
            (semResult.detailed_scores.message * 0.4) +
            (semResult.detailed_scores.offer * 0.3)
        );

        return {
            score: finalScore,
            dimensions: {
                message_match: semResult.detailed_scores.message,
                offer_match: semResult.detailed_scores.offer,
                cta_match: ctaScore,
                tracking_health: trackingScore
            },
            evidence: {
                ad_headline: ad.headline,
                page_h1: page.h1,
                pixels_detected: page.pixels,
                utms_detected: Object.keys(page.utms)
            },
            recommendations: [
                ...semResult.recommendations,
                ...(trackingScore < 100 ? ['Install missing tracking pixels (Meta/GA).'] : []),
                ...(ctaScore < 50 ? ['Ensure Landing Page CTA text matches Ad CTA.'] : [])
            ],
            confidence: 90, // Static for now, could be dynamic based on text length
            summary: semResult.summary,
            model_info: { model: 'gpt-4o' }
        };
    }

    private calculateTrackingScore(page: ExtractedPage): number {
        if (page.pixels.includes('meta') && Object.keys(page.utms).length > 0) return 100;
        if (page.pixels.includes('meta')) return 80;
        if (Object.keys(page.utms).length > 0) return 60;
        return 0;
    }

    private calculateCtaHeuristic(adCta: string, pageCtas: string[]): number {
        const normalizedAd = adCta.replace(/_/g, ' ').toLowerCase();
        // Check fuzzy match
        const match = pageCtas.some(c => c.toLowerCase().includes(normalizedAd) || normalizedAd.includes(c.toLowerCase()));
        return match ? 100 : 50; // 50 baseline if present but not matching
    }

    private async analyzeWithLLM(ad: MetaAdCreative, page: ExtractedPage): Promise<any> {
        const prompt = `
        Analyze alignment between:
        AD HEADLINE: ${ad.headline}
        AD BODY: ${ad.primary_text}
        
        PAGE TITLE: ${page.title}
        PAGE H1: ${page.h1.join(' | ')}
        PAGE TEXT: ${page.contentText.slice(0, 1500)}

        Return JSON:
        {
            "detailed_scores": { "message": 0-100, "offer": 0-100 },
            "summary": "2 sentences explaining mismatch/match",
            "recommendations": ["Actionable fix 1"]
        }
        Strict JSON.
        `;

        const resp = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'system', content: 'You are a Conversion Optimization Expert.' }, { role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.2
        });

        const content = resp.choices[0].message.content;
        if (!content) throw new Error('Empty AI response');
        return JSON.parse(content);
    }
}

export const alignmentScorer = new AlignmentScorer();
