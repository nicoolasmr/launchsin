import React from 'react';
import { Button } from '@/design-system/atoms/Button';
import { cn } from '@/lib/utils/cn';

interface EmptyStateProps {
    title: string;
    description: string;
    icon?: React.ReactNode;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

export const EmptyState = ({
    title,
    description,
    icon,
    actionLabel,
    onAction,
    className,
}: EmptyStateProps) => {
    return (
        <div
            className={cn(
                'flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed border-surface-200 p-12 text-center dark:border-surface-800',
                className
            )}
        >
            {icon && (
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-surface-50 text-surface-400 dark:bg-surface-900/50">
                    {icon}
                </div>
            )}
            <h3 className="mb-2 text-xl font-semibold text-surface-900 dark:text-white">{title}</h3>
            <p className="mb-8 max-w-[420px] text-surface-500 dark:text-surface-400">{description}</p>
            {actionLabel && onAction && (
                <Button onClick={onAction}>{actionLabel}</Button>
            )}
        </div>
    );
};
