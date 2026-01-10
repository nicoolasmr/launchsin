
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import bodyParser from 'body-parser';
import { handleHotmartWebhook } from '../routes/webhooks/hotmart';
import { supabase } from '../infra/db';

// Mock DB module
jest.mock('../infra/db', () => ({
    supabase: {
        from: jest.fn(),
        select: jest.fn(),
        eq: jest.fn(),
        single: jest.fn()
    }
}));

// Setup minimal app
const app = express();
app.use(bodyParser.json());
app.post('/api/webhooks/hotmart/:connectionId', handleHotmartWebhook as any);

describe('Hotmart Webhook Security (F-SEC-04)', () => {
    const CONNECTION_ID = 'conn_123';
    const SECRET = 'test_secret';
    const PAYLOAD = { id: 'evt_1', event: 'PURCHASE_COMPLETE' };

    // Cast to any to access mock methods
    const mockSupabase = supabase as any;

    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.HOTMART_HOTTOK; // Clear env

        // Setup chain defaults
        mockSupabase.from.mockReturnValue(mockSupabase);
        mockSupabase.select.mockReturnValue(mockSupabase);
        mockSupabase.eq.mockReturnValue(mockSupabase);
    });

    const generateHottok = (payload: any, secret: string) => {
        return crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
    };

    it('should 404 if connection not found', async () => {
        mockSupabase.single.mockResolvedValue({ data: null, error: null });

        await request(app)
            .post(`/api/webhooks/hotmart/${CONNECTION_ID}`)
            .send(PAYLOAD)
            .expect(404);
    });

    it('should 401 if valid connection but invalid hottok signature', async () => {
        mockSupabase.single.mockResolvedValue({
            data: { id: CONNECTION_ID, config_json: { hotmart_secret: SECRET }, org_id: 'org_1' },
            error: null
        });

        await request(app)
            .post(`/api/webhooks/hotmart/${CONNECTION_ID}`)
            .set('X-Hotmart-Hottok', 'invalid_signature')
            .send(PAYLOAD)
            .expect(401);
    });

    it('should 200 if valid signature (from Config)', async () => {
        mockSupabase.single.mockResolvedValue({
            data: { id: CONNECTION_ID, config_json: { hotmart_secret: SECRET }, org_id: 'org_1' },
            error: null
        });

        const validHottok = generateHottok(PAYLOAD, SECRET);

        await request(app)
            .post(`/api/webhooks/hotmart/${CONNECTION_ID}`)
            .set('X-Hotmart-Hottok', validHottok)
            .send(PAYLOAD)
            .expect(200);
    });

    it('should 200 if valid signature (from Env Fallback)', async () => {
        process.env.HOTMART_HOTTOK = 'env_secret';

        // Connection has NO secret
        mockSupabase.single.mockResolvedValue({
            data: { id: CONNECTION_ID, config_json: {}, org_id: 'org_1' },
            error: null
        });

        const validHottok = generateHottok(PAYLOAD, 'env_secret');

        await request(app)
            .post(`/api/webhooks/hotmart/${CONNECTION_ID}`)
            .set('X-Hotmart-Hottok', validHottok)
            .send(PAYLOAD)
            .expect(200);
    });
});
