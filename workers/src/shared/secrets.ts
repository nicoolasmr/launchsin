
import crypto from 'crypto';
import { logger } from '../utils/logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export class SecretsManager {
    private encryptionKey: Buffer;

    constructor() {
        const key = process.env.SECRETS_ENCRYPTION_KEY;
        if (!key || key.length < 32) {
            const isProd = process.env.NODE_ENV === 'production';
            if (isProd) {
                throw new Error('CRITICAL: SECRETS_ENCRYPTION_KEY must be a 32-byte string in production');
            }
            logger.warn('Using insecure development encryption key in Worker.');
            this.encryptionKey = Buffer.alloc(KEY_LENGTH, key || 'dev-insecure-key-32-chars-long-!!!');
        } else {
            this.encryptionKey = Buffer.from(key.substring(0, 32));
        }
    }

    decrypt(encryptedData: string): string {
        try {
            const [ivHex, tagHex, ciphertext] = encryptedData.split(':');
            if (!ivHex || !tagHex || !ciphertext) throw new Error('Invalid format');

            const iv = Buffer.from(ivHex, 'hex');
            const tag = Buffer.from(tagHex, 'hex');
            const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);
            decipher.setAuthTag(tag);

            let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        } catch (error: any) {
            logger.error('Decryption failed', { error: error.message });
            throw new Error('Failed to decrypt secret');
        }
    }
}

export const secretsManager = new SecretsManager();
