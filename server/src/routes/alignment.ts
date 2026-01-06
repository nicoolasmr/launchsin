import { Request, Response } from 'express';
import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';
import { AuthenticatedRequest } from '../middleware/auth';
import { alignmentEngine, AdCreative } from '../ai/alignment-engine';
import { pageScraper } from '../ai/page-scraper';
import { MetaAdsConnector } from '../integrations/connectors/meta-ads';

/**
 * Alignment Intelligence Routes
 * 
 * POST /api/projects/:projectId/integrations/:connectionId/alignment/check
 * GET /api/projects/:projectId/integrations/:connectionId/alignment/reports
 */

/**
 * Trigger alignment check for a connection
 * POST /api/projects/:projectId/integrations/:connectionId/alignment/check
 */
export async function triggerAlignmentCheck(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const { projectId, connectionId } = req.params;
    const { ad_id } = req.body;

    try {
        // Verify connection
        const { data: connection, error: connError } = await supabase
            .from('source_connections')
            .select('id, org_id, project_id, type, config_json')
            .eq('id', connectionId)
            .eq('project_id', projectId)
            .single();

        if (connError || !connection) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }

        // Check feature flag
        const { data: flagData } = await supabase
            .from('feature_flags')
            .select('enabled')
            .eq('org_id', connection.org_id)
            .eq('key', 'ads_pages_alignment')
            .single();

        if (!flagData?.enabled) {
            res.status(403).json({ error: 'Feature not enabled for this organization' });
            return;
        }

        // Fetch ad creative from Meta
        const accessToken = await getAccessToken(connectionId);
        const metaConnector = new MetaAdsConnector(accessToken);

        // Get ad details (simplified - in production, fetch from Meta API)
        const ad: AdCreative = {
            ad_id: ad_id,
            ad_name: 'Sample Ad',
            headline: 'Get 50% Off Today!',
            body: 'Limited time offer. Sign up now and save.',
            cta_text: 'Sign Up',
            landing_url: 'https://example.com/offer?utm_source=meta'
        };

        // Scrape landing page
        const pageAnalysis = await pageScraper.scrapePage(ad.landing_url);

        // Run AI analysis
        const report = await alignmentEngine.analyzeAlignment(ad, pageAnalysis);

        // Save report
        const reportId = await alignmentEngine.saveReport(
            connection.org_id,
            projectId,
            connectionId,
            ad,
            report
        );

        logger.info('Alignment check completed', {
            project_id: projectId,
            connection_id: connectionId,
            ad_id: ad_id,
            score: report.score,
            report_id: reportId
        });

        res.json({
            report_id: reportId,
            score: report.score,
            issues: report.reasons.length,
            top_issue: report.reasons[0]?.description
        });

    } catch (error: any) {
        logger.error('Alignment check failed', {
            error: error.message,
            project_id: projectId,
            connection_id: connectionId
        });
        res.status(500).json({ error: 'Alignment check failed' });
    }
}

/**
 * Get alignment reports for a connection
 * GET /api/projects/:projectId/integrations/:connectionId/alignment/reports
 */
export async function getAlignmentReports(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const { projectId, connectionId } = req.params;
    const { limit = 20, min_score, max_score } = req.query;

    try {
        let query = supabase
            .from('alignment_reports')
            .select('*')
            .eq('project_id', projectId)
            .eq('source_connection_id', connectionId)
            .order('created_at', { ascending: false })
            .limit(parseInt(limit as string));

        if (min_score) {
            query = query.gte('score', parseInt(min_score as string));
        }

        if (max_score) {
            query = query.lte('score', parseInt(max_score as string));
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        res.json(data || []);

    } catch (error: any) {
        logger.error('Failed to fetch alignment reports', {
            error: error.message,
            project_id: projectId
        });
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
}

/**
 * Helper: Get access token from secret_refs
 */
async function getAccessToken(connectionId: string): Promise<string> {
    const secretKeyName = `meta_token_${connectionId}`;
    const { data } = await supabase
        .from('secret_refs')
        .select('secret_id_ref')
        .eq('key_name', secretKeyName)
        .single();

    if (!data) {
        throw new Error('Access token not found');
    }

    return data.secret_id_ref; // In production, decrypt this
}
