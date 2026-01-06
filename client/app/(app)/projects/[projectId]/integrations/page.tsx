'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/design-system/atoms/Button';
import { Badge } from '@/design-system/atoms/Badge';
import { Card } from '@/design-system/atoms/Card';
import { cn } from '@/lib/utils/cn';
import { SyncRunsTab, SyncRun, DlqTab, DlqEvent } from '@/components/integrations/Tables';
import { AlertsTab, IntegrationAlert } from '@/components/integrations/Alerts';
import { SettingsTab, SourceConnection } from '@/components/integrations/Settings';

type TabId = 'overview' | 'runs' | 'dlq' | 'alerts' | 'settings';

export default function StatusCenterPage() {
    const { projectId } = useParams();
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    // MOCK DATA STATES
    const [healthScore, setHealthScore] = useState<number>(92);
    const [runs, setRuns] = useState<SyncRun[]>([]);
    const [dlq, setDlq] = useState<DlqEvent[]>([]);
    const [alerts, setAlerts] = useState<IntegrationAlert[]>([]);
    const [connections, setConnections] = useState<SourceConnection[]>([]);
    const [isAlignmentEnabled, setIsAlignmentEnabled] = useState(false);

    // RBAC: Mock current user role
    const userRole = 'owner'; // In production, this would come from a SessionContext
    const canManage = ['admin', 'owner'].includes(userRole);

    const fetchData = async () => {
        // MOCK: Simulate API calls
        // In producton: fetch(`/api/projects/${projectId}/integrations/health`) etc.
        setLastUpdated(new Date());

        // Simulating data updates
        setRuns([
            { id: '1', connection_name: 'Hotmart Pro', started_at: new Date(Date.now() - 3600000).toISOString(), finished_at: new Date(Date.now() - 3550000).toISOString(), status: 'success', records_processed: 450 },
            { id: '2', connection_name: 'Meta Ads', started_at: new Date(Date.now() - 7200000).toISOString(), finished_at: new Date(Date.now() - 7180000).toISOString(), status: 'failed', records_processed: 0, error_message: 'OAuth Token Expired' }
        ]);

        setDlq([
            { id: 'dlq_1', connection_name: 'Meta Ads', error_class: 'AUTH_EXPIRED', status: 'pending', attempt_count: 2, next_retry_at: new Date(Date.now() + 600000).toISOString(), last_error_message: 'Invalid credentials' },
            { id: 'dlq_2', connection_name: 'PostgreSQL Sync', error_class: 'TIMEOUT', status: 'dead', attempt_count: 5, last_error_message: 'Connection timed out after 30s' }
        ]);

        setAlerts([
            { id: 'alt_1', severity: 'warning', source: 'Meta Ads', message: 'Sync latency increased by 40% in the last 24h', created_at: new Date(Date.now() - 172800000).toISOString() }
        ]);

        setConnections([
            { id: 'conn_1', name: 'Hotmart Pro', type: 'hotmart', is_active: true, last_sync_at: new Date().toISOString() },
            { id: 'conn_2', name: 'Meta Ads', type: 'meta_ads', is_active: true, last_sync_at: new Date().toISOString() }
        ]);

        // MOCK: Feature Flag Check
        setIsAlignmentEnabled(false); // Default false for now
    };

    useEffect(() => {
        fetchData().then(() => setIsLoading(false));

        // Polling every 30s
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [projectId]);

    const tabs: { id: TabId; label: string; count?: number }[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'runs', label: 'Sync Runs' },
        { id: 'dlq', label: 'DLQ', count: dlq.filter(e => e.status === 'pending').length },
        { id: 'alerts', label: 'Alerts', count: alerts.length },
        { id: 'settings', label: 'Settings' },
    ];

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="flex flex-col gap-8 p-8 max-w-7xl mx-auto animate-in fade-in duration-700">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold tracking-tight text-surface-900 font-display">
                            Integration Status
                        </h1>
                        <Badge variant={healthScore > 80 ? 'brand' : 'warning'}>
                            {isLoading ? 'Calibrating...' : `Health: ${healthScore}/100`}
                        </Badge>
                    </div>
                    <p className="text-surface-500 max-w-2xl font-medium">
                        Real-time observability and reliability for your data pipeline.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-surface-400 uppercase tracking-widest">
                        Last Refresh: {formatTime(lastUpdated)}
                    </span>
                    <Button variant="outline" size="sm" onClick={fetchData} isLoading={isLoading}>
                        Sync Now
                    </Button>
                </div>
            </header>

            {/* Navigation */}
            <nav className="flex items-center gap-1 border-b border-surface-200">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            'relative px-5 py-3 text-sm font-semibold transition-all hover:text-brand-600',
                            activeTab === tab.id
                                ? 'text-brand-600 border-b-2 border-brand-500'
                                : 'text-surface-400 border-b-2 border-transparent hover:border-surface-300'
                        )}
                    >
                        {tab.label}
                        {tab.count ? (
                            <span className="ml-2 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-bold text-surface-600 ring-1 ring-inset ring-surface-200">
                                {tab.count}
                            </span>
                        ) : null}
                    </button>
                ))}
            </nav>

            {/* Content */}
            <main className="min-h-[500px]">
                {isLoading && activeTab === 'overview' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-32 rounded-2xl bg-surface-100 animate-pulse border border-surface-200" />
                        ))}
                    </div>
                ) : (
                    <div className="animate-in slide-in-from-bottom-1 duration-500 fill-mode-both">
                        {activeTab === 'overview' && <OverviewView isAlignmentEnabled={isAlignmentEnabled} />}
                        {activeTab === 'runs' && <SyncRunsTab data={runs} />}
                        {activeTab === 'dlq' && <DlqTab data={dlq} canManage={canManage} onRetry={(id: string) => console.log('Retry', id)} />}
                        {activeTab === 'alerts' && <AlertsTab data={alerts} />}
                        {activeTab === 'settings' && <SettingsTab connections={connections} canManage={canManage} onTest={(id: string) => console.log('Test', id)} />}
                    </div>
                )}
            </main>
        </div>
    );
}

function OverviewView({ isAlignmentEnabled }: { isAlignmentEnabled: boolean }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 flex flex-col gap-4 border-none bg-brand-50 shadow-minimal ring-1 ring-brand-100">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-brand-600">Sync Status</span>
                        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-3xl font-bold text-brand-900 font-display tracking-tight">Healthy</span>
                        <p className="text-xs text-brand-600/80 font-medium">Auto-scaling active</p>
                    </div>
                </Card>

                <Card className="p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-surface-400">Sync Volume (24h)</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-3xl font-bold text-surface-900 font-display tracking-tight">84,291</span>
                        <p className="text-xs text-green-600 font-semibold">↑ 12.4% vs avg.</p>
                    </div>
                </Card>

                <Card className="p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-surface-400">System Latency</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-3xl font-bold text-surface-900 font-display tracking-tight">142ms</span>
                        <p className="text-xs text-surface-500 font-medium">99th percentile</p>
                    </div>
                </Card>
            </div>

            {/* Alignment Card: Gated by Feature Flag or Placeholder */}
            {!isAlignmentEnabled ? (
                <Card className="p-8 border-dashed border-2 flex flex-col items-center justify-center text-center gap-4 py-16 bg-surface-50/50">
                    <div className="h-10 w-10 rounded-xl bg-surface-100 flex items-center justify-center text-lg grayscale opacity-50">
                        🎯
                    </div>
                    <div className="flex flex-col gap-1">
                        <h3 className="text-md font-bold text-surface-400">Ads → Pages Alignment</h3>
                        <p className="text-xs text-surface-400 max-w-sm">
                            Upcoming: Automated offer/message congruence verification between campaigns and landing pages.
                        </p>
                    </div>
                    <Badge variant="secondary" className="bg-surface-200/50 text-surface-400">Feature Locked</Badge>
                </Card>
            ) : (
                <Card className="p-8 flex flex-col gap-4 border-brand-200 bg-brand-50/20">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-brand-500 flex items-center justify-center text-white">🎯</div>
                        <h3 className="text-lg font-bold text-surface-900">Alignment Intelligence</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-white border border-brand-100 flex flex-col gap-1">
                            <span className="text-xs font-bold text-brand-600 uppercase">Offer Match</span>
                            <span className="text-xl font-bold text-surface-900">98% Correlation</span>
                        </div>
                        <div className="p-4 rounded-xl bg-white border border-brand-100 flex flex-col gap-1">
                            <span className="text-xs font-bold text-brand-600 uppercase">Message Match</span>
                            <span className="text-xl font-bold text-surface-900">High Confidence</span>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
