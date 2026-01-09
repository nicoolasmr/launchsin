
import { alignmentOpsService } from '../services/alignment-ops-service';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => {
    const mSupabase = {
        from: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
    };
    return { createClient: jest.fn(() => mSupabase) };
});

const supabase = createClient('url', 'key');

describe('AlignmentOps Leasing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // @ts-ignore
        (supabase.from('alignment_jobs').maybeSingle as jest.Mock).mockReset();
    });

    it('should claim a queued job successfully', async () => {
        // @ts-ignore
        (supabase.from('alignment_jobs').maybeSingle as jest.Mock).mockResolvedValue({ data: { id: 'job-123' } });

        const result = await alignmentOpsService.claimJobWithLease('job-123', 'worker-1');
        expect(result).toBe(true);
        expect(supabase.from).toHaveBeenCalledWith('alignment_jobs');
        expect(supabase.from('alignment_jobs').update).toHaveBeenCalledWith(expect.objectContaining({
            status: 'running',
            locked_by: 'worker-1'
        }));
    });

    it('should return false if job already claimed', async () => {
        // @ts-ignore
        (supabase.from('alignment_jobs').maybeSingle as jest.Mock).mockResolvedValue({ data: null });

        const result = await alignmentOpsService.claimJobWithLease('job-123', 'worker-1');
        // It tries to reclaim next.
        // Mock reclaim failure
        // @ts-ignore
        (supabase.from('alignment_jobs').maybeSingle as jest.Mock).mockResolvedValueOnce({ data: null });

        expect(result).toBe(false);
    });

    it('should reclaim a dead job', async () => {
        // First claim (queued) fails
        // @ts-ignore
        (supabase.from('alignment_jobs').maybeSingle as jest.Mock).mockResolvedValueOnce({ data: null });
        // Second claim (reclaim) succeeds
        // @ts-ignore
        (supabase.from('alignment_jobs').maybeSingle as jest.Mock).mockResolvedValueOnce({ data: { id: 'job-123' } });

        const result = await alignmentOpsService.claimJobWithLease('job-123', 'worker-1');
        expect(result).toBe(true);
        expect(supabase.from('alignment_jobs').update).toHaveBeenCalledWith(expect.objectContaining({
            error_message_redacted: expect.stringContaining('reclaimed')
        }));
    });

    it('should heartbeat successfully', async () => {
        // @ts-ignore
        (supabase.from('alignment_jobs').maybeSingle as jest.Mock).mockResolvedValue({ data: { id: 'job-123' } });
        const result = await alignmentOpsService.heartbeatLease('job-123', 'worker-1');
        expect(result).toBe(true);
    });
});
