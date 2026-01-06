import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';
import { withGlobalLock } from './lock-service';

/**
 * DLQ Worker
 * Reliability logic for re-processing failed integration events.
 */
export class DlqWorker {
    private isRunning = false;
    private pollInterval = parseInt(process.env.DLQ_POLL_INTERVAL_MS || '60000'); // Default 1 min
    private batchSize = parseInt(process.env.DLQ_BATCH_SIZE || '50');

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('DLQ Worker started polling.');

        while (this.isRunning) {
            try {
                await withGlobalLock('dlq_global', async () => {
                    await this.processBatch();
                });
            } catch (error: any) {
                logger.error('DLQ Worker loop error', { error: error.message });
            }
            await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        }
    }

    async stop() {
        this.isRunning = false;
    }

    private async processBatch() {
        logger.debug('DLQ Worker: Checking for pending events...');

        // 1. Fetch events ready for retry
        const { data: events, error } = await supabase
            .from('dlq_events')
            .select('*')
            .eq('status', 'pending')
            .lte('next_retry_at', new Date().toISOString())
            .limit(this.batchSize);

        if (error) {
            logger.error('Failed to fetch DLQ events', { error: error.message });
            return;
        }

        if (!events || events.length === 0) return;

        logger.info(`Processing ${events.length} DLQ events...`);

        // 2. Process in batch
        for (const event of events) {
            await this.processEvent(event);
        }
    }

    private async processEvent(event: any) {
        const correlationId = event.id;
        logger.info('Processing DLQ event', { correlationId, attempt: event.attempt_count + 1 });

        try {
            // SIMULATION: Placeholder for actual connector re-execution
            // In Sprint 1.1, we just simulate success if payload is "valid"
            const data = event.payload;
            const isValid = data && typeof data === 'object'; // Dummy check

            if (isValid) {
                await this.markResolved(event);
            } else {
                throw new Error('Invalid payload detected during simulation');
            }
        } catch (error: any) {
            await this.handleFailure(event, error);
        }
    }

    private async markResolved(event: any) {
        const { error } = await supabase
            .from('dlq_events')
            .update({
                status: 'resolved',
                resolved_reason: 'auto',
                attempt_count: event.attempt_count + 1,
                updated_at: new Date().toISOString()
            })
            .eq('id', event.id);

        if (error) logger.error('Failed to resolve DLQ event', { id: event.id, error: error.message });
        else logger.info('DLQ event resolved successfully', { id: event.id });
    }

    private async handleFailure(event: any, error: any) {
        const nextAttempt = event.attempt_count + 1;
        const maxAttempts = 5; // Configurable
        const deadAfter = new Date(event.dead_after);
        const now = new Date();

        const shouldDie = nextAttempt >= maxAttempts || now > deadAfter;
        const status = shouldDie ? 'dead' : 'pending';

        // Exponential backoff: 2^attempt * 5 minutes + jitter
        const backoffMinutes = Math.pow(2, nextAttempt) * 5;
        const jitter = Math.floor(Math.random() * 60); // 0-60 seconds jitter
        const nextRetryAt = new Date(now.getTime() + (backoffMinutes * 60000) + (jitter * 1000));

        logger.warn('DLQ event processing failed', {
            id: event.id,
            status,
            nextAttempt,
            error: error.message
        });

        await supabase
            .from('dlq_events')
            .update({
                status,
                attempt_count: nextAttempt,
                last_error_message: error.message.substring(0, 500),
                next_retry_at: nextRetryAt.toISOString(),
                resolved_reason: shouldDie ? 'auto' : null,
                updated_at: now.toISOString()
            })
            .eq('id', event.id);
    }
}

export const dlqWorker = new DlqWorker();
