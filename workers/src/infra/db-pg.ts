import { Pool, Client } from 'pg';
import { logger } from './structured-logger';

/**
 * Direct PostgreSQL Pool (node-pg)
 * Required for session-level advisory locks which are not supported by
 * Supabase HTTP clients or transient serverless pools.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    logger.warn('DATABASE_URL missing. PostgreSQL direct connectivity will fail.');
}

export const pgPool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pgPool.on('error', (err) => {
    logger.error('Unexpected error on idle client', { error: err.message });
});

/**
 * Gets a dedicated client from the pool.
 * Caller MUST call client.release() when done.
 */
export async function getDirectClient(): Promise<Client> {
    const client = await pgPool.connect();
    return client as unknown as Client; // node-pg PoolClient is a subtype of Client
}

logger.info('PostgreSQL Direct Client Pool Initialized');
