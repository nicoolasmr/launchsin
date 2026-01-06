import winston from 'winston';

/**
 * Structured Logger with Recursive PII Redaction
 * 
 * Rules:
 * 1. Redact any key in PII_DENY_LIST.
 * 2. Log in JSON format for production (structured).
 * 3. Human-readable for development.
 */

const PII_DENY_LIST = [
    'password', 'token', 'key', 'secret', 'ssn',
    'authorization', 'bearer', 'cookie', 'set-cookie'
];

const redactPII = winston.format((info) => {
    const result = JSON.parse(JSON.stringify(info)); // Deep copy to avoid mutating original objects

    const redact = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;

        for (const key in obj) {
            const lowerKey = key.toLowerCase();
            if (PII_DENY_LIST.some(p => lowerKey.includes(p))) {
                obj[key] = '[REDACTED]';
            } else if (typeof obj[key] === 'object') {
                redact(obj[key]);
            }
        }
    };

    redact(result);
    return result;
});

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        redactPII(),
        winston.format.json()
    ),
    defaultMeta: { service: 'launchsin-server', env: process.env.NODE_ENV },
    transports: [
        new winston.transports.Console({
            format: process.env.NODE_ENV === 'production'
                ? winston.format.json()
                : winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ timestamp, level, message, ...meta }) => {
                        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
                    })
                ),
        }),
    ],
});
