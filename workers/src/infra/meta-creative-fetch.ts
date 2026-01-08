
import { logger } from '../utils/logger';

export interface MetaAdCreative {
    id: string;
    headline: string;
    primary_text: string; // body
    cta: string;
    image_url: string | null;
}

export class MetaCreativeFetch {
    static async fetch(adId: string, accessToken: string): Promise<MetaAdCreative> {
        try {
            // Fetch Ad to get Creative ID
            const adUrl = `https://graph.facebook.com/v19.0/${adId}?fields=creative,status,name&access_token=${accessToken}`;
            const adRes = await fetch(adUrl);
            if (!adRes.ok) throw new Error(`Meta API Error: ${adRes.statusText}`);
            const adData = await adRes.json();

            if (!adData.creative?.id) throw new Error('No creative found for ad');

            // Fetch Creative Details
            // Use asset_feed_spec for dynamic ads or object_story_spec for standard
            // This is a simplification. Produciton needs to handle all formats.
            const creativeUrl = `https://graph.facebook.com/v19.0/${adData.creative.id}?fields=title,body,image_url,call_to_action_type,object_story_spec,asset_feed_spec&access_token=${accessToken}`;
            const creativeRes = await fetch(creativeUrl);
            const cData = await creativeRes.json();

            // Extract logic (Simplified)
            let headline = cData.title || '';
            let body = cData.body || '';
            let cta = cData.call_to_action_type || '';
            let imageUrl = cData.image_url || '';

            // Handle object_story_spec structure
            if (cData.object_story_spec?.link_data) {
                const ld = cData.object_story_spec.link_data;
                headline = headline || ld.name || ld.message || '';
                body = body || ld.message || ld.description || '';
                cta = cta || ld.call_to_action?.type || '';
                imageUrl = imageUrl || ld.image_hash || ld.picture || ''; // Picture often is URL
            }

            return {
                id: cData.id,
                headline: headline || adData.name, // Fallback
                primary_text: body,
                cta: cta || 'LEARN_MORE',
                image_url: imageUrl || null
            };

        } catch (error: any) {
            logger.error(`Failed to fetch Meta Creative for Ad ${adId}`, { error: error.message });
            throw error;
        }
    }
}
