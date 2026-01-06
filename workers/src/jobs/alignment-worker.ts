import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';
import { withGlobalLock } from './lock-service';

/**
 * Alignment Worker
 * 
 * Periodically checks if projects are due for alignment analysis.
 * Triggers batch analysis via Server Internal API.
 */
export class AlignmentWorker {
    private isRunning = false;
    private pollInterval = parseInt(process.env.ALIGNMENT_POLL_INTERVAL_MS || '3600000'); // Default 1 hour
    private internalApiUrl = process.env.INTERNAL_API_URL || 'http://localhost:3000/api';
    private internalApiKey = process.env.INTERNAL_API_KEY || 'dev-internal-key';

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('Alignment Worker started polling.');

        while (this.isRunning) {
            try {
                // Use lock to ensure only one worker instance processes scheduling
                await withGlobalLock('alignment_scheduler_global', async () => {
                    await this.scheduleRuns();
                });
            } catch (error: any) {
                logger.error('Alignment Worker loop error', { error: error.message });
            }
            await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        }
    }

    async stop() {
        this.isRunning = false;
    }

    private async scheduleRuns() {
        logger.debug('Checking for due alignment runs...');

        // 1. Fetch Enabled Settings
        const { data: settingsList, error } = await supabase
            .from('alignment_settings')
            .select('project_id, org_id, cadence, enabled')
            .eq('enabled', true);

        if (error || !settingsList) {
            logger.error('Failed to fetch alignment settings', { error: error?.message });
            return;
        }

        for (const settings of settingsList) {
            await this.checkAndTrigger(settings);
        }
    }

    private async checkAndTrigger(settings: any) {
        // 2. Check Last Run
        const { data: lastRun } = await supabase
            .from('alignment_runs')
            .select('created_at')
            .eq('project_id', settings.project_id)
            .eq('mode', 'scheduled')
            .eq('status', 'success')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const now = new Date();
        let shouldRun = false;

        if (!lastRun) {
            // Never ran? Run now.
            shouldRun = true;
        } else {
            const lastRunDate = new Date(lastRun.created_at);
            const hoursSince = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60);

            if (settings.cadence === 'daily' && hoursSince >= 24) shouldRun = true;
            if (settings.cadence === 'weekly' && hoursSince >= 24 * 7) shouldRun = true;
        }

        if (shouldRun) {
            logger.info('Triggering alignment check for project', { projectId: settings.project_id });
            await this.triggerBatchApi(settings.project_id, settings.org_id);
        }
    }

    private async triggerBatchApi(projectId: string, orgId: string) {
        try {
            const url = `${this.internalApiUrl}/internal/alignment/project/${projectId}/batch-run`;

            // Note: In Node 18, fetch is global. If older node, need node-fetch.
            // Assuming Node 18+ as per package.json engines.
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Key': this.internalApiKey
                },
                body: JSON.stringify({ orgId })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API returned ${response.status}: ${text}`);
            }

            logger.info('Successfully triggered alignment batch', { projectId });
        } catch (error: any) {
            logger.error('Failed to call Internal Alignment API', {
                projectId,
                error: error.message,
                url: this.internalApiUrl
            });
        }
    }
}

export const alignmentWorker = new AlignmentWorker();
