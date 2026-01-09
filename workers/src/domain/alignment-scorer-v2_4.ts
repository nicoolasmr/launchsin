
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ScoringInput {
    adContent: {
        headline?: string;
        primary_text?: string;
        cta?: string;
        image_url?: string | null;
    };
    pageSnapshot: {
        url: string;
        title: string;
        h1: string[];
        ctas: string[];
        contentText: string;
        meta: any;
    };
}

export interface GoldenRuleSignal {
    signal: string;
    impact: 'high' | 'medium' | 'low';
    evidence: string[];
}

export interface GoldenRule {
    why: GoldenRuleSignal[];
    sources: {
        ad: {
            provider: string;
            ad_id: string;
            creative_fields: string[];
        };
        page: {
            url: string;
            snapshot_id?: string;
            fields: string[];
        };
    };
    period: {
        checked_at: string;
    };
    confidence: {
        score: number;
        reasons: string[];
    };
    next_actions: Array<{
        action: string;
        eta: string;
        owner: string;
        link_to_ui?: string;
    }>;
}

export interface ScoringResult {
    score: number;
    dimensions: {
        message: number;
        offer: number;
        cta: number;
        tracking: number;
    };
    evidence: any;
    recommendations: string[];
    confidence: number;
    model_info: {
        llm_used?: string;
        heuristics_used: boolean;
        llm_success: boolean;
    };
    golden_rule: GoldenRule;
}

export class AlignmentScorerV2_4 {

    async score(input: ScoringInput, adId: string = 'unknown'): Promise<ScoringResult> {
        const startTime = Date.now();
        const signals: GoldenRuleSignal[] = [];
        const confidenceReasons: string[] = [];

        // 1. Run Heuristics (always)
        const heuristics = this.runHeuristics(input);
        signals.push(...heuristics.signals);

        // 2. Redact and prepare text for LLM
        const redactedAdText = this.redactText(`${input.adContent.headline || ''} ${input.adContent.primary_text || ''}`);
        const redactedPageText = this.redactText(input.pageSnapshot.contentText.substring(0, 2000));

        // 3. Try LLM scoring
        let llmResult: any = null;
        let llmSuccess = false;

        try {
            llmResult = await this.scoreLLM(redactedAdText, redactedPageText, input);
            llmSuccess = true;
            confidenceReasons.push('llm_ok');

            if (llmResult.signals) {
                signals.push(...llmResult.signals);
            }
        } catch (error: any) {
            logger.warn('LLM scoring failed, using heuristics only', { error: error.message });
            confidenceReasons.push('llm_failed');
        }

        // 4. Compute dimensions and score
        const dimensions = this.computeDimensions(signals, heuristics);
        const finalScore = Math.round((dimensions.message + dimensions.offer + dimensions.cta + dimensions.tracking) / 4);

        // 5. Compute confidence
        const confidence = this.computeConfidence({
            llmSuccess,
            textLength: input.pageSnapshot.contentText.length,
            trackingPresent: heuristics.trackingPresent,
            reasons: confidenceReasons
        });

        // 6. Build Golden Rule
        const goldenRule = this.buildGoldenRule(signals, input, adId, confidence);

        // 7. Generate recommendations
        const recommendations = this.generateRecommendations(signals);

        logger.info('Alignment scoring complete', {
            score: finalScore,
            confidence: confidence.score,
            duration: Date.now() - startTime,
            llmSuccess
        });

        return {
            score: finalScore,
            dimensions,
            evidence: {
                ad: input.adContent,
                page: {
                    title: input.pageSnapshot.title,
                    h1: input.pageSnapshot.h1,
                    ctas: input.pageSnapshot.ctas
                },
                tracking: heuristics.trackingDetails
            },
            recommendations,
            confidence: confidence.score,
            model_info: {
                llm_used: llmSuccess ? 'gpt-4o' : undefined,
                heuristics_used: true,
                llm_success: llmSuccess
            },
            golden_rule: goldenRule
        };
    }

    private runHeuristics(input: ScoringInput): {
        signals: GoldenRuleSignal[];
        trackingPresent: boolean;
        trackingDetails: any;
    } {
        const signals: GoldenRuleSignal[] = [];
        const trackingDetails: any = {
            has_pixel: false,
            has_utm: false,
            has_gtm: false
        };

        const pageText = input.pageSnapshot.contentText.toLowerCase();
        const pageMeta = JSON.stringify(input.pageSnapshot.meta).toLowerCase();

        trackingDetails.has_pixel = pageText.includes('fbq(') || pageText.includes('facebook pixel') || pageMeta.includes('facebook');
        trackingDetails.has_utm = input.pageSnapshot.url.includes('utm_');
        trackingDetails.has_gtm = pageText.includes('gtm.js') || pageText.includes('googletagmanager');

        if (!trackingDetails.has_pixel) {
            signals.push({
                signal: 'Meta Pixel missing',
                impact: 'high',
                evidence: ['No Facebook Pixel detected on landing page', 'Cannot track conversions']
            });
        }

        if (!trackingDetails.has_utm) {
            signals.push({
                signal: 'UTM parameters missing',
                impact: 'medium',
                evidence: ['Landing URL has no UTM parameters', 'Cannot attribute traffic source']
            });
        }

        const adCTA = (input.adContent.cta || '').toLowerCase();
        const pageCTAs = input.pageSnapshot.ctas.map(c => c.toLowerCase());

        if (adCTA && !pageCTAs.some(pc => pc.includes(adCTA) || adCTA.includes(pc))) {
            signals.push({
                signal: 'CTA mismatch',
                impact: 'medium',
                evidence: [`Ad CTA: "${input.adContent.cta}"`, `Page CTAs: ${input.pageSnapshot.ctas.join(', ')}`]
            });
        }

        const adText = `${input.adContent.headline} ${input.adContent.primary_text}`.toLowerCase();
        const offerKeywords = ['discount', 'off', '%', 'free', 'trial', 'limited', 'offer'];
        const adHasOffer = offerKeywords.some(kw => adText.includes(kw));
        const pageHasOffer = offerKeywords.some(kw => pageText.includes(kw));

        if (adHasOffer && !pageHasOffer) {
            signals.push({
                signal: 'Offer not found on page',
                impact: 'high',
                evidence: ['Ad mentions offer/discount', 'Landing page does not mention similar offer']
            });
        }

        return {
            signals,
            trackingPresent: trackingDetails.has_pixel && trackingDetails.has_utm,
            trackingDetails
        };
    }

    private async scoreLLM(adText: string, pageText: string, input: ScoringInput): Promise<any> {
        const prompt = `You are an expert at analyzing ad-to-landing-page alignment for digital marketing campaigns.

**Ad Creative:**
Headline: ${input.adContent.headline || 'N/A'}
Body: ${adText}
CTA: ${input.adContent.cta || 'N/A'}

**Landing Page:**
Title: ${input.pageSnapshot.title}
H1: ${input.pageSnapshot.h1.join(', ')}
Content: ${pageText}

**Task:**
Identify up to 3 critical misalignments between the ad and the landing page. For each, provide:
1. Signal name (concise, e.g., "Message mismatch")
2. Impact level (high/medium/low)
3. Evidence (2-3 specific quotes or observations)

Return ONLY valid JSON in this format:
{
  "signals": [
    {"signal": "...", "impact": "high", "evidence": ["...", "..."]}
  ]
}`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 500
        }, {
            timeout: 10000 // 10s timeout in options
        });

        const content = response.choices[0]?.message?.content || '{}';
        return JSON.parse(content);
    }

    private computeDimensions(signals: GoldenRuleSignal[], heuristics: any): {
        message: number;
        offer: number;
        cta: number;
        tracking: number;
    } {
        let message = 100;
        let offer = 100;
        let cta = 100;
        let tracking = heuristics.trackingPresent ? 100 : 50;

        for (const sig of signals) {
            const penalty = sig.impact === 'high' ? 30 : sig.impact === 'medium' ? 15 : 5;

            if (sig.signal.toLowerCase().includes('message') || sig.signal.toLowerCase().includes('headline')) {
                message = Math.max(0, message - penalty);
            }
            if (sig.signal.toLowerCase().includes('offer') || sig.signal.toLowerCase().includes('discount')) {
                offer = Math.max(0, offer - penalty);
            }
            if (sig.signal.toLowerCase().includes('cta')) {
                cta = Math.max(0, cta - penalty);
            }
            if (sig.signal.toLowerCase().includes('tracking') || sig.signal.toLowerCase().includes('pixel') || sig.signal.toLowerCase().includes('utm')) {
                tracking = Math.max(0, tracking - penalty);
            }
        }

        return { message, offer, cta, tracking };
    }

    private computeConfidence(params: {
        llmSuccess: boolean;
        textLength: number;
        trackingPresent: boolean;
        reasons: string[];
    }): { score: number; reasons: string[] } {
        let score = 100;
        const reasons = [...params.reasons];

        if (!params.llmSuccess) {
            score -= 20;
        }

        if (params.textLength < 200) {
            score -= 15;
            reasons.push('low_text');
        } else {
            reasons.push('scrape_ok');
        }

        if (params.trackingPresent) {
            reasons.push('tracking_ok');
        }

        return { score: Math.max(0, Math.min(100, score)), reasons };
    }

    private buildGoldenRule(
        signals: GoldenRuleSignal[],
        input: ScoringInput,
        adId: string,
        confidence: { score: number; reasons: string[] }
    ): GoldenRule {
        const sortedSignals = signals
            .sort((a, b) => {
                const impactOrder = { high: 3, medium: 2, low: 1 };
                return impactOrder[b.impact] - impactOrder[a.impact];
            })
            .slice(0, 5);

        return {
            why: sortedSignals,
            sources: {
                ad: {
                    provider: 'meta',
                    ad_id: adId,
                    creative_fields: ['headline', 'primary_text', 'cta']
                },
                page: {
                    url: input.pageSnapshot.url,
                    fields: ['title', 'h1', 'ctas', 'pixels', 'utms']
                }
            },
            period: {
                checked_at: new Date().toISOString()
            },
            confidence,
            next_actions: this.generateNextActions(sortedSignals)
        };
    }

    private generateNextActions(signals: GoldenRuleSignal[]): Array<{
        action: string;
        eta: string;
        owner: string;
        link_to_ui?: string;
    }> {
        const actions: any[] = [];

        for (const sig of signals) {
            if (sig.signal.includes('Pixel')) {
                actions.push({
                    action: 'Install Meta Pixel on landing page',
                    eta: '30m',
                    owner: 'dev',
                    link_to_ui: '/settings/tracking'
                });
            } else if (sig.signal.includes('UTM')) {
                actions.push({
                    action: 'Add UTM parameters to ad destination URL',
                    eta: '10m',
                    owner: 'marketing',
                    link_to_ui: '/ads/edit'
                });
            } else if (sig.signal.includes('CTA')) {
                actions.push({
                    action: 'Align CTA text between ad and landing page',
                    eta: '15m',
                    owner: 'marketing'
                });
            } else if (sig.signal.includes('Offer') || sig.signal.includes('offer')) {
                actions.push({
                    action: 'Ensure landing page prominently displays the advertised offer',
                    eta: '20m',
                    owner: 'marketing'
                });
            }
        }

        return actions.slice(0, 3);
    }

    private generateRecommendations(signals: GoldenRuleSignal[]): string[] {
        const recs: string[] = [];

        for (const sig of signals) {
            if (sig.impact === 'high') {
                recs.push(`🔴 ${sig.signal}: ${sig.evidence[0]}`);
            } else if (sig.impact === 'medium') {
                recs.push(`🟡 ${sig.signal}: ${sig.evidence[0]}`);
            }
        }

        return recs.slice(0, 5);
    }

    redactText(text: string): string {
        text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
        text = text.replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
        text = text.replace(/\b[A-Za-z0-9]{20,}\b/g, '[ID]');
        return text;
    }
}

export const alignmentScorer = new AlignmentScorerV2_4();
