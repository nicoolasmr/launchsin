'use client';

import React from 'react';
import { Card } from '@/design-system/atoms/Card';
import { Badge } from '@/design-system/atoms/Badge';
import { Button } from '@/design-system/atoms/Button';

export interface SyncRun {
    id: string;
    connection_name: string;
    started_at: string;
    finished_at?: string;
    status: 'success' | 'failed' | 'running';
    records_processed: number;
    error_message?: string;
}

export function SyncRunsTab({ data }: { data: SyncRun[] }) {
    return (
        <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                        <th className="px-6 py-4 font-semibold text-surface-900">Connection</th>
                        <th className="px-6 py-4 font-semibold text-surface-900">Started</th>
                        <th className="px-6 py-4 font-semibold text-surface-900">Status</th>
                        <th className="px-6 py-4 font-semibold text-surface-900">Records</th>
                        <th className="px-6 py-4 font-semibold text-surface-900">Duration</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                    {data.map((run) => (
                        <tr key={run.id} className="hover:bg-surface-50/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-surface-900">{run.connection_name}</td>
                            <td className="px-6 py-4 text-surface-500">{new Date(run.started_at).toLocaleString()}</td>
                            <td className="px-6 py-4">
                                <Badge variant={run.status === 'success' ? 'brand' : run.status === 'failed' ? 'warning' : 'secondary'}>
                                    {run.status}
                                </Badge>
                                {run.error_message && (
                                    <p className="mt-1 text-[10px] text-red-500 truncate max-w-[200px]" title={run.error_message}>
                                        {run.error_message}
                                    </p>
                                )}
                            </td>
                            <td className="px-6 py-4 text-surface-600">{run.records_processed.toLocaleString()}</td>
                            <td className="px-6 py-4 text-surface-500">
                                {run.finished_at
                                    ? `${Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
                                    : '--'
                                }
                            </td>
                        </tr>
                    ))}
                    {data.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-6 py-20 text-center text-surface-400">
                                No recent sync runs found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </Card>
    );
}

export interface DlqEvent {
    id: string;
    connection_name: string;
    error_class: string;
    status: 'pending' | 'resolved' | 'dead';
    attempt_count: number;
    next_retry_at?: string;
    last_error_message?: string;
}

export function DlqTab({ data, onRetry, canManage }: { data: DlqEvent[], onRetry: (id: string) => void, canManage: boolean }) {
    return (
        <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-surface-50 border-b border-surface-200">
                    <tr>
                        <th className="px-6 py-4 font-semibold text-surface-900">Connection</th>
                        <th className="px-6 py-4 font-semibold text-surface-900">Error Class</th>
                        <th className="px-6 py-4 font-semibold text-surface-900">Status</th>
                        <th className="px-6 py-4 font-semibold text-surface-900">Attempts</th>
                        <th className="px-6 py-4 font-semibold text-surface-900 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                    {data.map((event) => (
                        <tr key={event.id} className="hover:bg-surface-50/50 transition-colors">
                            <td className="px-6 py-4 font-medium text-surface-900">{event.connection_name}</td>
                            <td className="px-6 py-4">
                                <span className="text-surface-600">{event.error_class}</span>
                                {event.last_error_message && (
                                    <p className="mt-1 text-[10px] text-surface-400 truncate max-w-[250px]" title={event.last_error_message}>
                                        {event.last_error_message}
                                    </p>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                <Badge variant={event.status === 'resolved' ? 'brand' : event.status === 'dead' ? 'destructive' : 'warning'}>
                                    {event.status}
                                </Badge>
                                {event.next_retry_at && event.status === 'pending' && (
                                    <p className="mt-1 text-[10px] text-surface-400">
                                        Retry: {new Date(event.next_retry_at).toLocaleTimeString()}
                                    </p>
                                )}
                            </td>
                            <td className="px-6 py-4 text-surface-600">{event.attempt_count} / 5</td>
                            <td className="px-6 py-4 text-right">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onRetry(event.id)}
                                    disabled={!canManage || event.status === 'resolved'}
                                >
                                    Retry
                                </Button>
                            </td>
                        </tr>
                    ))}
                    {data.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-6 py-20 text-center text-surface-400">
                                No DLQ events to display.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </Card>
    );
}
