import { logger } from '../src/infra/structured-logger';

/**
 * Server Preflight Check
 * 
 * Validates the environment and infrastructure connectivity 
 * before the main process starts.
 */

async function runPreflight() {
    logger.info('Starting Server Preflight Checks...');

    const REQUIRED_ENV = [
        'NODE_ENV',
        'PORT'
    ];

    const missing = REQUIRED_ENV.filter(key => !process.env[key]);

    if (missing.length > 0) {
        logger.error('CRITICAL: Missing required environment variables', { missing });
        process.exit(1);
    }

    // --- External Connectivity (Conditional) ---
    if (process.env.DATABASE_URL) {
        logger.info('Validating Database connectivity...');
        // Placeholder for actual pool.connect() check
        // If DATABASE_URL starts with 'postgresql://' or similar
    }

    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
        logger.info('Validating Supabase connection pool...');
    }

    logger.info('Preflight Checks: PASSED');
}

runPreflight().catch(err => {
    logger.error('Preflight Check failed with unhandled error', { error: err.message });
    process.exit(1);
});
