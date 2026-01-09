import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { supabase } from '../../infra/db';
import { logger } from '../../infra/structured-logger';
import { validateProjectAccess } from '../../middleware/rbac';

type Severity = 'critical' | 'high' | 'medium' | 'low';

const router = Router();

/**
 * GET /api/home/overview
 * Aggregated overview for Command Center
 * Security: SafeDTO + LeakGate + Tenant-scoped + RBAC (Viewer+)
 */
router.get(
    '/api/home/overview',
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Tenant resolution: Get user's org_id and project_ids
            const { data: memberships, error: membershipError } = await supabase
                .from('org_members')
                .select('org_id')
                .eq('user_id', userId);

            if (membershipError || !memberships || memberships.length === 0) {
                logger.warn('User has no org memberships', { user_id: userId });
                return res.json({
                    total_projects: 0,
                    integrations_health: null,
                    alignment_summary: null,
                    crm_summary: null,
                    ops_summary: null
                });
            }

            const orgId = memberships[0].org_id;

            // Get project_ids for this user
            const { data: projectMemberships } = await supabase
                .from('project_members')
                .select('project_id')
                .eq('user_id', userId);

            const projectIds = projectMemberships?.map(pm => pm.project_id) || [];

            // Aggregate: total_projects
            const { count: totalProjects } = await supabase
                .from('projects')
                .select('*', { count: 'exact', head: true })
                .eq('org_id', orgId);

            // Aggregate: integrations_health
            const { data: connections } = await supabase
                .from('source_connections')
                .select('status, last_sync_at')
                .in('project_id', projectIds);

            const activeConnections = connections?.filter(c => c.status === 'active').length || 0;
            const totalConnections = connections?.length || 0;

            // Aggregate: alignment_summary
            const { data: alignmentReports } = await supabase
                .from('alignment_reports_v2')
                .select('alignment_score')
                .in('project_id', projectIds)
                .order('created_at', { ascending: false })
                .limit(100);

            const avgScore = alignmentReports && alignmentReports.length > 0
                ? alignmentReports.reduce((sum, r) => sum + (r.alignment_score || 0), 0) / alignmentReports.length
                : null;

            const criticalCount = alignmentReports?.filter(r => (r.alignment_score || 0) < 50).length || 0;
            const warningCount = alignmentReports?.filter(r => (r.alignment_score || 0) >= 50 && (r.alignment_score || 0) < 70).length || 0;

            const { data: lastRun } = await supabase
                .from('alignment_jobs')
                .select('created_at')
                .in('project_id', projectIds)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            // Aggregate: crm_summary
            const { count: contactsCount } = await supabase
                .from('crm_contacts')
                .select('*', { count: 'exact', head: true })
                .in('project_id', projectIds);

            const { count: dealsCount } = await supabase
                .from('crm_deals')
                .select('*', { count: 'exact', head: true })
                .in('project_id', projectIds);

            // Aggregate: ops_summary
            const { count: dlqPending } = await supabase
                .from('dlq_events')
                .select('*', { count: 'exact', head: true })
                .in('project_id', projectIds)
                .is('resolved_at', null);

            const { count: alertsOpen } = await supabase
                .from('alignment_alerts')
                .select('*', { count: 'exact', head: true })
                .in('project_id', projectIds)
                .eq('status', 'open');

            // SafeDTO: Whitelist response
            const safeResponse = {
                total_projects: totalProjects || 0,
                integrations_health: {
                    active: activeConnections,
                    total: totalConnections,
                    health_pct: totalConnections > 0 ? Math.round((activeConnections / totalConnections) * 100) : 0
                },
                alignment_summary: avgScore !== null ? {
                    avg_score: Math.round(avgScore),
                    critical_count: criticalCount,
                    warning_count: warningCount,
                    last_run_at: lastRun?.created_at || null
                } : null,
                crm_summary: {
                    contacts_count: contactsCount || 0,
                    deals_count: dealsCount || 0
                },
                ops_summary: {
                    dlq_pending: dlqPending || 0,
                    alerts_open: alertsOpen || 0
                }
            };

            res.json(safeResponse);
        } catch (error: any) {
            logger.error('Home overview failed', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch overview' });
        }
    }
);

/**
 * GET /api/home/decisions
 * Decision Feed: Top actionable items
 * Security: SafeDTO + LeakGate + Tenant-scoped + RBAC (Viewer+)
 */
router.get(
    '/api/home/decisions',
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            // Tenant resolution
            const { data: projectMemberships } = await supabase
                .from('project_members')
                .select('project_id')
                .eq('user_id', userId);

            const projectIds = projectMemberships?.map(pm => pm.project_id) || [];

            if (projectIds.length === 0) {
                return res.json([]);
            }

            const decisions: any[] = [];

            // Decision 1: Critical alignment scores
            const { data: criticalReports } = await supabase
                .from('alignment_reports_v2')
                .select('id, project_id, page_url, alignment_score, created_at')
                .in('project_id', projectIds)
                .lt('alignment_score', 50)
                .order('created_at', { ascending: false })
                .limit(3);

            criticalReports?.forEach(report => {
                decisions.push({
                    id: `alignment-${report.id}`,
                    type: 'ALIGNMENT_CRITICAL',
                    severity: 'critical',
                    title: `Low alignment score (${report.alignment_score}%)`,
                    why: `Page ${report.page_url} has critical misalignment with ad creative`,
                    confidence: report.alignment_score,
                    next_actions: ['View Evidence', 'Generate Fix Pack'],
                    deep_links: [`/projects/${report.project_id}/integrations/alignment?filter=critical`]
                });
            });

            // Decision 2: Tracking missing
            const { data: trackingAlerts } = await supabase
                .from('alignment_alerts')
                .select('id, project_id, page_url, alert_type, created_at')
                .in('project_id', projectIds)
                .eq('alert_type', 'TRACKING_MISSING')
                .eq('status', 'open')
                .order('created_at', { ascending: false })
                .limit(2);

            trackingAlerts?.forEach(alert => {
                decisions.push({
                    id: `tracking-${alert.id}`,
                    type: 'TRACKING_MISSING',
                    severity: 'high',
                    title: 'Tracking pixel missing',
                    why: `Page ${alert.page_url} is missing critical tracking pixels`,
                    confidence: 100,
                    next_actions: ['Generate Fix Pack', 'Verify Tracking'],
                    deep_links: [`/projects/${alert.project_id}/integrations/alignment?tab=fixpacks`]
                });
            });

            // Decision 3: DLQ accumulating
            const { count: dlqCount } = await supabase
                .from('dlq_events')
                .select('*', { count: 'exact', head: true })
                .in('project_id', projectIds)
                .is('resolved_at', null);

            if (dlqCount && dlqCount > 10) {
                decisions.push({
                    id: 'dlq-accumulating',
                    type: 'DLQ_ACCUMULATING',
                    severity: 'high',
                    title: `${dlqCount} events in DLQ`,
                    why: 'Integration sync failures are accumulating',
                    confidence: null,
                    next_actions: ['View DLQ', 'Retry Failed'],
                    deep_links: ['/integrations/dlq']
                });
            }

            // Sort by severity
            const severityOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
            decisions.sort((a, b) => severityOrder[a.severity as Severity] - severityOrder[b.severity as Severity]);

            // SafeDTO: Whitelist response (top 10)
            const safeDecisions = decisions.slice(0, 10).map(d => ({
                id: d.id,
                type: d.type,
                severity: d.severity,
                title: d.title,
                why: d.why,
                confidence: d.confidence,
                next_actions: d.next_actions,
                deep_links: d.deep_links
            }));

            res.json(safeDecisions);
        } catch (error: any) {
            logger.error('Home decisions failed', { error: error.message });
            res.status(500).json({ error: 'Failed to fetch decisions' });
        }
    }
);

export default router;
