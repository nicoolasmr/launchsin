'use client';

import { useState } from 'react';
import { Button } from '@/design-system/atoms/Button';

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

interface PersonalizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    prefs: Prefs;
    onSave: (prefs: Prefs) => Promise<void>;
}

export function PersonalizationModal({ isOpen, onClose, prefs, onSave }: PersonalizationModalProps) {
    const [localPrefs, setLocalPrefs] = useState<Prefs>(prefs);
    const [activeTab, setActiveTab] = useState<'widgets' | 'layout' | 'density'>('widgets');
    const [saving, setSaving] = useState(false);

    if (!isOpen) return null;

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(localPrefs);
            onClose();
        } catch (error) {
            console.error('Failed to save preferences:', error);
        } finally {
            setSaving(false);
        }
    };

    const toggleWidget = (widget: keyof Prefs['widget_visibility']) => {
        setLocalPrefs({
            ...localPrefs,
            widget_visibility: {
                ...localPrefs.widget_visibility,
                [widget]: !localPrefs.widget_visibility[widget]
            }
        });
    };

    const moveWidget = (index: number, direction: 'up' | 'down') => {
        const newOrder = [...localPrefs.widget_order];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= newOrder.length) return;

        [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];

        setLocalPrefs({
            ...localPrefs,
            widget_order: newOrder
        });
    };

    const widgetLabels: Record<string, string> = {
        kpi: 'KPI Cards',
        decisions: 'Decisions & Actions',
        alignment: 'Alignment Summary',
        crm: 'CRM Activity',
        ops: 'Ops Health',
        recent_actions: 'Recent Actions'
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-900">⚙️ Personalizar Home</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
                        ×
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-6 py-3 border-b border-gray-200 flex gap-4">
                    <button
                        onClick={() => setActiveTab('widgets')}
                        className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'widgets'
                                ? 'bg-blue-100 text-blue-800'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        Widgets
                    </button>
                    <button
                        onClick={() => setActiveTab('layout')}
                        className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'layout'
                                ? 'bg-blue-100 text-blue-800'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        Layout
                    </button>
                    <button
                        onClick={() => setActiveTab('density')}
                        className={`px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'density'
                                ? 'bg-blue-100 text-blue-800'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        Densidade
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-6 overflow-y-auto max-h-[50vh]">
                    {activeTab === 'widgets' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 mb-4">
                                Escolha quais widgets exibir na sua Home
                            </p>
                            {Object.entries(localPrefs.widget_visibility).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <span className="font-medium text-gray-900">
                                        {widgetLabels[key] || key}
                                    </span>
                                    <button
                                        onClick={() => toggleWidget(key as keyof Prefs['widget_visibility'])}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-gray-300'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'layout' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 mb-4">
                                Reordene os widgets usando os botões ↑↓
                            </p>
                            {localPrefs.widget_order.map((widget, index) => (
                                <div key={widget} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <span className="font-medium text-gray-900">
                                        {widgetLabels[widget] || widget}
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => moveWidget(index, 'up')}
                                            disabled={index === 0}
                                            className="px-3 py-1 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            onClick={() => moveWidget(index, 'down')}
                                            disabled={index === localPrefs.widget_order.length - 1}
                                            className="px-3 py-1 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            ↓
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'density' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 mb-4">
                                Escolha a densidade da interface
                            </p>
                            <div className="space-y-3">
                                <button
                                    onClick={() => setLocalPrefs({ ...localPrefs, density: 'comfortable' })}
                                    className={`w-full p-4 border-2 rounded-lg text-left transition-colors ${localPrefs.density === 'comfortable'
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-gray-300 hover:border-gray-400'
                                        }`}
                                >
                                    <div className="font-semibold text-gray-900">Confortável</div>
                                    <div className="text-sm text-gray-600">Mais espaçamento, melhor legibilidade</div>
                                </button>
                                <button
                                    onClick={() => setLocalPrefs({ ...localPrefs, density: 'compact' })}
                                    className={`w-full p-4 border-2 rounded-lg text-left transition-colors ${localPrefs.density === 'compact'
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-gray-300 hover:border-gray-400'
                                        }`}
                                >
                                    <div className="font-semibold text-gray-900">Compacto</div>
                                    <div className="text-sm text-gray-600">Menos espaçamento, mais informação</div>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                    <Button onClick={onClose} variant="secondary">
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
