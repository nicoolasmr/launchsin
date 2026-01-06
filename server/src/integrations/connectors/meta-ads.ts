import axios, { AxiosInstance } from 'axios';
import { logger } from '../../infra/structured-logger';
import { CanonicalEvent, eventIngestService } from '../../services/event-ingest';

/**
 * Meta Ads Connector
 * 
 * Handles OAuth flow and data sync from Meta Marketing API with:
 * - Read-only permissions
 * - Token management
 * - Rate limit handling
 * - Incremental sync
 */

export interface MetaOAuthTokens {
    access_token: string;
    token_type: string;
    expires_in: number;
}

export interface MetaCampaign {
    id: string;
    name: string;
    status: string;
    objective: string;
    created_time: string;
    updated_time: string;
}

export interface MetaAdSet {
    id: string;
    name: string;
    campaign_id: string;
    status: string;
    daily_budget?: string;
    lifetime_budget?: string;
}

export interface MetaAd {
    id: string;
    name: string;
    adset_id: string;
    status: string;
    creative?: {
        id: string;
        title?: string;
        body?: string;
        image_url?: string;
        call_to_action_type?: string;
    };
}

export interface MetaInsights {
    date_start: string;
    date_stop: string;
    impressions: string;
    clicks: string;
    spend: string;
    ctr: string;
    cpc: string;
    cpm: string;
}

export class MetaAdsConnector {
    private client: AxiosInstance;
    private accessToken: string;
    private apiVersion = 'v18.0';

    constructor(accessToken: string) {
        this.accessToken = accessToken;
        this.client = axios.create({
            baseURL: `https://graph.facebook.com/${this.apiVersion}`,
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
    }

    /**
     * Get OAuth authorization URL
     */
    public static getAuthorizationUrl(
        appId: string,
        redirectUri: string,
        state: string
    ): string {
        const scopes = [
            'ads_read',
            'ads_management', // For insights only
            'business_management'
        ].join(',');

        const params = new URLSearchParams({
            client_id: appId,
            redirect_uri: redirectUri,
            state: state,
            scope: scopes,
            response_type: 'code'
        });

        return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    }

    /**
     * Exchange authorization code for access token
     */
    public static async exchangeCodeForToken(
        appId: string,
        appSecret: string,
        redirectUri: string,
        code: string
    ): Promise<MetaOAuthTokens> {
        try {
            const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                params: {
                    client_id: appId,
                    client_secret: appSecret,
                    redirect_uri: redirectUri,
                    code: code
                }
            });

            return response.data;
        } catch (error: any) {
            logger.error('Failed to exchange Meta OAuth code', {
                error: error.response?.data || error.message
            });
            throw new Error('OAuth token exchange failed');
        }
    }

    /**
     * Fetch campaigns for an ad account
     */
    public async getCampaigns(adAccountId: string): Promise<MetaCampaign[]> {
        try {
            const response = await this.client.get(`/${adAccountId}/campaigns`, {
                params: {
                    fields: 'id,name,status,objective,created_time,updated_time',
                    limit: 100
                }
            });

            return response.data.data || [];
        } catch (error: any) {
            this.handleApiError(error, 'getCampaigns');
            return [];
        }
    }

    /**
     * Fetch adsets for a campaign
     */
    public async getAdSets(campaignId: string): Promise<MetaAdSet[]> {
        try {
            const response = await this.client.get(`/${campaignId}/adsets`, {
                params: {
                    fields: 'id,name,campaign_id,status,daily_budget,lifetime_budget',
                    limit: 100
                }
            });

            return response.data.data || [];
        } catch (error: any) {
            this.handleApiError(error, 'getAdSets');
            return [];
        }
    }

    /**
     * Fetch ads for an adset
     */
    public async getAds(adsetId: string): Promise<MetaAd[]> {
        try {
            const response = await this.client.get(`/${adsetId}/ads`, {
                params: {
                    fields: 'id,name,adset_id,status,creative{id,title,body,image_url,call_to_action_type}',
                    limit: 100
                }
            });

            return response.data.data || [];
        } catch (error: any) {
            this.handleApiError(error, 'getAds');
            return [];
        }
    }

    /**
     * Fetch ALL active ads for an ad account directly
     * Used for alignment checks to avoid traversing campaign -> adset -> ad
     */
    public async getAllActiveAds(adAccountId: string, limit: number = 50): Promise<MetaAd[]> {
        try {
            const response = await this.client.get(`/${adAccountId}/ads`, {
                params: {
                    fields: 'id,name,status,creative{id,title,body,image_url,call_to_action_type},adcreatives{object_story_spec}',
                    filtering: [{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }],
                    limit: limit
                }
            });

            return response.data.data || [];
        } catch (error: any) {
            this.handleApiError(error, 'getAllActiveAds');
            return [];
        }
    }

    /**
     * Fetch insights for an ad account (daily aggregates)
     */
    public async getInsights(
        adAccountId: string,
        datePreset: string = 'last_7d'
    ): Promise<MetaInsights[]> {
        try {
            const response = await this.client.get(`/${adAccountId}/insights`, {
                params: {
                    fields: 'date_start,date_stop,impressions,clicks,spend,ctr,cpc,cpm',
                    date_preset: datePreset,
                    time_increment: 1, // Daily
                    limit: 100
                }
            });

            return response.data.data || [];
        } catch (error: any) {
            this.handleApiError(error, 'getInsights');
            return [];
        }
    }

    /**
     * Map Meta insights to canonical events
     */
    public static mapInsightsToCanonicalEvents(
        insights: MetaInsights[],
        orgId: string,
        projectId: string,
        connectionId: string,
        adAccountId: string
    ): CanonicalEvent[] {
        const events: CanonicalEvent[] = [];

        for (const insight of insights) {
            const date = insight.date_start;
            const impressions = parseInt(insight.impressions || '0');
            const clicks = parseInt(insight.clicks || '0');
            const spend = parseFloat(insight.spend || '0');

            // Impression event
            if (impressions > 0) {
                events.push({
                    org_id: orgId,
                    project_id: projectId,
                    source_connection_id: connectionId,
                    event_type: 'ad_impression',
                    event_time: new Date(date).toISOString(),
                    idempotency_key: `meta_${adAccountId}_${date}_impression`,
                    actor_json: {},
                    entities_json: {
                        ad_account_id: adAccountId
                    },
                    value_json: {
                        impressions: impressions,
                        cpm: parseFloat(insight.cpm || '0')
                    },
                    raw_ref_json: {
                        source_event_id: `${adAccountId}_${date}`,
                        source: 'meta_ads',
                        payload_version: 'v18.0'
                    }
                });
            }

            // Click event
            if (clicks > 0) {
                events.push({
                    org_id: orgId,
                    project_id: projectId,
                    source_connection_id: connectionId,
                    event_type: 'ad_click',
                    event_time: new Date(date).toISOString(),
                    idempotency_key: `meta_${adAccountId}_${date}_click`,
                    actor_json: {},
                    entities_json: {
                        ad_account_id: adAccountId
                    },
                    value_json: {
                        clicks: clicks,
                        ctr: parseFloat(insight.ctr || '0'),
                        cpc: parseFloat(insight.cpc || '0')
                    },
                    raw_ref_json: {
                        source_event_id: `${adAccountId}_${date}`,
                        source: 'meta_ads',
                        payload_version: 'v18.0'
                    }
                });
            }

            // Spend event
            if (spend > 0) {
                events.push({
                    org_id: orgId,
                    project_id: projectId,
                    source_connection_id: connectionId,
                    event_type: 'ad_spend',
                    event_time: new Date(date).toISOString(),
                    idempotency_key: `meta_${adAccountId}_${date}_spend`,
                    actor_json: {},
                    entities_json: {
                        ad_account_id: adAccountId
                    },
                    value_json: {
                        amount: spend,
                        currency: 'USD' // Meta returns USD by default
                    },
                    raw_ref_json: {
                        source_event_id: `${adAccountId}_${date}`,
                        source: 'meta_ads',
                        payload_version: 'v18.0'
                    }
                });
            }
        }

        return events;
    }

    /**
     * Handle API errors with rate limit detection
     */
    private handleApiError(error: any, operation: string): void {
        const status = error.response?.status;
        const errorData = error.response?.data?.error;

        if (status === 429 || errorData?.code === 17) {
            // Rate limit exceeded
            logger.warn('Meta API rate limit exceeded', {
                operation,
                retry_after: error.response?.headers['retry-after']
            });
            throw new Error('RATE_LIMIT_EXCEEDED');
        }

        if (status === 401 || errorData?.code === 190) {
            // Invalid token
            logger.error('Meta API token invalid', { operation });
            throw new Error('INVALID_TOKEN');
        }

        logger.error('Meta API error', {
            operation,
            status,
            error: errorData?.message || error.message
        });

        throw error;
    }
}
