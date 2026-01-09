
import React, { useState, useEffect } from 'react';
import { Button } from '@/design-system/atoms/Button';
import { Card } from '@/design-system/atoms/Card';
import { Input } from '@/design-system/atoms/Input';
import { Badge } from '@/design-system/atoms/Badge';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Schedule {
    id: string;
    project_id: string;
    cadence: 'daily' | 'weekly';
    timezone: string;
    budget_daily_max_checks: number;
    enabled: boolean;
    target_urls_json: string[];
    quiet_hours?: { start: string; end: string };
}

export function SchedulesTab({ projectId }: { projectId: string }) {
    const { toast } = useToast();
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form State
    const [newUrl, setNewUrl] = useState('');
    const [newBudget, setNewBudget] = useState(50);

    // Edit Form State
    const [editBudget, setEditBudget] = useState(50);
    const [editEnabled, setEditEnabled] = useState(true);
    const [editCadence, setEditCadence] = useState<'daily' | 'weekly'>('daily');

    const fetchSchedules = async () => {
        try {
            const res = await fetch(`/api/projects/${projectId}/integrations/alignment/schedules`);
            if (res.ok) {
                const data = await res.json();
                setSchedules(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSchedules();
    }, [projectId]);

    const handleCreate = async () => {
        if (!newUrl) return;
        setIsCreating(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/integrations/alignment/schedules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_urls_json: [newUrl],
                    budget_daily_max_checks: newBudget,
                    cadence: 'daily',
                    enabled: true,
                    quiet_hours: { start: "22:00", end: "07:00" }
                })
            });
            if (!res.ok) throw new Error('Failed');
            await fetchSchedules();
            setNewUrl('');
            toast({ title: 'Schedule created' });
        } catch (e) {
            toast({ title: 'Error creating schedule', variant: 'destructive' });
        } finally {
            setIsCreating(false);
        }
    };

    const handleEdit = (schedule: Schedule) => {
        setEditingSchedule(schedule);
        setEditBudget(schedule.budget_daily_max_checks);
        setEditEnabled(schedule.enabled);
        setEditCadence(schedule.cadence);
    };

    const handleSaveEdit = async () => {
        if (!editingSchedule) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/projects/${projectId}/integrations/alignment/schedules/${editingSchedule.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    budget_daily_max_checks: editBudget,
                    enabled: editEnabled,
                    cadence: editCadence
                })
            });
            if (!res.ok) throw new Error('Failed to update');

            // Optimistic UI update
            setSchedules(prev => prev.map(s =>
                s.id === editingSchedule.id
                    ? { ...s, budget_daily_max_checks: editBudget, enabled: editEnabled, cadence: editCadence }
                    : s
            ));

            setEditingSchedule(null);
            toast({ title: 'Schedule updated successfully' });
        } catch (e) {
            toast({ title: 'Error updating schedule', variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/projects/${projectId}/integrations/alignment/schedules/${id}`, { method: 'DELETE' });
            await fetchSchedules();
            toast({ title: 'Schedule deleted' });
        } catch (e) {
            toast({ title: 'Error deleting', variant: 'destructive' });
        }
    };

    return (
        <div className="space-y-6">
            <Card className="p-6">
                <h3 className="text-lg font-bold mb-4">Create Schedule</h3>
                <div className="flex gap-4 items-end">
                    <div className="flex-1 space-y-2">
                        <label className="text-sm font-medium">Target URL</label>
                        <Input
                            value={newUrl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewUrl(e.target.value)}
                            placeholder="https://example.com/landing"
                        />
                    </div>
                    <div className="max-w-[150px] space-y-2">
                        <label className="text-sm font-medium">Daily Budget</label>
                        <Input
                            type="number"
                            value={newBudget}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewBudget(Number(e.target.value))}
                        />
                    </div>
                    <Button onClick={handleCreate} isLoading={isCreating}>Enable Schedule</Button>
                </div>
            </Card>

            <div className="space-y-4">
                <h3 className="text-lg font-medium">Active Schedules</h3>
                {isLoading ? (
                    <div className="animate-pulse h-20 bg-gray-100 rounded" />
                ) : schedules.length === 0 ? (
                    <p className="text-gray-500">No active schedules.</p>
                ) : (
                    schedules.map(sch => (
                        <Card key={sch.id} className="p-4 flex items-center justify-between">
                            <div>
                                <div className="flex gap-2 items-center mb-1">
                                    <span className="font-mono text-sm">{sch.target_urls_json?.[0]}</span>
                                    <Badge variant={sch.enabled ? 'brand' : 'neutral'}>
                                        {sch.enabled ? 'Active' : 'Paused'}
                                    </Badge>
                                </div>
                                <div className="text-xs text-gray-500 flex gap-4">
                                    <span>Cadence: {sch.cadence}</span>
                                    <span>Budget: {sch.budget_daily_max_checks}/day</span>
                                    <span>Zone: {sch.timezone}</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => handleEdit(sch)}>
                                    Edit
                                </Button>
                                <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDelete(sch.id)}>
                                    Delete
                                </Button>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            {/* Edit Modal */}
            <Dialog open={!!editingSchedule} onOpenChange={() => setEditingSchedule(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Schedule</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Daily Budget (1-1000)</label>
                            <Input
                                type="number"
                                min={1}
                                max={1000}
                                value={editBudget}
                                onChange={(e) => setEditBudget(Number(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Cadence</label>
                            <select
                                className="w-full border rounded px-3 py-2"
                                value={editCadence}
                                onChange={(e) => setEditCadence(e.target.value as 'daily' | 'weekly')}
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="edit-enabled"
                                checked={editEnabled}
                                onChange={(e) => setEditEnabled(e.target.checked)}
                            />
                            <label htmlFor="edit-enabled" className="text-sm font-medium">Enabled</label>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setEditingSchedule(null)}>Cancel</Button>
                        <Button onClick={handleSaveEdit} isLoading={isSaving}>Save Changes</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
