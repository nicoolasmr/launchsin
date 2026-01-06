import { createClient } from '@supabase/supabase-js';
import { logger } from './structured-logger';

/**
 * Supabase Server-Side Client
 * Uses SERVICE_ROLE_KEY to bypass RLS when performing administrative tasks
 * or when the application logic handles scoping (RBAC).
 */

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    logger.warn('Supabase credentials missing. Database connectivity will fail.');
}

export const supabase = createClient(
    supabaseUrl || '',
    supabaseServiceKey || '',
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

logger.info('Supabase Client Initialized', { url: supabaseUrl });
