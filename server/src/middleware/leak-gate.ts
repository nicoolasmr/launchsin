
import { Request, Response, NextFunction } from 'express';
import { logger } from '../infra/structured-logger';

const FORBIDDEN_KEYS = [
    'password',
    'secret',
    'token',
    'api_key',
    'apiKey',
    'private_key',
    'privateKey',
    'access_token',
    'accessToken',
    'refresh_token',
    'refreshToken',
    'client_secret',
    'clientSecret',
    'webhook_url',
    'config_json',
    'encrypted_value',
    'secret_id_ref',
    'authorization'
];

const FORBIDDEN_PATTERNS = [
    /^sk-[A-Za-z0-9]{20,}$/,           // OpenAI keys
    /^xoxb-[A-Za-z0-9-]+$/,            // Slack bot tokens
    /^xoxp-[A-Za-z0-9-]+$/,            // Slack user tokens
    /Bearer\s+[A-Za-z0-9\-_\.]+/,      // Bearer tokens
    /^ghp_[A-Za-z0-9]{36}$/,           // GitHub personal access tokens
    /^gho_[A-Za-z0-9]{36}$/,           // GitHub OAuth tokens
    /^[A-Za-z0-9]{32,}$/               // Generic long tokens
];

const LEAK_PATTERNS = [
    ...FORBIDDEN_PATTERNS,
    ...FORBIDDEN_KEYS.map(key => new RegExp(`"${key}":\\s*".*?"`, 'i')), // JSON key-value pairs
    ...FORBIDDEN_KEYS.map(key => new RegExp(`"${key}"\\s*:\\s*\\{.*?\\}`, 'i')), // JSON key with object value
    /eyJ[a-zA-Z0-9_-]{10,}/, // JWT-like
    /"config":\s*{.*"token"/i,
    /"config":\s*{.*"key"/i
];

export function leakGate(req: Request, res: Response, next: NextFunction) {
    const originalJson = res.json;

    function scanObject(obj: any, path: string = ''): string[] {
        const violations: string[] = [];

        if (obj === null || obj === undefined) return violations;

        if (typeof obj === 'string') {
            // Check against forbidden patterns
            for (const pattern of FORBIDDEN_PATTERNS) {
                if (pattern.test(obj)) {
                    violations.push(`${path}: matches forbidden pattern (${pattern.source})`);
                }
            }
            return violations;
        }

        if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
                violations.push(...scanObject(item, `${path}[${index}]`));
            });
            return violations;
        }

        if (typeof obj === 'object') {
            for (const key in obj) {
                const currentPath = path ? `${path}.${key}` : key;

                // Check if key is forbidden
                if (FORBIDDEN_KEYS.includes(key.toLowerCase())) {
                    violations.push(`${currentPath}: forbidden key detected`);
                }

                // Recursively scan value
                violations.push(...scanObject(obj[key], currentPath));
            }
        }

        return violations;
    }

    res.json = function (body: any) {
        try {
            const violations = scanObject(body);
            if (violations.length > 0) {
                logger.error(`[LEAK GATE] Blocked response containing sensitive data. Violations: ${violations.join(', ')}`, { url: req.originalUrl });
                return res.status(500).send({ error: 'Internal Security Error: Response contained sensitive data.' });
            }
        } catch (e) {
            // Ignore (maybe circular)
            logger.warn(`[LEAK GATE] Error during scanObject: ${e}`, { url: req.originalUrl });
        }
        return originalJson.call(this, body);
    };

    next();
}
