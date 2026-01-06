/**
 * Security Gate Test: Leak Detection
 * 
 * This test simulates API responses and asserts that no forbidden words 
 * (secrets, tokens, etc.) are present in the serialized JSON output.
 */

import { toSafeDTO, ProjectWhitelist } from '../shared/safe-dto';

describe('Security Leak Gate', () => {
    const FORBIDDEN_WORDS = [
        'token',
        'secret',
        'key',
        'authorization',
        'password',
        'encrypted_value',
        'refresh_token',
        'access_token',
        'encryption_tag',
        'encryption_iv',
        'hottok'
    ];


    const testObjects = [
        {
            id: '1',
            name: 'P1',
            org_id: 'o1',
            created_at: '...',
            internal_token: 'leak_me',
            db_password: '123'
        },
        {
            id: '2',
            name: 'P2',
            org_id: 'o2',
            created_at: '...',
            aws_key: 'AKIA...'
        }
    ];

    it('should not contain any forbidden words in serialized ProjectDTO', () => {
        const safeData = testObjects.map(obj => toSafeDTO(obj, ProjectWhitelist));
        const jsonOutput = JSON.stringify(safeData).toLowerCase();

        FORBIDDEN_WORDS.forEach(word => {
            expect(jsonOutput).not.toContain(word);
        });
    });

    it('should redact forbidden keys in logger (conceptual)', () => {
        // This is tested by verifying the logger output doesn't contain the raw data
        // Here we just ensure the logic works for the serializer
        const sensitiveObj = { user: 'nico', password: 'secure', headers: { authorization: 'Bearer 123' } };
        const serialized = JSON.stringify(sensitiveObj).toLowerCase();

        // If this were to reach the client, it would fail
        // But since we use SafeDTO, we only pick safe keys
        const pickSafe = toSafeDTO(sensitiveObj, ['user'] as any);
        expect(JSON.stringify(pickSafe).toLowerCase()).not.toContain('password');
        expect(JSON.stringify(pickSafe).toLowerCase()).not.toContain('authorization');
    });
});
