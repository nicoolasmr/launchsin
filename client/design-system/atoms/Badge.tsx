import React from 'react';
import { cn } from '@/lib/utils/cn';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'brand' | 'success' | 'warning' | 'error' | 'neutral' | 'outline' | 'secondary' | 'destructive';
}

export const Badge = ({ className, variant = 'neutral', ...props }: BadgeProps) => {
    const variants = {
        brand: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
        success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
        warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
        neutral: 'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300',
        outline: 'border border-surface-200 text-surface-600 dark:border-surface-700 dark:text-surface-400',
        secondary: 'bg-surface-200 text-surface-800 dark:bg-surface-700 dark:text-surface-200',
        destructive: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    };

    return (
        <div
            className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
                variants[variant],
                className
            )}
            {...props}
        />
    );
};
