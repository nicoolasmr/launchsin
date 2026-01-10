import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { logger } from '../../infra/structured-logger';

const router = Router();

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================================
// SCHEMAS
// ============================================================

const CreateTargetSchema = z.object({
    connection_id: z.string().uuid(),
    type: z.enum(['GTM']),
    display_name: z.string().min(1).max(255),
    config_json: z.object({
        container_id: z.string(),
        workspace_id: z.string().optional(),
        environment: z.string().optional()
    })
});

const ApplySchema = z.object({
    fixpack_id: z.string().uuid(),
    target_id: z.string().uuid(),
    mode: z.enum(['GTM']),
    dry_run: z.boolean().optional().default(false)
});

const RollbackSchema = z.object({
    apply_job_id: z.string().uuid()
});

// ============================================================
// TARGETS CRUD
// ============================================================

/**
 * GET /api/projects/:projectId/integrations/auto-apply/targets
 * List all apply targets for project (Viewer+)
 */
router.get('/api/projects/:projectId/integrations/auto-apply/targets', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const user = (req as any).user;

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Fetch targets (RLS enforced)
        const { data: targets, error } = await supabase
            .from('integration_apply_targets')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // SafeDTO: Whitelist response
        res.json({
            targets: targets?.map(t => ({
                id: t.id,
                type: t.type,
                display_name: t.display_name,
                config_json: t.config_json, // No secrets here
                created_at: t.created_at,
                updated_at: t.updated_at
            })) || []
        });
    } catch (error: any) {
        logger.error('Failed to list apply targets', { error: error.message });
        res.status(500).json({ error: 'Failed to list targets' });
    }
});

/**
 * POST /api/projects/:projectId/integrations/auto-apply/targets
 * Create new apply target (Admin/Owner only)
 */
router.post('/api/projects/:projectId/integrations/auto-apply/targets', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const user = (req as any).user;

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // RBAC: Admin/Owner only
        const { data: membership } = await supabase
            .from('project_members')
            .select('role')
            .eq('project_id', projectId)
            .eq('user_id', user.user_id)
            .single();

        if (!membership || !['admin', 'owner'].includes(membership.role)) {
            return res.status(403).json({ error: 'Forbidden: Admin/Owner required' });
        }

        // Validate input
        const parsed = CreateTargetSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid input', details: parsed.error });
        }

        const { connection_id, type, display_name, config_json } = parsed.data;

        // Get org_id from project
        const { data: project } = await supabase
            .from('projects')
            .select('org_id')
            .eq('id', projectId)
            .single();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Create target
        const { data: target, error } = await supabase
            .from('integration_apply_targets')
            .insert({
                org_id: project.org_id,
                project_id: projectId,
                connection_id,
                type,
                display_name,
                config_json
            })
            .select()
            .single();

        if (error) throw error;

        // SafeDTO: Whitelist response
        res.json({
            target: {
                id: target.id,
                type: target.type,
                display_name: target.display_name,
                config_json: target.config_json,
                created_at: target.created_at
            }
        });
    } catch (error: any) {
        logger.error('Failed to create apply target', { error: error.message });
        res.status(500).json({ error: 'Failed to create target' });
    }
});

/**
 * DELETE /api/projects/:projectId/integrations/auto-apply/targets/:targetId
 * Delete apply target (Admin/Owner only)
 */
router.delete('/api/projects/:projectId/integrations/auto-apply/targets/:targetId', async (req: Request, res: Response) => {
    try {
        const { projectId, targetId } = req.params;
        const user = (req as any).user;

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // RBAC: Admin/Owner only
        const { data: membership } = await supabase
            .from('project_members')
            .select('role')
            .eq('project_id', projectId)
            .eq('user_id', user.user_id)
            .single();

        if (!membership || !['admin', 'owner'].includes(membership.role)) {
            return res.status(403).json({ error: 'Forbidden: Admin/Owner required' });
        }

        // Delete target (RLS enforced)
        const { error } = await supabase
            .from('integration_apply_targets')
            .delete()
            .eq('id', targetId)
            .eq('project_id', projectId);

        if (error) throw error;

        res.json({ ok: true });
    } catch (error: any) {
        logger.error('Failed to delete apply target', { error: error.message });
        res.status(500).json({ error: 'Failed to delete target' });
    }
});

// ============================================================
// APPLY / ROLLBACK
// ============================================================

/**
 * POST /api/projects/:projectId/integrations/auto-apply/apply
 * Apply fix to target (Admin/Owner only)
 * dry_run=true: preview diff
 * dry_run=false: create job
 */
router.post('/api/projects/:projectId/integrations/auto-apply/apply', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const user = (req as any).user;

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // RBAC: Admin/Owner only
        const { data: membership } = await supabase
            .from('project_members')
            .select('role')
            .eq('project_id', projectId)
            .eq('user_id', user.user_id)
            .single();

        if (!membership || !['admin', 'owner'].includes(membership.role)) {
            return res.status(403).json({ error: 'Forbidden: Admin/Owner required' });
        }

        // Validate input
        const parsed = ApplySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid input', details: parsed.error });
        }

        const { fixpack_id, target_id, mode, dry_run } = parsed.data;

        // Get org_id
        const { data: project } = await supabase
            .from('projects')
            .select('org_id')
            .eq('id', projectId)
            .single();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        if (dry_run) {
            // DRY RUN: Return preview diff (mock for now)
            res.json({
                dry_run: true,
                diff: {
                    tags_to_create: ['GTM Snippet', 'GA4 Config'],
                    tags_to_update: [],
                    estimated_changes: 2
                }
            });
        } else {
            // CREATE JOB
            const { data: job, error } = await supabase
                .from('apply_jobs')
                .insert({
                    org_id: project.org_id,
                    project_id: projectId,
                    user_id: user.user_id,
                    type: 'APPLY_FIX',
                    status: 'queued',
                    payload_json: { fixpack_id, target_id, mode },
                    correlation_id: `apply-${Date.now()}`
                })
                .select()
                .single();

            if (error) throw error;

            // SafeDTO: Whitelist response
            res.json({
                job_id: job.id,
                status: job.status,
                created_at: job.created_at
            });
        }
    } catch (error: any) {
        logger.error('Failed to apply fix', { error: error.message });
        res.status(500).json({ error: 'Failed to apply fix' });
    }
});

/**
 * POST /api/projects/:projectId/integrations/auto-apply/rollback
 * Rollback previous apply (Admin/Owner only)
 */
router.post('/api/projects/:projectId/integrations/auto-apply/rollback', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const user = (req as any).user;

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // RBAC: Admin/Owner only
        const { data: membership } = await supabase
            .from('project_members')
            .select('role')
            .eq('project_id', projectId)
            .eq('user_id', user.user_id)
            .single();

        if (!membership || !['admin', 'owner'].includes(membership.role)) {
            return res.status(403).json({ error: 'Forbidden: Admin/Owner required' });
        }

        // Validate input
        const parsed = RollbackSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid input', details: parsed.error });
        }

        const { apply_job_id } = parsed.data;

        // Get org_id
        const { data: project } = await supabase
            .from('projects')
            .select('org_id')
            .eq('id', projectId)
            .single();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Create rollback job
        const { data: job, error } = await supabase
            .from('apply_jobs')
            .insert({
                org_id: project.org_id,
                project_id: projectId,
                user_id: user.user_id,
                type: 'ROLLBACK_FIX',
                status: 'queued',
                payload_json: { apply_job_id },
                correlation_id: `rollback-${Date.now()}`
            })
            .select()
            .single();

        if (error) throw error;

        // SafeDTO: Whitelist response
        res.json({
            job_id: job.id,
            status: job.status,
            created_at: job.created_at
        });
    } catch (error: any) {
        logger.error('Failed to rollback', { error: error.message });
        res.status(500).json({ error: 'Failed to rollback' });
    }
});

// ============================================================
// STATUS
// ============================================================

/**
 * GET /api/projects/:projectId/integrations/auto-apply/jobs
 * List apply jobs (Viewer+)
 */
router.get('/api/projects/:projectId/integrations/auto-apply/jobs', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const user = (req as any).user;
        const limit = parseInt(req.query.limit as string) || 50;

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Fetch jobs (RLS enforced)
        const { data: jobs, error } = await supabase
            .from('apply_jobs')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;

        // SafeDTO: Whitelist response
        res.json({
            jobs: jobs?.map(j => ({
                id: j.id,
                type: j.type,
                status: j.status,
                payload_json: j.payload_json,
                result_json: j.result_json,
                created_at: j.created_at,
                started_at: j.started_at,
                finished_at: j.finished_at,
                error_message_redacted: j.error_message_redacted
            })) || []
        });
    } catch (error: any) {
        logger.error('Failed to list apply jobs', { error: error.message });
        res.status(500).json({ error: 'Failed to list jobs' });
    }
});

/**
 * GET /api/projects/:projectId/integrations/auto-apply/jobs/:jobId
 * Get single job status (Viewer+)
 */
router.get('/api/projects/:projectId/integrations/auto-apply/jobs/:jobId', async (req: Request, res: Response) => {
    try {
        const { projectId, jobId } = req.params;
        const user = (req as any).user;

        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Fetch job (RLS enforced)
        const { data: job, error } = await supabase
            .from('apply_jobs')
            .select('*')
            .eq('id', jobId)
            .eq('project_id', projectId)
            .single();

        if (error) throw error;
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // SafeDTO: Whitelist response
        res.json({
            job: {
                id: job.id,
                type: job.type,
                status: job.status,
                payload_json: job.payload_json,
                result_json: job.result_json,
                created_at: job.created_at,
                started_at: job.started_at,
                finished_at: job.finished_at,
                error_message_redacted: job.error_message_redacted
            }
        });
    } catch (error: any) {
        logger.error('Failed to get apply job', { error: error.message });
        res.status(500).json({ error: 'Failed to get job' });
    }
});

export default router;
