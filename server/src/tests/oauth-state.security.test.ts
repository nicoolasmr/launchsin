
import { OAuthStateService } from '../infra/oauth-state';

describe('OAuth State Security (F-SEC-05)', () => {
    // 15 mins
    const VALID_PAYLOAD = {
        orgId: 'org_123',
        userId: 'user_456',
        provider: 'meta' as const
    };

    it('should generate and validate a valid state', () => {
        const state = OAuthStateService.generateState(VALID_PAYLOAD);
        const decoded = OAuthStateService.validateState(state);

        expect(decoded).toBeTruthy();
        expect(decoded?.orgId).toBe(VALID_PAYLOAD.orgId);
        expect(decoded?.userId).toBe(VALID_PAYLOAD.userId);
        expect(decoded?.provider).toBe(VALID_PAYLOAD.provider);
        expect(decoded?.timestamp).toBeDefined();
    });

    it('should reject invalid format (no signature)', () => {
        const state = 'eyJwYXlsb2FkIjoidGVzdCJ9'; // just base64, no dot
        expect(OAuthStateService.validateState(state)).toBeNull();
    });

    it('should reject tampered payload', () => {
        const state = OAuthStateService.generateState(VALID_PAYLOAD);
        const [payload, signature] = state.split('.');

        // Tamper payload
        const tamperedData = { ...VALID_PAYLOAD, orgId: 'org_666' };
        const tamperedPayload = Buffer.from(JSON.stringify(tamperedData)).toString('base64url');
        const tamperedState = `${tamperedPayload}.${signature}`;

        expect(OAuthStateService.validateState(tamperedState)).toBeNull();
    });

    it('should reject tampered signature', () => {
        const state = OAuthStateService.generateState(VALID_PAYLOAD);
        const [payload] = state.split('.');

        const fakeSignature = 'bWFsaWNpb3Vfc2lnbmF0dXJl';
        const tamperedState = `${payload}.${fakeSignature}`;

        expect(OAuthStateService.validateState(tamperedState)).toBeNull();
    });

    it('should reject expired state', () => {
        // Mock Date.now to simulate expiration
        const now = Date.now();
        jest.spyOn(Date, 'now').mockReturnValue(now);

        const state = OAuthStateService.generateState(VALID_PAYLOAD);

        // Fast forward 16 minutes
        jest.spyOn(Date, 'now').mockReturnValue(now + 16 * 60 * 1000);

        expect(OAuthStateService.validateState(state)).toBeNull();

        jest.restoreAllMocks();
    });

    it('should accept state just before expiration', () => {
        const now = Date.now();
        jest.spyOn(Date, 'now').mockReturnValue(now);

        const state = OAuthStateService.generateState(VALID_PAYLOAD);

        // Fast forward 14 minutes 59 seconds
        jest.spyOn(Date, 'now').mockReturnValue(now + 14 * 60 * 1000 + 59 * 1000);

        expect(OAuthStateService.validateState(state)).toBeTruthy();

        jest.restoreAllMocks();
    });
});
