'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/design-system/atoms/Card';
import { Button } from '@/design-system/atoms/Button';
import { Badge } from '@/design-system/atoms/Badge';
import { PersonalizationModal } from '@/components/home/PersonalizationModal';

interface OverviewData {
    total_projects: number;
    integrations_health: { active: number; total: number; health_pct: number } | null;
    alignment_summary: { avg_score: number; critical_count: number; warning_count: number; last_run_at: string | null } | null;
    crm_summary: { contacts_count: number; deals_count: number };
    ops_summary: { dlq_pending: number; alerts_open: number };
    alignment_cache_hit_rate_24h: number;
    llm_cost_today_usd: number;
    llm_cost_7d_usd: number;
}

interface NextAction {
    label: string;
    action_type: string;
    payload: any;
}

interface Decision {
    id: string;
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    why: string;
    confidence: number | null;
    next_actions: NextAction[];
    deep_links: string[];
}

interface RecentAction {
    id: string;
    action_type: string;
    entity_type: string | null;
    entity_id: string | null;
    metadata: any;
    created_at: string;
}

interface Prefs {
    widget_visibility: {
        kpi: boolean;
        decisions: boolean;
        alignment: boolean;
        crm: boolean;
        ops: boolean;
        recent_actions: boolean;
    };
    widget_order: string[];
    density: 'comfortable' | 'compact';
    default_project_id: string | null;
}

export default function HomePage() {
    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [decisions, setDecisions] = useState<Decision[]>([]);
    const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [executingAction, setExecutingAction] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [prefs, setPrefs] = useState<Prefs | null>(null);
    const [showPersonalization, setShowPersonalization] = useState(false);

    useEffect(() => {
        fetchData();
        fetchPrefs();
    }, []);

    const fetchPrefs = async () => {
        try {
            const res = await fetch('/api/home/prefs');
            if (res.ok) {
                const data = await res.json();
                setPrefs(data.prefs);
            }
        } catch (err) {
            console.error('Failed to fetch prefs:', err);
            // Use defaults
            setPrefs({
                widget_visibility: {
                    kpi: true,
                    decisions: true,
                    alignment: true,
                    crm: true,
                    ops: true,
                    recent_actions: true
                },
                widget_order: ['kpi', 'decisions', 'alignment', 'crm', 'ops', 'recent_actions'],
                density: 'comfortable',
                default_project_id: null
            });
        }
    };

    const savePrefs = async (newPrefs: Prefs) => {
        try {
            const res = await fetch('/api/home/prefs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prefs: newPrefs })
            });

            if (!res.ok) throw new Error('Failed to save preferences');

            setPrefs(newPrefs);
            setToast({ message: 'Preferências salvas com sucesso!', type: 'success' });
        } catch (err: any) {
            setToast({ message: err.message, type: 'error' });
        }
    };

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [overviewRes, decisionsRes] = await Promise.all([
                fetch('/api/home/overview'),
                fetch('/api/home/decisions')
            ]);

            if (!overviewRes.ok || !decisionsRes.ok) {
                throw new Error('Failed to fetch data');
            }

            const overviewData = await overviewRes.json();
            const decisionsData = await decisionsRes.json();

            setOverview(overviewData);
            setDecisions(decisionsData);

            // Fetch recent actions if we have projects
            if (overviewData.total_projects > 0) {
                await fetchRecentActions();
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchRecentActions = async () => {
        try {
            // Get first project_id from user's projects (simplified)
            const projectsRes = await fetch('/projects');
            if (projectsRes.ok) {
                const projects = await projectsRes.json();
                if (projects.length > 0) {
                    const actionsRes = await fetch(`/api/home/actions/recent?project_id=${projects[0].id}&limit=5`);
                    if (actionsRes.ok) {
                        const actions = await actionsRes.json();
                        setRecentActions(actions);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch recent actions:', err);
        }
    };

    const executeAction = async (action: NextAction, projectId: string) => {
        const actionKey = `${action.action_type}-${JSON.stringify(action.payload)}`;
        setExecutingAction(actionKey);
        setToast(null);

        try {
            const res = await fetch('/api/home/actions/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    action_type: action.action_type,
                    payload: action.payload
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Action failed');
            }

            setToast({ message: data.result.summary, type: 'success' });

            // Refresh data after successful action
            setTimeout(() => {
                fetchData();
            }, 1000);
        } catch (err: any) {
            setToast({ message: err.message, type: 'error' });
        } finally {
            setExecutingAction(null);
        }
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'bg-red-100 text-red-800 border-red-200';
            case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            default: return 'bg-blue-100 text-blue-800 border-blue-200';
        }
    };

    if (loading) {
        return (
            <div className="p-8 space-y-6">
                <div className="animate-pulse">
                    <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-32 bg-gray-200 rounded"></div>
                        ))}
                    </div>
                    <div className="h-96 bg-gray-200 rounded"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8">
                <Card className="p-12 text-center">
                    <span className="text-6xl mb-4 block">⚠️</span>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <Button onClick={fetchData}>Retry</Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-6">
            {/* Personalization Modal */}
            {prefs && (
                <PersonalizationModal
                    isOpen={showPersonalization}
                    onClose={() => setShowPersonalization(false)}
                    prefs={prefs}
                    onSave={savePrefs}
                />
            )}

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${toast.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                    <div className="flex items-center gap-2">
                        <span>{toast.type === 'success' ? '✅' : '❌'}</span>
                        <span>{toast.message}</span>
                        <button onClick={() => setToast(null)} className="ml-4 text-lg">×</button>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Command Center</h1>
                    <p className="text-gray-600 mt-1">Your operational dashboard</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setShowPersonalization(true)} variant="secondary">
                        ⚙️ Personalizar
                    </Button>
                    <Button onClick={fetchData} variant="secondary">
                        🔄 Refresh
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {/* Projects */}
                <Card className="p-6">
                    <div className="text-sm text-gray-600 mb-1">Total Projects</div>
                    <div className="text-3xl font-bold text-gray-900">{overview?.total_projects || 0}</div>
                </Card>

                {/* Integrations Health */}
                <Card className="p-6">
                    <div className="text-sm text-gray-600 mb-1">Integrations</div>
                    <div className="text-3xl font-bold text-gray-900">
                        {overview?.integrations_health?.health_pct || 0}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {overview?.integrations_health?.active || 0}/{overview?.integrations_health?.total || 0} active
                    </div>
                </Card>

                {/* Alignment Score */}
                <Card className="p-6">
                    <div className="text-sm text-gray-600 mb-1">Avg Alignment</div>
                    <div className="text-3xl font-bold text-gray-900">
                        {overview?.alignment_summary?.avg_score || 'N/A'}
                        {overview?.alignment_summary?.avg_score && '%'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {overview?.alignment_summary?.critical_count || 0} critical
                    </div>
                </Card>

                {/* Ops Health */}
                <Card className="p-6">
                    <div className="text-sm text-gray-600 mb-1">Ops Health</div>
                    <div className="text-3xl font-bold text-gray-900">
                        {(overview?.ops_summary?.dlq_pending || 0) + (overview?.ops_summary?.alerts_open || 0)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        {overview?.ops_summary?.dlq_pending || 0} DLQ, {overview?.ops_summary?.alerts_open || 0} alerts
                    </div>
                </Card>

                {/* LLM Cost Today */}
                <Card className="p-6 bg-gradient-to-br from-blue-50 to-blue-100">
                    <div className="text-sm text-blue-700 mb-1">LLM $ Hoje</div>
                    <div className="text-3xl font-bold text-blue-900">
                        ${overview?.llm_cost_today_usd?.toFixed(2) || '0.00'}
                    </div>
                    <div className="text-xs text-blue-600 mt-1">
                        7d: ${overview?.llm_cost_7d_usd?.toFixed(2) || '0.00'}
                    </div>
                </Card>

                {/* Cache Hit Rate 24h */}
                <Card className="p-6 bg-gradient-to-br from-green-50 to-green-100">
                    <div className="text-sm text-green-700 mb-1">Cache Hit 24h</div>
                    <div className="text-3xl font-bold text-green-900">
                        {overview?.alignment_cache_hit_rate_24h?.toFixed(1) || '0.0'}%
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                        Alignment jobs
                    </div>
                </Card>
            </div>

            {/* Decision Feed */}
            <Card className="p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">🎯 Decisions & Actions</h2>

                {decisions.length === 0 ? (
                    <div className="text-center py-12">
                        <span className="text-6xl mb-4 block">✅</span>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">All Clear!</h3>
                        <p className="text-gray-600">No critical decisions needed right now</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {decisions.map(decision => (
                            <div key={decision.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Badge className={getSeverityColor(decision.severity)}>
                                                {decision.severity.toUpperCase()}
                                            </Badge>
                                            {decision.confidence !== null && (
                                                <span className="text-xs text-gray-500">
                                                    Confidence: {decision.confidence}%
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                            {decision.title}
                                        </h3>
                                        <p className="text-sm text-gray-600 mb-3">{decision.why}</p>
                                        <div className="flex gap-2 flex-wrap">
                                            {decision.next_actions.map((action, idx) => {
                                                const actionKey = `${action.action_type}-${JSON.stringify(action.payload)}`;
                                                const isExecuting = executingAction === actionKey;

                                                return (
                                                    <Button
                                                        key={idx}
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => executeAction(action, overview?.total_projects ? 'project-id' : '')}
                                                        disabled={isExecuting}
                                                    >
                                                        {isExecuting ? '⏳ ' : ''}
                                                        {action.label}
                                                    </Button>
                                                );
                                            })}
                                            {decision.deep_links.map((link, idx) => (
                                                <a key={idx} href={link}>
                                                    <Button size="sm" variant="secondary">
                                                        View Details →
                                                    </Button>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Recent Actions */}
            {recentActions.length > 0 && (
                <Card className="p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">📋 Recent Actions</h2>
                    <div className="space-y-2">
                        {recentActions.map(action => (
                            <div key={action.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                <div>
                                    <span className="font-medium text-gray-900">{action.action_type.replace(/_/g, ' ')}</span>
                                    {action.entity_type && (
                                        <span className="text-sm text-gray-500 ml-2">({action.entity_type})</span>
                                    )}
                                </div>
                                <span className="text-xs text-gray-500">
                                    {new Date(action.created_at).toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* CRM Summary */}
            {overview?.crm_summary && (
                <Card className="p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">📊 CRM Activity</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="text-sm text-gray-600">Contacts</div>
                            <div className="text-2xl font-bold text-gray-900">
                                {overview.crm_summary.contacts_count}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-gray-600">Deals</div>
                            <div className="text-2xl font-bold text-gray-900">
                                {overview.crm_summary.deals_count}
                            </div>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
