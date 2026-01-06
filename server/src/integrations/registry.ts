import { IntegrationProvider } from './types';
import { Connector, HotmartConnector } from './connectors/hotmart';
import { MetaAdsConnector } from './connectors/meta';

class ConnectorRegistry {
    private connectors: Map<IntegrationProvider, Connector> = new Map();

    constructor() {
        this.connectors.set(IntegrationProvider.HOTMART, new HotmartConnector());
        this.connectors.set(IntegrationProvider.META_ADS, new MetaAdsConnector());
    }

    getConnector(provider: IntegrationProvider): Connector {
        const connector = this.connectors.get(provider);
        if (!connector) {
            throw new Error(`No connector registered for provider: ${provider}`);
        }
        return connector;
    }
}

export const connectorRegistry = new ConnectorRegistry();
