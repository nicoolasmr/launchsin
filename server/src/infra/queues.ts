import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { logger } from './structured-logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
});

// Singleton Queue instances
const queues: Record<string, Queue> = {};

export function getQueue(name: string): Queue {
    if (!queues[name]) {
        queues[name] = new Queue(name, { connection: redisConnection as any });
        logger.info(`Initialized job producer for queue: ${name}`);
    }
    return queues[name];
}

export async function addJob<T>(queueName: string, data: T, options = {}) {
    try {
        const queue = getQueue(queueName);
        const job = await queue.add(`${queueName}-job`, data, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            ...options
        });
        return job;
    } catch (error: any) {
        logger.error('Failed to add job to queue', { queueName, error: error.message });
        throw error;
    }
}
