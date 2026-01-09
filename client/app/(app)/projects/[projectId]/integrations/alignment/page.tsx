
'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AlignmentOverview } from '@/components/alignment/AlignmentOverview';
import { AlignmentTable, AlignmentReportUI } from '@/components/alignment/AlignmentTable';
import { EvidenceModal, AlignmentReportDetails } from '@/components/alignment/EvidenceModal';
import { useToast } from '@/components/ui/use-toast'; // or useToast hook
// import { useFeatureFlags } from '@/hooks/useFeatureFlags'; // Assuming hook exists

// Mock API client wrapper (replace with real axios/fetch)
const api = {
    get: async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error('API Error');
        return res.json();
    },
    post: async (url: string, body: any) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error('API Error');
        return res.json();
    }
};

import { SchedulesTab } from '@/components/alignment/SchedulesTab';
import { NotificationsTab } from '@/components/alignment/NotificationsTab';
import { FixPacksTab } from '@/components/alignment/FixPacksTab';
import { TimelineTab } from '@/components/alignment/TimelineTab';

export default function AlignmentPage() {
    const { projectId } = useParams();
    const { toast } = useToast();

    // State
    const [activeTab, setActiveTab] = useState<'reports' | 'schedules' | 'fixpacks' | 'timeline' | 'settings'>('reports');
    const [stats, setStats] = useState<any>(null);
    const [reports, setReports] = useState<AlignmentReportUI[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal State
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [reportDetails, setReportDetails] = useState<AlignmentReportDetails | null>(null);
    const [isModalLoading, setIsModalLoading] = useState(false);

    // Initial Fetch
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [overviewData, reportsData] = await Promise.all([
                api.get(`/api/projects/${projectId}/integrations/alignment/overview`),
                api.get(`/api/projects/${projectId}/integrations/alignment/reports?limit=50`)
            ]);
            setStats(overviewData);
            setReports(reportsData);
        } catch (error) {
            console.error(error);
            toast({ title: 'Error loading data', variant: 'destructive' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (projectId && activeTab === 'reports') fetchData();
    }, [projectId, activeTab]);

    // Handlers
    const handleTriggerCheck = async () => {
        try {
            toast({ title: 'Triggering batch check...' });
            await fetchData();
            toast({ title: 'Data refreshed' });
        } catch (e) {
            //
        }
    };

    const handleViewEvidence = async (report: AlignmentReportUI) => {
        setSelectedReportId(report.id);
        setIsModalLoading(true);
        try {
            const data = await api.get(`/api/projects/${projectId}/integrations/alignment/reports/${report.id}`);
            setReportDetails(data);
        } catch (error) {
            toast({ title: 'Failed to load details', variant: 'destructive' });
            setReportDetails(null);
        } finally {
            setIsModalLoading(false);
        }
    };

    const closeEvidence = () => {
        setSelectedReportId(null);
        setReportDetails(null);
    };

    // Render
    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Ads ↔ Pages Verification Center</h2>
                    <p className="text-muted-foreground">Ensure your Ad Creatives match your Landing Pages (Message, Offer, Tracking).</p>
                </div>
            </div>

            {/* Overview */}
            {stats && (
                <AlignmentOverview stats={stats} onTrigger={handleTriggerCheck} />
            )}

            {/* Tabs */}
            <div className="border-b">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('reports')}
                        className={`${activeTab === 'reports' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        Reports & Evidence
                    </button>
                    <button
                        onClick={() => setActiveTab('schedules')}
                        className={`${activeTab === 'schedules' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        Scheduled Checks (Ops)
                    </button>
                    <button
                        onClick={() => setActiveTab('fixpacks')}
                        className={`${activeTab === 'fixpacks' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        🔧 Fix Packs
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`${activeTab === 'settings' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        Notifications & Alerts
                    </button>
                </nav>
            </div>

            {/* Content per Tab */}
            {activeTab === 'reports' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">Recent Verifications</h3>
                    </div>
                    <AlignmentTable
                        reports={reports}
                        isLoading={isLoading}
                        onViewEvidence={handleViewEvidence}
                    />
                </div>
            )}

            {activeTab === 'schedules' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <SchedulesTab projectId={projectId as string} />
                </div>
            )}

            {activeTab === 'fixpacks' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <FixPacksTab projectId={projectId as string} />
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <NotificationsTab projectId={projectId as string} />
                </div>
            )}

            {/* Evidence Modal */}
            <EvidenceModal
                isOpen={!!selectedReportId}
                onClose={closeEvidence}
                report={reportDetails}
                isLoading={isModalLoading}
            />
        </div>
    );
}
