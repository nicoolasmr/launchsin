import { Router, Request, Response } from 'express';
import { logger } from '../../infra/structured-logger';
import { gtmConnector } from '../../integrations/gtm-connector';
import { createClient } from '@supabase/supabase-js';

const router = Router();
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GTM OAuth Routes (Phase A)
 * 
 * RBAC:
 * - Start/Callback: Admin/Owner only
 * - List accounts: Viewer+ (read only)
 * 
 * Security:
 * - State HMAC validation (CSRF protection)
 * - Tokens in secret_refs (AES-256)
 * - SafeDTO (no tokens in responses)
 * - LeakGate (blocks token patterns)
 */

/**
 * GET /api/integrations/gtm/oauth/start
 * Initiate GTM OAuth flow
 */
router.get('/api/integrations/gtm/oauth/start', async (req: Request, res: Response) => {
    try {
        const { project_id } = req.query;
        const userId = (req as any).user?.id;

        if (!project_id || !userId) {
            return res.status(400).json({ error: 'Missing project_id or user not authenticated' });
        }

        // RBAC: Check Admin/Owner
        const { data: membership } = await supabase
            .from('project_members')
            .select('role')
            .eq('project_id', project_id)
            .eq('user_id', userId)
            .single();

        if (!membership || !['admin', 'owner'].includes(membership.role)) {
            return res.status(403).json({ error: 'Admin/Owner role required' });
        }

        // Generate OAuth URL
        const authorizeUrl = gtmConnector.authorizeUrl(project_id as string, userId);

        logger.info('GTM OAuth started', { projectId: project_id, userId });

        res.redirect(authorizeUrl);
    } catch (error: any) {
        logger.error('GTM OAuth start failed', { error: error.message });
        res.status(500).json({ error: 'Failed to start OAuth flow' });
    }
});

/**
 * GET /api/integrations/gtm/oauth/callback
 * Handle OAuth callback from Google
 */
router.get('/api/integrations/gtm/oauth/callback', async (req: Request, res: Response) => {
    try {
        const { code, state, error } = req.query;

        if (error) {
            logger.error('GTM OAuth error', { error });
            return res.redirect(`/integrations/gtm/connect?error=${error}`);
        }

        if (!code || !state) {
            return res.status(400).json({ error: 'Missing code or state' });
        }

        // Validate state
        const stateData = gtmConnector.validateState(state as string);
        if (!stateData) {
            return res.status(400).json({ error: 'Invalid or expired state' });
        }

        const { projectId, userId } = stateData;

        // Exchange code for tokens
        const tokens = await gtmConnector.exchangeCodeForTokens(code as string);

        // Get org_id from project
        const { data: project } = await supabase
            .from('projects')
            .select('org_id')
            .eq('id', projectId)
            .single();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Create source_connection
        const { data: connection } = await supabase
            .from('source_connections')
            .insert({
                org_id: project.org_id,
                project_id: projectId,
                type: 'GTM',
                status: 'active',
                state_json: {
                    connected_at: new Date().toISOString(),
                    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
                    // NO tokens here!
                }
            })
            .select()
            .single();

        if (!connection) {
            throw new Error('Failed to create source_connection');
        }

        // Store tokens in secret_refs
        await gtmConnector.storeTokens(project.org_id, connection.id, tokens);

        // Audit log
        await supabase.from('audit_logs').insert({
            org_id: project.org_id,
            user_id: userId,
            action: 'GTM_CONNECT',
            resource_type: 'source_connection',
            resource_id: connection.id,
            metadata_redacted: { project_id: projectId }
        });

        logger.info('GTM OAuth completed', { connectionId: connection.id, projectId });

        res.redirect(`/integrations/gtm/connect?success=true&connection_id=${connection.id}`);
    } catch (error: any) {
        logger.error('GTM OAuth callback failed', { error: error.message });
        res.redirect(`/integrations/gtm/connect?error=callback_failed`);
    }
});

/**
 * GET /api/projects/:projectId/integrations/gtm/accounts
 * List GTM accounts/containers/workspaces
 */
router.get('/api/projects/:projectId/integrations/gtm/accounts', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const userId = (req as any).user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // RBAC: Check Viewer+ (read only)
        const { data: membership } = await supabase
            .from('project_members')
            .select('role')
            .eq('project_id', projectId)
            .eq('user_id', userId)
            .single();

        if (!membership) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get project org_id
        const { data: project } = await supabase
            .from('projects')
            .select('org_id')
            .eq('id', projectId)
            .single();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Get active GTM connection
        const { data: connection } = await supabase
            .from('source_connections')
            .select('id')
            .eq('project_id', projectId)
            .eq('type', 'GTM')
            .eq('status', 'active')
            .single();

        if (!connection) {
            return res.status(404).json({ error: 'GTM not connected' });
        }

        // Get access token
        const accessToken = await gtmConnector.getAccessToken(project.org_id, connection.id);

        // List accounts
        const accounts = await gtmConnector.listAccounts(accessToken);

        // SafeDTO: Return only safe data (no tokens)
        res.json({
            accounts: accounts.map(account => ({
                accountId: account.accountId,
                name: account.name,
                containers: account.containers.map(container => ({
                    containerId: container.containerId,
                    name: container.name,
                    publicId: container.publicId,
                    workspaces: container.workspaces.map(ws => ({
                        workspaceId: ws.workspaceId,
                        name: ws.name,
                        description: ws.description
                    }))
                }))
            }))
        });
    } catch (error: any) {
        logger.error('Failed to list GTM accounts', { error: error.message });
        res.status(500).json({ error: 'Failed to list accounts' });
    }
});

/**
 * POST /api/projects/:projectId/integrations/gtm/targets
 * Create integration_apply_targets from selected account/container/workspace
 */
router.post('/api/projects/:projectId/integrations/gtm/targets', async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const { accountId, containerId, containerName, workspaceId, workspaceName, publicId } = req.body;
        const userId = (req as any).user?.id;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // RBAC: Admin/Owner only
        const { data: membership } = await supabase
            .from('project_members')
            .select('role')
            .eq('project_id', projectId)
            .eq('user_id', userId)
            .single();

        if (!membership || !['admin', 'owner'].includes(membership.role)) {
            return res.status(403).json({ error: 'Admin/Owner role required' });
        }

        // Get project org_id
        const { data: project } = await supabase
            .from('projects')
            .select('org_id')
            .eq('id', projectId)
            .single();

        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }

        // Create target
        const { data: target } = await supabase
            .from('integration_apply_targets')
            .insert({
                org_id: project.org_id,
                project_id: projectId,
                type: 'GTM',
                name: `${containerName} - ${workspaceName}`,
                config_json: {
                    account_id: accountId,
                    container_id: containerId,
                    container_public_id: publicId,
                    workspace_id: workspaceId,
                    publish: false // default: don't auto-publish
                }
            })
            .select()
            .single();

        if (!target) {
            throw new Error('Failed to create target');
        }

        // Audit log
        await supabase.from('audit_logs').insert({
            org_id: project.org_id,
            user_id: userId,
            action: 'CREATE_GTM_TARGET',
            resource_type: 'integration_apply_targets',
            resource_id: target.id,
            metadata_redacted: { project_id: projectId, container_id: containerId }
        });

        logger.info('GTM target created', { targetId: target.id, projectId });

        res.json({ target });
    } catch (error: any) {
        logger.error('Failed to create GTM target', { error: error.message });
        res.status(500).json({ error: 'Failed to create target' });
    }
});

export default router;
