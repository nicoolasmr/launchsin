import { logger } from '../infra/structured-logger';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// LLM Pricing (from ENV or defaults)
const LLM_PRICING = process.env.LLM_PRICING_JSON
    ? JSON.parse(process.env.LLM_PRICING_JSON)
    : {
        'gpt-4o': { prompt_per_1k: 0.01, completion_per_1k: 0.03 },
        'gpt-4o-mini': { prompt_per_1k: 0.0015, completion_per_1k: 0.006 }
    };

export class AlignmentWorkerV2 {
    private isRunning = false;

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
            // Fetch schedule details
            const { data: schedule } = await supabase
                .from('alignment_schedules')
                .select('*')
                .eq('id', job.schedule_id)
                .single();

            if (!schedule) {
                throw new Error('Schedule not found');
            }

            // Fetch ad and page content
            const adContent = await this.fetchAdContent(schedule.project_id);
            const pageContent = await this.fetchPageContent(schedule.project_id);

            // Compute cache key
            const adHash = this.computeHash(JSON.stringify(adContent));
            const pageHash = this.computeHash(JSON.stringify(pageContent));
            const cacheKey = this.computeHash(`${adHash}:${pageHash}`);

            logger.info('Cache key computed', { jobId, cacheKey });

            // Check for force_refresh flag
            const forceRefresh = job.metadata?.force_refresh === true;

            // Try cache lookup (if not force_refresh)
            let cachedReport = null;
            if (!forceRefresh) {
                cachedReport = await this.lookupCache(schedule.project_id, cacheKey);
            }

            if (cachedReport) {
                // Cache hit! Create new report from cached data
                logger.info('Cache hit', { jobId, cached_from: cachedReport.id });

                const { data: newReport } = await supabase
                    .from('alignment_reports_v2')
                    .insert({
                        project_id: schedule.project_id,
                        schedule_id: schedule.id,
                        job_id: jobId,
                        alignment_score: cachedReport.alignment_score,
                        findings_json: cachedReport.findings_json,
                        golden_rule_json: cachedReport.golden_rule_json,
                        confidence_score: cachedReport.confidence_score,
                        cached: true,
                        cached_from_report_id: cachedReport.id,
                        cache_key: cacheKey,
                        cached_at: new Date().toISOString(),
                        cache_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                    })
                    .select()
                    .single();

                // Update job as completed
                await supabase
                    .from('alignment_jobs')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        report_id: newReport.id
                    })
                    .eq('id', jobId);

                logger.info('Job completed (cached)', { jobId, reportId: newReport.id });
                return;
            }

            // Cache miss - run LLM scorer
            logger.info('Cache miss - running LLM scorer', { jobId });

            const scoringResult = await this.runLLMScorer(adContent, pageContent);

            // Calculate cost
            const model = scoringResult.model || 'gpt-4o';
            const tokensPrompt = scoringResult.usage?.prompt_tokens || 0;
            const tokensCompletion = scoringResult.usage?.completion_tokens || 0;
            const costUsd = this.calculateCost(model, tokensPrompt, tokensCompletion);

            logger.info('LLM scoring complete', {
                jobId,
                model,
                tokensPrompt,
                tokensCompletion,
                costUsd
            });

            // Persist cost to ai_usage_events
            await supabase
                .from('ai_usage_events')
                .insert({
                    org_id: schedule.org_id,
                    project_id: schedule.project_id,
                    user_id: null, // Automated job
                    source: 'alignment',
                    model: model,
                    tokens_prompt: tokensPrompt,
                    tokens_completion: tokensCompletion,
                    cost_usd: costUsd
                });

            // Create alignment report
            const { data: newReport } = await supabase
                .from('alignment_reports_v2')
                .insert({
                    project_id: schedule.project_id,
                    schedule_id: schedule.id,
                    job_id: jobId,
                    alignment_score: scoringResult.alignment_score,
                    findings_json: scoringResult.findings,
                    golden_rule_json: scoringResult.golden_rule,
                    confidence_score: scoringResult.confidence,
                    cached: false,
                    cache_key: cacheKey
                })
                .select()
                .single();

            // Update job as completed
            await supabase
                .from('alignment_jobs')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    report_id: newReport.id
                })
                .eq('id', jobId);

            logger.info('Job completed (fresh)', { jobId, reportId: newReport.id, costUsd });

        } catch (error: any) {
            logger.error('Job processing failed', { jobId, error: error.message });

            await supabase
                .from('alignment_jobs')
                .update({
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                    error_message: error.message
                })
                .eq('id', jobId);
        }
    }

    /**
     * Compute SHA256 hash
     */
    private computeHash(content: string): string {
        return createHash('sha256').update(content).digest('hex');
    }

    /**
     * Lookup cache (7-day TTL, tenant-safe)
     */
    private async lookupCache(projectId: string, cacheKey: string): Promise<any | null> {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const { data } = await supabase
            .from('alignment_reports_v2')
            .select('*')
            .eq('project_id', projectId)
            .eq('cache_key', cacheKey)
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        return data || null;
    }

    /**
     * Calculate LLM cost
     */
    private calculateCost(model: string, tokensPrompt: number, tokensCompletion: number): number {
        const pricing = LLM_PRICING[model];
        if (!pricing) {
            logger.warn('Unknown model pricing', { model });
            return 0;
        }

        const promptCost = (tokensPrompt / 1000) * pricing.prompt_per_1k;
        const completionCost = (tokensCompletion / 1000) * pricing.completion_per_1k;

        return promptCost + completionCost;
    }

    /**
     * Fetch ad content (mock)
     */
    private async fetchAdContent(projectId: string): Promise<any> {
        // TODO: Implement actual ad content fetching
        return { ad_text: 'Sample ad content', ad_id: 'ad-123' };
    }

    /**
     * Fetch page content (mock)
     */
    private async fetchPageContent(projectId: string): Promise<any> {
        // TODO: Implement actual page content fetching
        return { page_text: 'Sample page content', page_url: 'https://example.com' };
    }

    /**
     * Run LLM scorer (mock)
     */
    private async runLLMScorer(adContent: any, pageContent: any): Promise<any> {
        // TODO: Implement actual LLM scoring
        return {
            model: 'gpt-4o',
            alignment_score: 85,
            findings: [{ issue: 'Sample finding', severity: 'medium' }],
            golden_rule: { rule: 'Sample rule' },
            confidence: 0.9,
            usage: {
                prompt_tokens: 1000,
                completion_tokens: 500
            }
        };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
export const alignmentWorkerV2 = new AlignmentWorkerV2();
