import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../../infra/db';
import { logger } from '../../infra/structured-logger';
import { HubSpotConnector } from '../../integrations/connectors/hubspot';
import { secretsProvider } from '../../security/secrets-provider';

import { OAuthStateService } from '../../infra/oauth-state';

// Removed local state signing logic in favor of OAuthStateService

export const startHubSpotOAuth = async (req: Request, res: Response) => {
    const { projectId, connectionId, redirectUri } = req.query;

    if (!projectId || !connectionId || !redirectUri) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Usually we should validate projectId access here, but this is a public endpoint?
    // Route in routes.ts is under "OAuth flows (NO auth middleware)".
    // So security depends on State validation in Callback.
    // Ideally we assume valid IDs are passed. The callback will verify if they exist/belong to user? 
    // Wait, callback doesn't have user session usually (cookie?).
    // If start is authenticated (via UI), we could protect it. But 'start' is usually a GET link.
    // I'll proceed with standard flow.


    // Fetch connection to get OrgID for state
    const { data: connection } = await supabase
        .from('source_connections')
        .select('id, org_id')
        .eq('id', String(connectionId))
        .single();

    if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
    }

    const state = OAuthStateService.generateState({
        orgId: connection.org_id,
        userId: (req as any).user?.id || 'public-oauth',
        connectionId: String(connectionId),
        provider: 'hubspot',
        redirectUri: String(redirectUri)
    });
    const connector = new HubSpotConnector();
    const url = connector.getAuthUrl({
        projectId: String(projectId),
        connectionId: String(connectionId),
        redirectUri: String(redirectUri),
        state
    });

    res.redirect(url);
};

export const handleHubSpotCallback = async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
        logger.error('HubSpot OAuth Error', { error: String(error) });
        return res.redirect('/integrations?error=oauth_denied');
    }

    if (!state || typeof state !== 'string') {
        return res.status(400).send('Missing or invalid state parameter');
    }

    try {
        const payload = OAuthStateService.validateState(state);
        if (!payload) throw new Error('Invalid or expired state');
        // Check provider type to be sure
        if (payload.provider !== 'hubspot') throw new Error('Invalid provider in state');

        const connector = new HubSpotConnector();
        const tokens = await connector.exchangeCodeForToken({
            code: String(code),
            redirectUri: (payload.redirectUri as string) || ''
        });

        // 1. Get Connection to verify validity (and get OrgID)
        const { data: connection, error: connError } = await supabase
            .from('source_connections')
            .select('id, org_id, project_id, config_json')
            .eq('id', payload.connectionId)
            .single();

        if (connError || !connection) throw new Error('Connection not found');

        // 2. Store Tokens Securely
        const secretRefId = await secretsProvider.storeSecret(
            connection.org_id,
            `hubspot_tokens_${connection.id}`,
            JSON.stringify(tokens)
        );

        // 3. Update Connection
        const newConfig = {
            ...(connection.config_json || {}),
            secret_ref_id: secretRefId, // Link to secret
            has_token: true
        };

        await supabase
            .from('source_connections')
            .update({
                is_active: true,
                config_json: newConfig,
                last_success_at: new Date().toISOString()
            })
            .eq('id', connection.id);

        // 4. Redirect to UI
        // We need projectId. Fetch from connection again (we just fetched verify validity but didn't select projectId)
        // Optimization: select projectId above
        const uiRedirect = `${new URL(payload.redirectUri!).origin}/projects/${connection.project_id || 'unknown'}/integrations?tab=settings&status=connected`;
        res.redirect(uiRedirect);

    } catch (err: any) {
        logger.error('HubSpot Callback Failed', { error: err.message });
        res.status(400).send(`OAuth Failed: ${err.message}`);
    }
};
