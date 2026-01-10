
import crypto from 'crypto';
import { logger } from './structured-logger';

const SECRET = process.env.OAUTH_STATE_SECRET || 'dev-secret-do-not-use-in-prod';
const TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface OAuthState {
    orgId: string;
    userId: string;
    connectionId?: string;
    provider: string; // 'meta', 'hubspot'
    redirectUri?: string;
    timestamp: number;
}

export class OAuthStateService {
    /**
     * Generate a signed state string
     */
    static generateState(data: Omit<OAuthState, 'timestamp'>): string {
        const payload: OAuthState = {
            ...data,
            timestamp: Date.now()
        };

        const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signature = this.sign(payloadStr);

        return `${payloadStr}.${signature}`;
    }

    /**
     * Parse and validate a state string
     * Returns null if invalid or expired
     */
    static validateState(state: string): OAuthState | null {
        if (!state || !state.includes('.')) {
            logger.warn('OAuth state missing or malformed');
            return null;
        }

        const [payloadStr, signature] = state.split('.');

        // 1. Verify signature
        const expectedSignature = this.sign(payloadStr);
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            logger.warn('OAuth state signature invalid');
            return null;
        }

        try {
            // 2. Parse payload
            const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8')) as OAuthState;

            // 3. Verify expiration
            if (Date.now() - payload.timestamp > TTL_MS) {
                logger.warn('OAuth state expired', { timestamp: payload.timestamp, now: Date.now() });
                return null;
            }

            return payload;
        } catch (err) {
            logger.warn('OAuth state payload parse error');
            return null;
        }
    }

    private static sign(payloadStr: string): string {
        return crypto
            .createHmac('sha256', SECRET)
            .update(payloadStr)
            .digest('base64url');
    }
}
