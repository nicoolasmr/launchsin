import winston from 'winston';

const PII_FIELDS = ['password', 'token', 'apiKey', 'ssn', 'creditCard'];

const redactPII = winston.format((info) => {
  const result = { ...info };

  const redact = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key in obj) {
      if (PII_FIELDS.includes(key)) {
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
  defaultMeta: { service: 'launchsin-server' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'launchsin-server', audit: true },
  transports: [
    new winston.transports.Console(),
  ],
});
