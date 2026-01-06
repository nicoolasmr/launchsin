'use client';

import React from 'react';
import { Card } from '@/design-system/atoms/Card';
import { Badge } from '@/design-system/atoms/Badge';

export interface IntegrationAlert {
    id: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    source: string;
    created_at: string;
}

export function AlertsTab({ data }: { data: IntegrationAlert[] }) {
    return (
        <div className="flex flex-col gap-4">
            {data.map((alert) => (
                <Card key={alert.id} className="p-4 flex items-start gap-4 border-l-4" style={{
                    borderLeftColor: alert.severity === 'critical' ? '#ef4444' : alert.severity === 'warning' ? '#f59e0b' : '#3b82f6'
                }}>
                    <div className={cn(
                        "mt-1 rotate-12 text-lg",
                        alert.severity === 'critical' ? "text-red-500" : alert.severity === 'warning' ? "text-amber-500" : "text-blue-500"
                    )}>
                        {alert.severity === 'critical' ? '🚨' : alert.severity === 'warning' ? '⚠️' : 'ℹ️'}
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-surface-400">
                                {alert.source}
                            </span>
                            <span className="text-xs text-surface-400">
                                {new Date(alert.created_at).toLocaleString()}
                            </span>
                        </div>
                        <p className="text-sm text-surface-900 font-medium">{alert.message}</p>
                    </div>
                </Card>
            ))}
            {data.length === 0 && (
                <Card className="p-12 flex flex-col items-center justify-center text-center gap-2 border-dashed">
                    <span className="text-2xl">🎉</span>
                    <h3 className="font-semibold text-surface-900">No active alerts</h3>
                    <p className="text-sm text-surface-500">Your connections are looking healthy.</p>
                </Card>
            )}
        </div>
    );
}

import { cn } from '@/lib/utils/cn';
