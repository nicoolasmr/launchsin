import React from 'react';
import { cn } from '@/lib/utils/cn';

interface ConfidenceBadgeProps {
    score: number; // 0 to 100
    size?: 'sm' | 'md' | 'lg';
    explanation?: string;
}

export const ConfidenceBadge = ({
    score,
    size = 'md',
    explanation = "Score based on infrastructure telemetry and historical drift analysis."
}: ConfidenceBadgeProps) => {
    const getColors = (s: number) => {
        if (s >= 90) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
        if (s >= 70) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
        return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
    };

    const sizes = {
        sm: 'px-2 py-0.5 text-[9px]',
        md: 'px-3 py-1 text-[10px]',
        lg: 'px-4 py-1.5 text-xs',
    };

    return (
        <div
            className="group relative inline-block"
            title={explanation}
        >
            <div
                className={cn(
                    'inline-flex items-center gap-2 rounded-full border font-bold tracking-widest uppercase transition-all duration-300 hover:scale-105',
                    getColors(score),
                    sizes[size]
                )}
            >
                <div className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-current"></span>
                </div>
                <span>CONFIDENCE: {score}%</span>
            </div>

            {/* Tooltip implementation placeholder - would normally use Radix UI */}
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded-md bg-surface-900 p-2 text-[10px] text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 dark:bg-brand-500/20 backdrop-blur-md border border-white/10">
                <div className="font-bold mb-1 uppercase tracking-tighter">AI Analysis</div>
                {explanation}
            </div>
        </div>
    );
};
