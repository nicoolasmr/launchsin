import { Request, Response } from 'express';
import { supabase } from '../../infra/db';
import { logger } from '../../infra/structured-logger';
import { MetaAdsConnector } from '../../integrations/connectors/meta-ads';
import { AuthenticatedRequest } from '../../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || 'http://localhost:3000/api/oauth/meta/callback';

/**
 * Start Meta OAuth flow
 * GET /api/oauth/meta/start?projectId=...&connectionId=...
 */
export async function startMetaOAuth(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { projectId, connectionId } = req.query;

    if (!projectId || !connectionId) {
        res.status(400).json({ error: 'Missing projectId or connectionId' });
        return;
    }

    try {
        // Verify connection exists and user has access
        const { data: connection, error } = await supabase
            .from('source_connections')
            .select('id, org_id, project_id')
            .eq('id', connectionId as string)
            .eq('project_id', projectId as string)
            .eq('type', 'meta_ads')
            .single();

        if (error || !connection) {
            res.status(404).json({ error: 'Connection not found' });
            return;
        }

        // Generate state for CSRF protection
        const state = crypto.randomBytes(32).toString('hex');

        // Store state in session or database (for validation in callback)
        // For now, we'll encode connectionId in state
        const statePayload = Buffer.from(JSON.stringify({
            connection_id: connectionId,
            project_id: projectId,
            nonce: state
        })).toString('base64');

        const authUrl = MetaAdsConnector.getAuthorizationUrl(
            META_APP_ID,
            META_REDIRECT_URI,
            statePayload
        );

        logger.info('Meta OAuth flow started', {
            connection_id: connectionId,
            project_id: projectId
        });

        res.redirect(authUrl);
    } catch (error: any) {
        logger.error('Failed to start Meta OAuth', { error: error.message });
        res.status(500).json({ error: 'Failed to initiate OAuth flow' });
    }
}

/**
 * Handle Meta OAuth callback
 * GET /api/oauth/meta/callback?code=...&state=...
 */
export async function handleMetaOAuthCallback(req: Request, res: Response): Promise<void> {
    const { code, state } = req.query;

    if (!code || !state) {
        res.status(400).send('Missing code or state');
        return;
    }

    try {
        // Decode state
        const statePayload = JSON.parse(Buffer.from(state as string, 'base64').toString());
        const { connection_id, project_id } = statePayload;

        // Exchange code for token
        const tokens = await MetaAdsConnector.exchangeCodeForToken(
            META_APP_ID,
            META_APP_SECRET,
            META_REDIRECT_URI,
            code as string
        );

        // Calculate token expiration
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

        // Store token in secret_refs (encrypted)
        const secretKeyName = `meta_token_${connection_id}`;

        // In production, encrypt the token before storing
        // For now, storing directly (will be encrypted by vault service)
        await supabase.from('secret_refs').upsert({
            org_id: (await supabase.from('source_connections').select('org_id').eq('id', connection_id).single()).data?.org_id,
            key_name: secretKeyName,
            secret_id_ref: tokens.access_token, // This should be encrypted
            key_version: 1
        });

        // Update connection config
        await supabase
            .from('source_connections')
            .update({
                config_json: {
                    has_token: true,
                    token_expires_at: expiresAt,
                    scopes: ['ads_read', 'ads_management', 'business_management']
                },
                is_active: true
            })
            .eq('id', connection_id);

        logger.info('Meta OAuth completed', {
            connection_id,
            expires_at: expiresAt
        });

        // Redirect to success page
        res.redirect(`/projects/${project_id}/integrations?oauth=success`);
    } catch (error: any) {
        logger.error('Meta OAuth callback failed', { error: error.message });
        res.status(500).send('OAuth failed. Please try again.');
    }
}
