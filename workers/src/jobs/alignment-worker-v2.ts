
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { PageExtractor } from '../infra/page-extractor';
import { withPage } from '../infra/browser';
import { MetaCreativeFetch } from '../infra/meta-creative-fetch';
import { alignmentScorer } from '../domain/alignment-scorer';
import { secretsManager } from '../shared/secrets';
import { v4 as uuidv4 } from 'uuid';

// Supabase Service Role (Module Level for ease of use in methods)
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CHECK_INTERVAL_MS = 10000;

export class AlignmentWorkerV2 {
    private isRunning = false;
    private redis: Redis;

    constructor() {
        this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    }

    async start() {
        logger.info('Starting AlignmentWorkerV2...');
        setInterval(() => this.loop(), CHECK_INTERVAL_MS);
    }

    async loop() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            // Leader Election (Simple)
            const isLeader = await this.acquireLock('alignment_v2_leader', 15); // 15s ttl
            if (!isLeader) {
                // Not leader, idle
                return;
            }

            // Fetch Queued Jobs
            // Limit concurrency per org??
            // Simplified: Fetch 10 queued jobs.
            const { data: jobs, error } = await supabase
                .from('alignment_jobs')
                .select('*')
                .eq('status', 'queued')
                .limit(10)
                .order('created_at', { ascending: true });

            if (error) throw error;
            if (!jobs || jobs.length === 0) return;

            // Process Parallel
            await Promise.all(jobs.map(job => this.processJob(job)));

        } catch (error: any) {
            logger.error('AlignmentWorker V2 Loop Error', { error: error.message });
        } finally {
            this.isRunning = false;
        }
    }

    async processJob(job: any) {
        const jobId = job.id;
        const orgId = job.org_id;

        try {
            // 1. Mark Running
            await supabase.from('alignment_jobs').update({ status: 'running' }).eq('id', jobId);

            // 2. Fetch Secrets (Token)
            const token = await this.getAccessToken(job.source_connection_id, orgId);

            // 3. Fetch Ad
            const ad = await MetaCreativeFetch.fetch(job.ad_id, token);

            // 4. Scrape Page
            const snapshot = await withPage(async (page) => {
                await page.goto(job.landing_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                return await PageExtractor.extract(page, job.landing_url);
            });

            // 5. Upload Screenshot
            let screenshotPath = null;
            if (snapshot.screenshotBuffer) {
                const path = `${orgId}/${job.project_id}/${job.ad_id}_${Date.now()}.jpg`;
                const { error: uploadError } = await supabase.storage
                    .from('alignment')
                    .upload(path, snapshot.screenshotBuffer, { contentType: 'image/jpeg' });

                if (!uploadError) screenshotPath = path;
                else logger.error('Screenshot upload failed', { error: uploadError });
            }

            // 6. Score
            const report = await alignmentScorer.score(ad, snapshot);

            // 7. Save Report
            const { data: reportRows, error: reportError } = await supabase
                .from('alignment_reports_v2')
                .insert({
                    org_id: orgId,
                    project_id: job.project_id,
                    source_connection_id: job.source_connection_id,
                    ad_id: job.ad_id,
                    landing_url: job.landing_url,
                    score: report.score,
                    dimensions: report.dimensions,
                    evidence: report.evidence,
                    recommendations: report.recommendations,
                    confidence_score: report.confidence,
                    model_info: report.model_info
                })
                .select('id')
                .single();

            if (reportError) throw reportError;
            const reportId = reportRows.id;

            // 8. Save Snapshot Metadata
            await supabase.from('page_snapshots').insert({
                org_id: orgId,
                project_id: job.project_id,
                url: job.landing_url,
                content_text: snapshot.contentText,
                meta: { ...snapshot.meta, ctas: snapshot.ctas, h1: snapshot.h1 },
                screenshot_path: screenshotPath
            });

            // 9. Create Alerts if needed
            if (report.score < 70) {
                await supabase.from('alignment_alerts').insert({
                    org_id: orgId,
                    project_id: job.project_id,
                    severity: report.score < 50 ? 'high' : 'med',
                    type: 'low_score',
                    message: `Low Alignment Score: ${report.score}`,
                    report_id: reportId
                });
            }

            // 10. Mark Success
            await supabase.from('alignment_jobs').update({ status: 'success' }).eq('id', jobId);

        } catch (error: any) {
            logger.error(`Job ${jobId} failed`, { error: error.message });
            await supabase.from('alignment_jobs').update({ status: 'failed' }).eq('id', jobId);
        }
    }

    private async acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
        const result = await this.redis.set(key, 'locked', 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }

    private async getAccessToken(connectionId: string, orgId: string): Promise<string> {
        const keyName = `meta_token_${connectionId}`;
        const { data } = await supabase
            .from('secret_refs')
            .select('secret_id_ref')
            .eq('key_name', keyName)
            .eq('org_id', orgId)
            .single();

        if (!data) throw new Error(`Token not found for connection ${connectionId}`);
        return secretsManager.decrypt(data.secret_id_ref);
    }
}

export const alignmentWorkerV2 = new AlignmentWorkerV2();
