import { Card } from '@/design-system/atoms/Card';

export default function AutomationsPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-surface-900 dark:text-white">
                Automations
            </h1>
            <Card className="flex h-64 items-center justify-center border-dashed bg-surface-50 dark:bg-surface-900">
                <div className="text-center">
                    <p className="text-lg font-medium text-surface-900 dark:text-white">Coming Soon</p>
                    <p className="text-sm text-surface-500">Global automation workflows will appear here.</p>
                </div>
            </Card>
        </div>
    );
}
