import crypto from 'crypto';
import { logger } from '../infra/structured-logger';
import { supabase } from '../infra/db';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class SecretsProvider {
    private encryptionKey: Buffer;

    constructor() {
        const key = process.env.SECRETS_ENCRYPTION_KEY;
        if (!key || key.length < 32) {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('CRITICAL: SECRETS_ENCRYPTION_KEY must be a 32-byte string in production');
            }
            // Fallback for development (insecure, but allows startup)
            logger.warn('Using insecure development encryption key. Set SECRETS_ENCRYPTION_KEY for production.');
            this.encryptionKey = Buffer.alloc(KEY_LENGTH, key || 'dev-insecure-key-32-chars-long-!!!');
        } else {
            this.encryptionKey = Buffer.from(key.substring(0, 32));
        }
    }

    /**
     * Encrypts a plaintext string and returns a hex string containing IV, Auth Tag, and Ciphertext.
     */
    encrypt(plaintext: string): string {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv);

        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const tag = cipher.getAuthTag().toString('hex');

        // Format: iv:tag:encrypted
        return `${iv.toString('hex')}:${tag}:${encrypted}`;
    }

    /**
     * Decrypts an encrypted hex string.
     */
    decrypt(encryptedData: string): string {
        const [ivHex, tagHex, ciphertext] = encryptedData.split(':');

        if (!ivHex || !tagHex || !ciphertext) {
            throw new Error('Invalid encrypted data format');
        }

        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv);

        decipher.setAuthTag(tag);

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Encrypts and stores a secret in the database.
     */
    async storeSecret(orgId: string, keyName: string, plaintext: string): Promise<string> {
        const encrypted = this.encrypt(plaintext);
        const { data, error } = await supabase
            .from('secret_refs')
            .upsert({
                org_id: orgId,
                key_name: keyName,
                secret_id_ref: encrypted
            })
            .select('id')
            .single();

        if (error) {
            logger.error('Failed to store secret', { error: error.message, keyName });
            throw new Error(`Vault Error: ${error.message}`);
        }

        return data.id;
    }

    /**
     * Retrieves and decrypts a secret from the database.
     */
    async getSecret(secretRefId: string): Promise<string> {
        const { data, error } = await supabase
            .from('secret_refs')
            .select('secret_id_ref')
            .eq('id', secretRefId)
            .single();

        if (error || !data) {
            logger.error('Failed to retrieve secret', { error: error?.message, secretRefId });
            throw new Error('Secret not found or access denied');
        }

        return this.decrypt(data.secret_id_ref);
    }
}

export const secretsProvider = new SecretsProvider();
