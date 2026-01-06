import React from 'react';
import { Button } from '@/design-system/atoms/Button';
import { Search, Bell, UserCircle } from 'lucide-react';

export const Header = () => {
    return (
        <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-surface-200 bg-white/80 px-8 backdrop-blur-md dark:border-surface-800 dark:bg-surface-950/80">
            <div className="flex flex-1 items-center gap-4">
                <div className="relative w-96">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                    <input
                        type="text"
                        placeholder="Search resources, jobs, logs..."
                        className="h-9 w-full rounded-md border border-surface-200 bg-surface-50/50 pl-10 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-surface-800 dark:bg-surface-900/50"
                    />
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-500"></span>
                </Button>
                <div className="mx-2 h-6 w-px bg-surface-200 dark:bg-surface-800"></div>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                    <div className="h-7 w-7 rounded-full bg-surface-200 dark:bg-surface-800 flex items-center justify-center">
                        <UserCircle className="h-5 w-5 text-surface-500" />
                    </div>
                    <div className="hidden text-left sm:block">
                        <p className="text-xs font-semibold">Admin User</p>
                        <p className="text-[10px] text-surface-500 italic">LaunchSin Org</p>
                    </div>
                </Button>
            </div>
        </header>
    );
};
