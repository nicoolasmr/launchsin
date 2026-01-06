import React from 'react';
import { Button } from '@/design-system/atoms/Button';
import { cn } from '@/lib/utils/cn';

interface ErrorStateProps {
    title?: string;
    description?: string;
    onRetry?: () => void;
    className?: string;
}

export const ErrorState = ({
    title = 'Something went wrong',
    description = 'An unexpected error occurred. Please try again or contact support if the issue persists.',
    onRetry,
    className,
}: ErrorStateProps) => {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center rounded-lg border border-red-100 bg-red-50 p-12 text-center dark:border-red-900/20 dark:bg-red-900/10',
                className
            )}
        >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-red-900 dark:text-red-300">{title}</h3>
            <p className="mb-8 max-w-[420px] text-red-700/80 dark:text-red-400/80">{description}</p>
            {onRetry && (
                <Button variant="secondary" onClick={onRetry}>
                    Try Again
                </Button>
            )}
        </div>
    );
};
