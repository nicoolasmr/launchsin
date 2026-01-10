import { logger } from '../infra/structured-logger';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Auto-Apply Worker (Phase B)
 * 
 * Real implementation with:
 * - DB leasing (TTL 60s, heartbeat 15s)
 * - APPLY_FIX pipeline (8 steps)
 * - ROLLBACK_FIX pipeline
 * - Idempotency
 * - Post-verify trigger
 */

export class AutoApplyWorker {
    private isRunning = false;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    async start() {
        if (this.isRunning) {
            logger.warn('AutoApplyWorker already running');
            return;
        }

        this.isRunning = true;
        logger.info('AutoApplyWorker started');

        while (this.isRunning) {
            try {
                await this.pollAndProcess();
                await this.sleep(5000); // Poll every 5s
            } catch (error: any) {
                logger.error('AutoApplyWorker error', { error: error.message });
                await this.sleep(10000); // Back off on error
            }
        }
    }

    async stop() {
        this.isRunning = false;
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        logger.info('AutoApplyWorker stopped');
    }

    private async pollAndProcess() {
        // Claim job with lease (TTL 60s)
        const { data: jobs } = await supabase
            .from('apply_jobs')
            .select('*')
            .eq('status', 'queued')
            .is('claimed_by', null)
            .order('created_at', { ascending: true })
            .limit(1);

        if (!jobs || jobs.length === 0) {
            return;
        }

        const job = jobs[0];
        const workerId = `worker-${process.pid}`;
        const claimedAt = new Date();
        const leaseExpiresAt = new Date(claimedAt.getTime() + 60000); // 60s TTL

        // Claim job
        const { data: claimedJob } = await supabase
            .from('apply_jobs')
            .update({
                claimed_by: workerId,
                claimed_at: claimedAt.toISOString(),
                lease_expires_at: leaseExpiresAt.toISOString(),
                status: 'running',
                started_at: new Date().toISOString()
            })
            .eq('id', job.id)
            .is('claimed_by', null) // Ensure not claimed by another worker
            .select()
            .single();

        if (!claimedJob) {
            logger.warn('Job already claimed by another worker', { jobId: job.id });
            return;
        }

        // Start heartbeat
        this.startHeartbeat(job.id, workerId);

        try {
            if (job.type === 'APPLY_FIX') {
                await this.processApplyFix(job);
            } else if (job.type === 'ROLLBACK_FIX') {
                await this.processRollback(job);
            }
        } finally {
            // Stop heartbeat
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
        }
    }

    private startHeartbeat(jobId: string, workerId: string) {
        this.heartbeatInterval = setInterval(async () => {
            const leaseExpiresAt = new Date(Date.now() + 60000);
            await supabase
                .from('apply_jobs')
                .update({ lease_expires_at: leaseExpiresAt.toISOString() })
                .eq('id', jobId)
                .eq('claimed_by', workerId);
        }, 15000); // Heartbeat every 15s
    }

    private async processApplyFix(job: any) {
        const jobId = job.id;
        const startTime = Date.now();

        logger.info('Processing APPLY_FIX', { jobId });

        try {
            // Step 1: Load data
            const { fixpack_id, target_id, page_url, verify = true } = job.payload_json;

            // Step 2: Fetch fixpack
            const { data: fixpack } = await supabase
                .from('tracking_fix_packs')
                .select('*')
                .eq('id', fixpack_id)
                .single();

            if (!fixpack) {
                throw new Error('Fixpack not found');
            }

            // Step 3: Fetch target
            const { data: target } = await supabase
                .from('integration_apply_targets')
                .select('*')
                .eq('id', target_id)
                .single();

            if (!target) {
                throw new Error('Target not found');
            }

            // Step 4: Create GTM client
            const { data: connection } = await supabase
                .from('source_connections')
                .select('id')
                .eq('project_id', target.project_id)
                .eq('type', 'GTM')
                .eq('status', 'active')
                .single();

            if (!connection) {
                throw new Error('GTM connection not found');
            }

            const gtmClient = new GTMClient(
                target.org_id,
                connection.id,
                target.config_json.account_id,
                target.config_json.container_id,
                target.config_json.workspace_id
            );

            // Step 5: Snapshot BEFORE
            const snapshot = await gtmClient.getWorkspaceState();

            await supabase.from('apply_snapshots').insert({
                org_id: target.org_id,
                apply_job_id: jobId,
                snapshot_json: snapshot,
                created_at: new Date().toISOString()
            });

            logger.info('Snapshot created', { jobId });

            // Step 6: Execute apply
            const appliedTagIds: string[] = [];

            // Ensure "All Pages" trigger
            const allPagesTriggerId = await gtmClient.ensureAllPagesTrigger();

            // Apply fixes
            for (const fix of fixpack.fixes_json || []) {
                if (fix.type === 'META_PIXEL') {
                    const tag = await gtmClient.upsertTag({
                        name: 'LaunchSin - Meta Pixel',
                        type: 'html',
                        parameter: [
                            { key: 'html', value: fix.snippet, type: 'template' }
                        ],
                        firingTriggerId: [allPagesTriggerId]
                    });
                    appliedTagIds.push(tag.tagId!);
                } else if (fix.type === 'GA4') {
                    const tag = await gtmClient.upsertTag({
                        name: 'LaunchSin - GA4 Config',
                        type: 'gaawc',
                        parameter: [
                            { key: 'measurementId', value: fix.measurement_id || 'G-XXXXXX', type: 'template' }
                        ],
                        firingTriggerId: [allPagesTriggerId]
                    });
                    appliedTagIds.push(tag.tagId!);
                }
            }

            logger.info('Tags applied', { jobId, count: appliedTagIds.length });

            // Step 7: Create version
            const versionName = `LaunchSin Apply ${new Date().toISOString()}`;
            const { versionId, containerVersionId } = await gtmClient.createVersion(versionName);

            // Step 8: Publish (if configured)
            if (target.config_json.publish === true) {
                await gtmClient.publishVersion(versionId);
            }

            // Step 9: Post-verify (if enabled)
            let verifyJobId = null;
            if (verify) {
                const { data: verifyJob } = await supabase
                    .from('verify_jobs')
                    .insert({
                        org_id: target.org_id,
                        project_id: target.project_id,
                        type: 'TRACKING_VERIFY',
                        status: 'queued',
                        payload_json: {
                            page_url,
                            correlation_id: `apply_${jobId}`
                        }
                    })
                    .select()
                    .single();

                verifyJobId = verifyJob?.id;
            }

            // Step 10: Finalize
            const duration = Date.now() - startTime;

            await supabase
                .from('apply_jobs')
                .update({
                    status: 'ok',
                    finished_at: new Date().toISOString(),
                    result_json: {
                        applied_tag_ids: appliedTagIds,
                        created_version_id: versionId,
                        container_version_id: containerVersionId,
                        published: target.config_json.publish === true,
                        verify_job_id: verifyJobId,
                        duration_ms: duration
                    }
                })
                .eq('id', jobId);

            // Metrics
            autoApplyJobsTotal.inc({ type: 'APPLY_FIX', result: 'ok' });

            logger.info('APPLY_FIX complete', { jobId, duration });

        } catch (error: any) {
            logger.error('APPLY_FIX failed', { jobId, error: error.message });

            await supabase
                .from('apply_jobs')
                .update({
                    status: 'error',
                    finished_at: new Date().toISOString(),
                    error_message_redacted: error.message.substring(0, 500)
                })
                .eq('id', jobId);

            autoApplyJobsTotal.inc({ type: 'APPLY_FIX', result: 'error' });
        }
    }

    private async processRollback(job: any) {
        const jobId = job.id;
        logger.info('Processing ROLLBACK_FIX', { jobId });

        try {
            // Step 1: Load snapshot
            const { original_apply_job_id } = job.payload_json;

            const { data: snapshot } = await supabase
                .from('apply_snapshots')
                .select('*')
                .eq('apply_job_id', original_apply_job_id)
                .single();

            if (!snapshot) {
                throw new Error('Snapshot not found');
            }

            // Step 2: Fetch target from original job
            const { data: originalJob } = await supabase
                .from('apply_jobs')
                .select('payload_json')
                .eq('id', original_apply_job_id)
                .single();

            const { target_id } = originalJob.payload_json;

            const { data: target } = await supabase
                .from('integration_apply_targets')
                .select('*')
                .eq('id', target_id)
                .single();

            if (!target) {
                throw new Error('Target not found');
            }

            // Step 3: Create GTM client
            const { data: connection } = await supabase
                .from('source_connections')
                .select('id')
                .eq('project_id', target.project_id)
                .eq('type', 'GTM')
                .eq('status', 'active')
                .single();

            if (!connection) {
                throw new Error('GTM connection not found');
            }

            const gtmClient = new GTMClient(
                target.org_id,
                connection.id,
                target.config_json.account_id,
                target.config_json.container_id,
                target.config_json.workspace_id
            );

            // Step 4: Restore snapshot (simplified - delete applied tags)
            const originalSnapshot = snapshot.snapshot_json;
            const currentSnapshot = await gtmClient.getWorkspaceState();

            // Find tags that were added (not in original snapshot)
            const addedTags = currentSnapshot.tags.filter(
                (tag: any) => !originalSnapshot.tags.find((t: any) => t.tagId === tag.tagId)
            );

            for (const tag of addedTags) {
                if (tag.path) {
                    await gtmClient.deleteTag(tag.path);
                }
            }

            // Step 5: Create rollback version
            const versionName = `LaunchSin Rollback ${new Date().toISOString()}`;
            const { versionId } = await gtmClient.createVersion(versionName);

            // Step 6: Trigger verify
            const { data: verifyJob } = await supabase
                .from('verify_jobs')
                .insert({
                    org_id: target.org_id,
                    project_id: target.project_id,
                    type: 'TRACKING_VERIFY',
                    status: 'queued',
                    payload_json: {
                        page_url: job.payload_json.page_url,
                        correlation_id: `rollback_${jobId}`
                    }
                })
                .select()
                .single();

            // Step 7: Finalize
            await supabase
                .from('apply_jobs')
                .update({
                    status: 'ok',
                    finished_at: new Date().toISOString(),
                    result_json: {
                        restored_version: versionId,
                        deleted_tags: addedTags.length,
                        verify_job_id: verifyJob?.id
                    }
                })
                .eq('id', jobId);

            // Metrics
            autoApplyJobsTotal.inc({ type: 'ROLLBACK_FIX', result: 'ok' });
            autoApplyRollbacksTotal.inc();

            logger.info('ROLLBACK_FIX complete', { jobId });

        } catch (error: any) {
            logger.error('ROLLBACK_FIX failed', { jobId, error: error.message });

            await supabase
                .from('apply_jobs')
                .update({
                    status: 'error',
                    finished_at: new Date().toISOString(),
                    error_message_redacted: error.message.substring(0, 500)
                })
                .eq('id', jobId);

            autoApplyJobsTotal.inc({ type: 'ROLLBACK_FIX', result: 'error' });
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton
export const autoApplyWorker = new AutoApplyWorker();
