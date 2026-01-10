import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import {
    LayoutDashboard,
    FolderKanban,
    Megaphone,
    BarChart3,
    Network,
    Wrench,
    Settings
} from 'lucide-react';

const navigation = [
    { name: 'Command Center', href: '/home', icon: LayoutDashboard },
    { name: 'Projects', href: '/projects', icon: FolderKanban },
    { name: 'Campaigns', href: '/campaigns', icon: Megaphone },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Integrations', href: '/integrations', icon: Network },
    { name: 'Ops Console', href: '/infra', icon: Wrench },
    { name: 'Settings', href: '/settings', icon: Settings },
];

export const Sidebar = () => {
    const pathname = usePathname();

    return (
        <aside className="fixed left-0 top-0 h-full w-64 border-r border-t border-white/10 bg-slate-900/95 backdrop-blur-xl text-slate-300 shadow-2xl z-50">
            {/* Logo Section */}
            <div className="flex h-16 items-center px-6 border-b border-white/5">
                <div className="flex items-center gap-3 group cursor-pointer">
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/20 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                        <span className="text-white font-bold text-lg leading-none">L</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white group-hover:text-blue-400 transition-colors">
                        LaunchSin
                    </span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="mt-8 flex-1 space-y-1 px-4">
                {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "group flex items-center rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                                isActive
                                    ? "bg-gradient-to-r from-blue-600/20 to-indigo-600/20 text-blue-400 shadow-sm border border-blue-500/10"
                                    : "text-slate-400 hover:bg-white/5 hover:text-white hover:translate-x-1"
                            )}
                        >
                            <Icon className={cn(
                                "mr-3 h-5 w-5 transition-colors",
                                isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
                            )} />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>

            {/* User Plan */}
            <div className="absolute bottom-6 w-full px-4">
                <div className="rounded-xl bg-gradient-to-b from-slate-800/50 to-slate-900/50 p-4 border border-white/5 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500">Current Plan</span>
                        <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                    </div>
                    <p className="text-sm font-medium text-white">Marketing Suite</p>
                    <p className="text-xs text-slate-500 mt-1">Pro Edition</p>
                </div>
            </div>
        </aside>
    );
};
