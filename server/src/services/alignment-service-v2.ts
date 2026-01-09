
import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';

export interface CheckPayload {
    connectionId: string;
    ad_id: string;
    landing_url: string;
    project_id: string;
    org_id: string;
    user_id: string;
}

export class AlignmentServiceV2 {

    async enqueueCheck(payload: CheckPayload) {
        const { data, error } = await supabase
            .from('alignment_jobs')
            .insert({
                org_id: payload.org_id,
                project_id: payload.project_id,
                source_connection_id: payload.connectionId,
                ad_id: payload.ad_id,
                landing_url: payload.landing_url,
                requested_by: payload.user_id,
                status: 'queued'
            })
            .select('id')
            .single();

        if (error) throw error;
        return data.id;
    }

    async listReports(projectId: string, filters: any = {}) {
        let query = supabase
            .from('alignment_reports_v2')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (filters.min_score) query = query.gte('score', filters.min_score);
        if (filters.max_score) query = query.lte('score', filters.max_score);
        if (filters.limit) query = query.limit(filters.limit);

        const { data, error } = await query;
        if (error) throw error;

        return data.map(this.safeDTO);
    }

    async getReport(projectId: string, reportId: string) {
        const { data, error } = await supabase
            .from('alignment_reports_v2')
            .select('*')
            .eq('project_id', projectId)
            .eq('id', reportId)
            .single();

        if (error) throw error;

        // Fetch Screenshot URL
        const { data: snapshot } = await supabase
            .from('page_snapshots')
            .select('screenshot_path')
            .eq('project_id', projectId)
            .eq('url', data.landing_url)
            .order('fetched_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        let screenshotUrl = null;
        if (snapshot?.screenshot_path) {
            const { data: sign } = await supabase.storage
                .from('alignment')
                .createSignedUrl(snapshot.screenshot_path, 3600);
            screenshotUrl = sign?.signedUrl;
        }

        // Fetch Diff
        const { data: diff } = await supabase
            .from('page_snapshot_diffs')
            .select('diff_summary, severity')
            // @ts-ignore
            .eq('current_snapshot_id', data.page_snapshot_id)
            .maybeSingle();

        return {
            ...this.safeDTO(data),
            screenshot_url: screenshotUrl,
            diff: diff ? { summary: diff.diff_summary, severity: diff.severity } : null
        };
    }

    async getOverview(projectId: string) {
        // Aggregations
        // Supabase/Postgrest simple aggregations via RPC or client-side?
        // Client-side for MVP if volume low, or separate queries.

        const { count: trackingFailures } = await supabase
            .from('alignment_alerts')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .eq('type', 'tracking_missing')
            .eq('status', 'open');

        const { count: lowScores } = await supabase
            .from('alignment_alerts')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .eq('type', 'low_score')
            .eq('status', 'open');

        // Avg Score 7d
        const { data: reports } = await supabase
            .from('alignment_reports_v2')
            .select('score')
            .eq('project_id', projectId)
            .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());

        const avgScore = reports?.length
            ? Math.round(reports.reduce((a, b) => a + b.score, 0) / reports.length)
            : 0;

        // Last Run
        const { data: lastJob } = await supabase
            .from('alignment_jobs')
            .select('created_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        return {
            avg_score_7d: avgScore,
            low_score_count: lowScores || 0,
            tracking_fail_count: trackingFailures || 0,
            last_run_at: lastJob?.created_at || null
        };
    }

    async resolveAlerts(projectId: string, reportId: string, reason: string) {
        const { error } = await supabase
            .from('alignment_alerts')
            .update({ status: 'resolved', resolved_at: new Date().toISOString() })
            .eq('project_id', projectId)
            .eq('report_id', reportId);

        if (error) throw error;
        return { success: true };
    }

    // SafeDTO: Whitelist fields to return
    private safeDTO(report: any) {
        // Strip sensitive if any (model_info might have details, though we try to avoid saving them)
        // Ensure no internal backend IDs or secrets
        const {
            org_id, source_connection_id, model_info, ...rest
        } = report;

        // If model_info is present, ensure no keys
        let safeModelInfo = model_info ? { model: model_info.model } : null;

        return {
            ...rest,
            model_info: safeModelInfo
        };
    }
}

export const alignmentServiceV2 = new AlignmentServiceV2();
