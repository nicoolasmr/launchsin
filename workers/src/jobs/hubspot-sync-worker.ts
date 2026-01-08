import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';
import { withGlobalLock } from './lock-service';

export class HubSpotSyncWorker {
    private isRunning = false;
    private pollInterval = parseInt(process.env.HUBSPOT_SYNC_INTERVAL_MS || '3600000'); // Default 1 hour
    private internalApiUrl = process.env.INTERNAL_API_URL || 'http://localhost:3001/api';
    private internalApiKey = process.env.INTERNAL_API_KEY || 'dev-internal-key';

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('HubSpot Sync Worker started.');

        while (this.isRunning) {
            try {
                // Global Leader Election logic ensures only one worker schedules checks
                await withGlobalLock('hubspot_sync_leader_global', async () => {
                    await this.processSyncs();
                });
            } catch (error: any) {
                logger.error('HubSpot Worker Loop Error', { error: error.message });
            }
            // Wait for next poll
            await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        }
    }

    async stop() {
        this.isRunning = false;
    }

    private async processSyncs() {
        logger.debug('Checking for HubSpot connections due for sync...');

        // 1. Find Manual Triggers (Pending Sync Runs)
        const { data: pendingRuns } = await supabase
            .from('sync_runs')
            .select('connection_id')
            .eq('status', 'pending');

        const pendingConnectionIds = new Set(pendingRuns?.map(r => r.connection_id) || []);

        // 2. Find Stale Connections (Auto Sync)
        // Logic: active, type=hubspot, (last_sync_at is null OR older than interval)
        const intervalMs = this.pollInterval;
        const threshold = new Date(Date.now() - intervalMs).toISOString();

        const { data: staleConnections } = await supabase
            .from('source_connections')
            .select('id, org_id')
            .eq('is_active', true)
            .eq('type', 'hubspot')
            .or(`last_sync_at.is.null,last_sync_at.lt.${threshold}`);

        // Merge lists (processed candidates)
        const candidates = [
            ...(pendingRuns?.map(r => ({ id: r.connection_id, org_id: 'fetch_needed' })) || []),
            ...(staleConnections || [])
        ];

        // Deduplicate
        const uniqueIds = new Set();
        const finalQueue: { id: string, org_id: string }[] = [];

        // Need to refetch org_id for Pending runs if missing?
        // Note: 'pendingRuns' query above only selected connection_id.
        // We can fetch source_connections for them.

        if (pendingConnectionIds.size > 0) {
            const { data: manualConns } = await supabase
                .from('source_connections')
                .select('id, org_id')
                .in('id', Array.from(pendingConnectionIds));

            manualConns?.forEach(c => {
                if (!uniqueIds.has(c.id)) {
                    uniqueIds.add(c.id);
                    finalQueue.push(c);
                }
            });
        }

        staleConnections?.forEach(c => {
            if (!uniqueIds.has(c.id)) {
                uniqueIds.add(c.id);
                finalQueue.push(c);
            }
        });

        logger.info(`Found ${finalQueue.length} connections to sync.`);

        // 3. Process All
        for (const conn of finalQueue) {
            // Per-Org or Per-Connection Lock handled by Server? 
            // Better to handle serial execution here or let server concurrent?
            // Master Prompt: "Per-org lock: withGlobalLock".
            // So we should lock here before calling server? Or server locks?
            // "Worker behavior ... Locking ... Per-org lock".
            // I'll wrap the call in a lock.

            await withGlobalLock(`hubspot_sync_org_${conn.org_id}`, async () => {
                await this.triggerSync(conn.id, conn.org_id);
            });
        }
    }

    private async triggerSync(connectionId: string, orgId: string) {
        try {
            const url = `${this.internalApiUrl}/internal/integration/sync`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Key': this.internalApiKey
                },
                body: JSON.stringify({ connectionId, orgId })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API ${response.status}: ${text}`);
            }

            logger.info('Sync Triggered Success', { connectionId });

            // If it was a pending run, update it?
            // Server endpoint handles result update on Connection.
            // SyncRuns table cleanup/update logic is pending.
            // Ideally server endpoint does it.
            // For now, MVP assumes connection state is source of truth.

        } catch (error: any) {
            logger.error('Sync Trigger Failed', { connectionId, error: error.message });
        }
    }
}

export const hubspotSyncWorker = new HubSpotSyncWorker();
