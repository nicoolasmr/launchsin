export interface SyncResult {
    status: 'success' | 'partial' | 'failed';
    objects_processed: number;
    errors?: any[];
    new_state?: any;
}

export interface OAuthTokens {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
}

export interface IConnector {
    provider: string;
    capabilities: {
        oauth: boolean;
        incremental_sync: boolean;
        backfill: boolean;
        writeback: boolean;
    };

    getAuthUrl(params: { projectId: string; connectionId: string; redirectUri: string }): string;

    exchangeCodeForToken(params: { code: string; redirectUri: string }): Promise<OAuthTokens>;

    refreshTokenIfNeeded(secretRefId: string): Promise<OAuthTokens>;

    testConnection(connection: any): Promise<boolean>;

    syncIncremental(params: { orgId: string; projectId: string; connectionId: string; state?: any }): Promise<SyncResult>;
}
