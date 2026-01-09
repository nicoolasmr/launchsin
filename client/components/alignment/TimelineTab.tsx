'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/design-system/atoms/Card';
import { Button } from '@/design-system/atoms/Button';
import { Badge } from '@/design-system/atoms/Badge';

interface TimelineItem {
    id: string;
    diff_summary: string;
    diff_json: any;
    created_at: string;
    prev_snapshot: any;
    next_snapshot: any;
}

interface TimelineTabProps {
    projectId: string;
}

export function TimelineTab({ projectId }: TimelineTabProps) {
    const [timeline, setTimeline] = useState<TimelineItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedPageUrl, setSelectedPageUrl] = useState<string>('');
    const [compareModal, setCompareModal] = useState<{ prev: any; next: any } | null>(null);

    const fetchTimeline = async (pageUrl?: string) => {
        setLoading(true);
        try {
            const url = pageUrl
                ? `/api/projects/${projectId}/integrations/alignment/timeline?page_url=${encodeURIComponent(pageUrl)}`
                : `/api/projects/${projectId}/integrations/alignment/timeline`;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setTimeline(data);
            }
        } catch (error) {
            console.error('Failed to fetch timeline:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTimeline();
    }, [projectId]);

    const openCompare = (item: TimelineItem) => {
        setCompareModal({
            prev: item.prev_snapshot,
            next: item.next_snapshot
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Change Timeline</h2>
                    <p className="text-gray-600 mt-1">
                        Track changes to your landing pages over time
                    </p>
                </div>
                <Button onClick={() => fetchTimeline()}>
                    🔄 Refresh
                </Button>
            </div>

            {/* Filter */}
            <Card className="p-4 bg-gray-50">
                <div className="flex gap-3">
                    <input
                        type="url"
                        placeholder="Filter by page URL (optional)"
                        value={selectedPageUrl}
                        onChange={(e) => setSelectedPageUrl(e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <Button
                        onClick={() => fetchTimeline(selectedPageUrl)}
                        disabled={loading}
                    >
                        Filter
                    </Button>
                    {selectedPageUrl && (
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setSelectedPageUrl('');
                                fetchTimeline();
                            }}
                        >
                            Clear
                        </Button>
                    )}
                </div>
            </Card>

            {/* Timeline List */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : timeline.length === 0 ? (
                <Card className="p-12 text-center">
                    <div className="max-w-md mx-auto">
                        <span className="text-6xl mb-4 block">📊</span>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            No Changes Yet
                        </h3>
                        <p className="text-gray-600 mb-6">
                            Timeline will show changes when your landing pages are updated
                        </p>
                    </div>
                </Card>
            ) : (
                <div className="space-y-4">
                    {timeline.map((item) => (
                        <Card key={item.id} className="p-6 hover:shadow-lg transition-shadow">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <Badge variant="brand">Change Detected</Badge>
                                        <span className="text-sm text-gray-500">
                                            {new Date(item.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                        {item.diff_summary}
                                    </h3>
                                    <p className="text-sm text-gray-600">
                                        {item.prev_snapshot?.url || item.next_snapshot?.url}
                                    </p>

                                    {/* Change Details */}
                                    <div className="mt-4 space-y-2">
                                        {item.diff_json.title && (
                                            <div className="text-sm">
                                                <span className="font-medium text-gray-700">Title:</span>
                                                <div className="ml-4 mt-1">
                                                    <div className="text-red-600">- {item.diff_json.title.old}</div>
                                                    <div className="text-green-600">+ {item.diff_json.title.new}</div>
                                                </div>
                                            </div>
                                        )}
                                        {item.diff_json.h1 && (
                                            <div className="text-sm">
                                                <span className="font-medium text-gray-700">H1:</span>
                                                <div className="ml-4 mt-1">
                                                    <div className="text-red-600">- {item.diff_json.h1.old.join(', ')}</div>
                                                    <div className="text-green-600">+ {item.diff_json.h1.new.join(', ')}</div>
                                                </div>
                                            </div>
                                        )}
                                        {item.diff_json.tracking && (
                                            <div className="text-sm">
                                                <span className="font-medium text-gray-700">Tracking Changes:</span>
                                                <div className="ml-4 mt-1 flex gap-2 flex-wrap">
                                                    {Object.entries(item.diff_json.tracking).map(([key, value]: [string, any]) => (
                                                        <Badge
                                                            key={key}
                                                            variant={value.new ? 'success' : 'warning'}
                                                        >
                                                            {key}: {value.old ? '✓' : '✗'} → {value.new ? '✓' : '✗'}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => openCompare(item)}
                                >
                                    🔍 Compare
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Compare Modal */}
            {compareModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <Card className="max-w-6xl w-full max-h-[90vh] overflow-auto">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold">Before & After Comparison</h2>
                                <Button
                                    variant="secondary"
                                    onClick={() => setCompareModal(null)}
                                >
                                    ✕ Close
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                {/* Before */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-3 text-red-600">Before</h3>
                                    <div className="space-y-2 text-sm">
                                        <div>
                                            <strong>Title:</strong> {compareModal.prev?.title || 'N/A'}
                                        </div>
                                        <div>
                                            <strong>H1:</strong> {compareModal.prev?.h1?.join(', ') || 'N/A'}
                                        </div>
                                        <div>
                                            <strong>CTAs:</strong> {compareModal.prev?.ctas?.join(', ') || 'N/A'}
                                        </div>
                                    </div>
                                </div>

                                {/* After */}
                                <div>
                                    <h3 className="text-lg font-semibold mb-3 text-green-600">After</h3>
                                    <div className="space-y-2 text-sm">
                                        <div>
                                            <strong>Title:</strong> {compareModal.next?.title || 'N/A'}
                                        </div>
                                        <div>
                                            <strong>H1:</strong> {compareModal.next?.h1?.join(', ') || 'N/A'}
                                        </div>
                                        <div>
                                            <strong>CTAs:</strong> {compareModal.next?.ctas?.join(', ') || 'N/A'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
