
import React, { useState, useEffect } from 'react';
import { Button } from '@/design-system/atoms/Button';
import { Card } from '@/design-system/atoms/Card';
import { Input } from '@/design-system/atoms/Input';
import { Badge } from '@/design-system/atoms/Badge';
import { useToast } from '@/components/ui/use-toast';

interface Notification {
    id: string;
    channel: string;
    enabled: boolean;
    created_at: string;
    last_sent_at?: string;
    total_sent?: number;
}

export function NotificationsTab({ projectId }: { projectId: string }) {
    const { toast } = useToast();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [testingId, setTestingId] = useState<string | null>(null);

    const [newChannel, setNewChannel] = useState('');
    const [newWebhookUrl, setNewWebhookUrl] = useState('');

    const fetchNotifications = async () => {
        try {
            const res = await fetch(`/api/projects/${projectId}/integrations/alignment/notifications`);
            if (res.ok) {
                const data = await res.json();
                setNotifications(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, [projectId]);

    const handleCreate = async () => {
        if (!newChannel || !newWebhookUrl) return;
        setIsCreating(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/integrations/alignment/notifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: newChannel,
                    webhook_url: newWebhookUrl
                })
            });
            if (!res.ok) throw new Error('Failed');
            await fetchNotifications();
            setNewChannel('');
            setNewWebhookUrl('');
            toast({ title: 'Notification channel added' });
        } catch (e) {
            toast({ title: 'Error adding channel', variant: 'destructive' });
        } finally {
            setIsCreating(false);
        }
    };

    const handleTestWebhook = async (id: string) => {
        setTestingId(id);
        try {
            const res = await fetch(`/api/projects/${projectId}/integrations/alignment/notifications/${id}/test`, {
                method: 'POST'
            });
            if (!res.ok) throw new Error('Test failed');
            toast({ title: 'Test message sent successfully!' });
        } catch (e) {
            toast({ title: 'Test failed - check webhook URL', variant: 'destructive' });
        } finally {
            setTestingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/projects/${projectId}/integrations/alignment/notifications/${id}`, { method: 'DELETE' });
            await fetchNotifications();
            toast({ title: 'Notification deleted' });
        } catch (e) {
            toast({ title: 'Error deleting', variant: 'destructive' });
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'Never';
        return new Date(dateStr).toLocaleString();
    };

    return (
        <div className="space-y-6">
            <Card className="p-6">
                <h3 className="text-lg font-bold mb-4">Add Notification Channel</h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Channel Name</label>
                        <Input
                            value={newChannel}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewChannel(e.target.value)}
                            placeholder="Slack Marketing Alerts"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Webhook URL</label>
                        <Input
                            value={newWebhookUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewWebhookUrl(e.target.value)}
                            placeholder="https://hooks.slack.com/services/..."
                            type="password"
                        />
                    </div>
                    <Button onClick={handleCreate} isLoading={isCreating}>Add Channel</Button>
                </div>
            </Card>

            <div className="space-y-4">
                <h3 className="text-lg font-medium">Active Channels</h3>
                {isLoading ? (
                    <div className="animate-pulse h-20 bg-gray-100 rounded" />
                ) : notifications.length === 0 ? (
                    <p className="text-gray-500">No notification channels configured.</p>
                ) : (
                    notifications.map(notif => (
                        <Card key={notif.id} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex gap-2 items-center">
                                    <span className="font-medium">{notif.channel}</span>
                                    <Badge variant={notif.enabled ? 'brand' : 'neutral'}>
                                        {notif.enabled ? 'Active' : 'Disabled'}
                                    </Badge>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleTestWebhook(notif.id)}
                                        isLoading={testingId === notif.id}
                                    >
                                        Test Webhook
                                    </Button>
                                    <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(notif.id)}>
                                        Delete
                                    </Button>
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 flex gap-4">
                                <span>Created: {formatDate(notif.created_at)}</span>
                                <span>Last Sent: {formatDate(notif.last_sent_at)}</span>
                                {notif.total_sent !== undefined && (
                                    <span>Total Sent: {notif.total_sent}</span>
                                )}
                            </div>
                        </Card>
                    ))
                )}
            </div>
            <p className="text-xs text-gray-400">
                Alerts are dispatched when Score &lt; 50 or Tracking is missing.
            </p>
        </div>
    );
}
