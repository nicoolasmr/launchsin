
import { Request, Response, NextFunction } from 'express';
import { logger } from '../infra/structured-logger';

const LEAK_PATTERNS = [
    /eyJ[a-zA-Z0-9_-]{10,}/, // JWT-like
    /sk-[a-zA-Z0-9]{20,}/, // OpenAI-like
    /access_token/i,
    /refresh_token/i,
    /client_secret/i,
    /api_key/i,
    /secret_ref/i,
    /"config":\s*{.*"token"/i
];

export function leakGate(req: Request, res: Response, next: NextFunction) {
    const originalJson = res.json;

    res.json = function (body: any) {
        try {
            const str = JSON.stringify(body);
            for (const pattern of LEAK_PATTERNS) {
                if (pattern.test(str)) {
                    logger.error(`[LEAK GATE] Blocked response containing sensitive pattern: ${pattern}`, { url: req.originalUrl });
                    return res.status(500).send({ error: 'Internal Security Error: Response contained sensitive data.' });
                }
            }
        } catch (e) {
            // Ignore (maybe circular)
        }
        return originalJson.call(this, body);
    };

    next();
}
