import { Job } from 'bullmq';
import { BaseJob } from '../shared/base-job';
import { logger } from '../infra/structured-logger';

interface AuditSyncData {
    action: string;
    userId: string;
    orgId: string;
    entityType: string;
    entityId: string;
    metadata?: any;
}

export class AuditSyncJob extends BaseJob<AuditSyncData> {
    readonly queueName = 'audit-sync';

    async handle(job: Job<AuditSyncData>) {
        const { action, userId, entityType, entityId } = job.data;

        // MOCK: In production, this would perform heavy persistence or external integrations
        logger.info('Syncing audit log entry', { action, userId, entityType, entityId });

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}
