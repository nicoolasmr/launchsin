import { AuditSyncJob } from './jobs/audit-sync';
import { dlqWorker } from './jobs/dlq-worker';

import { logger } from './infra/structured-logger';

/**
 * LaunchSin Worker Entry Point
 */

async function bootstrap() {
    logger.info('Starting LaunchSin Workers...');

    // Register Jobs (BullMQ workers)
    const jobs = [
        new AuditSyncJob()
    ];

    // Start all workers
    for (const job of jobs) {
        await job.startWorker();
    }

    // Start Polling Workers (Standalone loops) based on MODE
    const mode = process.env.WORKER_MODE || 'all';

    if (mode === 'all' || mode === 'dlq') {
        await dlqWorker.start();
    }



    if (mode === 'all' || mode === 'hubspot') {
        const { hubspotSyncWorker } = await import('./jobs/hubspot-sync-worker.js');
        await hubspotSyncWorker.start();
    }

    if (mode === 'all' || mode === 'alignment') {
        // Use V2 Worker
        const { alignmentWorkerV2 } = await import('./jobs/alignment-worker-v2.js');
        await alignmentWorkerV2.start();
    }

    logger.info(`Workers active. Mode: ${mode}`);
}

bootstrap().catch(err => {
    logger.error('Worker bootstrap failed', { error: err.message, stack: err.stack });
    process.exit(1);
});
