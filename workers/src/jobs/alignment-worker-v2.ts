import { BaseJob } from '../shared/base-job';
import { logger } from '../infra/structured-logger';
import { supabase } from '../infra/supabase';
import { AlignmentOps } from '../domain/alignment-ops';

export class AlignmentWorkerV2 extends BaseJob {
    private isRunning = false;

    constructor() {
        super('alignment_v2_worker');
    }

    async start() {
        if (this.isRunning) {
            logger.warn('AlignmentWorkerV2 already running');
            return;
        }

        this.isRunning = true;
        logger.info('AlignmentWorkerV2 started');

        while (this.isRunning) {
            try {
                await this.pollAndProcess();
                await this.sleep(5000); // Poll every 5s
            } catch (error: any) {
                logger.error('AlignmentWorkerV2 error', { error: error.message });
                await this.sleep(10000); // Back off on error
            }
        }
    }

    async stop() {
        this.isRunning = false;
        logger.info('AlignmentWorkerV2 stopped');
    }

    private async pollAndProcess() {
        const { data: jobs } = await supabase
            .from('alignment_jobs')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);

        if (!jobs || jobs.length === 0) {
            return;
        }

        const job = jobs[0];
        await this.processJob(job);
    }

    private async processJob(job: any) {
        const jobId = job.id;
        const correlationId = `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        logger.info('Starting job processing', { jobId, correlation_id: correlationId });

        // Update job with correlation_id and started_at
        await supabase
            .from('alignment_jobs')
            .update({
                correlation_id: correlationId,
                started_at: new Date().toISOString(),
                status: 'running'
            })
            .eq('id', jobId);

        try {
            // Process the alignment job
            const ops = new AlignmentOps();

            // Fetch schedule details
            const { data: schedule } = await supabase
                .from('alignment_schedules')
                .select('*')
                .eq('id', job.schedule_id)
                .single();

            if (!schedule) {
                throw new Error('Schedule not found');
            }

            // Process each target URL
            for (const url of schedule.target_urls_json || []) {
                logger.info('Processing URL', { url, jobId, correlation_id: correlationId });

                // Scrape page
                const snapshot = await ops.scrapePage(url);

                // Score alignment
                const report = await ops.scoreAlignment({
                    org_id: job.org_id,
                    project_id: job.project_id,
                    schedule_id: job.schedule_id,
                    landing_url: url,
                    ad_id: job.ad_id || 'unknown',
                    snapshot
                });

                // Dispatch alerts if needed
                await ops.dispatchAlerts(report);

                logger.info('URL processed successfully', { url, reportId: report.id, correlation_id: correlationId });
            }

            // Mark job as completed
            await supabase
                .from('alignment_jobs')
                .update({
                    status: 'completed',
                    finished_at: new Date().toISOString()
                })
                .eq('id', jobId);

            logger.info('Job completed successfully', { jobId, correlation_id: correlationId });

        } catch (error: any) {
            logger.error('Job processing failed', {
                jobId,
                error: error.message,
                correlation_id: correlationId
            });

            // Mark job as failed
            await supabase
                .from('alignment_jobs')
                .update({
                    status: 'failed',
                    error_message_redacted: error.message.substring(0, 500),
                    finished_at: new Date().toISOString()
                })
                .eq('id', jobId);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
