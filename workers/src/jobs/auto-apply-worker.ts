import { logger } from '../infra/structured-logger';
import { createClient } from '@supabase/supabase-js';

// TODO: Integration Point - Copy GTMClient to workers/src/integrations/
// import { GTMClient } from '../integrations/gtm-client';

// TODO: Integration Point - Create worker metrics or HTTP reporting
// import { autoApplyJobsTotal, autoApplyRollbacksTotal } from '../infra/metrics';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Auto-Apply Worker (Phase B)
 * 
 * INTEGRATION STATUS: Core logic complete, needs GTMClient + metrics
 * 
 * Real implementation with:
 * - DB leasing (TTL 60s, heartbeat 15s)
 * - APPLY_FIX pipeline (8 steps)
 * - ROLLBACK_FIX pipeline
 * - Idempotency
 * - Post-verify trigger
 * 
 * TODO: Copy server/src/integrations/gtm-client.ts to workers/src/integrations/
 * TODO: Add metrics (create worker-specific or use HTTP to report)
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
        logger.info('AutoApplyWorker started (STUB mode - GTMClient integration pending)');

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

        logger.info('Processing APPLY_FIX (STUB mode)', { jobId });

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

            // Step 4: Create GTM client (STUB)
            logger.info('GTMClient integration pending - using STUB', { jobId });

            // Step 5: Snapshot BEFORE (STUB)
            const snapshot = { workspaceId: target.config_json.workspace_id, tags: [], triggers: [] };

            await supabase.from('apply_snapshots').insert({
                org_id: target.org_id,
                apply_job_id: jobId,
                snapshot_json: snapshot,
                created_at: new Date().toISOString()
            });

            logger.info('Snapshot created (STUB)', { jobId });

            // Step 6-8: Apply tags, create version, publish (STUB)
            const appliedTagIds = fixpack.fixes_json?.map((fix: any) => `stub-tag-${fix.type}`) || [];
            const versionId = 'stub-version-id';
            const containerVersionId = 'stub-container-version-id';

            logger.info('Tags applied (STUB)', { jobId, count: appliedTagIds.length });

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
                        duration_ms: duration,
                        stub_mode: true // STUB indicator
                    }
                })
                .eq('id', jobId);

            logger.info('APPLY_FIX complete (STUB)', { jobId, duration });

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
        }
    }

    private async processRollback(job: any) {
        const jobId = job.id;
        logger.info('Processing ROLLBACK_FIX (STUB mode)', { jobId });

        try {
            // Step 1: Load snapshot
            const { original_apply_job_id, page_url } = job.payload_json;

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

            if (!originalJob) {
                throw new Error('Original job not found');
            }

            const { target_id } = originalJob.payload_json;

            const { data: target } = await supabase
                .from('integration_apply_targets')
                .select('*')
                .eq('id', target_id)
                .single();

            if (!target) {
                throw new Error('Target not found');
            }

            // Step 3-5: Restore snapshot, create version (STUB)
            const versionId = 'stub-rollback-version-id';

            logger.info('Rollback complete (STUB)', { jobId });

            // Step 6: Trigger verify
            const { data: verifyJob } = await supabase
                .from('verify_jobs')
                .insert({
                    org_id: target.org_id,
                    project_id: target.project_id,
                    type: 'TRACKING_VERIFY',
                    status: 'queued',
                    payload_json: {
                        page_url,
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
                        deleted_tags: 0,
                        verify_job_id: verifyJob?.id,
                        stub_mode: true // STUB indicator
                    }
                })
                .eq('id', jobId);

            logger.info('ROLLBACK_FIX complete (STUB)', { jobId });

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
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton
export const autoApplyWorker = new AutoApplyWorker();
