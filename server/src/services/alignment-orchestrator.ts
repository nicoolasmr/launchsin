/**
 * Alignment Orchestrator
 * 
 * Manages batch execution of alignment checks for projects.
 * Orchestrates:
 * 1. Fetching ads from sources (Meta, etc.)
 * 2. Budget checking
 * 3. AI Analysis (AlignmentEngine)
 * 4. Result persistence
 */

import * as crypto from 'crypto';
import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';
import { alignmentEngine } from '../ai/alignment-engine';
import { alignmentSettingsService } from './alignment-settings';
import { pageScraper } from '../ai/page-scraper';
import { MetaAdsConnector } from '../integrations/connectors/meta-ads';

export class AlignmentOrchestrator {
    /**
     * Run batch alignment check for a project
     */
    async runProjectBatch(projectId: string, orgId: string): Promise<void> {
        const runId = crypto.randomUUID();
        logger.info('Starting alignment batch run', { projectId, runId });

        try {
            // 1. Check Settings & Budget
            const settings = await alignmentSettingsService.getSettings(projectId);
            if (!settings?.enabled) {
                logger.info('Alignment disabled for project, skipping', { projectId });
                return;
            }

            const budget = await alignmentSettingsService.canRunCheck(projectId);
            if (!budget.allowed) {
                logger.warn('Budget exceeded, skipping batch', { projectId, reason: budget.reason });
                return;
            }

            // 2. Fetch Active Connections (Meta only for now)
            const { data: connections } = await supabase
                .from('source_connections')
                .select('*')
                .eq('project_id', projectId)
                .eq('status', 'active')
                .eq('provider', 'meta_ads');

            if (!connections || connections.length === 0) {
                logger.info('No active Meta connections found', { projectId });
                return;
            }

            // 3. Process each connection
            for (const conn of connections) {
                await this.processConnection(conn, settings.max_checks_per_day, runId);
            }

        } catch (error: any) {
            logger.error('Alignment batch run failed', { error: error.message, projectId });
        }
    }

    private async processConnection(connection: any, maxChecks: number, runId: string) {
        try {
            // Get Token
            const accessToken = await this.getAccessToken(connection.id);
            const connector = new MetaAdsConnector(accessToken);

            // Fetch Ads (Using the new getAllActiveAds method)
            const metaAds = await connector.getAllActiveAds(connection.config_json?.ad_account_id || 'act_123');

            let checkedCount = 0;

            for (const metaAd of metaAds) {
                // Check budget again inside loop as it consumes quota
                const budget = await alignmentSettingsService.canRunCheck(connection.project_id);
                if (!budget.allowed) break;

                // Extract Creative Data
                // Note: In production this requires robust parsing of Meta's nested creative structure
                // We use defaults here if fields are missing as placeholders
                const headline = metaAd.creative?.title || metaAd.name;
                const body = metaAd.creative?.body || 'Check this out';

                // Try to find a URL (simplified logic)
                // Real implementation would look into adcreatives link_data or object_story_spec
                // For this sprint, we use a placeholder or extract if seemingly available
                const landingUrl = 'https://example.com/product?utm_source=meta';

                if (!landingUrl) continue;

                const adData = {
                    ad_id: metaAd.id,
                    ad_name: metaAd.name,
                    headline,
                    body,
                    cta_text: metaAd.creative?.call_to_action_type || 'Learn More',
                    image_url: metaAd.creative?.image_url,
                    landing_url: landingUrl
                };

                try {
                    // Scrape
                    const pageAnalysis = await pageScraper.scrapePage(adData.landing_url);

                    // Analyze
                    const report = await alignmentEngine.analyzeAlignment(
                        connection.org_id,
                        connection.project_id,
                        adData,
                        pageAnalysis
                    );

                    // Save report (Note: analyzeAlignment handles caching, but saveReport handles persistence to reports table)
                    await alignmentEngine.saveReport(
                        connection.org_id,
                        connection.project_id,
                        connection.id,
                        adData,
                        report
                    );

                    checkedCount++;

                } catch (error: any) {
                    logger.error('Failed to process ad in batch', { ad_id: metaAd.id, error: error.message });
                }
            }

            // Log Run Success
            await supabase.from('alignment_runs').insert({
                org_id: connection.org_id,
                project_id: connection.project_id,
                source_connection_id: connection.id,
                mode: 'scheduled',
                status: 'success',
                started_at: new Date().toISOString(),
                finished_at: new Date().toISOString(),
                checks_count: checkedCount,
                failures_count: 0,
                correlation_id: runId
            });

        } catch (error: any) {
            logger.error('Failed to process connection in batch', { connectionId: connection.id, error: error.message });

            await supabase.from('alignment_runs').insert({
                org_id: connection.org_id,
                project_id: connection.project_id,
                source_connection_id: connection.id,
                mode: 'scheduled',
                status: 'failed',
                last_error: error.message,
                correlation_id: runId
            });
        }
    }

    private async getAccessToken(connectionId: string): Promise<string> {
        const secretKeyName = `meta_token_${connectionId}`;
        const { data } = await supabase
            .from('secret_refs')
            .select('secret_id_ref')
            .eq('key_name', secretKeyName)
            .single();
        if (!data) throw new Error('Token not found');
        return data.secret_id_ref;
    }
}

export const alignmentOrchestrator = new AlignmentOrchestrator();
