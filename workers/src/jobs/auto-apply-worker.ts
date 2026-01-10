import { logger } from '../infra/structured-logger';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Auto-Apply Worker (Phase D)
 * 
 * PLACEHOLDER: Requires GTM API client and OAuth
 * 
 * To implement:
 * 1. Poll apply_jobs table for queued jobs
 * 2. Process APPLY_FIX and ROLLBACK_FIX jobs
 * 3. Create snapshots before apply
 * 4. Apply changes via GTM API
 * 5. Trigger VERIFY_TRACKING automatically
 */

export class AutoApplyWorker {
    private isRunning = false;

    async start() {
        if (this.isRunning) {
            logger.warn('AutoApplyWorker already running');
            return;
        }

        this.isRunning = true;
        logger.info('AutoApplyWorker started (STUB)');

        while (this.isRunning) {
            try {
                await this.pollAndProcess();
                await this.sleep(10000); // Poll every 10s
            } catch (error: any) {
                logger.error('AutoApplyWorker error', { error: error.message });
                await this.sleep(30000); // Back off on error
            }
        }
    }

    async stop() {
        this.isRunning = false;
        logger.info('AutoApplyWorker stopped');
    }

    private async pollAndProcess() {
        // STUB: In production, query apply_jobs for queued jobs
        const { data: jobs } = await supabase
            .from('apply_jobs')
            .select('*')
            .eq('status', 'queued')
            .order('created_at', { ascending: true })
            .limit(1);

        if (!jobs || jobs.length === 0) {
            return;
        }

        const job = jobs[0];

        if (job.type === 'APPLY_FIX') {
            await this.processApplyFix(job);
        } else if (job.type === 'ROLLBACK_FIX') {
            await this.processRollback(job);
        }
    }

    private async processApplyFix(job: any) {
        const jobId = job.id;
        logger.info('Processing APPLY_FIX (STUB)', { jobId });

        try {
            // Update job to running
            await supabase
                .from('apply_jobs')
                .update({ status: 'running', started_at: new Date().toISOString() })
                .eq('id', jobId);

            // STUB: In production:
            // 1. Fetch target config
            // 2. Create GTM client
            // 3. Snapshot current state
            // 4. Apply changes (create/update tags)
            // 5. Create version
            // 6. Trigger VERIFY_TRACKING

            logger.info('APPLY_FIX complete (STUB)', { jobId });

            // Update job to ok
            await supabase
                .from('apply_jobs')
                .update({
                    status: 'ok',
                    finished_at: new Date().toISOString(),
                    result_json: {
                        applied_tag_ids: ['tag-stub-1', 'tag-stub-2'],
                        version: 'version-stub',
                        verify_job_id: null
                    }
                })
                .eq('id', jobId);

            // Metrics
            autoApplyJobsTotal.inc({ type: 'APPLY_FIX', result: 'ok' });

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
        logger.info('Processing ROLLBACK_FIX (STUB)', { jobId });

        try {
            // Update job to running
            await supabase
                .from('apply_jobs')
                .update({ status: 'running', started_at: new Date().toISOString() })
                .eq('id', jobId);

            // STUB: In production:
            // 1. Fetch apply_snapshots for original job
            // 2. Create GTM client
            // 3. Restore previous version
            // 4. Trigger VERIFY_TRACKING

            logger.info('ROLLBACK_FIX complete (STUB)', { jobId });

            // Update job to ok
            await supabase
                .from('apply_jobs')
                .update({
                    status: 'ok',
                    finished_at: new Date().toISOString(),
                    result_json: {
                        restored_version: 'version-stub-previous',
                        verify_job_id: null
                    }
                })
                .eq('id', jobId);

            // Metrics
            autoApplyJobsTotal.inc({ type: 'ROLLBACK_FIX', result: 'ok' });
            autoApplyRollbacksTotal.inc();

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
