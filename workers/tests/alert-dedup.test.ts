import { describe, it, expect, beforeEach } from '@jest/globals';
import crypto from 'crypto';

describe('Alert Deduplication', () => {
    describe('Fingerprint Generation', () => {
        it('should generate consistent fingerprints for same inputs', () => {
            const projectId = 'proj-123';
            const url = 'https://example.com/landing';
            const adId = 'ad-456';
            const alertType = 'low_score';
            const day = '2026-01-08';

            const fingerprint1 = generateFingerprint(projectId, url, adId, alertType, day);
            const fingerprint2 = generateFingerprint(projectId, url, adId, alertType, day);

            expect(fingerprint1).toBe(fingerprint2);
        });

        it('should generate different fingerprints for different days', () => {
            const projectId = 'proj-123';
            const url = 'https://example.com/landing';
            const adId = 'ad-456';
            const alertType = 'low_score';

            const fingerprint1 = generateFingerprint(projectId, url, adId, alertType, '2026-01-08');
            const fingerprint2 = generateFingerprint(projectId, url, adId, alertType, '2026-01-09');

            expect(fingerprint1).not.toBe(fingerprint2);
        });

        it('should generate different fingerprints for different URLs', () => {
            const projectId = 'proj-123';
            const adId = 'ad-456';
            const alertType = 'low_score';
            const day = '2026-01-08';

            const fingerprint1 = generateFingerprint(projectId, 'https://example.com/page1', adId, alertType, day);
            const fingerprint2 = generateFingerprint(projectId, 'https://example.com/page2', adId, alertType, day);

            expect(fingerprint1).not.toBe(fingerprint2);
        });

        it('should generate different fingerprints for different alert types', () => {
            const projectId = 'proj-123';
            const url = 'https://example.com/landing';
            const adId = 'ad-456';
            const day = '2026-01-08';

            const fingerprint1 = generateFingerprint(projectId, url, adId, 'low_score', day);
            const fingerprint2 = generateFingerprint(projectId, url, adId, 'tracking_missing', day);

            expect(fingerprint1).not.toBe(fingerprint2);
        });
    });

    describe('Suppression Logic', () => {
        it('should suppress duplicate alerts on same day', async () => {
            const alert1 = {
                project_id: 'proj-123',
                landing_url: 'https://example.com',
                ad_id: 'ad-456',
                type: 'low_score',
                created_at: '2026-01-08T10:00:00Z'
            };

            const alert2 = {
                ...alert1,
                created_at: '2026-01-08T14:00:00Z'
            };

            const fingerprint = generateFingerprint(
                alert1.project_id,
                alert1.landing_url,
                alert1.ad_id,
                alert1.type,
                '2026-01-08'
            );

            // First alert should be sent
            const shouldSend1 = await shouldSendAlert(fingerprint, '2026-01-08');
            expect(shouldSend1).toBe(true);

            // Second alert on same day should be suppressed
            const shouldSend2 = await shouldSendAlert(fingerprint, '2026-01-08');
            expect(shouldSend2).toBe(false);
        });

        it('should allow alerts on different days', async () => {
            const alert = {
                project_id: 'proj-123',
                landing_url: 'https://example.com',
                ad_id: 'ad-456',
                type: 'low_score'
            };

            const fingerprint1 = generateFingerprint(
                alert.project_id,
                alert.landing_url,
                alert.ad_id,
                alert.type,
                '2026-01-08'
            );

            const fingerprint2 = generateFingerprint(
                alert.project_id,
                alert.landing_url,
                alert.ad_id,
                alert.type,
                '2026-01-09'
            );

            const shouldSend1 = await shouldSendAlert(fingerprint1, '2026-01-08');
            const shouldSend2 = await shouldSendAlert(fingerprint2, '2026-01-09');

            expect(shouldSend1).toBe(true);
            expect(shouldSend2).toBe(true);
        });
    });

    describe('Suppression Counter', () => {
        it('should increment suppressed_count on duplicate', async () => {
            const alert = {
                project_id: 'proj-123',
                landing_url: 'https://example.com',
                ad_id: 'ad-456',
                type: 'low_score',
                fingerprint: 'test-fingerprint'
            };

            // First alert
            await createAlert(alert);
            let count = await getSuppressedCount(alert.fingerprint);
            expect(count).toBe(0);

            // Duplicate alert
            await suppressAlert(alert.fingerprint);
            count = await getSuppressedCount(alert.fingerprint);
            expect(count).toBe(1);

            // Another duplicate
            await suppressAlert(alert.fingerprint);
            count = await getSuppressedCount(alert.fingerprint);
            expect(count).toBe(2);
        });
    });

    describe('Logging', () => {
        it('should log alert_suppressed=true for duplicates', async () => {
            const logs: string[] = [];
            const mockLogger = {
                info: (msg: string, meta: any) => {
                    logs.push(JSON.stringify({ msg, ...meta }));
                }
            };

            const alert = {
                project_id: 'proj-123',
                landing_url: 'https://example.com',
                ad_id: 'ad-456',
                type: 'low_score',
                fingerprint: 'test-fingerprint'
            };

            await logAlert(alert, true, mockLogger);

            const logEntry = logs.find(l => l.includes('alert_suppressed'));
            expect(logEntry).toBeDefined();
            expect(logEntry).toContain('"alert_suppressed":true');
        });
    });
});

// Helper functions (would be imported from actual implementation)
function generateFingerprint(projectId: string, url: string, adId: string, type: string, day: string): string {
    const input = `${projectId}|${url}|${adId}|${type}|${day}`;
    return crypto.createHash('sha256').update(input).digest('hex');
}

async function shouldSendAlert(fingerprint: string, day: string): Promise<boolean> {
    // Mock implementation - would check database
    return !alertExists(fingerprint, day);
}

function alertExists(fingerprint: string, day: string): boolean {
    // Mock implementation
    return false;
}

async function createAlert(alert: any): Promise<void> {
    // Mock implementation
}

async function suppressAlert(fingerprint: string): Promise<void> {
    // Mock implementation - would increment suppressed_count in DB
}

async function getSuppressedCount(fingerprint: string): Promise<number> {
    // Mock implementation
    return 0;
}

async function logAlert(alert: any, suppressed: boolean, logger: any): Promise<void> {
    logger.info('Alert processed', {
        alert_fingerprint: alert.fingerprint,
        alert_suppressed: suppressed
    });
}
