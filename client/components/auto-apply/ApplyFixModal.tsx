'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';

/**
 * ApplyFixModal Component (Phase E)
 * 
 * Features:
 * - E2: Dry-run preview (show diff before apply)
 * - E3: Target selector (GTM containers)
 * - Apply button (1-click)
 * - E5: Rollback button (1-click)
 * - E4: Status pós-apply + verify link
 * 
 * PLACEHOLDER: Requires OAuth + GTM API integration
 */

interface ApplyFixModalProps {
    isOpen: boolean;
    onClose: () => void;
    fixpackId: string;
    projectId: string;
}

export function ApplyFixModal({ isOpen, onClose, fixpackId, projectId }: ApplyFixModalProps) {
    const [selectedTarget, setSelectedTarget] = useState<string>('');
    const [dryRunResult, setDryRunResult] = useState<any>(null);
    const [applyStatus, setApplyStatus] = useState<'idle' | 'dry-run' | 'applying' | 'success' | 'error'>('idle');
    const [jobId, setJobId] = useState<string | null>(null);

    // STUB: In production, fetch from API
    const targets = [
        { id: 'target-1', name: 'Production GTM (GTM-XXXXX)', type: 'GTM' },
        { id: 'target-2', name: 'Staging GTM (GTM-YYYYY)', type: 'GTM' }
    ];

    const handleDryRun = async () => {
        setApplyStatus('dry-run');

        // STUB: In production, POST /api/projects/:id/integrations/auto-apply/apply with dry_run=true
        setTimeout(() => {
            setDryRunResult({
                dry_run: true,
                diff: {
                    tags_to_create: ['GTM Snippet (pageview)', 'GA4 Config (G-XXXXXX)'],
                    tags_to_update: [],
                    estimated_changes: 2
                }
            });
            setApplyStatus('idle');
        }, 1500);
    };

    const handleApply = async () => {
        setApplyStatus('applying');

        // STUB: In production, POST /api/projects/:id/integrations/auto-apply/apply with dry_run=false
        setTimeout(() => {
            setJobId('job-stub-123');
            setApplyStatus('success');
        }, 2000);
    };

    const handleRollback = async () => {
        // STUB: In production, POST /api/projects/:id/integrations/auto-apply/rollback
        alert('Rollback initiated (STUB)');
    };

    return (
        <div className={`fixed inset-0 z-50 ${isOpen ? 'block' : 'hidden'}`}>
            <div className="fixed inset-0 bg-black/50" onClick={onClose} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 max-h-[90vh] overflow-y-auto">
                <div className="mb-6">
                    <h2 className="text-2xl font-bold">Apply Fix to GTM</h2>
                </div>

                <div className="space-y-6">
                    {/* E3: Target Selector */}
                    <div>
                        <label className="text-sm font-medium mb-2 block">Select Target</label>
                        <select
                            value={selectedTarget}
                            onChange={(e) => setSelectedTarget(e.target.value)}
                            className="w-full px-3 py-2 border rounded-md"
                        >
                            <option value="">Choose GTM container</option>
                            {targets.map(target => (
                                <option key={target.id} value={target.id}>
                                    {target.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* E2: Dry-Run Preview */}
                    {dryRunResult && (
                        <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                            <h3 className="font-medium mb-3 flex items-center gap-2">
                                ⚠️ Preview Changes
                            </h3>
                            <div className="space-y-2 text-sm">
                                <div>
                                    <p className="font-medium text-green-600">Tags to Create:</p>
                                    <ul className="list-disc list-inside ml-2">
                                        {dryRunResult.diff.tags_to_create.map((tag: string, i: number) => (
                                            <li key={i}>{tag}</li>
                                        ))}
                                    </ul>
                                </div>
                                {dryRunResult.diff.tags_to_update.length > 0 && (
                                    <div>
                                        <p className="font-medium text-blue-600">Tags to Update:</p>
                                        <ul className="list-disc list-inside ml-2">
                                            {dryRunResult.diff.tags_to_update.map((tag: string, i: number) => (
                                                <li key={i}>{tag}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                <p className="text-gray-600 dark:text-gray-400 mt-2">
                                    Estimated changes: <strong>{dryRunResult.diff.estimated_changes}</strong>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* E4: Status pós-apply */}
                    {applyStatus === 'success' && jobId && (
                        <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-900/20">
                            <div className="flex items-center gap-2 mb-2">
                                ✅ <h3 className="font-medium text-green-600">Apply Successful!</h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                Job ID: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{jobId}</code>
                            </p>
                            <div className="flex gap-2">
                                <a
                                    href={`/projects/${projectId}/tracking/verify`}
                                    className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    View Verification →
                                </a>
                                <button
                                    onClick={handleRollback}
                                    className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    Rollback
                                </button>
                            </div>
                        </div>
                    )}

                    {applyStatus === 'error' && (
                        <div className="border rounded-lg p-4 bg-red-50 dark:bg-red-900/20">
                            <div className="flex items-center gap-2">
                                ❌ <h3 className="font-medium text-red-600">Apply Failed</h3>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                Please check the logs or try again.
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                            Cancel
                        </button>

                        {!dryRunResult && (
                            <button
                                onClick={handleDryRun}
                                disabled={!selectedTarget || applyStatus === 'dry-run'}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {applyStatus === 'dry-run' ? 'Loading Preview...' : 'Preview Changes'}
                            </button>
                        )}

                        {dryRunResult && applyStatus !== 'success' && (
                            <button
                                onClick={handleApply}
                                disabled={applyStatus === 'applying'}
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {applyStatus === 'applying' ? 'Applying...' : 'Aplicar Agora'}
                            </button>
                        )}
                    </div>

                    {/* Feature Flag Notice */}
                    <div className="text-xs text-gray-500 border-t pt-3">
                        <span className="inline-block px-2 py-1 text-xs border rounded mb-2">
                            Feature Flag: auto_apply_v1
                        </span>
                        <p className="mt-2">
                            This feature requires GTM OAuth configuration. Contact admin to enable.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
