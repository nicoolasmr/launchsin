'use client';

import { useState } from 'react';
import { ApplyFixModal } from '@/components/auto-apply/ApplyFixModal';
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
            <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
                🚀 Apply Fix
            </button>

            <ApplyFixModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                fixpackId={fixpackId}
                projectId={projectId}
            />
        </>
    );
}
