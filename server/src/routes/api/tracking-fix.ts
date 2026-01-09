import { Router } from 'express';
import { trackingFixService } from '../../services/tracking-fix-service';
import { validateProjectAccess } from '../../middleware/rbac';
import { supabase } from '../../infra/db';
import { logger } from '../../infra/structured-logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * POST /api/projects/:id/integrations/alignment/fixpack
 * Generate fix pack for missing tracking
 */
router.post(
    '/api/projects/:id/integrations/alignment/fixpack',
    validateProjectAccess,
    async (req, res) => {
        try {
            const { id: projectId } = req.params;
            const { page_url, snapshot_id, context } = req.body;

            if (!page_url) {
                return res.status(400).json({ error: 'page_url is required' });
            }

            // Get latest snapshot or use provided one
            let snapshot;
            if (snapshot_id) {
                const { data } = await supabase
                    .from('page_snapshots')
                    .select('*')
                    .eq('id', snapshot_id)
                    .single();
                snapshot = data;
            } else {
                const { data } = await supabase
                    .from('page_snapshots')
                    .select('*')
                    .eq('project_id', projectId)
                    .eq('url', page_url)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                snapshot = data;
            }

            if (!snapshot) {
                return res.status(404).json({ error: 'No snapshot found for this page' });
            }

            // Detect tracking from snapshot
            const pageText = snapshot.content_text?.toLowerCase() || '';
            const pageMeta = JSON.stringify(snapshot.meta).toLowerCase();

            const detected = {
                meta_pixel: pageText.includes('fbq(') || pageText.includes('facebook pixel') || pageMeta.includes('facebook'),
                gtm: pageText.includes('gtm.js') || pageText.includes('googletagmanager'),
                ga4: pageText.includes('gtag') || pageText.includes('google-analytics'),
                utm_params: page_url.includes('utm_')
            };

            // Get platform hints from context or project settings
            const platformHints = context?.platformHints || {};

            // Build fix pack
            const fixPackData = trackingFixService.buildFixPack(
                detected,
                page_url,
                projectId,
                platformHints
            );

            // Save to database
            const { data: savedPack, error } = await supabase
                .from('tracking_fix_packs')
                .insert({
                    id: uuidv4(),
                    org_id: (req as any).org_id,
                    project_id: projectId,
                    page_url,
                    detected,
                    fixes: fixPackData.fixes,
                    created_by: (req as any).user?.id
                })
                .select()
                .single();

            if (error) throw error;

            logger.info('Fix pack generated', {
                project_id: projectId,
                page_url,
                fix_pack_id: savedPack.id,
                fixes_count: fixPackData.fixes.length
            });

            res.json(savedPack);
        } catch (error: any) {
            logger.error('Fix pack generation failed', { error: error.message });
            res.status(500).json({ error: 'Failed to generate fix pack' });
        }
    }
);

/**
 * GET /api/projects/:id/integrations/alignment/fixpacks
 * List fix packs for project
 */
router.get(
    '/api/projects/:id/integrations/alignment/fixpacks',
    validateProjectAccess,
    async (req, res) => {
        try {
            const { id: projectId } = req.params;
            const { page_url } = req.query;

            let query = supabase
                .from('tracking_fix_packs')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false });

            if (page_url) {
                query = query.eq('page_url', page_url);
            }

            const { data, error } = await query.limit(50);

            if (error) throw error;

            res.json(data || []);
        } catch (error: any) {
            logger.error('Fix packs fetch failed', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch fix packs' });
        }
    }
);

/**
 * POST /api/projects/:id/integrations/alignment/verify-tracking
 * Trigger tracking verification job
 */
router.post(
    '/api/projects/:id/integrations/alignment/verify-tracking',
    validateProjectAccess,
    async (req, res) => {
        try {
            const { id: projectId } = req.params;
            const { page_url } = req.body;

            if (!page_url) {
                return res.status(400).json({ error: 'page_url is required' });
            }

            // Create a tracking verification job
            const { data: job, error } = await supabase
                .from('alignment_jobs')
                .insert({
                    org_id: (req as any).org_id,
                    project_id: projectId,
                    job_type: 'TRACKING_VERIFY',
                    status: 'pending',
                    landing_url: page_url,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;

            logger.info('Tracking verification job created', {
                project_id: projectId,
                page_url,
                job_id: job.id
            });

            res.json({
                job_id: job.id,
                status: 'pending',
                message: 'Tracking verification started. Check back in 30-60 seconds.'
            });
        } catch (error: any) {
            logger.error('Tracking verification failed', { error: error.message });
            res.status(500).json({ error: 'Failed to start tracking verification' });
        }
    }
);

export default router;
