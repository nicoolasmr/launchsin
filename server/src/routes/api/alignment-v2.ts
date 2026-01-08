
import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { leakGate } from '../../middleware/leak-gate';
import { requireOrgRole } from '../../middleware/rbac';
import { alignmentServiceV2 } from '../../services/alignment-service-v2';
import { logger } from '../../infra/structured-logger';

export const alignmentV2Router = Router({ mergeParams: true });

alignmentV2Router.use(leakGate);

/**
 * POST /check
 * Trigger manual alignment check (ADMIN/OWNER)
 */
alignmentV2Router.post('/check', requireOrgRole('admin'), async (req, res) => {
    try {
        const { projectId } = req.params as any;
        const { connectionId, ad_id, landing_url } = req.body;
        const orgId = req.headers['x-org-id'] as string; // Or derive from project
        const userId = (req as any).user?.id; // Assuming auth middleware populates user

        if (!orgId) return res.status(400).json({ error: 'x-org-id header required' });

        const jobId = await alignmentServiceV2.enqueueCheck({
            project_id: projectId,
            org_id: orgId,
            connectionId,
            ad_id,
            landing_url,
            user_id: userId
        });

        res.status(202).json({ job_id: jobId, status: 'queued' });
    } catch (error: any) {
        logger.error('Alignment Check Trigger Failed', { error: error.message });
        res.status(500).json({ error: 'Failed to trigger check' });
    }
});

/**
 * GET /reports
 * List reports with filters (VIEWER)
 */
alignmentV2Router.get('/reports', requireOrgRole('viewer'), async (req, res) => {
    try {
        const { projectId } = req.params as any;
        const { min_score, max_score, limit } = req.query;

        const reports = await alignmentServiceV2.listReports(projectId, {
            min_score, max_score, limit
        });

        res.json(reports);
    } catch (error: any) {
        logger.error('List Reports Failed', { error: error.message });
        res.status(500).json({ error: 'Failed to list reports' });
    }
});

/**
 * GET /reports/:id
 * Get report details (VIEWER)
 */
alignmentV2Router.get('/reports/:id', requireOrgRole('viewer'), async (req, res) => {
    try {
        const { projectId, id } = req.params as any;
        const report = await alignmentServiceV2.getReport(projectId, id);
        res.json(report);
    } catch (error: any) {
        logger.error('Get Report Failed', { error: error.message });
        res.status(500).json({ error: 'Failed to get report' });
    }
});

/**
 * GET /overview
 * Get Dashboard KPIs (VIEWER)
 */
alignmentV2Router.get('/overview', requireOrgRole('viewer'), async (req, res) => {
    try {
        const { projectId } = req.params as any;
        const overview = await alignmentServiceV2.getOverview(projectId);
        res.json(overview);
    } catch (error: any) {
        logger.error('Get Overview Failed', { error: error.message });
        res.status(500).json({ error: 'Failed to get overview' });
    }
});

/**
 * POST /reports/:id/resolve
 * Resolve alerts for a report (ADMIN/OWNER)
 */
alignmentV2Router.post('/reports/:id/resolve', requireOrgRole('admin'), async (req, res) => {
    try {
        const { projectId, id } = req.params as any;
        const { reason } = req.body;

        await alignmentServiceV2.resolveAlerts(projectId, id, reason);
        res.json({ success: true });
    } catch (error: any) {
        logger.error('Resolve Alerts Failed', { error: error.message });
        res.status(500).json({ error: 'Failed to resolve alerts' });
    }
});
