'use client';

import React from 'react';
import { Card } from '@/design-system/atoms/Card';
import { Button } from '@/design-system/atoms/Button';
import { Badge } from '@/design-system/atoms/Badge';

export interface SourceConnection {
    id: string;
    name: string;
    type: string;
    is_active: boolean;
    last_sync_at?: string;
}

export function SettingsTab({
    connections,
    onTest,
    canManage
}: {
    connections: SourceConnection[],
    onTest: (id: string) => void,
    canManage: boolean
}) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-surface-900">Manage Connections</h2>
                <Button variant="primary" size="sm" disabled={!canManage}>
                    + Add Integration
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {connections.map((conn) => (
                    <Card key={conn.id} className="p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-surface-100 flex items-center justify-center font-bold text-surface-400 uppercase text-xs">
                                {conn.type.substring(0, 2)}
                            </div>
                            <div className="flex flex-col">
                                <span className="font-semibold text-surface-900">{conn.name}</span>
                                <span className="text-xs text-surface-500 uppercase">{conn.type}</span>
                            </div>
                            <Badge variant={conn.is_active ? 'brand' : 'secondary'}>
                                {conn.is_active ? 'Active' : 'Paused'}
                            </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onTest(conn.id)}
                                disabled={!canManage}
                            >
                                Test
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:bg-red-50"
                                disabled={!canManage}
                            >
                                Remove
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
