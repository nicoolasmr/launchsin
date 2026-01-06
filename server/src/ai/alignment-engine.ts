import OpenAI from 'openai';
import { logger } from '../infra/structured-logger';
import { supabase } from '../infra/db';

/**
 * Alignment Engine
 * 
 * AI-powered analysis of ad-to-landing page congruence using OpenAI GPT-4.
 * 
 * Checks:
 * - Message match (ad copy vs page content)
 * - Offer match (price, product, CTA)
 * - CTA consistency
 * - Tracking presence (pixel, UTM parameters)
 */

export interface AdCreative {
    ad_id: string;
    ad_name?: string;
    headline?: string;
    body?: string;
    cta_text?: string;
    image_url?: string;
    landing_url: string;
}

export interface PageAnalysis {
    url: string;
    title?: string;
    h1?: string;
    meta_description?: string;
    has_pixel: boolean;
    has_utm: boolean;
    has_form: boolean;
    cta_buttons: string[];
}

export interface AlignmentReport {
    score: number; // 0-100
    reasons: Array<{
        type: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        recommendation?: string;
    }>;
    evidence: {
        ad_copy: string;
        page_title?: string;
        page_h1?: string;
        has_pixel: boolean;
        has_utm: boolean;
        message_match_score: number;
        offer_match_score: number;
        cta_match_score: number;
        tracking_score: number;
    };
}

export class AlignmentEngine {
    private openai: OpenAI;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY not configured');
        }
        this.openai = new OpenAI({ apiKey });
    }

    /**
     * Analyze alignment between ad and landing page
     */
    public async analyzeAlignment(
        ad: AdCreative,
        page: PageAnalysis
    ): Promise<AlignmentReport> {
        try {
            // Build analysis prompt
            const prompt = this.buildAnalysisPrompt(ad, page);

            // Call OpenAI GPT-4
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert marketing analyst specializing in ad-to-landing page congruence. Analyze alignment and provide actionable recommendations.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3, // Low temperature for consistent analysis
                max_tokens: 1500
            });

            const response = completion.choices[0]?.message?.content;
            if (!response) {
                throw new Error('Empty response from OpenAI');
            }

            // Parse AI response
            const report = this.parseAIResponse(response, ad, page);

            logger.info('Alignment analysis completed', {
                ad_id: ad.ad_id,
                score: report.score,
                issues: report.reasons.length
            });

            return report;

        } catch (error: any) {
            logger.error('Alignment analysis failed', {
                error: error.message,
                ad_id: ad.ad_id
            });
            throw error;
        }
    }

    /**
     * Build analysis prompt for GPT-4
     */
    private buildAnalysisPrompt(ad: AdCreative, page: PageAnalysis): string {
        return `
Analyze the alignment between this ad and its landing page:

**AD CREATIVE:**
- Headline: ${ad.headline || 'N/A'}
- Body: ${ad.body || 'N/A'}
- CTA: ${ad.cta_text || 'N/A'}

**LANDING PAGE:**
- URL: ${page.url}
- Title: ${page.title || 'N/A'}
- H1: ${page.h1 || 'N/A'}
- Meta Description: ${page.meta_description || 'N/A'}
- CTA Buttons: ${page.cta_buttons.join(', ') || 'None'}
- Has Tracking Pixel: ${page.has_pixel ? 'Yes' : 'No'}
- Has UTM Parameters: ${page.has_utm ? 'Yes' : 'No'}
- Has Form: ${page.has_form ? 'Yes' : 'No'}

**ANALYSIS REQUIRED:**
1. Message Match (0-100): Does the page content match the ad's promise?
2. Offer Match (0-100): Are pricing, product, and value proposition consistent?
3. CTA Consistency (0-100): Do CTAs align between ad and page?
4. Tracking Score (0-100): Is proper tracking in place?

**OUTPUT FORMAT (JSON):**
{
  "message_match_score": <0-100>,
  "offer_match_score": <0-100>,
  "cta_match_score": <0-100>,
  "tracking_score": <0-100>,
  "issues": [
    {
      "type": "message_mismatch|offer_mismatch|cta_mismatch|tracking_missing",
      "severity": "low|medium|high|critical",
      "description": "Brief description of the issue",
      "recommendation": "Actionable fix"
    }
  ]
}

Respond ONLY with valid JSON.
`.trim();
    }

    /**
     * Parse AI response into structured report
     */
    private parseAIResponse(response: string, ad: AdCreative, page: PageAnalysis): AlignmentReport {
        try {
            // Extract JSON from response (GPT-4 sometimes adds markdown)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Calculate overall score (weighted average)
            const score = Math.round(
                parsed.message_match_score * 0.35 +
                parsed.offer_match_score * 0.30 +
                parsed.cta_match_score * 0.20 +
                parsed.tracking_score * 0.15
            );

            return {
                score,
                reasons: parsed.issues || [],
                evidence: {
                    ad_copy: `${ad.headline || ''} ${ad.body || ''}`.trim(),
                    page_title: page.title,
                    page_h1: page.h1,
                    has_pixel: page.has_pixel,
                    has_utm: page.has_utm,
                    message_match_score: parsed.message_match_score,
                    offer_match_score: parsed.offer_match_score,
                    cta_match_score: parsed.cta_match_score,
                    tracking_score: parsed.tracking_score
                }
            };
        } catch (error: any) {
            logger.error('Failed to parse AI response', {
                error: error.message,
                response: response.substring(0, 200)
            });

            // Fallback: basic heuristic scoring
            return this.fallbackAnalysis(ad, page);
        }
    }

    /**
     * Fallback analysis if AI fails
     */
    private fallbackAnalysis(ad: AdCreative, page: PageAnalysis): AlignmentReport {
        const issues: any[] = [];
        let score = 100;

        // Basic checks
        if (!page.has_pixel) {
            issues.push({
                type: 'tracking_missing',
                severity: 'high',
                description: 'No tracking pixel detected on landing page',
                recommendation: 'Install Meta Pixel or Google Analytics'
            });
            score -= 20;
        }

        if (!page.has_utm) {
            issues.push({
                type: 'tracking_missing',
                severity: 'medium',
                description: 'No UTM parameters in landing URL',
                recommendation: 'Add UTM parameters to track campaign source'
            });
            score -= 10;
        }

        if (!page.has_form && !page.cta_buttons.length) {
            issues.push({
                type: 'cta_mismatch',
                severity: 'critical',
                description: 'No clear CTA or form on landing page',
                recommendation: 'Add a prominent CTA button or lead form'
            });
            score -= 30;
        }

        return {
            score: Math.max(0, score),
            reasons: issues,
            evidence: {
                ad_copy: `${ad.headline || ''} ${ad.body || ''}`.trim(),
                page_title: page.title,
                page_h1: page.h1,
                has_pixel: page.has_pixel,
                has_utm: page.has_utm,
                message_match_score: 50,
                offer_match_score: 50,
                cta_match_score: page.cta_buttons.length > 0 ? 70 : 30,
                tracking_score: (page.has_pixel ? 50 : 0) + (page.has_utm ? 50 : 0)
            }
        };
    }

    /**
     * Save alignment report to database
     */
    public async saveReport(
        orgId: string,
        projectId: string,
        connectionId: string,
        ad: AdCreative,
        report: AlignmentReport
    ): Promise<string> {
        const { data, error } = await supabase
            .from('alignment_reports')
            .insert({
                org_id: orgId,
                project_id: projectId,
                source_connection_id: connectionId,
                ad_id: ad.ad_id,
                ad_name: ad.ad_name,
                landing_url: ad.landing_url,
                score: report.score,
                reasons_json: report.reasons,
                evidence_json: report.evidence,
                analyzed_by: 'gpt-4'
            })
            .select('id')
            .single();

        if (error) {
            // Check if duplicate
            if (error.code === '23505') {
                logger.info('Duplicate alignment report ignored', {
                    ad_id: ad.ad_id,
                    landing_url: ad.landing_url
                });
                return 'duplicate';
            }
            throw error;
        }

        return data.id;
    }
}

export const alignmentEngine = new AlignmentEngine();
