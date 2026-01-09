
import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';
import { v4 as uuidv4 } from 'uuid';

export interface PageSnapshot {
    id: string;
    url: string;
    title: string;
    h1: string[];
    ctas: string[];
    extracted_text: string;
    screenshot_path: string | null;
    meta: any;
    created_at: string;
}

export class AlignmentOpsService {

    /**
     * Attempts to claim a job using DB-based leasing.
     * Supports initial claim (queued) and reclaiming dead jobs (running + expired lease).
     */
    async claimJobWithLease(jobId: string, workerId: string): Promise<boolean> {
        const leaseDurationMinutes = 2;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + leaseDurationMinutes * 60000).toISOString();

        // 1. Try to claim if queued
        const { data, error } = await supabase
            .from('alignment_jobs')
            .update({
                status: 'running',
                locked_by: workerId,
                lock_expires_at: expiresAt,
                started_at: now.toISOString()
            })
            .eq('id', jobId)
            .eq('status', 'queued')
            .select('id')
            .maybeSingle();

        if (data) return true;

        // 2. Try to reclaim if dead (running but expired)
        const { data: reclaimed } = await supabase
            .from('alignment_jobs')
            .update({
                locked_by: workerId,
                lock_expires_at: expiresAt,
                error_message_redacted: 'Job reclaimed after worker crash'
            })
            .eq('id', jobId)
            .eq('status', 'running')
            .lt('lock_expires_at', now.toISOString())
            .select('id')
            .maybeSingle();

        return !!reclaimed;
    }

    /**
     * Extends the lease for a running job.
     */
    async heartbeatLease(jobId: string, workerId: string): Promise<boolean> {
        const leaseDurationMinutes = 2;
        const expiresAt = new Date(Date.now() + leaseDurationMinutes * 60000).toISOString();

        const { data } = await supabase
            .from('alignment_jobs')
            .update({ lock_expires_at: expiresAt })
            .eq('id', jobId)
            .eq('locked_by', workerId)
            .eq('status', 'running')
            .select('id')
            .maybeSingle();

        return !!data;
    }

    /**
     * Finalizes job status and releases lock.
     */
    async finalizeJob(jobId: string, status: 'succeeded' | 'failed', errorMsg?: string) {
        await supabase
            .from('alignment_jobs')
            .update({
                status: status,
                locked_by: null,
                finished_at: new Date().toISOString(),
                error_message_redacted: errorMsg ? errorMsg.substring(0, 500) : null // Redact/Truncate
            })
            .eq('id', jobId);
    }

    /**
     * Compares two snapshots and records a diff if meaningful changes are found.
     */
    async createDiff(orgId: string, projectId: string, currentSnap: PageSnapshot, previousSnap: PageSnapshot) {
        const changes: any = {};

        // Compare Title
        if (currentSnap.title !== previousSnap.title) {
            changes.title = { from: previousSnap.title, to: currentSnap.title };
        }

        // Compare H1 (Simple array comparison)
        if (JSON.stringify(currentSnap.h1?.sort()) !== JSON.stringify(previousSnap.h1?.sort())) {
            changes.h1 = { from: previousSnap.h1, to: currentSnap.h1 };
        }

        // Compare Text Similarity (Naive length check for now, logic can be improved)
        const textDiff = Math.abs(currentSnap.extracted_text.length - previousSnap.extracted_text.length);
        if (textDiff > 100) {
            changes.content_length = { diff: textDiff, direction: currentSnap.extracted_text.length > previousSnap.extracted_text.length ? 'increased' : 'decreased' };
        }

        if (Object.keys(changes).length > 0) {
            await supabase.from('page_snapshot_diffs').insert({
                org_id: orgId,
                project_id: projectId,
                previous_snapshot_id: previousSnap.id,
                current_snapshot_id: currentSnap.id,
                diff_summary: changes,
                severity: 'low' // Default, upgrade logic can be added
            });
            logger.info('Diff created', { projectId, changes: Object.keys(changes) });
        }
    }

    /**
     * Checks if alerts need to be emitted and dispatches webhooks.
     */
    async emitAlertIfNeeded(report: any) {
        // Condition: Low Score (< 50) OR Tracking Issues
        const isCritical = report.score < 50;
        const hasTrackingIssues = report.tracking_health && (!report.tracking_health.has_pixel || !report.tracking_health.has_utm);

        if (!isCritical && !hasTrackingIssues) return;

        // 1. Create Internal Alert
        const { data: alert } = await supabase.from('alignment_alerts').insert({
            org_id: report.org_id,
            project_id: report.project_id,
            severity: isCritical ? 'high' : 'medium',
            type: isCritical ? 'low_score' : 'tracking_missing',
            message: isCritical ? `Critical Alignment Score: ${report.score}` : 'Tracking Pixel/UTM Missing',
            report_id: report.id,
            status: 'open'
        }).select('id').single();

        // 2. Fetch Notifications Config
        const { data: notifications } = await supabase
            .from('outbound_notifications')
            .select('*')
            .eq('project_id', report.project_id)
            .eq('enabled', true);

        if (!notifications || notifications.length === 0) return;

        // 3. Dispatch (Mocking the actual HTTP call here, ideally queued)
        for (const notif of notifications) {
            try {
                // Fetch secret
                const { data: secretData } = await supabase
                    .from('secret_refs')
                    .select('secret_id_ref')
                    .eq('id', notif.webhook_secret_ref_id)
                    .single();

                if (secretData) {
                    // In a real worker, we decrypt and POST. 
                    // For now, logging the intent.
                    logger.info(`[MOCK] Dispatching Webhook to ${notif.channel}`, {
                        alertId: alert?.id,
                        reason: isCritical ? 'Low Score' : 'Tracking'
                    });
                }
            } catch (e) {
                logger.error('Failed to dispatch notification', { error: e });
            }
        }
    }
}

export const alignmentOpsService = new AlignmentOpsService();
