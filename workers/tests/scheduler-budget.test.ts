
import { AlignmentWorkerV2 } from '../src/jobs/alignment-worker-v2';

// Mock everything needed
jest.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
    })
}));

jest.mock('ioredis');

describe('AlignmentWorker V2 Scheduler', () => {
    let worker: AlignmentWorkerV2;

    beforeEach(() => {
        worker = new AlignmentWorkerV2();
    });

    // Validating Private Method Logic via exposure or testing public side effect?
    // Testing private method by casting to any
    it('should correctly identify quiet hours', () => {
        const isInQuietHours = (worker as any).isInQuietHours.bind(worker);

        // Standard 09-17
        const quietStandard = { enabled: true, start: '09:00', end: '17:00' };
        // 10:00 (London) should be QUIET
        // Mock Date? Too complex.
        // The implementation uses Intl with current time.
        // We can't easily mock `new Date()` locally inside the function unless we stub global Date.
        // Let's use jest.useFakeTimers().setSystemTime();
    });
});

// Since mocking Date logic inside the method depends on system time, we will run checking logic.
describe('Quiet Hours Logic', () => {
    let worker: AlignmentWorkerV2;

    beforeAll(() => {
        jest.useFakeTimers();
        worker = new AlignmentWorkerV2();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    it('should block execution during quiet hours', () => {
        // Set time to 12:00 UTC
        jest.setSystemTime(new Date('2023-01-01T12:00:00Z'));
        const check = (worker as any).isInQuietHours.bind(worker);

        // Range 10:00 - 14:00 UTC = Quiet
        expect(check({ enabled: true, start: '10:00', end: '14:00' }, 'UTC')).toBe(true);

        // Range 14:00 - 18:00 UTC = Not Quiet
        expect(check({ enabled: true, start: '14:00', end: '18:00' }, 'UTC')).toBe(false);
    });

    it('should handle overnight quiet hours', () => {
        // Set time to 02:00 UTC
        jest.setSystemTime(new Date('2023-01-01T02:00:00Z'));
        const check = (worker as any).isInQuietHours.bind(worker);

        // Range 22:00 - 06:00 UTC = Quiet
        expect(check({ enabled: true, start: '22:00', end: '06:00' }, 'UTC')).toBe(true);

        // Range 09:00 - 17:00 UTC = Not Quiet
        expect(check({ enabled: true, start: '09:00', end: '17:00' }, 'UTC')).toBe(false);
    });

    it('should handle timezones', () => {
        // Time: 12:00 UTC.
        // In NY (UTC-5), it is 07:00.
        jest.setSystemTime(new Date('2023-01-01T12:00:00Z'));
        const check = (worker as any).isInQuietHours.bind(worker);

        // NY Quiet Hours: 06:00 - 08:00.
        // 07:00 is IN.
        expect(check({ enabled: true, start: '06:00', end: '08:00' }, 'America/New_York')).toBe(true);

        // NY Quiet Hours: 09:00 - 17:00.
        // 07:00 is OUT.
        expect(check({ enabled: true, start: '09:00', end: '17:00' }, 'America/New_York')).toBe(false);
    });
});
