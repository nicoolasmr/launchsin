'use client';

import { useState } from 'react';
import { Card } from '@/design-system/atoms/Card';
import { Button } from '@/design-system/atoms/Button';
import { FixPackCard } from './FixPackCard';

interface TrackingDetection {
    meta_pixel: boolean;
    gtm: boolean;
    ga4: boolean;
    utm_params: boolean;
}

interface FixRecommendation {
    type: 'META_PIXEL' | 'GTM' | 'GA4' | 'UTM';
    severity: 'critical' | 'high' | 'medium';
    instructions: string;
    snippet_html?: string;
    snippet_nextjs?: string;
    verification: string;
}

interface FixPack {
    id: string;
    project_id: string;
    page_url: string;
    detected: TrackingDetection;
    fixes: FixRecommendation[];
    created_at: string;
}

interface FixPacksTabProps {
    projectId: string;
}

export function FixPacksTab({ projectId }: FixPacksTabProps) {
    const [fixPacks, setFixPacks] = useState<FixPack[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedPageUrl, setSelectedPageUrl] = useState<string>('');

    const fetchFixPacks = async (pageUrl?: string) => {
        setLoading(true);
        try {
            const url = pageUrl
                ? `/api/projects/${projectId}/integrations/alignment/fixpacks?page_url=${encodeURIComponent(pageUrl)}`
                : `/api/projects/${projectId}/integrations/alignment/fixpacks`;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setFixPacks(data);
            }
        } catch (error) {
            console.error('Failed to fetch fix packs:', error);
        } finally {
            setLoading(false);
        }
    };

    const generateFixPack = async (pageUrl: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/integrations/alignment/fixpack`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_url: pageUrl })
            });

            if (res.ok) {
                const newPack = await res.json();
                setFixPacks([newPack, ...fixPacks]);
            }
        } catch (error) {
            console.error('Failed to generate fix pack:', error);
        } finally {
            setLoading(false);
        }
    };

    const verifyTracking = async (pageUrl: string) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/integrations/alignment/verify-tracking`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page_url: pageUrl })
            });

            if (res.ok) {
                const result = await res.json();
                alert(`Verification job created! Job ID: ${result.job_id}\nCheck back in 30-60 seconds.`);
            }
        } catch (error) {
            console.error('Failed to verify tracking:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">Fix Packs</h2>
                    <p className="text-gray-600 mt-1">
                        Generated tracking fix recommendations for your landing pages
                    </p>
                </div>
                <Button onClick={() => fetchFixPacks()}>
                    🔄 Refresh
                </Button>
            </div>

            {/* Generate New Fix Pack */}
            <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    🔧 Generate New Fix Pack
                </h3>
                <div className="flex gap-3">
                    <input
                        type="url"
                        placeholder="https://example.com/landing-page"
                        value={selectedPageUrl}
                        onChange={(e) => setSelectedPageUrl(e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <Button
                        onClick={() => selectedPageUrl && generateFixPack(selectedPageUrl)}
                        disabled={!selectedPageUrl || loading}
                    >
                        Generate
                    </Button>
                </div>
            </Card>

            {/* Fix Packs List */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : fixPacks.length === 0 ? (
                <Card className="p-12 text-center">
                    <div className="max-w-md mx-auto">
                        <span className="text-6xl mb-4 block">🔧</span>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            No Fix Packs Yet
                        </h3>
                        <p className="text-gray-600 mb-6">
                            Generate your first fix pack by entering a landing page URL above
                        </p>
                    </div>
                </Card>
            ) : (
                <div className="space-y-6">
                    {fixPacks.map((pack) => (
                        <div key={pack.id} className="space-y-4">
                            {/* Pack Header */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        {pack.page_url}
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                        Generated {new Date(pack.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => verifyTracking(pack.page_url)}
                                >
                                    ✅ Verify Fix
                                </Button>
                            </div>

                            {/* Detection Status */}
                            <div className="flex gap-2 flex-wrap">
                                <span className={`px-3 py-1 rounded-full text-sm ${pack.detected.meta_pixel ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    Meta Pixel: {pack.detected.meta_pixel ? '✓' : '✗'}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-sm ${pack.detected.gtm ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    GTM: {pack.detected.gtm ? '✓' : '✗'}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-sm ${pack.detected.ga4 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    GA4: {pack.detected.ga4 ? '✓' : '✗'}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-sm ${pack.detected.utm_params ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    UTM: {pack.detected.utm_params ? '✓' : '✗'}
                                </span>
                            </div>

                            {/* Fix Cards */}
                            <div className="space-y-4">
                                {pack.fixes.map((fix, idx) => (
                                    <FixPackCard key={idx} fix={fix} />
                                ))}
                            </div>

                            <hr className="border-gray-200" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
