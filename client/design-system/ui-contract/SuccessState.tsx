import React from 'react';
import { cn } from '@/lib/utils/cn';

interface SuccessStateProps {
    title: string;
    description: string;
    className?: string;
}

export const SuccessState = ({ title, description, className }: SuccessStateProps) => {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 p-12 text-center dark:border-emerald-900/20 dark:bg-emerald-900/10',
                className
            )}
        >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M20 6L9 17l-5-5" />
                </svg>
            </div>
            <h3 className="mb-2 text-lg font-bold text-emerald-900 dark:text-emerald-400 uppercase tracking-tight">{title}</h3>
            <p className="text-sm text-emerald-700/80 dark:text-emerald-500/80 max-w-sm mx-auto leading-relaxed">
                {description}
            </p>
        </div>
    );
};
