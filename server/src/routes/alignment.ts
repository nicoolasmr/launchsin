import { Request, Response } from 'express';
import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';
import { AuthenticatedRequest } from '../middleware/auth';
import { alignmentEngine, AdCreative, AlignmentReport } from '../ai/alignment-engine';
import { pageScraper } from '../ai/page-scraper';
import { alignmentSettingsService } from '../services/alignment-settings';
import { MetaAdsConnector } from '../integrations/connectors/meta-ads';

/**
 * Alignment Intelligence Routes
 */

/**
 * Trigger alignment check (Manual)
 * POST /api/projects/:projectId/integrations/alignment/check
 * Note: connectionId is optional if ad_id provides enough context or if testing
 */
export async function triggerAlignmentCheck(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const { projectId } = req.params;
    const { ad_id, landing_url, connection_id } = req.body;
    const { tenant_id } = req.user!;

    if (!landing_url) {
        res.status(400).json({ error: 'landing_url is required' });
        return;
    }

    try {
        // 1. Check permissions & settings
        const settings = await alignmentSettingsService.getSettings(projectId);
        if (settings && !settings.enabled) {
            // Allow manual checks even if disabled? Usually yes for testing.
            // But let's log it.
            logger.info('Manual alignment check triggers while disabled', { projectId });
        }

        // 2. Prepare Ad Data
        // In a real scenario, we might fetch from connection if provided
        const ad: AdCreative = {
            ad_id: ad_id || `manual-${Date.now()}`,
            ad_name: 'Manual Check Ad',
            headline: req.body.headline,
            body: req.body.body,
            cta_text: req.body.cta_text,
            landing_url: landing_url
        };

        // 3. Scrape Page
        const pageAnalysis = await pageScraper.scrapePage(landing_url);

        // 4. Run Analysis (Engine handles caching, cost checks, PII)
        const report = await alignmentEngine.analyzeAlignment(
            tenant_id,
            projectId,
            ad,
            pageAnalysis
        );

        // 5. Save Report (History)
        // If connection_id is provided, link it
        const reportId = await alignmentEngine.saveReport(
            tenant_id,
            projectId,
            connection_id || null, // Allow null if ad-hoc
            ad,
            report
        );

        // 6. Log Run (Audit)
        await supabase.from('alignment_runs').insert({
            org_id: tenant_id,
            project_id: projectId,
            mode: 'manual',
            status: 'success',
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            checks_count: 1,
            failures_count: 0,
            cost_estimated: 0.03 // Approx cost for GPT-4 analysis
        });

        res.json({
            report_id: reportId,
            score: report.score,
            issues: report.reasons,
            evidence: report.evidence,
            source: report.source
        });

    } catch (error: any) {
        logger.error('Manual alignment check failed', {
            error: error.message,
            projectId,
            ad_id
        });

        // Log failed run
        await supabase.from('alignment_runs').insert({
            org_id: tenant_id,
            project_id: projectId,
            mode: 'manual',
            status: 'failed',
            last_error: error.message
        });

        if (error.message.includes('budget exceeded')) {
            res.status(429).json({ error: 'Daily alignment budget exceeded' });
            return;
        }

        res.status(500).json({ error: 'Alignment check failed' });
    }
}

/**
 * Get alignment reports
 * GET /api/projects/:projectId/integrations/alignment/reports
 */
export async function getAlignmentReports(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const { projectId } = req.params;
    const { limit = 20, min_score, ad_id } = req.query;

    try {
        let query = supabase
            .from('alignment_reports') // Assuming this table exists from previous sprints
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(Number(limit));

        if (min_score) {
            query = query.gte('score', Number(min_score));
        }

        if (ad_id) {
            query = query.eq('ad_id', ad_id);
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json(data || []);
    } catch (error: any) {
        logger.error('Failed to fetch reports', { error, projectId });
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
}

/**
 * Get specific alignment report
 * GET /api/projects/:projectId/integrations/alignment/reports/:reportId
 */
export async function getAlignmentReport(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const { projectId, reportId } = req.params;

    try {
        const { data, error } = await supabase
            .from('alignment_reports')
            .select('*')
            .eq('project_id', projectId)
            .eq('id', reportId)
            .single();

        if (error || !data) {
            res.status(404).json({ error: 'Report not found' });
            return;
        }

        res.json(data);
    } catch (error: any) {
        logger.error('Failed to fetch report details', { error, projectId, reportId });
        res.status(500).json({ error: 'Failed to fetch report' });
    }
}

/**
 * Get alignment settings
 * GET /api/projects/:projectId/integrations/alignment/settings
 */
export async function getAlignmentSettings(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const { projectId } = req.params;
    const { tenant_id } = req.user!;

    try {
        const settings = await alignmentSettingsService.getOrCreateSettings(projectId, tenant_id);
        res.json(settings);
    } catch (error: any) {
        logger.error('Failed to get alignment settings', { error, projectId });
        res.status(500).json({ error: 'Failed to get settings' });
    }
}

/**
 * Update alignment settings
 * PUT /api/projects/:projectId/integrations/alignment/settings
 */
export async function updateAlignmentSettings(
    req: AuthenticatedRequest,
    res: Response
): Promise<void> {
    const { projectId } = req.params;
    const updates = req.body;

    // Basic validation
    if (updates.cadence && !['daily', 'weekly'].includes(updates.cadence)) {
        res.status(400).json({ error: 'Invalid cadence' });
        return;
    }

    try {
        const updated = await alignmentSettingsService.updateSettings(projectId, updates);
        res.json(updated);
    } catch (error: any) {
        logger.error('Failed to update alignment settings', { error, projectId });
        res.status(500).json({ error: 'Failed to update settings' });
    }
}
