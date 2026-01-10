import { Router, Request, Response } from 'express';
import { register } from '../../infra/metrics';

const router = Router();

/**
 * GET /metrics
 * Prometheus metrics endpoint
 * 
 * Security:
 * - No authentication (standard Prometheus scraping)
 * - No PII in metrics labels
 * - No LeakGate (metrics don't contain secrets)
 */
router.get('/api/metrics', async (req: Request, res: Response) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to collect metrics' });
    }
});

export default router;
