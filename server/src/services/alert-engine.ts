/**
 * Alert Engine Service
 * 
 * Manages system alerts for integrations and alignment operations.
 */

import { supabase } from '../infra/db';
import { logger } from '../utils/logger';

export interface CreateAlertParams {
    org_id: string;
    project_id: string;
    source_connection_id?: string;
    type: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    metadata?: Record<string, any>;
}

export class AlertEngine {
    /**
     * Create a new alert
     */
    async createAlert(params: CreateAlertParams): Promise<string> {
        try {
            // Check for duplicate active alerts of same type/source to avoid noise
            if (params.metadata?.deduplication_key) {
                const existing = await this.findActiveDuplicate(
                    params.project_id,
                    params.type,
                    params.metadata.deduplication_key
                );

                if (existing) {
                    logger.debug('Duplicate alert suppressed', {
                        type: params.type,
                        deduplication_key: params.metadata.deduplication_key
                    });
                    return existing.id;
                }
            }

            const { data, error } = await supabase
                .from('integration_alerts')
                .insert({
                    org_id: params.org_id,
                    project_id: params.project_id,
                    source_connection_id: params.source_connection_id,
                    type: params.type,
                    severity: params.severity,
                    message: params.message,
                    metadata: params.metadata,
                    status: 'open',
                    created_at: new Date().toISOString()
                })
                .select('id')
                .single();

            if (error) throw error;

            logger.info('Alert created', {
                alert_id: data.id,
                type: params.type,
                project_id: params.project_id
            });

            return data.id;

        } catch (error: any) {
            logger.error('Failed to create alert', { error, params });
            // Don't crash the caller, alerts are auxiliary
            return '';
        }
    }

    /**
     * Find active duplicate alert
     */
    private async findActiveDuplicate(
        projectId: string,
        type: string,
        dedupKey: string
    ): Promise<{ id: string } | null> {
        // Assuming metadata->>'deduplication_key' pattern
        const { data, error } = await supabase
            .from('integration_alerts')
            .select('id')
            .eq('project_id', projectId)
            .eq('type', type)
            .eq('status', 'open')
            .contains('metadata', { deduplication_key: dedupKey })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.warn('Error checking duplicate alert', { error });
        }

        return data;
    }

    /**
     * Resolve alerts by type/key (e.g. when alignment score improves)
     */
    async resolveAlerts(
        projectId: string,
        type: string,
        dedupKey: string
    ): Promise<void> {
        try {
            await supabase
                .from('integration_alerts')
                .update({
                    status: 'resolved',
                    resolved_at: new Date().toISOString(),
                    resolved_by: 'system'
                })
                .eq('project_id', projectId)
                .eq('type', type)
                .eq('status', 'open')
                .contains('metadata', { deduplication_key: dedupKey });
        } catch (error) {
            logger.error('Failed to resolve alerts', { error, projectId, type });
        }
    }
}

export const alertEngine = new AlertEngine();
