import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { supabase } from '../../infra/db';
import { logger } from '../../infra/structured-logger';
import { homeActionsService, ActionType } from '../../services/home-actions';

const router = Router();

/**
 * POST /api/home/actions/execute
 * Execute action with RBAC + audit logging
 * Security: SafeDTO + LeakGate + RBAC (Admin/Owner only)
 */
router.post(
    '/api/home/actions/execute',
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { project_id, action_type, payload } = req.body;

            if (!project_id || !action_type) {
                return res.status(400).json({ error: 'project_id and action_type required' });
            }

            // Validate action_type
            const validActions: ActionType[] = [
                'GENERATE_FIX_PACK',
                'VERIFY_TRACKING',
                'TRIGGER_ALIGNMENT_CHECK',
                'RESOLVE_ALERT'
            ];

            if (!validActions.includes(action_type)) {
                return res.status(400).json({ error: 'Invalid action_type' });
            }

            // RBAC: Check user is admin/owner of project
            const { data: membership } = await supabase
                .from('project_members')
                .select('role')
                .eq('project_id', project_id)
                .eq('user_id', userId)
                .single();

            if (!membership || !['admin', 'owner'].includes(membership.role)) {
                return res.status(403).json({ error: 'Admin/Owner role required' });
            }

            // Get org_id for tenant scoping
            const { data: project } = await supabase
                .from('projects')
                .select('org_id')
                .eq('id', project_id)
                .single();

            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            // Execute action
            const result = await homeActionsService.executeAction(
                action_type,
                payload || {},
                project_id,
                project.org_id,
                userId
            );

            // SafeDTO: Whitelist response
            res.json({
                ok: result.ok,
                audit_id: result.audit_id,
                result: {
                    summary: result.result.summary,
                    deep_link: result.result.deep_link
                }
            });
        } catch (error: any) {
            logger.error('Action execution failed', { error: error.message });
            res.status(500).json({ error: error.message || 'Action execution failed' });
        }
    }
);

/**
 * GET /api/home/actions/recent?project_id=...&limit=10
 * Get recent actions (audit logs)
 * Security: SafeDTO + LeakGate + RBAC (Viewer+)
 */
router.get(
    '/api/home/actions/recent',
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const projectId = req.query.project_id as string;
            const limit = parseInt(req.query.limit as string) || 10;

            if (!projectId) {
                return res.status(400).json({ error: 'project_id required' });
            }

            // RBAC: Check user has access to project (viewer+)
            const { data: membership } = await supabase
                .from('project_members')
                .select('role')
                .eq('project_id', projectId)
                .eq('user_id', userId)
                .single();

            if (!membership) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Get recent actions
            const actions = await homeActionsService.getRecentActions(projectId, limit);

            // SafeDTO: Already whitelisted in service
            res.json(actions);
        } catch (error: any) {
            logger.error('Failed to fetch recent actions', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch recent actions' });
        }
    }
);

export default router;
