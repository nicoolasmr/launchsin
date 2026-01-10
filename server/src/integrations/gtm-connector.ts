import crypto from 'crypto';
import { logger } from '../infra/structured-logger';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GTM OAuth2 Connector (Phase A)
 * 
 * Implements Google Tag Manager OAuth2 flow with:
 * - State HMAC validation (CSRF protection)
 * - Token storage in secret_refs (AES-256)
 * - Auto-refresh on token expiry
 * - Metadata in source_connections (no tokens)
 */

export interface GTMOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface GTMTokens {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
}

export interface GTMAccount {
    accountId: string;
    name: string;
    containers: GTMContainer[];
}

export interface GTMContainer {
    containerId: string;
    name: string;
    publicId: string; // GTM-XXXXX
    workspaces: GTMWorkspace[];
}

export interface GTMWorkspace {
    workspaceId: string;
    name: string;
    description?: string;
}

export class GTMConnector {
    private config: GTMOAuthConfig;
    private stateSecret: string;

    constructor(config?: GTMOAuthConfig) {
        this.config = config || {
            clientId: process.env.GTM_OAUTH_CLIENT_ID!,
            clientSecret: process.env.GTM_OAUTH_CLIENT_SECRET!,
            redirectUri: process.env.GTM_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/integrations/gtm/oauth/callback'
        };

        this.stateSecret = process.env.GTM_OAUTH_STATE_SECRET || 'default-secret-change-in-production';

        if (!this.config.clientId || !this.config.clientSecret) {
            logger.warn('GTM OAuth credentials not configured. Using mock mode.');
        }
    }

    /**
     * Generate OAuth authorization URL with HMAC state
     */
    authorizeUrl(projectId: string, userId: string): string {
        const state = this.generateState(projectId, userId);
        const scope = 'https://www.googleapis.com/auth/tagmanager.edit.containers';

        const params = new URLSearchParams({
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            response_type: 'code',
            scope,
            access_type: 'offline',
            prompt: 'consent',
            state
        });

        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    /**
     * Exchange authorization code for tokens
     */
    async exchangeCodeForTokens(code: string): Promise<GTMTokens> {
        try {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    redirect_uri: this.config.redirectUri,
                    grant_type: 'authorization_code'
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Token exchange failed: ${error}`);
            }

            const tokens = await response.json();
            return tokens as GTMTokens;
        } catch (error: any) {
            logger.error('GTM token exchange failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshAccessToken(refreshToken: string): Promise<GTMTokens> {
        try {
            const response = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    refresh_token: refreshToken,
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    grant_type: 'refresh_token'
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Token refresh failed: ${error}`);
            }

            const tokens = await response.json();
            return {
                ...tokens,
                refresh_token: refreshToken // Google doesn't return new refresh_token
            } as GTMTokens;
        } catch (error: any) {
            logger.error('GTM token refresh failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Store tokens in secret_refs (AES-256)
     */
    async storeTokens(orgId: string, connectionId: string, tokens: GTMTokens): Promise<void> {
        try {
            const encryptionKey = process.env.SECRETS_ENCRYPTION_KEY || 'default-key-change-in-production';

            // Store access_token
            await supabase.from('secret_refs').upsert({
                org_id: orgId,
                connection_id: connectionId,
                key_name: 'gtm_access_token',
                encrypted_value: this.encrypt(tokens.access_token, encryptionKey),
                expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            });

            // Store refresh_token
            await supabase.from('secret_refs').upsert({
                org_id: orgId,
                connection_id: connectionId,
                key_name: 'gtm_refresh_token',
                encrypted_value: this.encrypt(tokens.refresh_token, encryptionKey),
                expires_at: null // refresh tokens don't expire
            });

            logger.info('GTM tokens stored', { connectionId });
        } catch (error: any) {
            logger.error('Failed to store GTM tokens', { error: error.message });
            throw error;
        }
    }

    /**
     * Fetch access token from secret_refs (with auto-refresh)
     */
    async getAccessToken(orgId: string, connectionId: string): Promise<string> {
        try {
            const encryptionKey = process.env.SECRETS_ENCRYPTION_KEY || 'default-key-change-in-production';

            // Fetch access_token
            const { data: accessTokenRef } = await supabase
                .from('secret_refs')
                .select('*')
                .eq('org_id', orgId)
                .eq('connection_id', connectionId)
                .eq('key_name', 'gtm_access_token')
                .single();

            if (!accessTokenRef) {
                throw new Error('Access token not found');
            }

            // Check if expired
            const expiresAt = new Date(accessTokenRef.expires_at);
            const now = new Date();

            if (expiresAt <= now) {
                // Token expired, refresh it
                logger.info('Access token expired, refreshing', { connectionId });

                const { data: refreshTokenRef } = await supabase
                    .from('secret_refs')
                    .select('*')
                    .eq('org_id', orgId)
                    .eq('connection_id', connectionId)
                    .eq('key_name', 'gtm_refresh_token')
                    .single();

                if (!refreshTokenRef) {
                    throw new Error('Refresh token not found');
                }

                const refreshToken = this.decrypt(refreshTokenRef.encrypted_value, encryptionKey);
                const newTokens = await this.refreshAccessToken(refreshToken);
                await this.storeTokens(orgId, connectionId, newTokens);

                return newTokens.access_token;
            }

            return this.decrypt(accessTokenRef.encrypted_value, encryptionKey);
        } catch (error: any) {
            logger.error('Failed to get access token', { error: error.message });
            throw error;
        }
    }

    /**
     * List GTM accounts/containers/workspaces
     */
    async listAccounts(accessToken: string): Promise<GTMAccount[]> {
        try {
            const response = await fetch('https://tagmanager.googleapis.com/tagmanager/v2/accounts', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!response.ok) {
                throw new Error(`Failed to list accounts: ${response.statusText}`);
            }

            const data = await response.json();
            const accounts: GTMAccount[] = [];

            for (const account of data.account || []) {
                const containers = await this.listContainers(accessToken, account.path);
                accounts.push({
                    accountId: account.accountId,
                    name: account.name,
                    containers
                });
            }

            return accounts;
        } catch (error: any) {
            logger.error('Failed to list GTM accounts', { error: error.message });
            throw error;
        }
    }

    /**
     * List containers for an account
     */
    private async listContainers(accessToken: string, accountPath: string): Promise<GTMContainer[]> {
        try {
            const response = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${accountPath}/containers`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!response.ok) {
                throw new Error(`Failed to list containers: ${response.statusText}`);
            }

            const data = await response.json();
            const containers: GTMContainer[] = [];

            for (const container of data.container || []) {
                const workspaces = await this.listWorkspaces(accessToken, container.path);
                containers.push({
                    containerId: container.containerId,
                    name: container.name,
                    publicId: container.publicId,
                    workspaces
                });
            }

            return containers;
        } catch (error: any) {
            logger.error('Failed to list GTM containers', { error: error.message });
            throw error;
        }
    }

    /**
     * List workspaces for a container
     */
    private async listWorkspaces(accessToken: string, containerPath: string): Promise<GTMWorkspace[]> {
        try {
            const response = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${containerPath}/workspaces`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!response.ok) {
                throw new Error(`Failed to list workspaces: ${response.statusText}`);
            }

            const data = await response.json();
            return (data.workspace || []).map((ws: any) => ({
                workspaceId: ws.workspaceId,
                name: ws.name,
                description: ws.description
            }));
        } catch (error: any) {
            logger.error('Failed to list GTM workspaces', { error: error.message });
            throw error;
        }
    }

    /**
     * Generate HMAC state for CSRF protection
     */
    private generateState(projectId: string, userId: string): string {
        const payload = JSON.stringify({ projectId, userId, timestamp: Date.now() });
        const hmac = crypto.createHmac('sha256', this.stateSecret).update(payload).digest('hex');
        const state = Buffer.from(JSON.stringify({ payload, hmac })).toString('base64url');
        return state;
    }

    /**
     * Validate HMAC state
     */
    validateState(state: string): { projectId: string; userId: string } | null {
        try {
            const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
            const { payload, hmac } = decoded;

            const expectedHmac = crypto.createHmac('sha256', this.stateSecret).update(payload).digest('hex');

            if (hmac !== expectedHmac) {
                logger.warn('Invalid state HMAC');
                return null;
            }

            const data = JSON.parse(payload);

            // Check timestamp (max 10 minutes)
            if (Date.now() - data.timestamp > 10 * 60 * 1000) {
                logger.warn('State expired');
                return null;
            }

            return { projectId: data.projectId, userId: data.userId };
        } catch (error: any) {
            logger.error('State validation failed', { error: error.message });
            return null;
        }
    }

    /**
     * Encrypt value (AES-256)
     */
    private encrypt(value: string, key: string): string {
        const cipher = crypto.createCipher('aes-256-cbc', key);
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    /**
     * Decrypt value (AES-256)
     */
    private decrypt(encrypted: string, key: string): string {
        const decipher = crypto.createDecipher('aes-256-cbc', key);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}

// Export singleton
export const gtmConnector = new GTMConnector();
