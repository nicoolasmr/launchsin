
import { alignmentWorkerV2 } from '../src/jobs/alignment-worker-v2';
import Redis from 'ioredis';

// Mock Redis
jest.mock('ioredis');
const mockRedis = Redis as unknown as jest.Mock;

describe('Alignment Worker V2 - Locking', () => {
    let worker: any;
    let redisClient: any;

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup mock redis instance
        redisClient = {
            set: jest.fn()
        };
        mockRedis.mockImplementation(() => redisClient);

        // Re-import or use the one imported. Note: Singleton might be initialized already.
        // We access private method acquireLock via casting or exposure?
        // JS/TS allows access with cast.
        worker = alignmentWorkerV2;
        (worker as any).redis = redisClient; // Manually inject if needed or rely on mock implementation at module level
    });

    it('should acquire leader lock successfully', async () => {
        redisClient.set.mockResolvedValue('OK');
        const result = await (worker as any).acquireLock('leader', 15);
        expect(result).toBe(true);
        expect(redisClient.set).toHaveBeenCalledWith('leader', 'locked', 'EX', 15, 'NX');
    });

    it('should fail to acquire lock if held', async () => {
        redisClient.set.mockResolvedValue(null);
        const result = await (worker as any).acquireLock('leader', 15);
        expect(result).toBe(false);
    });
});
