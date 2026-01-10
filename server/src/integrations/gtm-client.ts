import { logger } from '../infra/structured-logger';
import { gtmConnector } from './gtm-connector';

/**
 * GTM API Client (Phase B)
 * 
 * Real implementation for GTM Tag Manager API v2
 * 
 * Features:
 * - Token management (auto-refresh)
 * - Tag CRUD operations
 * - Version management
 * - Workspace state snapshots
 * - Error handling (rate limits, permissions)
 */

export interface GTMTag {
    tagId?: string;
    name: string;
    type: string;
    parameter: Array<{ key: string; value: string; type: string }>;
    firingTriggerId: string[];
    path?: string;
}

export interface GTMTrigger {
    triggerId?: string;
    name: string;
    type: string;
    filter?: any[];
    path?: string;
}

export interface GTMWorkspaceSnapshot {
    workspaceId: string;
    containerId: string;
    containerVersionId?: string;
    tags: GTMTag[];
    triggers: GTMTrigger[];
    variables: any[];
    snapshotAt: string;
}

export class GTMClient {
    private orgId: string;
    private connectionId: string;
    private accountId: string;
    private containerId: string;
    private workspaceId: string;

    constructor(orgId: string, connectionId: string, accountId: string, containerId: string, workspaceId: string) {
        this.orgId = orgId;
        this.connectionId = connectionId;
        this.accountId = accountId;
        this.containerId = containerId;
        this.workspaceId = workspaceId;
    }

    /**
     * Get workspace state (for snapshot before apply)
     */
    async getWorkspaceState(): Promise<GTMWorkspaceSnapshot> {
        try {
            const accessToken = await gtmConnector.getAccessToken(this.orgId, this.connectionId);
            const workspacePath = `accounts/${this.accountId}/containers/${this.containerId}/workspaces/${this.workspaceId}`;

            // Fetch workspace info
            const wsResponse = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${workspacePath}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!wsResponse.ok) {
                throw new Error(`Failed to fetch workspace: ${wsResponse.statusText}`);
            }

            const workspace = await wsResponse.json();

            // Fetch tags
            const tagsResponse = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${workspacePath}/tags`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const tagsData = await tagsResponse.json();
            const tags = (tagsData.tag || []).map((tag: any) => ({
                tagId: tag.tagId,
                name: tag.name,
                type: tag.type,
                parameter: tag.parameter || [],
                firingTriggerId: tag.firingTriggerId || [],
                path: tag.path
            }));

            // Fetch triggers
            const triggersResponse = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${workspacePath}/triggers`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const triggersData = await triggersResponse.json();
            const triggers = (triggersData.trigger || []).map((trigger: any) => ({
                triggerId: trigger.triggerId,
                name: trigger.name,
                type: trigger.type,
                filter: trigger.filter,
                path: trigger.path
            }));

            return {
                workspaceId: this.workspaceId,
                containerId: this.containerId,
                containerVersionId: workspace.containerVersionId,
                tags,
                triggers,
                variables: [],
                snapshotAt: new Date().toISOString()
            };
        } catch (error: any) {
            logger.error('Failed to get workspace state', { error: error.message });
            throw error;
        }
    }

    /**
     * Create tag in workspace (idempotent - update if exists)
     */
    async upsertTag(tagConfig: GTMTag): Promise<GTMTag> {
        try {
            const accessToken = await gtmConnector.getAccessToken(this.orgId, this.connectionId);
            const workspacePath = `accounts/${this.accountId}/containers/${this.containerId}/workspaces/${this.workspaceId}`;

            // Check if tag exists
            const existingTags = await this.listTags();
            const existingTag = existingTags.find(t => t.name === tagConfig.name);

            if (existingTag) {
                // Update existing tag
                logger.info('Updating existing GTM tag', { tagName: tagConfig.name });

                const response = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${existingTag.path}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: tagConfig.name,
                        type: tagConfig.type,
                        parameter: tagConfig.parameter,
                        firingTriggerId: tagConfig.firingTriggerId
                    })
                });

                if (!response.ok) {
                    throw new Error(`Failed to update tag: ${response.statusText}`);
                }

                return await response.json();
            } else {
                // Create new tag
                logger.info('Creating new GTM tag', { tagName: tagConfig.name });

                const response = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${workspacePath}/tags`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: tagConfig.name,
                        type: tagConfig.type,
                        parameter: tagConfig.parameter,
                        firingTriggerId: tagConfig.firingTriggerId
                    })
                });

                if (!response.ok) {
                    throw new Error(`Failed to create tag: ${response.statusText}`);
                }

                return await response.json();
            }
        } catch (error: any) {
            logger.error('Failed to upsert tag', { error: error.message });
            throw error;
        }
    }

    /**
     * Create or get "All Pages" trigger
     */
    async ensureAllPagesTrigger(): Promise<string> {
        try {
            const accessToken = await gtmConnector.getAccessToken(this.orgId, this.connectionId);
            const workspacePath = `accounts/${this.accountId}/containers/${this.containerId}/workspaces/${this.workspaceId}`;

            // Check if trigger exists
            const triggersResponse = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${workspacePath}/triggers`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const triggersData = await triggersResponse.json();
            const allPagesTrigger = (triggersData.trigger || []).find((t: any) => t.name === 'All Pages' || t.type === 'PAGEVIEW');

            if (allPagesTrigger) {
                return allPagesTrigger.triggerId;
            }

            // Create "All Pages" trigger
            const response = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${workspacePath}/triggers`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: 'All Pages',
                    type: 'PAGEVIEW'
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to create trigger: ${response.statusText}`);
            }

            const trigger = await response.json();
            return trigger.triggerId;
        } catch (error: any) {
            logger.error('Failed to ensure All Pages trigger', { error: error.message });
            throw error;
        }
    }

    /**
     * Create workspace version
     */
    async createVersion(versionName: string): Promise<{ versionId: string; containerVersionId: string }> {
        try {
            const accessToken = await gtmConnector.getAccessToken(this.orgId, this.connectionId);
            const workspacePath = `accounts/${this.accountId}/containers/${this.containerId}/workspaces/${this.workspaceId}`;

            const response = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${workspacePath}:create_version`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: versionName,
                    notes: 'Created by LaunchSin Auto-Apply'
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to create version: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                versionId: data.containerVersion.containerVersionId,
                containerVersionId: data.containerVersion.containerVersionId
            };
        } catch (error: any) {
            logger.error('Failed to create version', { error: error.message });
            throw error;
        }
    }

    /**
     * Publish version (optional)
     */
    async publishVersion(versionId: string): Promise<void> {
        try {
            const accessToken = await gtmConnector.getAccessToken(this.orgId, this.connectionId);
            const versionPath = `accounts/${this.accountId}/containers/${this.containerId}/versions/${versionId}`;

            const response = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${versionPath}:publish`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to publish version: ${response.statusText}`);
            }

            logger.info('Version published', { versionId });
        } catch (error: any) {
            logger.error('Failed to publish version', { error: error.message });
            throw error;
        }
    }

    /**
     * List tags
     */
    private async listTags(): Promise<GTMTag[]> {
        const accessToken = await gtmConnector.getAccessToken(this.orgId, this.connectionId);
        const workspacePath = `accounts/${this.accountId}/containers/${this.containerId}/workspaces/${this.workspaceId}`;

        const response = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${workspacePath}/tags`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const data = await response.json();
        return (data.tag || []).map((tag: any) => ({
            tagId: tag.tagId,
            name: tag.name,
            type: tag.type,
            parameter: tag.parameter || [],
            firingTriggerId: tag.firingTriggerId || [],
            path: tag.path
        }));
    }

    /**
     * Delete tag (for rollback)
     */
    async deleteTag(tagPath: string): Promise<void> {
        try {
            const accessToken = await gtmConnector.getAccessToken(this.orgId, this.connectionId);

            const response = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${tagPath}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!response.ok && response.status !== 404) {
                throw new Error(`Failed to delete tag: ${response.statusText}`);
            }

            logger.info('Tag deleted', { tagPath });
        } catch (error: any) {
            logger.error('Failed to delete tag', { error: error.message });
            throw error;
        }
    }
}
