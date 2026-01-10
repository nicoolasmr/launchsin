'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Apply Fix to GTM</DialogTitle>
                </DialogHeader>

                <div className="space-y-6">
                    {/* E3: Target Selector */}
                    <div>
                        <label className="text-sm font-medium mb-2 block">Select Target</label>
                        <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose GTM container" />
                            </SelectTrigger>
                            <SelectContent>
                                {targets.map(target => (
                                    <SelectItem key={target.id} value={target.id}>
                                        {target.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* E2: Dry-Run Preview */}
                    {dryRunResult && (
                        <div className="border rounded-lg p-4 bg-muted/50">
                            <h3 className="font-medium mb-3 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                Preview Changes
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
                                <p className="text-muted-foreground mt-2">
                                    Estimated changes: <strong>{dryRunResult.diff.estimated_changes}</strong>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* E4: Status pós-apply */}
                    {applyStatus === 'success' && jobId && (
                        <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <h3 className="font-medium text-green-600">Apply Successful!</h3>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">
                                Job ID: <code className="bg-muted px-1 rounded">{jobId}</code>
                            </p>
                            <div className="flex gap-2">
                                <Button size="sm" variant="outline" asChild>
                                    <a href={`/projects/${projectId}/tracking/verify`}>
                                        View Verification →
                                    </a>
                                </Button>
                                <Button size="sm" variant="outline" onClick={handleRollback}>
                                    Rollback
                                </Button>
                            </div>
                        </div>
                    )}

                    {applyStatus === 'error' && (
                        <div className="border rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
                            <div className="flex items-center gap-2">
                                <XCircle className="h-5 w-5 text-red-600" />
                                <h3 className="font-medium text-red-600">Apply Failed</h3>
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">
                                Please check the logs or try again.
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>

                        {!dryRunResult && (
                            <Button
                                onClick={handleDryRun}
                                disabled={!selectedTarget || applyStatus === 'dry-run'}
                            >
                                {applyStatus === 'dry-run' ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Loading Preview...
                                    </>
                                ) : (
                                    'Preview Changes'
                                )}
                            </Button>
                        )}

                        {dryRunResult && applyStatus !== 'success' && (
                            <Button
                                onClick={handleApply}
                                disabled={applyStatus === 'applying'}
                            >
                                {applyStatus === 'applying' ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Applying...
                                    </>
                                ) : (
                                    'Aplicar Agora'
                                )}
                            </Button>
                        )}
                    </div>

                    {/* Feature Flag Notice */}
                    <div className="text-xs text-muted-foreground border-t pt-3">
                        <Badge variant="outline" className="text-xs">
                            Feature Flag: auto_apply_v1
                        </Badge>
                        <p className="mt-2">
                            This feature requires GTM OAuth configuration. Contact admin to enable.
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
