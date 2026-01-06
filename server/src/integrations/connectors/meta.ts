import { logger } from '../../infra/structured-logger';
import { Connector } from './hotmart';

export class MetaAdsConnector implements Connector {
    async testConnection(config: any): Promise<{ success: boolean; message: string }> {
        logger.info('Meta Ads: Testing connection (STUB)');
        if (!config.access_token_ref) return { success: false, message: 'Missing access_token reference' };
        return { success: true, message: 'Meta Ads Graph API reachable' };
    }

    async backfill(config: any): Promise<{ success: boolean; items_synced: number }> {
        logger.info('Meta Ads: Starting backfill (STUB)');
        return { success: true, items_synced: 120 };
    }
}
