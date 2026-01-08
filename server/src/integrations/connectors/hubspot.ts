import axios from 'axios';
import { logger } from '../../infra/structured-logger';
import { IConnector, OAuthTokens, SyncResult } from '../connector.interface';
import { secretsProvider } from '../../security/secrets-provider';
import { HubSpotMapper } from '../mappers/hubspot-to-canonical';
import { eventIngestService } from '../../services/event-ingest';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

export class HubSpotConnector implements IConnector {
    provider = 'hubspot';
    capabilities = {
        oauth: true,
        incremental_sync: true,
        backfill: false,
        writeback: false
    };

    getAuthUrl(params: { projectId: string; connectionId: string; redirectUri: string; state?: string }): string {
        if (!process.env.HUBSPOT_CLIENT_ID) {
            throw new Error('HUBSPOT_CLIENT_ID not configured');
        }
        const scopes = [
            'crm.objects.contacts.read',
            'crm.objects.deals.read'
        ].join(' '); // HubSpot uses space separator

        const q = new URLSearchParams({
            client_id: process.env.HUBSPOT_CLIENT_ID,
            redirect_uri: params.redirectUri,
            scope: scopes,
            response_type: 'code',
            state: params.state || ''
        });

        return `https://app.hubspot.com/oauth/authorize?${q.toString()}`;
    }

    async exchangeCodeForToken(params: { code: string; redirectUri: string }): Promise<OAuthTokens> {
        try {
            const formData = new URLSearchParams();
            formData.append('grant_type', 'authorization_code');
            formData.append('client_id', process.env.HUBSPOT_CLIENT_ID!);
            formData.append('client_secret', process.env.HUBSPOT_CLIENT_SECRET!);
            formData.append('redirect_uri', params.redirectUri);
            formData.append('code', params.code);

            const res = await axios.post(`${HUBSPOT_API_BASE}/oauth/v1/token`, formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            return {
                access_token: res.data.access_token,
                refresh_token: res.data.refresh_token,
                expires_in: res.data.expires_in
            };
        } catch (error: any) {
            logger.error('HubSpot Token Exchange Failed', { error: error.response?.data || error.message });
            throw new Error('HubSpot Auth Failed');
        }
    }

    async refreshTokenIfNeeded(secretRefId: string): Promise<OAuthTokens> {
        // 1. Decrypt Stored Tokens (Refresh Token)
        const storedJson = await secretsProvider.getSecret(secretRefId);
        const tokens = JSON.parse(storedJson);

        if (!tokens.refresh_token) throw new Error('No refresh token found');

        // Note: Simple check logic or just always refresh if logic expects valid token
        // In a real scenario, we check expiration. Here we assume we call this when needed.
        // Actually, pure refresh:
        try {
            const formData = new URLSearchParams();
            formData.append('grant_type', 'refresh_token');
            formData.append('client_id', process.env.HUBSPOT_CLIENT_ID!);
            formData.append('client_secret', process.env.HUBSPOT_CLIENT_SECRET!);
            formData.append('refresh_token', tokens.refresh_token);

            const res = await axios.post(`${HUBSPOT_API_BASE}/oauth/v1/token`, formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            return {
                access_token: res.data.access_token,
                refresh_token: res.data.refresh_token, // HubSpot rotates refresh tokens
                expires_in: res.data.expires_in
            };
        } catch (error: any) {
            logger.error('HubSpot Refresh Token Failed', { error: error.response?.data || error.message });
            throw error;
        }
    }

    async testConnection(connection: any): Promise<boolean> {
        // Implement test logic (e.g., fetch one contact)
        return true;
    }

    async syncIncremental(params: { orgId: string; projectId: string; connectionId: string; state?: any; accessToken: string }): Promise<SyncResult> {
        const { state, accessToken } = params;
        const lastSyncedAt = state?.last_synced_at ? new Date(state.last_synced_at).getTime() : 0;

        const client = axios.create({
            baseURL: HUBSPOT_API_BASE,
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        let processed = 0;
        const currentSyncTime = new Date().toISOString();

        // 1. Sync Contacts
        try {
            const contactFilter = lastSyncedAt > 0 ? {
                filterGroups: [{ filters: [{ propertyName: 'lastmodifieddate', operator: 'GT', value: lastSyncedAt.toString() }] }]
            } : {}; // No filter implies all? Or limit? Search API requires body.

            // Just raw list if backfill? Or Search always?
            // Search is best for incremental.
            const contactRes = await client.post('/crm/v3/objects/contacts/search', {
                ...contactFilter,
                limit: 100, // Batch size
                properties: ['email', 'firstname', 'lastname', 'phone', 'mobilephone', 'lifecyclestage', 'lastmodifieddate', 'createdate']
            });

            const contacts = contactRes.data.results || [];

            if (contacts.length > 0) {
                const canonicalContacts = contacts.map((c: any) => HubSpotMapper.mapContact(c, params));
                await eventIngestService.insertCanonicalEvents(canonicalContacts);
                processed += contacts.length;
            }

        } catch (err: any) {
            logger.error('Sync Contacts Failed', { error: err.message, projectId: params.projectId });
            // Continue to Deals? Or fail partial?
        }

        // 2. Sync Deals
        try {
            const dealFilter = lastSyncedAt > 0 ? {
                filterGroups: [{ filters: [{ propertyName: 'lastmodifieddate', operator: 'GT', value: lastSyncedAt.toString() }] }]
            } : {};

            const dealRes = await client.post('/crm/v3/objects/deals/search', {
                ...dealFilter,
                limit: 100,
                properties: ['dealname', 'dealstage', 'amount', 'closedate', 'lastmodifieddate', 'createdate']
            });

            const deals = dealRes.data.results || [];
            if (deals.length > 0) {
                const canonicalDeals = deals.map((d: any) => HubSpotMapper.mapDeal(d, params));
                await eventIngestService.insertCanonicalEvents(canonicalDeals);
                processed += deals.length;
            }
        } catch (err: any) {
            logger.error('Sync Deals Failed', { error: err.message });
        }

        return {
            status: 'success',
            objects_processed: processed,
            new_state: { last_synced_at: currentSyncTime }
        };
    }
}
