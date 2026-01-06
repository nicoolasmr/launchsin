import { pgPool } from '../infra/db-pg';
import { logger } from '../infra/structured-logger';

/**
 * Single-Flight Lock Service using PostgreSQL Advisory Locks.
 * Ensures that only one worker instance processes a specific global key.
 */
export async function withGlobalLock<T>(
    lockKey: string,
    operation: () => Promise<T>
): Promise<T | null> {
    const client = await pgPool.connect();

    try {
        // We use pg_try_advisory_lock which returns immediately (true if lock acquired, false otherwise)
        // hashtext converts the string key to a bigint for the lock
        const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) as locked', [lockKey]);
        const isLocked = rows[0]?.locked;

        if (!isLocked) {
            logger.debug(`Lock already held for key: ${lockKey}. Skipping execution.`);
            return null;
        }

        logger.info(`Lock acquired for key: ${lockKey}. Executing operation...`);

        const result = await operation();

        return result;
    } catch (error: any) {
        logger.error('Error during locked operation', { error: error.message, lockKey });
        throw error;
    } finally {
        // Releasing the lock requires calling pg_advisory_unlock OR ending the session.
        // Advisory locks acquired via pg_try_advisory_lock are session-level by default.
        // Releasing back to the pool DOES NOT end the session if the pool reuses it.
        // So we explicitly unlock to be sure.
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
        client.release();
    }
}
