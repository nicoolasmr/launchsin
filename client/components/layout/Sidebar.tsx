import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

const navigation = [
    { name: 'Home', href: '/home', icon: '🏠' },
    { name: 'Projects', href: '/projects', icon: '📁' },
    { name: 'Campaigns', href: '/campaigns', icon: '📢' },
    { name: 'Analytics', href: '/analytics', icon: '📊' },
    { name: 'Integrations', href: '/integrations', icon: '🔌' },
    { name: 'Settings', href: '/settings', icon: '⚙️' },
];

export const Sidebar = () => {
    return (
        <aside className="fixed left-0 top-0 h-full w-64 border-r border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-950">
            <div className="flex h-16 items-center px-6">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-brand-500 shadow-minimal"></div>
                    <span className="text-xl font-bold tracking-tight">LaunchSin</span>
                </div>
            </div>

            <nav className="mt-6 flex-1 space-y-1 px-3">
                {navigation.map((item) => (
                    <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                            "group flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-all hover:bg-surface-100 dark:hover:bg-surface-900",
                            "text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-white"
                        )}
                    >
                        <span className="mr-3 text-lg">{item.icon}</span>
                        {item.name}
                    </Link>
                ))}
            </nav>

            <div className="absolute bottom-6 w-full px-6">
                <div className="rounded-lg bg-brand-50/50 p-4 dark:bg-brand-950/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-brand-600">User Plan</p>
                    <p className="mt-1 text-xs text-surface-500">Marketing Suite</p>
                </div>
            </div>
        </aside>
    );
};
