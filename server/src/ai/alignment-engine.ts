import OpenAI from 'openai';
import * as crypto from 'crypto';
import { logger } from '../infra/structured-logger';
import { supabase } from '../infra/db';
import { redactPII } from './pii-redactor';
import { alignmentSettingsService } from '../services/alignment-settings';
import { alertEngine } from '../services/alert-engine';

/**
 * Alignment Engine
 * 
 * AI-powered analysis of ad-to-landing page congruence using OpenAI GPT-4.
 * 
 * Features:
 * - PII Redaction
 * - Caching (TTL)
 * - Cost Guardrails
 * - Alert Generation
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
    source?: 'cache' | 'openai';
}

export class AlignmentEngine {
    private openai: OpenAI;
    private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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
        orgId: string,
        projectId: string,
        ad: AdCreative,
        page: PageAnalysis
    ): Promise<AlignmentReport> {
        try {
            // 1. Generate Cache Key
            const cacheKey = this.generateCacheKey(ad, page);

            // 2. Check Cache
            const cached = await this.getCachedResult(projectId, cacheKey);
            if (cached) {
                logger.info('Alignment analysis cache hit', { ad_id: ad.ad_id });
                return { ...cached, source: 'cache' };
            }

            // 3. Check Budget / Cost Guardrails
            const budgetCheck = await alignmentSettingsService.canRunCheck(projectId);
            if (!budgetCheck.allowed) {
                logger.warn('Alignment budget exceeded', { projectId, reason: budgetCheck.reason });

                // Alert if budget exceeded (with deduplication)
                await alertEngine.createAlert({
                    org_id: orgId,
                    project_id: projectId,
                    type: 'alignment_budget_exceeded',
                    severity: 'warning',
                    message: `Daily alignment checks budget exceeded. ${budgetCheck.reason}`,
                    metadata: { deduplication_key: `budget_${new Date().toISOString().split('T')[0]}` }
                });

                throw new Error(`Alignment check blocked: ${budgetCheck.reason}`);
            }

            // 4. Redact PII
            const safeAd = this.redactAdCreative(ad);
            const safePage = this.redactPageAnalysis(page);

            // 5. Build prompt & Call OpenAI
            const prompt = this.buildAnalysisPrompt(safeAd, safePage);

            const completion = await this.openai.chat.completions.create({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert marketing analyst specializing in ad-to-landing page congruence.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1500
            });

            const response = completion.choices[0]?.message?.content;
            if (!response) throw new Error('Empty response from OpenAI');

            // 6. Parse Response
            const report = this.parseAIResponse(response, safeAd, safePage);

            // 7. Cache Result
            await this.cacheResult(orgId, projectId, cacheKey, report);

            // 8. Generate Alerts if needed
            await this.checkAndAlert(orgId, projectId, ad.ad_id, report);

            logger.info('Alignment analysis completed', {
                ad_id: ad.ad_id,
                score: report.score,
                issues: report.reasons.length
            });

            return { ...report, source: 'openai' };

        } catch (error: any) {
            logger.error('Alignment analysis failed', {
                error: error.message,
                ad_id: ad.ad_id
            });
            throw error;
        }
    }

    private generateCacheKey(ad: AdCreative, page: PageAnalysis): string {
        const data = JSON.stringify({
            // Cache based on key content
            ad_headline: ad.headline,
            ad_body: ad.body,
            ad_img: ad.image_url,
            landing_url: ad.landing_url,
            // Page content hash (assuming page object reflects current state)
            page_title: page.title,
            page_h1: page.h1,
            prompt_version: 'v1'
        });
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    private async getCachedResult(projectId: string, cacheKey: string): Promise<AlignmentReport | null> {
        const { data } = await supabase
            .from('alignment_cache')
            .select('payload_json')
            .eq('project_id', projectId)
            .eq('cache_key', cacheKey)
            .gt('expires_at', new Date().toISOString())
            .single();

        return data?.payload_json || null;
    }

    private async cacheResult(orgId: string, projectId: string, cacheKey: string, report: AlignmentReport): Promise<void> {
        const expiresAt = new Date(Date.now() + this.CACHE_TTL_MS).toISOString();

        await supabase.from('alignment_cache').upsert({
            org_id: orgId,
            project_id: projectId,
            cache_key: cacheKey,
            expires_at: expiresAt,
            payload_json: report
        }, { onConflict: 'project_id,cache_key' });
    }

    private redactAdCreative(ad: AdCreative): AdCreative {
        return {
            ...ad,
            headline: redactPII(ad.headline || ''),
            body: redactPII(ad.body || ''),
            cta_text: redactPII(ad.cta_text || '')
        };
    }

    private redactPageAnalysis(page: PageAnalysis): PageAnalysis {
        return {
            ...page,
            title: redactPII(page.title || ''),
            h1: redactPII(page.h1 || ''),
            meta_description: redactPII(page.meta_description || '')
        };
    }

    private async checkAndAlert(orgId: string, projectId: string, adId: string, report: AlignmentReport): Promise<void> {
        const settings = await alignmentSettingsService.getSettings(projectId);
        const threshold = settings?.min_score_alert_threshold || 70;

        if (report.score < threshold) {
            await alertEngine.createAlert({
                org_id: orgId,
                project_id: projectId,
                type: 'alignment_low_score',
                severity: 'warning',
                message: `Low alignment score detected (${report.score}) for ad ${adId}`,
                metadata: {
                    ad_id: adId,
                    score: report.score,
                    deduplication_key: `low_score_${adId}`
                }
            });
        }

        // Resolving alerts is complex (needs re-check), omitting for now or can implement logic to resolve if score > threshold
        if (report.score >= threshold) {
            await alertEngine.resolveAlerts(projectId, 'alignment_low_score', `low_score_${adId}`);
        }
    }

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

    private parseAIResponse(response: string, ad: AdCreative, page: PageAnalysis): AlignmentReport {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('No JSON found in response');

            const parsed = JSON.parse(jsonMatch[0]);

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
            logger.error('Failed to parse AI response', { error: error.message });
            return this.fallbackAnalysis(ad, page);
        }
    }

    private fallbackAnalysis(ad: AdCreative, page: PageAnalysis): AlignmentReport {
        // ... (existing fallback logic kept same)
        const issues: any[] = [];
        let score = 100;

        if (!page.has_pixel) {
            issues.push({
                type: 'tracking_missing',
                severity: 'high',
                description: 'No tracking pixel detected',
                recommendation: 'Install Meta Pixel'
            });
            score -= 20;
        }

        if (!page.has_utm) {
            issues.push({
                type: 'tracking_missing',
                severity: 'medium',
                description: 'No UTM parameters',
                recommendation: 'Add UTM parameters'
            });
            score -= 10;
        }

        if (!page.has_form && !page.cta_buttons.length) {
            issues.push({
                type: 'cta_mismatch',
                severity: 'critical',
                description: 'No clear CTA or form',
                recommendation: 'Add CTA button'
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
     * Save alignment report to database (kept for backward compatibility or direct use)
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
            if (error.code === '23505') {
                return 'duplicate';
            }
            throw error;
        }

        return data.id;
    }
}

export const alignmentEngine = new AlignmentEngine();
