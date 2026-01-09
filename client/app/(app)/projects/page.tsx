'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/design-system/atoms/Card';
import { Button } from '@/design-system/atoms/Button';
import { Badge } from '@/design-system/atoms/Badge';

interface Project {
    id: string;
    name: string;
    description?: string;
    created_at: string;
}

export default function ProjectsPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProjects();
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

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">My Projects</h1>
                        <p className="text-gray-600 mt-2">Manage your marketing campaigns and integrations</p>
                    </div>
                    <Button onClick={() => router.push('/projects/new')}>
                        + New Project
                    </Button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : projects.length === 0 ? (
                    <Card className="p-12 text-center">
                        <div className="max-w-md mx-auto">
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">No projects yet</h3>
                            <p className="text-gray-600 mb-6">
                                Create your first project to start tracking your marketing campaigns
                            </p>
                            <Button onClick={() => router.push('/projects/new')}>
                                Create Your First Project
                            </Button>
                        </div>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map(project => (
                            <Card
                                key={project.id}
                                className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
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
