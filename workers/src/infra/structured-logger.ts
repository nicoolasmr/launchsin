import winston from 'winston';

/**
 * Structured Logger with Recursive PII Redaction for Workers
 */

const PII_DENY_LIST = [
    'password', 'token', 'key', 'secret', 'ssn',
    'authorization', 'bearer', 'cookie', 'set-cookie'
];

const redactPII = winston.format((info) => {
    const result = JSON.parse(JSON.stringify(info));

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
    defaultMeta: { service: 'launchsin-workers', env: process.env.NODE_ENV },
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
