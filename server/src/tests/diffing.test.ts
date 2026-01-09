
import { alignmentOpsService } from '../services/alignment-ops-service';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => {
    const mSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        neq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
        insert: jest.fn().mockReturnThis(),
    };
    return { createClient: jest.fn(() => mSupabase) };
});

const supabase = createClient('url', 'key');

describe('AlignmentOps Diffing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should detect title changes', async () => {
        const prevSnap = { id: 'old', title: 'Old Title', h1: ['Header'], ctas: ['Buy'], url: 'http://e.com', extracted_text: 'abc' };
        const currSnap = { id: 'new', title: 'New Title', h1: ['Header'], ctas: ['Buy'], url: 'http://e.com', meta: {}, extracted_text: 'abc' };

        // @ts-ignore
        (supabase.from('page_snapshots').maybeSingle as jest.Mock).mockResolvedValue({ data: prevSnap });

        await alignmentOpsService.createDiff('org1', 'proj1', currSnap as any, prevSnap as any);

        expect(supabase.from('page_snapshot_diffs').insert).toHaveBeenCalledWith(expect.objectContaining({
            diff_summary: {
                title: { from: 'Old Title', to: 'New Title' }
            }
        }));
    });

    it('should detect H1 changes', async () => {
        const prevSnap = { id: 'old', title: 'Same', h1: ['Old Header'], ctas: ['Buy'], url: 'http://e.com', extracted_text: 'abc' };
        const currSnap = { id: 'new', title: 'Same', h1: ['New Header'], ctas: ['Buy'], url: 'http://e.com', meta: {}, extracted_text: 'abc' };

        // @ts-ignore
        (supabase.from('page_snapshots').maybeSingle as jest.Mock).mockResolvedValue({ data: prevSnap });

        await alignmentOpsService.createDiff('org1', 'proj1', currSnap as any, prevSnap as any);

        expect(supabase.from('page_snapshot_diffs').insert).toHaveBeenCalledWith(expect.objectContaining({
            diff_summary: {
                h1: { from: ['Old Header'], to: ['New Header'] }
            }
        }));
    });

    it('should ignore if no changes', async () => {
        const prevSnap = { id: 'old', title: 'Same', h1: ['Same'], ctas: ['Same'], url: 'http://e.com', extracted_text: 'abc' };
        const currSnap = { id: 'new', title: 'Same', h1: ['Same'], ctas: ['Same'], url: 'http://e.com', meta: {}, extracted_text: 'abc' };

        // @ts-ignore
        (supabase.from('page_snapshots').maybeSingle as jest.Mock).mockResolvedValue({ data: prevSnap });

        await alignmentOpsService.createDiff('org1', 'proj1', currSnap as any, prevSnap as any);

        expect(supabase.from('page_snapshot_diffs').insert).not.toHaveBeenCalled();
    });
});
