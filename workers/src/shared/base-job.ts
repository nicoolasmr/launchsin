import { Job, Worker, WorkerOptions } from 'bullmq';
import { redisConnection } from '../infra/redis';
import { logger } from '../infra/structured-logger';

export abstract class BaseJob<T = any> {
    abstract readonly queueName: string;

    async startWorker() {
        const workerOptions: WorkerOptions = {
            connection: redisConnection as any,
            concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
        };

        const worker = new Worker(this.queueName, async (job: Job<T>) => {
            const startTime = Date.now();
            logger.info(`Starting job ${job.id}`, { queue: this.queueName, jobId: job.id });

            try {
                await this.handle(job);
                const duration = Date.now() - startTime;
                logger.info(`Completed job ${job.id}`, { queue: this.queueName, jobId: job.id, duration });
            } catch (error: any) {
                logger.error(`Failed job ${job.id}`, {
                    queue: this.queueName,
                    jobId: job.id,
                    error: error.message,
                    stack: error.stack
                });
                throw error; // Rethrow to trigger BullMQ retry logic
            }
        }, workerOptions);

        worker.on('failed', (job, err) => {
            logger.error(`Worker error on queue ${this.queueName}`, { jobId: job?.id, error: err.message });
        });

        logger.info(`Worker started for queue: ${this.queueName}`);
        return worker;
    }

    abstract handle(job: Job<T>): Promise<void>;
}
