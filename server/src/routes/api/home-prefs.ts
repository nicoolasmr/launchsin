import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { supabase } from '../../infra/db';
import { logger } from '../../infra/structured-logger';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Zod schema for preferences validation
const PrefsSchema = z.object({
    widget_visibility: z.object({
        kpi: z.boolean().optional(),
        decisions: z.boolean().optional(),
        alignment: z.boolean().optional(),
        crm: z.boolean().optional(),
        ops: z.boolean().optional(),
        recent_actions: z.boolean().optional()
    }).optional(),
    widget_order: z.array(z.string()).max(10).optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
    default_project_id: z.string().uuid().nullable().optional()
});

const PutPrefsBodySchema = z.object({
    prefs: PrefsSchema
});

// Default preferences
const DEFAULT_PREFS = {
    widget_visibility: {
        kpi: true,
        decisions: true,
        alignment: true,
        crm: true,
        ops: true,
        recent_actions: true
    },
    widget_order: ['kpi', 'decisions', 'alignment', 'crm', 'ops', 'recent_actions'],
    density: 'comfortable' as const,
    default_project_id: null
};

/**
 * GET /api/home/prefs
 * Get user's home preferences
 * Security: SafeDTO + LeakGate + Self-only RLS
 */
router.get(
    '/api/home/prefs',
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Get user's org_id
            const { data: membership } = await supabase
                .from('org_members')
                .select('org_id')
                .eq('user_id', userId)
                .single();

            if (!membership) {
                // Return defaults if no org membership
                return res.json({
                    prefs: DEFAULT_PREFS,
                    updated_at: null
                });
            }

            const orgId = membership.org_id;

            // Get user preferences (RLS enforces self-only)
            const { data: userPrefs, error } = await supabase
                .from('user_home_prefs')
                .select('prefs_json, updated_at')
                .eq('org_id', orgId)
                .eq('user_id', userId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = not found
                logger.error('Failed to fetch user prefs', { error: error.message });
                throw error;
            }

            // Return defaults if no preferences exist
            if (!userPrefs) {
                return res.json({
                    prefs: DEFAULT_PREFS,
                    updated_at: null
                });
            }

            // SafeDTO: Whitelist response
            res.json({
                prefs: userPrefs.prefs_json,
                updated_at: userPrefs.updated_at
            });
        } catch (error: any) {
            logger.error('Get home prefs failed', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch preferences' });
        }
    }
);

/**
 * PUT /api/home/prefs
 * Update user's home preferences (upsert)
 * Security: SafeDTO + LeakGate + Self-only RLS + Zod validation + Audit
 */
router.put(
    '/api/home/prefs',
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Validate request body
            const validation = PutPrefsBodySchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: 'Invalid preferences',
                    details: validation.error.errors
                });
            }

            const { prefs } = validation.data;

            // Get user's org_id
            const { data: membership } = await supabase
                .from('org_members')
                .select('org_id')
                .eq('user_id', userId)
                .single();

            if (!membership) {
                return res.status(403).json({ error: 'No org membership found' });
            }

            const orgId = membership.org_id;

            // Get current prefs to merge
            const { data: currentPrefs } = await supabase
                .from('user_home_prefs')
                .select('prefs_json')
                .eq('org_id', orgId)
                .eq('user_id', userId)
                .single();

            // Merge with existing prefs (or defaults)
            const mergedPrefs = {
                ...(currentPrefs?.prefs_json || DEFAULT_PREFS),
                ...prefs
            };

            // Upsert preferences (RLS enforces self-only)
            const { data: updatedPrefs, error } = await supabase
                .from('user_home_prefs')
                .upsert({
                    org_id: orgId,
                    user_id: userId,
                    prefs_json: mergedPrefs,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'org_id,user_id'
                })
                .select('updated_at')
                .single();

            if (error) {
                logger.error('Failed to update user prefs', { error: error.message });
                throw error;
            }

            // Write audit log
            await supabase
                .from('audit_logs')
                .insert({
                    id: uuidv4(),
                    org_id: orgId,
                    project_id: null,
                    actor_user_id: userId,
                    action_type: 'HOME_PREFS_UPDATE',
                    entity_type: 'user_home_prefs',
                    entity_id: userId,
                    metadata_json: {
                        // Redacted: only store that prefs were updated, not the values
                        updated_fields: Object.keys(prefs)
                    },
                    created_at: new Date().toISOString()
                });

            logger.info('User prefs updated', {
                user_id: userId,
                org_id: orgId
            });

            // SafeDTO: Whitelist response
            res.json({
                ok: true,
                updated_at: updatedPrefs.updated_at
            });
        } catch (error: any) {
            logger.error('Update home prefs failed', { error: error.message });
            res.status(500).json({ error: 'Failed to update preferences' });
        }
    }
);

export default router;
