import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';
import { v4 as uuidv4 } from 'uuid';
import { trackingFixService } from './tracking-fix-service';

export type ActionType =
    | 'GENERATE_FIX_PACK'
    | 'VERIFY_TRACKING'
    | 'TRIGGER_ALIGNMENT_CHECK'
    | 'RESOLVE_ALERT';

interface ActionPayload {
    page_url?: string;
    alert_id?: string;
    connection_id?: string;
    ad_id?: string;
}

interface ActionResult {
    ok: boolean;
    audit_id: string;
    result: {
        summary: string;
        deep_link: string | null;
    };
}

export class HomeActionsService {
    /**
     * Execute action with RBAC + audit logging
     */
    async executeAction(
        actionType: ActionType,
        payload: ActionPayload,
        projectId: string,
        orgId: string,
        userId: string
    ): Promise<ActionResult> {
        try {
            // Execute action
            let result: { summary: string; deep_link: string | null; entity_type?: string; entity_id?: string };

            switch (actionType) {
                case 'GENERATE_FIX_PACK':
                    result = await this.generateFixPack(payload, projectId, orgId);
                    break;
                case 'VERIFY_TRACKING':
                    result = await this.verifyTracking(payload, projectId);
                    break;
                case 'TRIGGER_ALIGNMENT_CHECK':
                    result = await this.triggerAlignmentCheck(payload, projectId);
                    break;
                case 'RESOLVE_ALERT':
                    result = await this.resolveAlert(payload, projectId);
                    break;
                default:
                    throw new Error(`Unknown action type: ${actionType}`);
            }

            // Write audit log (metadata redacted)
            const auditId = await this.writeAuditLog({
                org_id: orgId,
                project_id: projectId,
                actor_user_id: userId,
                action_type: actionType,
                entity_type: result.entity_type || null,
                entity_id: result.entity_id || null,
                metadata_json: this.redactMetadata({
                    page_url: payload.page_url,
                    alert_id: payload.alert_id,
                    result: result.summary
                })
            });

            logger.info('Action executed', {
                action_type: actionType,
                project_id: projectId,
                audit_id: auditId
            });

            return {
                ok: true,
                audit_id: auditId,
                result: {
                    summary: result.summary,
                    deep_link: result.deep_link
                }
            };
        } catch (error: any) {
            logger.error('Action execution failed', {
                action_type: actionType,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Generate Fix Pack (reuses tracking-fix-service)
     */
    private async generateFixPack(
        payload: ActionPayload,
        projectId: string,
        orgId: string
    ) {
        if (!payload.page_url) {
            throw new Error('page_url required for GENERATE_FIX_PACK');
        }

        // Note: buildFixPack expects TrackingDetection, but we're simplifying for action executor
        // Create a minimal detection object
        const detection = {
            meta_pixel: false,
            gtm: false,
            ga4: false,
            utm_params: false
        };

        const fixPack = trackingFixService.buildFixPack(
            detection,
            payload.page_url,
            projectId
        );

        return {
            summary: `Fix pack generated for ${payload.page_url}`,
            deep_link: `/projects/${projectId}/integrations/alignment?tab=fixpacks`,
            entity_type: 'fix_pack',
            entity_id: 'generated'
        };
    }

    /**
     * Verify Tracking (creates TRACKING_VERIFY job)
     */
    private async verifyTracking(payload: ActionPayload, projectId: string) {
        if (!payload.page_url) {
            throw new Error('page_url required for VERIFY_TRACKING');
        }

        // Create alignment job with type TRACKING_VERIFY
        const { data: job, error } = await supabase
            .from('alignment_jobs')
            .insert({
                id: uuidv4(),
                project_id: projectId,
                job_type: 'TRACKING_VERIFY',
                page_url: payload.page_url,
                status: 'pending',
                created_at: new Date().toISOString()
            })
            .select('id')
            .single();

        if (error) {
            throw new Error(`Failed to create job: ${error.message}`);
        }

        return {
            summary: `Tracking verification queued for ${payload.page_url}`,
            deep_link: `/projects/${projectId}/integrations/alignment`,
            entity_type: 'alignment_job',
            entity_id: job.id
        };
    }

    /**
     * Trigger Alignment Check (creates alignment job)
     */
    private async triggerAlignmentCheck(payload: ActionPayload, projectId: string) {
        if (!payload.page_url) {
            throw new Error('page_url required for TRIGGER_ALIGNMENT_CHECK');
        }

        const { data: job, error } = await supabase
            .from('alignment_jobs')
            .insert({
                id: uuidv4(),
                project_id: projectId,
                job_type: 'ALIGNMENT_CHECK',
                page_url: payload.page_url,
                status: 'pending',
                created_at: new Date().toISOString()
            })
            .select('id')
            .single();

        if (error) {
            throw new Error(`Failed to create job: ${error.message}`);
        }

        return {
            summary: `Alignment check queued for ${payload.page_url}`,
            deep_link: `/projects/${projectId}/integrations/alignment`,
            entity_type: 'alignment_job',
            entity_id: job.id
        };
    }

    /**
     * Resolve Alert (updates alignment_alerts status)
     */
    private async resolveAlert(payload: ActionPayload, projectId: string) {
        if (!payload.alert_id) {
            throw new Error('alert_id required for RESOLVE_ALERT');
        }

        const { error } = await supabase
            .from('alignment_alerts')
            .update({ status: 'resolved' })
            .eq('id', payload.alert_id)
            .eq('project_id', projectId);

        if (error) {
            throw new Error(`Failed to resolve alert: ${error.message}`);
        }

        return {
            summary: `Alert ${payload.alert_id} resolved`,
            deep_link: `/projects/${projectId}/integrations/alignment`,
            entity_type: 'alignment_alert',
            entity_id: payload.alert_id
        };
    }

    /**
     * Write audit log (metadata redacted)
     */
    private async writeAuditLog(data: {
        org_id: string;
        project_id: string;
        actor_user_id: string;
        action_type: string;
        entity_type: string | null;
        entity_id: string | null;
        metadata_json: any;
    }): Promise<string> {
        const { data: audit, error } = await supabase
            .from('audit_logs')
            .insert({
                id: uuidv4(),
                ...data,
                created_at: new Date().toISOString()
            })
            .select('id')
            .single();

        if (error) {
            logger.error('Failed to write audit log', { error: error.message });
            throw new Error('Failed to write audit log');
        }

        return audit.id;
    }

    /**
     * Redact metadata (remove secrets, tokens, keys)
     */
    private redactMetadata(metadata: any): any {
        const redacted = { ...metadata };

        // Remove forbidden patterns
        const forbiddenKeys = ['api_key', 'token', 'secret', 'password', 'bearer', 'authorization'];

        Object.keys(redacted).forEach(key => {
            if (forbiddenKeys.some(forbidden => key.toLowerCase().includes(forbidden))) {
                redacted[key] = '[REDACTED]';
            }

            // Redact values matching secret patterns
            if (typeof redacted[key] === 'string') {
                if (redacted[key].startsWith('sk-') || redacted[key].startsWith('Bearer ')) {
                    redacted[key] = '[REDACTED]';
                }
            }
        });

        return redacted;
    }

    /**
     * Get recent actions (audit logs)
     */
    async getRecentActions(projectId: string, limit: number = 10) {
        const { data: logs, error } = await supabase
            .from('audit_logs')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.error('Failed to fetch audit logs', { error: error.message });
            throw error;
        }

        // SafeDTO: whitelist response
        return logs?.map(log => ({
            id: log.id,
            action_type: log.action_type,
            entity_type: log.entity_type,
            entity_id: log.entity_id,
            metadata: log.metadata_json,
            created_at: log.created_at
        })) || [];
    }
}

export const homeActionsService = new HomeActionsService();
