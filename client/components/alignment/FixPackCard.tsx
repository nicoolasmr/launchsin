'use client';

import { useState } from 'react';
import { Card } from '@/design-system/atoms/Card';
import { Button } from '@/design-system/atoms/Button';
import { Badge } from '@/design-system/atoms/Badge';

interface FixRecommendation {
    type: 'META_PIXEL' | 'GTM' | 'GA4' | 'UTM';
    severity: 'critical' | 'high' | 'medium';
    instructions: string;
    snippet_html?: string;
    snippet_nextjs?: string;
    verification: string;
}

interface FixPackCardProps {
    fix: FixRecommendation;
}

export function FixPackCard({ fix }: FixPackCardProps) {
    const [copiedHtml, setCopiedHtml] = useState(false);
    const [copiedNextjs, setCopiedNextjs] = useState(false);

    const copyToClipboard = async (text: string, type: 'html' | 'nextjs') => {
        try {
            await navigator.clipboard.writeText(text);
            if (type === 'html') {
                setCopiedHtml(true);
                setTimeout(() => setCopiedHtml(false), 2000);
            } else {
                setCopiedNextjs(true);
                setTimeout(() => setCopiedNextjs(false), 2000);
            }
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return 'bg-red-100 text-red-800 border-red-200';
            case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'META_PIXEL': return '📱';
            case 'GTM': return '🏷️';
            case 'GA4': return '📊';
            case 'UTM': return '🔗';
            default: return '🔧';
        }
    };

    return (
        <Card className="p-6 border-l-4 border-l-blue-500">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{getTypeIcon(fix.type)}</span>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            {fix.type.replace('_', ' ')}
                        </h3>
                        <Badge variant="warning" className={getSeverityColor(fix.severity)}>
                            {fix.severity.toUpperCase()}
                        </Badge>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {/* Instructions */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-blue-900 mb-1">📋 Instructions</p>
                    <p className="text-sm text-blue-800">{fix.instructions}</p>
                </div>

                {/* HTML Snippet */}
                {fix.snippet_html && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700">HTML Snippet</label>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => copyToClipboard(fix.snippet_html!, 'html')}
                            >
                                {copiedHtml ? '✓ Copied!' : '📋 Copy'}
                            </Button>
                        </div>
                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
                            <code>{fix.snippet_html}</code>
                        </pre>
                    </div>
                )}

                {/* Next.js Snippet */}
                {fix.snippet_nextjs && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium text-gray-700">Next.js Snippet</label>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => copyToClipboard(fix.snippet_nextjs!, 'nextjs')}
                            >
                                {copiedNextjs ? '✓ Copied!' : '📋 Copy'}
                            </Button>
                        </div>
                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
                            <code>{fix.snippet_nextjs}</code>
                        </pre>
                    </div>
                )}

                {/* Verification */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-green-900 mb-1">✅ Verification</p>
                    <p className="text-sm text-green-800">{fix.verification}</p>
                </div>
            </div>
        </Card>
    );
}
