import { Router, Response } from 'express';
import { supabase } from './infra/db';
import {
    toSafeDTOList,
    toSafeDTO,
    ProjectWhitelist,
    AuditLogWhitelist
} from './shared/safe-dto';
import { authMiddleware, AuthenticatedRequest } from './middleware/auth';
import { requireOrgRole, validateProjectAccess } from './middleware/rbac';
import { integrationService } from './integrations/service';
import {
    toSafeSourceConnectionDTO,
    toSafeRunDTO,
    toSafeDlqDTO,
    toSafeAlertDTO
} from './integrations/safe-dto';
import { IntegrationProvider, SourceConnection, SyncRun, DlqEvent, IntegrationAlert } from './integrations/types';
import { logger } from './infra/structured-logger';
import { handleHotmartWebhook } from './routes/webhooks/hotmart';
import { startMetaOAuth, handleMetaOAuthCallback } from './routes/oauth/meta';
import { triggerAlignmentCheck, getAlignmentReports } from './routes/alignment';

const router = Router();

// Webhooks (NO auth middleware - external sources)
router.post('/webhooks/hotmart/:connectionId', handleHotmartWebhook);

// OAuth flows (NO auth middleware - redirects)
router.get('/oauth/meta/start', startMetaOAuth);
router.get('/oauth/meta/callback', handleMetaOAuthCallback);

// Apply auth to all other routes
router.use(authMiddleware);

// Alignment Intelligence (ADMIN only)
router.post('/projects/:projectId/integrations/:connectionId/alignment/check', requireOrgRole('admin'), triggerAlignmentCheck);
router.get('/projects/:projectId/integrations/:connectionId/alignment/reports', getAlignmentReports);

// --- Projects ---
router.get('/projects', async (req: AuthenticatedRequest, res: Response) => {
    const { tenant_id } = req.user!;
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('org_id', tenant_id);

    if (error) return res.status(500).json({ error: error.message });
    res.json(toSafeDTOList(data as any[] || [], ProjectWhitelist));
});

router.get('/projects/:projectId', validateProjectAccess, requireOrgRole('viewer'), async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

    if (error || !data) return res.status(404).json({ error: 'Project not found' });
    res.json(toSafeDTO(data as any, ProjectWhitelist));
});

// --- Integration Hub & Status Center ---

// List Integrations
router.get('/projects/:projectId/integrations', validateProjectAccess, async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { data, error } = await supabase
        .from('source_connections')
        .select('*')
        .eq('project_id', projectId);

    if (error) return res.status(500).json({ error: error.message });

    const safeItems = await Promise.all((data as SourceConnection[] || []).map(async (conn) => {
        const score = await integrationService.calculateHealthScore(projectId, conn.id);
        return toSafeSourceConnectionDTO(conn, score);
    }));

    res.json(safeItems);
});

// Create Integration
router.post('/projects/:projectId/integrations', validateProjectAccess, requireOrgRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { tenant_id } = req.user!;
    const { type, name, config, secrets } = req.body;

    try {
        const connection = await integrationService.createConnection({
            orgId: tenant_id,
            projectId,
            type: type as IntegrationProvider,
            name,
            config,
            secrets
        });
        res.status(201).json(toSafeSourceConnectionDTO(connection));
    } catch (error: any) {
        logger.error('Failed to create integration', { error: error.message, type, projectId });
        res.status(400).json({ error: error.message });
    }
});

// Health Score
router.get('/projects/:projectId/integrations/health', validateProjectAccess, async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const score = await integrationService.calculateHealthScore(projectId);

    res.json({
        score,
        status: score > 80 ? 'healthy' : score > 50 ? 'degraded' : 'critical'
    });
});

// Sync Runs
router.get('/projects/:projectId/integrations/runs', validateProjectAccess, async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { data, error } = await supabase
        .from('sync_runs')
        .select('*, source_connections!inner(project_id)')
        .eq('source_connections.project_id', projectId)
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json((data as SyncRun[] || []).map(toSafeRunDTO));
});

// DLQ
router.get('/projects/:projectId/integrations/dlq', validateProjectAccess, async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { data, error } = await supabase
        .from('dlq_events')
        .select('*, source_connections!inner(project_id)')
        .eq('source_connections.project_id', projectId);

    if (error) return res.status(500).json({ error: error.message });
    res.json((data as DlqEvent[] || []).map(toSafeDlqDTO));
});

// Alerts
router.get('/projects/:projectId/integrations/alerts', validateProjectAccess, async (req: AuthenticatedRequest, res: Response) => {
    const { projectId } = req.params;
    const { data, error } = await supabase
        .from('integration_alerts')
        .select('*')
        .eq('project_id', projectId);

    if (error) return res.status(500).json({ error: error.message });
    res.json((data as IntegrationAlert[] || []).map(toSafeAlertDTO));
});


// --- Audit Logs ---
router.get('/audit-logs', async (req: AuthenticatedRequest, res: Response) => {
    const { tenant_id } = req.user!;
    const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('org_id', tenant_id)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) return res.status(500).json({ error: error.message });
    res.json(toSafeDTOList(data as any[] || [], AuditLogWhitelist));
});

// Health Checks
router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
