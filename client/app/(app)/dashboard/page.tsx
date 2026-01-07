"use client";

import { useEffect, useState } from "react";
import { Button } from "@/design-system/atoms/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/design-system/atoms/Card";
import { Badge } from "@/design-system/atoms/Badge";
import { ConfidenceBadge } from "@/design-system/signature/ConfidenceBadge";
import { GoldenRuleCard } from "@/design-system/signature/GoldenRuleCard";
import { Activity, Server, Zap, Shield } from "lucide-react";

export default function Home() {
    const [stats, setStats] = useState({
        api_status: 'Healthy',
        worker_status: 'Running',
        ai_status: 'Optimizing',
        security_status: 'Active',
        confidence_score: 98,
        recent_activity: [] as any[]
    });

    useEffect(() => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

        fetch(`${apiUrl}/dashboard/stats`)
            .then(res => {
                if (res.ok) return res.json();
                throw new Error('Failed to fetch dashboard stats');
            })
            .then(data => {
                console.log("Dashboard stats loaded:", data);
                setStats(prev => ({ ...prev, ...data }));
            })
            .catch(err => console.warn("Dashboard running in static mode (API not reachable)", err));
    }, []);

    const statusItems = [
        { label: 'Cloud API', status: stats.api_status, icon: Server, color: stats.api_status === 'Healthy' ? 'success' : 'warning' },
        { label: 'Sync Workers', status: stats.worker_status, icon: Zap, color: stats.worker_status === 'Running' ? 'brand' : 'warning' },
        { label: 'AI Engine', status: stats.ai_status, icon: Activity, color: 'warning' },
        { label: 'Security Gate', status: stats.security_status, icon: Shield, color: 'success' },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-surface-900 dark:text-white">System Overview</h1>
                    <p className="text-surface-500">Real-time status of your multi-tenant infrastructure.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline">Export Reports</Button>
                    <Button>Deploy New Worker</Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {statusItems.map((item) => (
                    <Card key={item.label} className="flex flex-col justify-between">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-surface-600 dark:text-surface-400">{item.label}</CardTitle>
                            <item.icon className="h-4 w-4 text-surface-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <div className="text-2xl font-bold text-surface-900 dark:text-white">{item.status}</div>
                                <Badge variant={item.color as any}>{item.status}</Badge>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-6 md:grid-cols-7">
                <Card className="md:col-span-4">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Infrastructure Confidence</CardTitle>
                                <CardDescription>AI-generated reliability forecast for the next 24h.</CardDescription>
                            </div>
                            <ConfidenceBadge score={stats.confidence_score} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px] flex items-center justify-center rounded-lg border-2 border-dashed border-surface-200 dark:border-surface-800 bg-surface-50 dark:bg-surface-950/50">
                            <span className="text-surface-400 italic">Historical Chart Placeholder</span>
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6 md:col-span-3">
                    <GoldenRuleCard
                        rule="Org Scoped Isolation v1"
                        source="System Architecture"
                        period="Q4 2024"
                        confidence={100}
                        evidence="Verified by 12 independent multi-tenant stress tests."
                        nextAction="Audit RLS Policies"
                    />
                    <Card>
                        <CardHeader>
                            <CardTitle>Active Tenants</CardTitle>
                            <CardDescription>Recent activity per organization.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {(stats.recent_activity.length > 0 ? stats.recent_activity : [1, 2, 3]).map((item, i) => (
                                    <div key={i} className="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800 last:border-0">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium italic text-surface-900 dark:text-surface-200">
                                                {typeof item === 'object' ? item.name : `Org_${(i + 1) * 124}`}
                                            </span>
                                            <span className="text-xs text-surface-500">
                                                {typeof item === 'object' ? 'Active now' : 'Last event: 2 mins ago'}
                                            </span>
                                        </div>
                                        <Badge variant="outline">Managed</Badge>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
