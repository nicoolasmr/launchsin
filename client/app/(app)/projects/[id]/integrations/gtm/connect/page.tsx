'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * GTM Connect Page (Phase A7)
 * 
 * OAuth flow + target selection
 * 
 * Flow:
 * 1. Click "Connect GTM" → OAuth start
 * 2. OAuth callback → success/error
 * 3. Select account/container/workspace
 * 4. Create integration_apply_targets
 */

export default function GTMConnectPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const projectId = params.id;

    const [loading, setLoading] = useState(false);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccount, setSelectedAccount] = useState('');
    const [selectedContainer, setSelectedContainer] = useState('');
    const [selectedWorkspace, setSelectedWorkspace] = useState('');

    useEffect(() => {
        // Check OAuth callback
        const success = searchParams?.get('success');
        const errorParam = searchParams?.get('error');
        const connectionId = searchParams?.get('connection_id');

        if (success === 'true' && connectionId) {
            setConnected(true);
            loadAccounts();
        } else if (errorParam) {
            setError(`OAuth failed: ${errorParam}`);
        }
    }, [searchParams]);

    const handleConnect = () => {
        setLoading(true);
        window.location.href = `/api/integrations/gtm/oauth/start?project_id=${projectId}`;
    };

    const loadAccounts = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/projects/${projectId}/integrations/gtm/accounts`);

            if (!response.ok) {
                throw new Error('Failed to load accounts');
            }

            const data = await response.json();
            setAccounts(data.accounts || []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTarget = async () => {
        try {
            setLoading(true);

            const account = accounts.find(a => a.accountId === selectedAccount);
            const container = account?.containers.find((c: any) => c.containerId === selectedContainer);
            const workspace = container?.workspaces.find((w: any) => w.workspaceId === selectedWorkspace);

            const response = await fetch(`/api/projects/${projectId}/integrations/gtm/targets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId: selectedAccount,
                    containerId: selectedContainer,
                    containerName: container?.name,
                    workspaceId: selectedWorkspace,
                    workspaceName: workspace?.name,
                    publicId: container?.publicId
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create target');
            }

            router.push(`/projects/${projectId}/integrations?success=gtm_configured`);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const selectedAccountData = accounts.find(a => a.accountId === selectedAccount);
    const selectedContainerData = selectedAccountData?.containers.find((c: any) => c.containerId === selectedContainer);

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-3xl font-bold mb-6">Connect Google Tag Manager</h1>

            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <p className="text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {!connected ? (
                <div className="border rounded-lg p-8 text-center">
                    <h2 className="text-xl font-semibold mb-4">Step 1: Authorize GTM Access</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Click below to connect your Google Tag Manager account. You'll be redirected to Google to authorize access.
                    </p>
                    <button
                        onClick={handleConnect}
                        disabled={loading}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Connecting...' : 'Connect GTM'}
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                        <p className="text-green-600 dark:text-green-400">✅ GTM Connected Successfully</p>
                    </div>

                    <div className="border rounded-lg p-6">
                        <h2 className="text-xl font-semibold mb-4">Step 2: Select Target Configuration</h2>

                        {/* Account Selector */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-2">Account</label>
                            <select
                                value={selectedAccount}
                                onChange={(e) => {
                                    setSelectedAccount(e.target.value);
                                    setSelectedContainer('');
                                    setSelectedWorkspace('');
                                }}
                                className="w-full px-3 py-2 border rounded-md"
                            >
                                <option value="">Select account...</option>
                                {accounts.map(account => (
                                    <option key={account.accountId} value={account.accountId}>
                                        {account.name} ({account.accountId})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Container Selector */}
                        {selectedAccount && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2">Container</label>
                                <select
                                    value={selectedContainer}
                                    onChange={(e) => {
                                        setSelectedContainer(e.target.value);
                                        setSelectedWorkspace('');
                                    }}
                                    className="w-full px-3 py-2 border rounded-md"
                                >
                                    <option value="">Select container...</option>
                                    {selectedAccountData?.containers.map((container: any) => (
                                        <option key={container.containerId} value={container.containerId}>
                                            {container.name} ({container.publicId})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Workspace Selector */}
                        {selectedContainer && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium mb-2">Workspace</label>
                                <select
                                    value={selectedWorkspace}
                                    onChange={(e) => setSelectedWorkspace(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-md"
                                >
                                    <option value="">Select workspace...</option>
                                    {selectedContainerData?.workspaces.map((workspace: any) => (
                                        <option key={workspace.workspaceId} value={workspace.workspaceId}>
                                            {workspace.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Create Target Button */}
                        {selectedWorkspace && (
                            <button
                                onClick={handleCreateTarget}
                                disabled={loading}
                                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Creating...' : 'Create Apply Target'}
                            </button>
                        )}
                    </div>

                    <div className="text-sm text-gray-500 border-t pt-4">
                        <p className="font-medium mb-2">ℹ️ What's next?</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li>This target will be used for auto-applying fixes to GTM</li>
                            <li>You can create multiple targets for different containers</li>
                            <li>Changes will be applied to the selected workspace</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
