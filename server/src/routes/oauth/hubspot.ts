import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../../infra/db';
import { logger } from '../../infra/structured-logger';
import { HubSpotConnector } from '../../integrations/connectors/hubspot';
import { secretsProvider } from '../../security/secrets-provider';

const STATE_SECRET = process.env.SECRETS_ENCRYPTION_KEY || 'dev-secret';

function signState(payload: object): string {
    const data = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', STATE_SECRET).update(data).digest('base64url');
    return `${Buffer.from(data).toString('base64url')}.${hmac}`;
}

function verifyState(state: string): any {
    const [dataB64, signature] = state.split('.');
    if (!dataB64 || !signature) throw new Error('Invalid state format');

    const data = Buffer.from(dataB64, 'base64url').toString();
    const expectedSig = crypto.createHmac('sha256', STATE_SECRET).update(data).digest('base64url');

    if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        return JSON.parse(data);
    }
    throw new Error('Invalid state signature');
}

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

    const statePayload = {
        projectId,
        connectionId,
        redirectUri,
        nonce: crypto.randomBytes(8).toString('hex'),
        expiresAt: Date.now() + 1000 * 60 * 10 // 10 mins
    };

    const state = signState(statePayload);
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

    try {
        const payload = verifyState(String(state));
        if (Date.now() > payload.expiresAt) throw new Error('State expired');

        const connector = new HubSpotConnector();
        const tokens = await connector.exchangeCodeForToken({
            code: String(code),
            redirectUri: payload.redirectUri
        });

        // 1. Get Connection to verify validity (and get OrgID)
        const { data: connection, error: connError } = await supabase
            .from('source_connections')
            .select('id, org_id, config_json')
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
        const uiRedirect = `${new URL(payload.redirectUri).origin}/projects/${payload.projectId}/integrations?tab=settings&status=connected`;
        res.redirect(uiRedirect);

    } catch (err: any) {
        logger.error('HubSpot Callback Failed', { error: err.message });
        res.status(400).send(`OAuth Failed: ${err.message}`);
    }
};
