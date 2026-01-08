import React, { useState, useEffect } from 'react';
import { Card } from '@/design-system/atoms/Card';
import { Badge } from '@/design-system/atoms/Badge';
import { Button } from '@/design-system/atoms/Button';
import { cn } from '@/lib/utils/cn';
// Assuming lucide-react is available, else use text/emoji
import { Users, DollarSign, Clock, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

interface CrmHubProps {
    projectId: string;
}

interface CrmCounts {
    contacts: number;
    deals: number;
}

interface Connection {
    id: string;
    name: string;
    status: 'connected' | 'disconnected';
    last_success_at?: string;
    has_token: boolean;
}

export function CrmHub({ projectId }: CrmHubProps) {
    const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'deals'>('overview');
    const [counts, setCounts] = useState<CrmCounts>({ contacts: 0, deals: 0 });
    const [lagMinutes, setLagMinutes] = useState<number>(0);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dataList, setDataList] = useState<any[]>([]); // Contacts or Deals
    const [listLoading, setListLoading] = useState(false);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

    const fetchOverview = async () => {
        try {
            const res = await fetch(`${apiUrl}/projects/${projectId}/crm/overview`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` } // Mock auth handling
            });
            if (res.ok) {
                const data = await res.json();
                setCounts(data.counts);
                setLagMinutes(data.lag_minutes);
                setConnections(data.connections);
            }
        } catch (err) {
            console.error('Failed to fetch CRM overview', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchList = async (type: 'contacts' | 'deals') => {
        setListLoading(true);
        try {
            const res = await fetch(`${apiUrl}/projects/${projectId}/crm/${type}?limit=20`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
            });
            if (res.ok) {
                const data = await res.json();
                setDataList(data.data);
            }
        } catch (err) {
            console.error(`Failed to fetch CRM ${type}`, err);
        } finally {
            setListLoading(false);
        }
    };

    const handleSyncNow = async (connectionId: string) => {
        try {
            await fetch(`${apiUrl}/projects/${projectId}/crm/connections/${connectionId}/sync-now`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
            });
            // Toast success?
        } catch (err) {
            console.error('Sync failed', err);
        }
    };

    useEffect(() => {
        fetchOverview();
    }, [projectId]);

    useEffect(() => {
        if (activeTab !== 'overview') {
            fetchList(activeTab);
        }
    }, [activeTab, projectId]);

    return (
        <div className="flex flex-col gap-6">
            {/* Header / Tabs */}
            <div className="flex items-center gap-4 border-b border-surface-200 pb-2">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", activeTab === 'overview' ? "bg-surface-100 text-surface-900" : "text-surface-500 hover:text-surface-900")}
                >
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab('contacts')}
                    className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", activeTab === 'contacts' ? "bg-surface-100 text-surface-900" : "text-surface-500 hover:text-surface-900")}
                >
                    Contacts
                </button>
                <button
                    onClick={() => setActiveTab('deals')}
                    className={cn("px-3 py-1 text-sm font-medium rounded-md transition-colors", activeTab === 'deals' ? "bg-surface-100 text-surface-900" : "text-surface-500 hover:text-surface-900")}
                >
                    Deals
                </button>
            </div>

            {/* Overview Content */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-300">
                    <Card className="p-6 flex items-center justify-between shadow-sm">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-surface-500">Total Contacts</span>
                            <span className="text-2xl font-bold text-surface-900 font-display">{isLoading ? '...' : counts.contacts.toLocaleString()}</span>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Users className="w-5 h-5" />
                        </div>
                    </Card>

                    <Card className="p-6 flex items-center justify-between shadow-sm">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-surface-500">Total Deals</span>
                            <span className="text-2xl font-bold text-surface-900 font-display">{isLoading ? '...' : counts.deals.toLocaleString()}</span>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <DollarSign className="w-5 h-5" />
                        </div>
                    </Card>

                    <Card className="p-6 flex items-center justify-between shadow-sm">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-surface-500">Data Lag</span>
                            <div className="flex items-center gap-2">
                                <span className={cn("text-2xl font-bold font-display", lagMinutes > 60 ? 'text-amber-600' : 'text-surface-900')}>
                                    {isLoading ? '...' : `${lagMinutes}m`}
                                </span>
                                {lagMinutes < 15 && !isLoading && <Badge variant="brand" className="text-[10px]">Real-time</Badge>}
                            </div>
                        </div>
                        <div className="h-10 w-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                            <Clock className="w-5 h-5" />
                        </div>
                    </Card>

                    {/* Connections Status */}
                    <div className="col-span-1 md:col-span-3">
                        <h3 className="text-sm font-semibold text-surface-500 mb-3 uppercase tracking-wider">Active Connections</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {connections.map(c => (
                                <Card key={c.id} className="p-4 flex items-center justify-between border-l-4 border-l-brand-500">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("h-2 w-2 rounded-full", c.status === 'connected' ? "bg-green-500" : "bg-red-500")} />
                                        <div>
                                            <p className="font-semibold text-surface-900">{c.name}</p>
                                            <p className="text-xs text-surface-500">Last success: {c.last_success_at ? new Date(c.last_success_at).toLocaleString() : 'Never'}</p>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => handleSyncNow(c.id)}>
                                        <RefreshCw className="w-3 h-3 mr-2" />
                                        Sync Now
                                    </Button>
                                </Card>
                            ))}
                            {connections.length === 0 && !isLoading && (
                                <p className="text-sm text-surface-400 italic">No CRM connections found.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* List Content (Contacts/Deals) */}
            {(activeTab === 'contacts' || activeTab === 'deals') && (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-surface-50 text-surface-500 font-medium border-b border-surface-200">
                                <tr>
                                    <th className="px-6 py-3">Reference (Ext. ID)</th>
                                    <th className="px-6 py-3">Attributes</th>
                                    <th className="px-6 py-3">Occurred At</th>
                                    <th className="px-6 py-3">Updated At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {listLoading ? (
                                    <tr><td colSpan={4} className="p-6 text-center text-surface-400">Loading data...</td></tr>
                                ) : dataList.length === 0 ? (
                                    <tr><td colSpan={4} className="p-6 text-center text-surface-400">No records found.</td></tr>
                                ) : (
                                    dataList.map((item: any) => (
                                        <tr key={item.id} className="border-b border-surface-100 hover:bg-surface-50/50">
                                            <td className="px-6 py-3 font-mono text-xs text-surface-600">{item.external_id}</td>
                                            <td className="px-6 py-3">
                                                {activeTab === 'contacts' ? (
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-surface-900">{item.full_name || 'Unknown'}</span>
                                                        <span className="text-xs text-surface-500">{item.lifecycle_stage}</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-surface-900">{item.deal_name || 'Untitled'}</span>
                                                        <span className="text-xs text-surface-500 flex items-center gap-1">
                                                            {item.stage} • <span className="font-mono text-green-600">{new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency || 'USD' }).format(item.amount || 0)}</span>
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-3 text-surface-500">{new Date(item.occurred_at).toLocaleDateString()}</td>
                                            <td className="px-6 py-3 text-surface-500">{new Date(item.updated_at).toLocaleString()}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}
