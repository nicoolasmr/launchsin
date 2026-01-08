import OpenAI from 'openai';
import { logger } from '../infra/structured-logger';
// import { ScrapedContent } from '../services/scraping-service'; 

export interface ScrapedContent {
    url: string;
    title?: string;
    description?: string;
    h1?: string[];
    h2?: string[];
    visibleText?: string;
    bodyText?: string;
    meta?: any;
    has_pixel?: boolean;
    has_utm?: boolean;
    has_form?: boolean;
    cta_buttons?: string[];
    error?: string;
}

// Aliases/Interfaces for compatibility with legacy code
export interface PageAnalysis extends ScrapedContent {
    // Map legacy fields if needed
    has_pixel?: boolean;
    has_utm?: boolean;
    has_form?: boolean;
    cta_buttons?: string[];
}

export type AlignmentReport = AlignmentAnalysis;

export interface AdCreative extends AdContent {
    ad_id: string;
    ad_name: string;
    cta_text?: string;
    landing_url: string;
}

export interface AlignmentAnalysis {
    score: number;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        cost_usd: number;
    };
    source?: string; // Add source for consistency
    reasons?: any[]; // Legacy alias
    evidence?: any;  // Legacy alias
    findings: {
        type: 'message_match' | 'offer_match' | 'visual_match' | 'tone_match';
        status: 'pass' | 'fail' | 'warning';
        description: string;
    }[];
    summary: string;
}

export interface AdContent {
    headline: string;
    body: string;
    cta: string;
    imageUrl?: string;
    creativeId: string;
}

export class AlignmentEngine {
    private openai: OpenAI;
    private model = 'gpt-4o'; // Use GPT-4o for better performance/cost

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            logger.warn('OPENAI_API_KEY not found. Alignment Engine will fail if called.');
        }
        this.openai = new OpenAI({ apiKey: apiKey || 'dummy' });
    }

    public async analyze(ad: AdContent, page: ScrapedContent): Promise<AlignmentAnalysis> {
        // Construct detailed prompt
        const systemPrompt = `
You are a senior Conversion Rate Optimization (CRO) expert. Your task is to analyze the "Alignment" between a Facebook Ad and a Landing Page.
High alignment leads to higher conversion rates. Key elements to check:
1. Message Match: Does the page headline match the ad promise?
2. Offer Match: Is the specific offer (price, discount, bonus) present above the fold?
3. Visual Continuity: (Implicit from text description) Do they feel connected?
4. Call to Action: Is there a clear path forward?

Output JSON format:
{
  "score": number (0-100),
  "findings": [
    { "type": "message_match", "status": "pass"|"fail"|"warning", "description": "..." }
  ],
  "summary": "Short executive summary."
}
Strictly return valid JSON. logic:
- Score < 50: Critical mismatch (e.g. wrong product, broken link).
- Score 50-70: Weak alignment (generic page for specific ad).
- Score > 90: Perfect scent trail.
`;

        const userPrompt = `
--- AD CREATIVE ---
Headline: ${ad.headline}
Body: ${ad.body}
cta: ${ad.cta}

--- LANDING PAGE ---
URL: ${page.url}
Title: ${page.title || 'N/A'}
H1: ${(page.h1 || []).join(', ')}
H2: ${(page.h2 || []).join(', ')}
Text Sample: ${(page.visibleText || '').slice(0, 2000)}

Evaluate the alignment score (0-100) based on:
`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.2
            });

            const resultJson = completion.choices[0].message.content;
            if (!resultJson) throw new Error('Empty response from OpenAI');

            const result = JSON.parse(resultJson);

            // Calculate cost (estimate)
            // GPT-4o: $5/1M input, $15/1M output (approx)
            const inputCost = (completion.usage?.prompt_tokens || 0) * (5 / 1000000);
            const outputCost = (completion.usage?.completion_tokens || 0) * (15 / 1000000);

            return {
                score: result.score || 0,
                findings: result.findings || [],
                summary: result.summary || 'No summary provided.',
                reasons: result.findings, // Align
                evidence: { summary: result.summary }, // Align
                source: 'gpt-4o',
                usage: {
                    prompt_tokens: completion.usage?.prompt_tokens || 0,
                    completion_tokens: completion.usage?.completion_tokens || 0,
                    cost_usd: inputCost + outputCost
                }
            };

        } catch (error: any) {
            logger.error('Alignment analysis failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Legacy wrapper for analyze
     */
    public async analyzeAlignment(
        orgId: string,
        projectId: string,
        ad: AdCreative,
        page: ScrapedContent
    ): Promise<AlignmentAnalysis> {
        // Map AdCreative to AdContent
        const content: AdContent = {
            headline: ad.headline,
            body: ad.body,
            cta: ad.cta_text || ad.cta || 'LEARN_MORE',
            creativeId: ad.creativeId || ad.ad_id,
            imageUrl: ad.imageUrl
        };

        return this.analyze(content, page);
    }

    /**
     * Legacy wrapper for saving report
     * Ideally strictly DAO responsibility, but kept here for compatibility
     */
    public async saveReport(
        orgId: string,
        projectId: string,
        connectionId: string | null,
        ad: AdCreative,
        report: AlignmentAnalysis
    ): Promise<string> {
        // This creates a circular dependency if we import 'db' directly?
        // db imports logger, etc. Should be fine.
        // We need to dynamic import or assume db is available.
        // Let's use the 'supabase' client from infra/db if possible, or just Log it if we can't save.
        // But internal/alignment.ts does INSERT.
        // Let's import supabase at module level? 'infra/db'
        // @ts-ignore
        const { supabase } = await import('../infra/db');

        const { data, error } = await supabase.from('alignment_reports').insert({
            org_id: orgId,
            project_id: projectId,
            source_connection_id: connectionId,
            ad_id: ad.ad_id,
            ad_name: ad.ad_name,
            landing_url: ad.landing_url,
            score: report.score,
            reasons_json: JSON.stringify(report.findings),
            evidence_json: JSON.stringify({
                summary: report.summary,
                usage: report.usage
            }),
            analyzed_by: 'gpt-4o'
        }).select('id').single();

        if (error) throw error;
        return data.id;
    }
}

export const alignmentEngine = new AlignmentEngine();
