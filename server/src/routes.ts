import { Router, Response } from 'express';
import { supabase } from './infra/db';
import {
    toSafeDTOList,
    toSafeDTO,
    ProjectWhitelist,
    AuditLogWhitelist
} from './shared/safe-dto';
import { authMiddleware, AuthenticatedRequest, requireInternalKey } from './middleware/auth';
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
import { startHubSpotOAuth, handleHubSpotCallback } from './routes/oauth/hubspot';
import { triggerIntegrationSync } from './routes/internal/integrations';
// import { alignmentRouter } from './routes/internal/alignment';
import crmRouter from './routes/crm';
import {
    triggerAlignmentCheck,
    getAlignmentReports,
    getAlignmentReport,
    getAlignmentSettings,
    updateAlignmentSettings,
    triggerBatchAlignment
} from './routes/alignment';

const router = Router();

// Webhooks (NO auth middleware - external sources)
router.post('/webhooks/hotmart/:connectionId', handleHotmartWebhook);

// OAuth flows (NO auth middleware - redirects)
router.get('/oauth/meta/start', startMetaOAuth);
router.get('/oauth/meta/callback', handleMetaOAuthCallback);

router.get('/oauth/hubspot/start', startHubSpotOAuth);
router.get('/oauth/hubspot/callback', handleHubSpotCallback);

// CRM Hub Routes
router.use(crmRouter);

// Internal Service Routes (Protected by Internal Key, No User Auth)
router.post('/internal/alignment/project/:projectId/batch-run', requireInternalKey, triggerBatchAlignment);
router.post('/internal/integration/sync', requireInternalKey, triggerIntegrationSync);

// Dashboard Stats (Public/Demo)
router.get('/dashboard/stats', async (_req, res) => {
    const tenant_id = 'org_launchsin_demo'; // Hardcoded for demo

    // 1. Check DB/API Health
    const { error } = await supabase.from('projects').select('count', { count: 'exact', head: true });
    const apiStatus = error ? 'Degraded' : 'Healthy';

    // 2. Metrics (Mocked/Inferred)
    const workerStatus = 'Running';
    const aiStatus = 'Optimizing';

    // 3. fetch recent projects
    const { data: projects } = await supabase
        .from('projects')
        .select('id, name, created_at')
        .eq('org_id', tenant_id)
        .order('created_at', { ascending: false })
        .limit(3);

    res.json({
        api_status: apiStatus,
        worker_status: workerStatus,
        ai_status: aiStatus,
        security_status: 'Active',
        confidence_score: 98,
        recent_activity: projects || []
    });
});

// Apply auth to all other routes
router.use(authMiddleware);

// Alignment Intelligence (ADMIN only)
// Alignment Intelligence (ADMIN only for checks/settings, VIEWER for reports)
router.post('/projects/:projectId/integrations/alignment/check', validateProjectAccess, requireOrgRole('admin'), triggerAlignmentCheck);
router.get('/projects/:projectId/integrations/alignment/reports', validateProjectAccess, requireOrgRole('viewer'), getAlignmentReports);
router.get('/projects/:projectId/integrations/alignment/reports/:reportId', validateProjectAccess, requireOrgRole('viewer'), getAlignmentReport);
router.get('/projects/:projectId/integrations/alignment/settings', validateProjectAccess, requireOrgRole('viewer'), getAlignmentSettings);
router.put('/projects/:projectId/integrations/alignment/settings', validateProjectAccess, requireOrgRole('admin'), updateAlignmentSettings);

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

// Dashboard Stats
router.get('/dashboard/stats', async (req: AuthenticatedRequest, res: Response) => {
    const { tenant_id } = req.user!;

    // 1. Check DB/API Health
    const { error } = await supabase.from('projects').select('count', { count: 'exact', head: true });
    const apiStatus = error ? 'Degraded' : 'Healthy';

    // 2. Metrics (Mocked/Inferred)
    const workerStatus = 'Running';
    const aiStatus = 'Optimizing';

    // 3. fetch recent projects as "Active Tenants/Projects" context
    const { data: projects } = await supabase
        .from('projects')
        .select('id, name, created_at')
        .eq('org_id', tenant_id)
        .order('created_at', { ascending: false })
        .limit(3);

    res.json({
        api_status: apiStatus,
        worker_status: workerStatus,
        ai_status: aiStatus,
        security_status: 'Active',
        confidence_score: 98,
        recent_activity: projects || []
    });
});

export default router;
