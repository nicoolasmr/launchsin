'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Rocket } from 'lucide-react';
import { ApplyFixModal } from '@/components/auto-apply/ApplyFixModal';

/**
 * ApplyFixButton Component (Phase E1)
 * 
 * Feature-flagged button to apply fixes via GTM
 * 
 * Usage:
 * <ApplyFixButton fixpackId="uuid" projectId="uuid" />
 */

interface ApplyFixButtonProps {
    fixpackId: string;
    projectId: string;
    featureEnabled?: boolean; // Feature flag: auto_apply_v1
}

export function ApplyFixButton({ fixpackId, projectId, featureEnabled = false }: ApplyFixButtonProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Feature flag check
    if (!featureEnabled) {
        return null;
    }

    return (
        <>
            <Button
                onClick={() => setIsModalOpen(true)}
                className="gap-2"
            >
                <Rocket className="h-4 w-4" />
                Apply Fix
            </Button>

            <ApplyFixModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                fixpackId={fixpackId}
                projectId={projectId}
            />
        </>
    );
}
