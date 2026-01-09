
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import { secretsManager } from '../shared/secrets';
import axios from 'axios';
import crypto from 'crypto';

// Supabase Client (Service Role)
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface PageSnapshot {
    id: string;
    url: string;
    title: string;
    h1: string[];
    ctas: string[];
    content_text?: string;
    meta: any;
}

export class AlignmentOps {

    /**
     * LEASING
     */
    async claimJobWithLease(jobId: string, workerInstanceId: string): Promise<boolean> {
        const leaseDurationMinutes = 2;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + leaseDurationMinutes * 60000).toISOString();

        // 1. Try to claim if queued
        const { data: claimed } = await supabase
            .from('alignment_jobs')
            .update({
                status: 'running',
                locked_by: workerInstanceId,
                lock_expires_at: expiresAt,
                started_at: now.toISOString()
            })
            .eq('id', jobId)
            .eq('status', 'queued')
            .select('id')
            .maybeSingle();

        if (claimed) return true;

        // 2. Reclaim if dead
        const { data: reclaimed } = await supabase
            .from('alignment_jobs')
            .update({
                locked_by: workerInstanceId,
                lock_expires_at: expiresAt,
                error_message_redacted: 'Job reclaimed (worker crash detected)'
            })
            .eq('id', jobId)
            .eq('status', 'running')
            .lt('lock_expires_at', now.toISOString())
            .select('id')
            .maybeSingle();

        return !!reclaimed;
    }

    async heartbeatLease(jobId: string, workerInstanceId: string): Promise<boolean> {
        const leaseDurationMinutes = 2;
        const expiresAt = new Date(Date.now() + leaseDurationMinutes * 60000).toISOString();

        const { data } = await supabase
            .from('alignment_jobs')
            .update({ lock_expires_at: expiresAt })
            .eq('id', jobId)
            .eq('locked_by', workerInstanceId)
            .eq('status', 'running')
            .select('id')
            .maybeSingle();

        return !!data;
    }

    /**
     * DIFFING
     */
    async processDiff(orgId: string, projectId: string, currentSnapshot: PageSnapshot) {
        // Fetch previous snapshot
        const { data: prevSnap } = await supabase
            .from('page_snapshots')
            .select('*')
            .eq('project_id', projectId)
            .eq('url', currentSnapshot.url)
            .neq('id', currentSnapshot.id) // Not the one we just saved
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!prevSnap) return;

        const changes: any = {};

        // Title
        if (currentSnapshot.title !== prevSnap.title) {
            changes.title = { from: prevSnap.title, to: currentSnapshot.title };
        }

        // H1
        const currH1 = JSON.stringify(currentSnapshot.h1?.sort() || []);
        const prevH1 = JSON.stringify(prevSnap.h1?.sort() || []);
        if (currH1 !== prevH1) {
            changes.h1 = { from: prevSnap.h1, to: currentSnapshot.h1 };
        }

        // CTAs
        const currCtas = JSON.stringify(currentSnapshot.ctas?.sort() || []);
        const prevCtas = JSON.stringify(prevSnap.ctas?.sort() || []);
        if (currCtas !== prevCtas) {
            changes.ctas = { from: prevSnap.ctas, to: currentSnapshot.ctas };
        }

        if (Object.keys(changes).length > 0) {
            await supabase.from('page_snapshot_diffs').insert({
                org_id: orgId,
                project_id: projectId,
                previous_snapshot_id: prevSnap.id,
                current_snapshot_id: currentSnapshot.id,
                diff_summary: changes,
                severity: 'low'
            });
            logger.info(`Recorded diff for ${currentSnapshot.url}`);
        }
    }

    /**
     * ALERTING (Webhook) with Deduplication
     */
    async dispatchAlerts(report: any) {
        // Logic: Score < 50 OR Tracking Missing
        const isCritical = report.score < 50;
        const tracking = report.tracking_health || {};

        const trackingMissing = (tracking.has_pixel === false) || (tracking.has_utm === false);

        if (!isCritical && !trackingMissing) return;

        // Generate fingerprint for dedup
        const alertType = isCritical ? 'low_score' : 'tracking_missing';
        const fingerprint = this.generateAlertFingerprint(
            report.project_id,
            report.landing_url,
            report.ad_id,
            alertType
        );

        // Check if alert already exists today
        const today = new Date().toISOString().split('T')[0];
        const { data: existingAlert } = await supabase
            .from('alignment_alerts')
            .select('id, suppressed_count')
            .eq('project_id', report.project_id)
            .eq('alert_fingerprint', fingerprint)
            .gte('created_at', `${today}T00:00:00Z`)
            .maybeSingle();

        if (existingAlert) {
            // Alert already exists today - increment suppressed count
            await supabase
                .from('alignment_alerts')
                .update({ suppressed_count: (existingAlert.suppressed_count || 0) + 1 })
                .eq('id', existingAlert.id);

            logger.info('Alert suppressed (dedup)', {
                fingerprint,
                alert_id: existingAlert.id,
                alert_suppressed: true
            });
            return; // Don't send webhook
        }

        // 1. Create Internal Alert
        const { data: alert } = await supabase.from('alignment_alerts').insert({
            org_id: report.org_id,
            project_id: report.project_id,
            severity: isCritical ? 'high' : 'medium',
            type: alertType,
            message: isCritical ? `Critical Score: ${report.score}` : 'Tracking issues detected',
            report_id: report.id,
            status: 'open',
            alert_fingerprint: fingerprint,
            suppressed_count: 0
        }).select('id').single();

        // 2. Fetch Webhooks
        const { data: notifs } = await supabase
            .from('outbound_notifications')
            .select('*')
            .eq('project_id', report.project_id)
            .eq('enabled', true);

        if (!notifs || notifs.length === 0) return;

        for (const notif of notifs) {
            try {
                const { data: secretRef } = await supabase
                    .from('secret_refs')
                    .select('secret_id_ref')
                    .eq('id', notif.webhook_secret_ref_id)
                    .single();

                if (secretRef) {
                    let webhookUrl = secretRef.secret_id_ref;

                    const payload = {
                        text: `🚨 *LaunchSin Alert* 🚨\n\n**Project:** ${report.project_id}\n**Issue:** ${alertType}\n**Score:** ${report.score}\n**URL:** ${report.landing_url}\n**Report:** ${process.env.NEXT_PUBLIC_APP_URL || 'https://launchsin.com'}/projects/${report.project_id}/integrations/alignment?report=${report.id}`
                    };

                    await axios.post(webhookUrl, payload);
                    logger.info(`Webhook sent to ${notif.channel}`);

                    // Update last_sent_at and total_sent
                    await supabase
                        .from('outbound_notifications')
                        .update({
                            last_sent_at: new Date().toISOString(),
                            total_sent: (notif.total_sent || 0) + 1
                        })
                        .eq('id', notif.id);
                }
            } catch (e) {
                logger.error('Webhook dispatch failed', { error: e });
            }
        }
    }

    /**
     * Generate alert fingerprint for deduplication
     */
    private generateAlertFingerprint(
        projectId: string,
        url: string,
        adId: string,
        type: string
    ): string {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const input = `${projectId}|${url}|${adId}|${type}|${today}`;
        return crypto.createHash('sha256').update(input).digest('hex');
    }
}

export const alignmentOps = new AlignmentOps();
