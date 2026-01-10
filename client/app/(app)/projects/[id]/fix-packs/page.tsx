'use client';

import { useState, useEffect } from 'react';
import { ApplyFixButton } from '@/components/auto-apply/ApplyFixButton';

/**
 * Fix Packs Page (Phase C6)
 * 
 * Displays tracking fix packs with "Apply via GTM" button
 * 
 * Feature flag: auto_apply_v1
 */

interface FixPack {
    id: string;
    project_id: string;
    page_url: string;
    detected_json: any;
    fixes_json: any[];
    status: string;
    created_at: string;
}

export default function FixPacksPage({ params }: { params: { id: string } }) {
    const projectId = params.id;
    const [fixPacks, setFixPacks] = useState<FixPack[]>([]);
    const [loading, setLoading] = useState(true);
    const [featureEnabled, setFeatureEnabled] = useState(false);

    useEffect(() => {
        loadFixPacks();
        checkFeatureFlag();
    }, [projectId]);

    const loadFixPacks = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/projects/${projectId}/tracking/fix-packs`);

            if (!response.ok) {
                throw new Error('Failed to load fix packs');
            }

            const data = await response.json();
            setFixPacks(data.fix_packs || []);
        } catch (error) {
            console.error('Failed to load fix packs:', error);
        } finally {
            setLoading(false);
        }
    };

    const checkFeatureFlag = async () => {
        try {
            // Feature flag check
            const enabled = process.env.NEXT_PUBLIC_AUTO_APPLY_V1 === 'true';
            setFeatureEnabled(enabled);
        } catch (error) {
            console.error('Failed to check feature flag:', error);
        }
    };

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto p-6">
                <h1 className="text-3xl font-bold mb-6">Fix Packs</h1>
                <p className="text-gray-600">Loading...</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold">Fix Packs</h1>
                {featureEnabled && (
                    <div className="text-sm text-gray-500 border px-3 py-1 rounded">
                        Auto-Apply: Enabled
                    </div>
                )}
            </div>

            {fixPacks.length === 0 ? (
                <div className="border rounded-lg p-8 text-center">
                    <p className="text-gray-600">No fix packs found</p>
                    <p className="text-sm text-gray-500 mt-2">
                        Fix packs will appear here when tracking issues are detected
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {fixPacks.map((fixPack) => (
                        <div key={fixPack.id} className="border rounded-lg p-6">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold mb-2">
                                        {fixPack.page_url}
                                    </h3>
                                    <div className="flex gap-4 text-sm text-gray-600">
                                        <span>
                                            Status: <strong>{fixPack.status}</strong>
                                        </span>
                                        <span>
                                            Fixes: <strong>{fixPack.fixes_json?.length || 0}</strong>
                                        </span>
                                        <span>
                                            Created: {new Date(fixPack.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>

                                {/* C6: Apply via GTM button */}
                                <ApplyFixButton
                                    fixpackId={fixPack.id}
                                    projectId={projectId}
                                    featureEnabled={featureEnabled}
                                />
                            </div>

                            {/* Detected Issues */}
                            {fixPack.detected_json && (
                                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded">
                                    <h4 className="font-medium mb-2">Detected Issues:</h4>
                                    <ul className="list-disc list-inside text-sm space-y-1">
                                        {Object.entries(fixPack.detected_json).map(([key, value]) => (
                                            <li key={key}>
                                                {key}: {JSON.stringify(value)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Proposed Fixes */}
                            {fixPack.fixes_json && fixPack.fixes_json.length > 0 && (
                                <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded">
                                    <h4 className="font-medium mb-2">Proposed Fixes:</h4>
                                    <ul className="list-disc list-inside text-sm space-y-1">
                                        {fixPack.fixes_json.map((fix, idx) => (
                                            <li key={idx}>
                                                {fix.type}: {fix.description || 'Auto-generated fix'}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
