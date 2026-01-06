import Redis from 'ioredis';
import { logger } from './structured-logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required for BullMQ
    retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
    },
});

redisConnection.on('connect', () => logger.info('Redis connected successfully'));
redisConnection.on('error', (err) => logger.error('Redis connection error', { error: err.message }));
