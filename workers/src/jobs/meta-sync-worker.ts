import { logger } from '../../infra/structured-logger';
import { supabase } from '../../infra/db';
import { MetaAdsConnector } from '../../integrations/connectors/meta-ads';
import { eventIngestService } from '../../services/event-ingest';

/**
 * Meta Sync Worker
 * 
 * Incremental sync for Meta Ads:
 * - Campaigns, AdSets, Ads
 * - Daily insights (last 7 days)
 * - Maps to canonical events
 */

export class MetaSyncWorker {
    private pollInterval: number;

    constructor() {
        this.pollInterval = parseInt(process.env.META_SYNC_INTERVAL_MS || '3600000'); // 1 hour default
    }

    /**
     * Start polling for Meta connections
     */
    public async start(): Promise<void> {
        logger.info('Meta Sync Worker started', { interval_ms: this.pollInterval });

        // Initial sync
        await this.syncAllConnections();

        // Schedule periodic sync
        setInterval(async () => {
            await this.syncAllConnections();
        }, this.pollInterval);
    }

    /**
     * Sync all active Meta connections
     */
    private async syncAllConnections(): Promise<void> {
        try {
            // Fetch active Meta connections
            const { data: connections, error } = await supabase
                .from('source_connections')
                .select('id, org_id, project_id, config_json')
                .eq('type', 'meta_ads')
                .eq('is_active', true);

            if (error || !connections || connections.length === 0) {
                logger.info('No active Meta connections to sync');
                return;
            }

            logger.info('Syncing Meta connections', { count: connections.length });

            for (const connection of connections) {
                await this.syncConnection(connection);
            }
        } catch (error: any) {
            logger.error('Failed to sync Meta connections', { error: error.message });
        }
    }

    /**
     * Sync a single connection
     */
    private async syncConnection(connection: any): Promise<void> {
        const connectionId = connection.id;
        const orgId = connection.org_id;
        const projectId = connection.project_id;

        try {
            // Create sync run
            const { data: syncRun } = await supabase
                .from('sync_runs')
                .insert({
                    connection_id: connectionId,
                    status: 'running',
                    started_at: new Date().toISOString()
                })
                .select('id')
                .single();

            const syncRunId = syncRun?.id;

            // Get access token from secret_refs
            const secretKeyName = `meta_token_${connectionId}`;
            const { data: secretRef } = await supabase
                .from('secret_refs')
                .select('secret_id_ref')
                .eq('key_name', secretKeyName)
                .single();

            if (!secretRef) {
                throw new Error('Access token not found');
            }

            const accessToken = secretRef.secret_id_ref; // In production, decrypt this
            const connector = new MetaAdsConnector(accessToken);

            // Get ad account ID from config
            const adAccountId = connection.config_json?.ad_account_id || 'act_123'; // Should be configured

            // Fetch insights (last 7 days)
            const insights = await connector.getInsights(adAccountId, 'last_7d');

            // Map to canonical events
            const canonicalEvents = MetaAdsConnector.mapInsightsToCanonicalEvents(
                insights,
                orgId,
                projectId,
                connectionId,
                adAccountId
            );

            // Insert events
            const results = await eventIngestService.insertCanonicalEvents(canonicalEvents);

            const successCount = results.filter((r: any) => r.success).length;
            const duplicateCount = results.filter((r: any) => r.duplicate).length;

            // Update sync run
            await supabase
                .from('sync_runs')
                .update({
                    status: 'success',
                    finished_at: new Date().toISOString(),
                    stats_json: {
                        events_processed: canonicalEvents.length,
                        events_inserted: successCount,
                        events_duplicate: duplicateCount
                    }
                })
                .eq('id', syncRunId);

            logger.info('Meta sync completed', {
                connection_id: connectionId,
                events_processed: canonicalEvents.length,
                success: successCount,
                duplicates: duplicateCount
            });

        } catch (error: any) {
            logger.error('Meta sync failed', {
                connection_id: connectionId,
                error: error.message
            });

            // Update sync run as failed
            await supabase
                .from('sync_runs')
                .update({
                    status: 'failed',
                    finished_at: new Date().toISOString(),
                    error_message: error.message
                })
                .eq('connection_id', connectionId)
                .eq('status', 'running');

            // Handle rate limit
            if (error.message === 'RATE_LIMIT_EXCEEDED') {
                logger.warn('Meta rate limit exceeded, will retry next cycle');
            }
        }
    }
}

export const metaSyncWorker = new MetaSyncWorker();
