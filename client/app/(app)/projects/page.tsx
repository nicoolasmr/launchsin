'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/design-system/atoms/Card';
import { Button } from '@/design-system/atoms/Button';
import { Badge } from '@/design-system/atoms/Badge';
import { PersonalizationModal } from '@/components/home/PersonalizationModal';

interface Project {
    id: string;
    name: string;
    description?: string;
    created_at: string;
}

interface Prefs {
    widget_visibility: {
        kpi: boolean;
        decisions: boolean;
        alignment: boolean;
        crm: boolean;
        ops: boolean;
        recent_actions: boolean;
    };
    widget_order: string[];
    density: 'comfortable' | 'compact';
    default_project_id: string | null;
}

export default function ProjectsPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [prefs, setPrefs] = useState<Prefs | null>(null);
    const [showPersonalization, setShowPersonalization] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchProjects();
        fetchPrefs();
    }, []);

    const fetchProjects = async () => {
        try {
            const res = await fetch('/api/projects');
            if (res.ok) {
                const data = await res.json();
                setProjects(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchPrefs = async () => {
        try {
            const res = await fetch('/api/home/prefs');
            if (res.ok) {
                const data = await res.json();
                setPrefs(data.prefs);
            }
        } catch (err) {
            console.error('Failed to fetch prefs:', err);
            // Use defaults
            setPrefs({
                widget_visibility: {
                    kpi: true,
                    decisions: true,
                    alignment: true,
                    crm: true,
                    ops: true,
                    recent_actions: true
                },
                widget_order: ['kpi', 'decisions', 'alignment', 'crm', 'ops', 'recent_actions'],
                density: 'comfortable',
                default_project_id: null
            });
        }
    };

    const savePrefs = async (newPrefs: Prefs) => {
        try {
            const res = await fetch('/api/home/prefs', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prefs: newPrefs })
            });

            if (!res.ok) throw new Error('Failed to save preferences');

            setPrefs(newPrefs);
            setToast({ message: 'Preferências salvas com sucesso!', type: 'success' });
            setTimeout(() => setToast(null), 3000);
        } catch (err: any) {
            setToast({ message: err.message, type: 'error' });
            setTimeout(() => setToast(null), 3000);
        }
    };

    // Apply density class
    const densityClass = prefs?.density === 'compact' ? 'compact' : 'comfortable';
    const cardPadding = prefs?.density === 'compact' ? 'p-4' : 'p-12';
    const gridGap = prefs?.density === 'compact' ? 'gap-4' : 'gap-6';

    return (
        <div className={`min-h-screen bg-gray-50 p-8 ${densityClass}`}>
            {/* Personalization Modal */}
            {prefs && (
                <PersonalizationModal
                    isOpen={showPersonalization}
                    onClose={() => setShowPersonalization(false)}
                    prefs={prefs}
                    onSave={savePrefs}
                />
            )}

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${toast.type === 'success'
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                    {toast.message}
                </div>
            )}

            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">My Projects</h1>
                        <p className="text-gray-600 mt-2">Manage your marketing campaigns and integrations</p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => setShowPersonalization(true)} variant="secondary">
                            ⚙️ Personalizar
                        </Button>
                        <Button onClick={() => router.push('/projects/new')}>
                            + New Project
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : projects.length === 0 ? (
                    <Card className={`${cardPadding} text-center bg-gray-900 text-white`}>
                        <div className="max-w-md mx-auto">
                            <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
                            <p className="text-gray-300 mb-6">
                                Create your first project to start tracking your marketing campaigns
                            </p>
                            <Button onClick={() => router.push('/projects/new')}>
                                Create Your First Project
                            </Button>
                        </div>
                    </Card>
                ) : (
                    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${gridGap}`}>
                        {projects.map(project => (
                            <Card
                                key={project.id}
                                className={`${prefs?.density === 'compact' ? 'p-4' : 'p-6'} hover:shadow-lg transition-shadow cursor-pointer`}
                                onClick={() => router.push(`/projects/${project.id}/integrations`)}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                                    <Badge variant="brand">Active</Badge>
                                </div>
                                {project.description && (
                                    <p className="text-gray-600 text-sm mb-4">{project.description}</p>
                                )}
                                <div className="text-xs text-gray-500">
                                    Created {new Date(project.created_at).toLocaleDateString()}
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                <div className="mt-12 text-center">
                    <p className="text-sm text-gray-500">
                        Need help? Check out our{' '}
                        <a href="/docs" className="text-blue-600 hover:underline">documentation</a>
                        {' '}or{' '}
                        <a href="/support" className="text-blue-600 hover:underline">contact support</a>
                    </p>
                </div>
            </div>
        </div>
    );
}
