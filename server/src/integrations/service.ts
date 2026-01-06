import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';
import { connectorRegistry } from './registry';
import { secretsProvider } from '../security/secrets-provider';
import {
    IntegrationProvider,
    SourceConnection,
    IntegrationAlert,
    DlqEvent,
    SyncRun
} from './types';

export class IntegrationService {
    /**
     * Calculates Health Score v1 for a project or connection.
     * Logic: Start at 100, deduct for alerts, DLQ, and lag.
     */
    async calculateHealthScore(projectId: string, connectionId?: string): Promise<number> {
        let score = 100;

        // 1. Deduct for alerts
        const alertsQuery = supabase
            .from('integration_alerts')
            .select('severity')
            .eq('project_id', projectId)
            .eq('is_resolved', false);

        if (connectionId) {
            alertsQuery.eq('connection_id', connectionId);
        }

        const { data: alerts } = await alertsQuery;

        (alerts || []).forEach((a: { severity: string }) => {
            if (a.severity === 'critical') score -= 30;
            if (a.severity === 'warning') score -= 10;
        });

        // 2. Deduct for DLQ
        const dlqQuery = supabase
            .from('dlq_events')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        if (connectionId) {
            dlqQuery.eq('connection_id', connectionId);
        }

        const { count: dlqCount } = await dlqQuery;
        score -= (dlqCount || 0) * 2;

        // 3. Deduct for Lag (Staleness)
        // Simplified: Check last successful sync run
        const { data: lastRun } = await supabase
            .from('sync_runs')
            .select('finished_at')
            .eq('status', 'success')
            .order('finished_at', { ascending: false })
            .limit(1);

        if (lastRun?.[0]?.finished_at) {
            const finishedAt = new Date(lastRun[0].finished_at).getTime();
            const lagHours = (Date.now() - finishedAt) / (1000 * 60 * 60);
            if (lagHours > 1) {
                score -= Math.floor(lagHours) * 2;
            }
        }

        return Math.max(0, score);
    }

    /**
     * Creates a new connection and handles secret storage.
     */
    async createConnection(params: {
        orgId: string;
        projectId: string;
        type: IntegrationProvider;
        name: string;
        config: any;
        secrets?: Record<string, string>;
    }): Promise<SourceConnection> {
        logger.info('Creating integration connection', { type: params.type, projectId: params.projectId });

        // 1. Store secrets in vault and Get References
        if (params.secrets) {
            for (const [key, value] of Object.entries(params.secrets)) {
                const encrypted = secretsProvider.encrypt(value);
                await supabase.from('secret_refs').insert({
                    org_id: params.orgId,
                    key_name: `${params.type}_${key}`,
                    secret_id_ref: encrypted
                });
            }
        }

        // 2. Save Connection
        const { data, error } = await supabase
            .from('source_connections')
            .insert({
                org_id: params.orgId,
                project_id: params.projectId,
                type: params.type,
                name: params.name,
                config_json: params.config
            })
            .select()
            .single();

        if (error) throw error;
        return data as SourceConnection;
    }

    async testConnection(connectionId: string): Promise<{ success: boolean; message: string }> {
        const { data: conn } = await supabase
            .from('source_connections')
            .select('*')
            .eq('id', connectionId)
            .single();

        if (!conn) throw new Error('Connection not found');

        const connector = connectorRegistry.getConnector(conn.type as IntegrationProvider);
        return connector.testConnection(conn.config_json);
    }
}

export const integrationService = new IntegrationService();
