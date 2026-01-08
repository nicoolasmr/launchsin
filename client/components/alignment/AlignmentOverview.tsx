import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/design-system/atoms/Card'; // Fixed import
// Fallback if shadcn not installed: use div with standard classes
// Project uses Tailwind.

interface OverviewStats {
    avg_score_7d: number;
    low_score_count: number; // Alerts
    tracking_fail_count: number;
    last_run_at: string | null;
}

export const AlignmentOverview: React.FC<{ stats: OverviewStats, onTrigger: () => void }> = ({ stats, onTrigger }) => {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <h3 className="tracking-tight text-sm font-medium text-muted-foreground">Avg Score (7d)</h3>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="h-4 w-4 text-muted-foreground"
                    >
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                </div>
                <div className="text-2xl font-bold flex items-center gap-2">
                    {stats.avg_score_7d}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${stats.avg_score_7d >= 70 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {stats.avg_score_7d >= 70 ? 'Healty' : 'Action Needed'}
                    </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Based on last 7 days</p>
            </div>

            <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <h3 className="tracking-tight text-sm font-medium text-muted-foreground">Tracking Failures</h3>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="h-4 w-4 text-red-500"
                    >
                        <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                        <line x1="12" x2="12" y1="2" y2="12" />
                    </svg>
                </div>
                <div className="text-2xl font-bold text-red-600">{stats.tracking_fail_count}</div>
                <p className="text-xs text-muted-foreground mt-1">Pixel/UTM missing</p>
            </div>

            <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <h3 className="tracking-tight text-sm font-medium text-muted-foreground">Low Score Alerts</h3>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="h-4 w-4 text-orange-500"
                    >
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                </div>
                <div className="text-2xl font-bold text-orange-600">{stats.low_score_count}</div>
                <p className="text-xs text-muted-foreground mt-1">Score {"<"} 70</p>
            </div>

            <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-6">
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <h3 className="tracking-tight text-sm font-medium text-muted-foreground">Last Check</h3>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="h-4 w-4 text-muted-foreground"
                    >
                        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                        <line x1="16" x2="16" y1="2" y2="6" />
                        <line x1="8" x2="8" y1="2" y2="6" />
                        <line x1="3" x2="21" y1="10" y2="10" />
                    </svg>
                </div>
                <div className="text-lg font-bold truncate">
                    {stats.last_run_at ? new Date(stats.last_run_at).toLocaleDateString() : 'Never'}
                </div>
                <button onClick={onTrigger} className="mt-2 w-full inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8">
                    Trigger Check
                </button>
            </div>
        </div>
    );
};
