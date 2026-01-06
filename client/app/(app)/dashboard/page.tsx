import { Button } from "@/design-system/atoms/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/design-system/atoms/Card";
import { Badge } from "@/design-system/atoms/Badge";
import { ConfidenceBadge } from "@/design-system/signature/ConfidenceBadge";
import { GoldenRuleCard } from "@/design-system/signature/GoldenRuleCard";
import { Activity, Server, Zap, Shield } from "lucide-react";

export default function Home() {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">System Overview</h1>
                    <p className="text-surface-500">Real-time status of your multi-tenant infrastructure.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline">Export Reports</Button>
                    <Button>Deploy New Worker</Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {[
                    { label: 'Cloud API', status: 'Healthy', icon: Server, color: 'success' },
                    { label: 'Sync Workers', status: 'Running', icon: Zap, color: 'brand' },
                    { label: 'AI Engine', status: 'Optimizing', icon: Activity, color: 'warning' },
                    { label: 'Security Gate', status: 'Active', icon: Shield, color: 'success' },
                ].map((item) => (
                    <Card key={item.label} className="flex flex-col justify-between">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
                            <item.icon className="h-4 w-4 text-surface-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <div className="text-2xl font-bold">{item.status}</div>
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
                            <ConfidenceBadge score={98} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[200px] flex items-center justify-center rounded-lg border-2 border-dashed border-surface-200 dark:border-surface-800">
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
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex items-center justify-between py-2 border-b border-surface-100 dark:border-surface-800 last:border-0">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium italic">Org_{i * 124}</span>
                                            <span className="text-xs text-surface-500">Last event: 2 mins ago</span>
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
