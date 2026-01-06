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

    // Start Polling Workers (Standalone loops)
    await dlqWorker.start();

    logger.info('All workers and polling loops active.');
}

bootstrap().catch(err => {
    logger.error('Worker bootstrap failed', { error: err.message, stack: err.stack });
    process.exit(1);
});
