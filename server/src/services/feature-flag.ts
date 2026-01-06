import { supabase } from '../infra/db';
import { logger } from '../infra/structured-logger';

export class FeatureFlagService {
    private static instance: FeatureFlagService;

    private constructor() { }

    public static getInstance(): FeatureFlagService {
        if (!FeatureFlagService.instance) {
            FeatureFlagService.instance = new FeatureFlagService();
        }
        return FeatureFlagService.instance;
    }

    /**
     * Checks if a specific feature flag is enabled for an organization.
     * Includes a default fallback logic.
     */
    async isEnabled(orgId: string, key: string): Promise<boolean> {
        try {
            const { data, error } = await supabase
                .from('feature_flags')
                .select('enabled')
                .eq('org_id', orgId)
                .eq('key', key)
                .single();

            if (error) {
                // If flag not found (406), we might have defaults
                if (error.code === 'PGRST116') {
                    return this.getDefaultValue(key);
                }
                logger.error('Failed to fetch feature flag', { error: error.message, orgId, key });
                return this.getDefaultValue(key);
            }

            return data.enabled;
        } catch (error: any) {
            logger.error('Unexpected error in FeatureFlagService', { error: error.message, orgId, key });
            return this.getDefaultValue(key);
        }
    }

    /**
     * Centralized default policy for flags before they are explicitly set in DB.
     */
    private getDefaultValue(key: string): boolean {
        const defaults: Record<string, boolean> = {
            'integrations_status_center': true,
            'ads_pages_alignment': false
        };
        return defaults[key] ?? false;
    }
}

export const featureFlagService = FeatureFlagService.getInstance();
