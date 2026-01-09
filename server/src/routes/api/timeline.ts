import { Router } from 'express';
import { timelineService } from '../../services/timeline-service';
import { validateProjectAccess } from '../../middleware/rbac';
import { logger } from '../../infra/structured-logger';

const router = Router();

/**
 * GET /api/projects/:id/integrations/alignment/timeline
 * Get change timeline for landing pages
 */
router.get(
    '/api/projects/:id/integrations/alignment/timeline',
    validateProjectAccess,
    async (req, res) => {
        try {
            const { id: projectId } = req.params;
            const { page_url } = req.query;

            const timeline = await timelineService.getTimeline(
                projectId,
                page_url as string
            );

            res.json(timeline);
        } catch (error: any) {
            logger.error('Timeline fetch failed', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch timeline' });
        }
    }
);

export default router;
