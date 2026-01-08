import { Request, Response } from 'express';
import { supabase } from '../../infra/db';
import { logger } from '../../infra/structured-logger';
import { HubSpotConnector } from '../../integrations/connectors/hubspot';
import { secretsProvider } from '../../security/secrets-provider';

export const triggerIntegrationSync = async (req: Request, res: Response) => {
    const { connectionId, orgId } = req.body;

    if (!connectionId || !orgId) {
        return res.status(400).json({ error: 'Missing connectionId or orgId' });
    }

    try {
        // 1. Fetch Connection Safe
        const { data: connection, error } = await supabase
            .from('source_connections')
            .select('*')
            .eq('id', connectionId)
            .eq('org_id', orgId)
            .single();

        if (error || !connection) throw new Error('Connection not found');

        if (connection.type !== 'hubspot') {
            return res.status(400).json({ error: 'Unsupported provider for this endpoint' });
        }

        // 2. Get Access Token
        if (!connection.config_json?.secret_ref_id) {
            throw new Error('No secret_ref_id found');
        }

        const connector = new HubSpotConnector();
        const tokens = await connector.refreshTokenIfNeeded(connection.config_json.secret_ref_id);

        // 3. Run Sync
        const result = await connector.syncIncremental({
            orgId: connection.org_id,
            projectId: connection.project_id,
            connectionId: connection.id,
            state: connection.state_json,
            accessToken: tokens.access_token
        });

        // 4. Update DB State
        await supabase
            .from('source_connections')
            .update({
                state_json: result.new_state ? { ...connection.state_json, ...result.new_state } : connection.state_json,
                last_sync_at: new Date().toISOString(),
                last_success_at: result.status === 'success' ? new Date().toISOString() : connection.last_success_at,
                last_error_at: result.status === 'failed' ? new Date().toISOString() : null,
                last_error_class: result.errors ? JSON.stringify(result.errors) : null
            })
            .eq('id', connectionId);

        // 5. Update Sync Run if triggered from Pending (Worker handles finding pending run? Or we pass runId?)
        // If worker triggered it, worker might want to update the Run.
        // For now, simpler: we just respond.

        res.json(result);

    } catch (err: any) {
        logger.error('Sync Execution Failed', { connectionId, error: err.message });

        // Update Error State in DB
        await supabase
            .from('source_connections')
            .update({
                last_error_at: new Date().toISOString(),
                last_error_class: err.message
            })
            .eq('id', connectionId);

        res.status(500).json({ error: err.message });
    }
};
