import React from 'react';
import { cn } from '@/lib/utils/cn';
import { Lock } from 'lucide-react';

interface ActionBlockedProps {
    reason: string;
    action?: {
        label: string;
        href?: string;
    };
    className?: string;
}

export const ActionBlocked = ({ reason, action, className }: ActionBlockedProps) => {
    return (
        <div
            className={cn(
                'group relative cursor-not-allowed grayscale opacity-70 transition-all hover:opacity-100 hover:grayscale-0',
                className
            )}
        >
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/10 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="rounded-md bg-surface-950/90 px-3 py-1.5 text-[10px] font-bold text-white shadow-xl flex items-center gap-2 border border-white/10">
                    <Lock className="h-3 w-3 text-amber-500" />
                    {reason}
                </div>
            </div>
            {/* Wrapped Content */}
            <div className="pointer-events-none">
                {/* Placeholder for children if needed */}
                <div className="h-10 w-full rounded-md bg-surface-200 dark:bg-surface-800 animate-pulse"></div>
            </div>
        </div>
    );
};
