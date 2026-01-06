/**
 * PII Redactor
 * 
 * Utility to redact Personally Identifiable Information (PII) from text
 * before sending to external services like OpenAI.
 * 
 * This is critical for compliance and security.
 */

/**
 * Redact PII from text
 * 
 * Removes or masks:
 * - Email addresses
 * - Phone numbers (various formats)
 * - URLs with sensitive query parameters
 * - Tokens and API keys
 * - Credit card numbers
 * 
 * @param text - Input text that may contain PII
 * @param maxLength - Maximum length of output (truncate if needed)
 * @returns Redacted text safe for external processing
 */
export function redactPII(text: string, maxLength: number = 5000): string {
    if (!text) return '';

    let redacted = text;

    // Redact email addresses
    redacted = redacted.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        '[EMAIL_REDACTED]'
    );

    // Redact phone numbers (various formats)
    // Matches: +55 11 98765-4321, (11) 98765-4321, 11987654321, etc.
    redacted = redacted.replace(
        /(\+?\d{1,3}[-.\s]?)?\(?\d{2,3}\)?[-.\s]?\d{4,5}[-.\s]?\d{4}/g,
        '[PHONE_REDACTED]'
    );

    // Redact URLs with sensitive query parameters
    redacted = redacted.replace(
        /(https?:\/\/[^\s]+[?&](token|key|secret|password|auth|api_key)=[^\s&]+)/gi,
        '[URL_WITH_SENSITIVE_PARAMS_REDACTED]'
    );

    // Redact potential API keys/tokens (long alphanumeric strings)
    redacted = redacted.replace(
        /\b[A-Za-z0-9]{32,}\b/g,
        '[TOKEN_REDACTED]'
    );

    // Redact credit card numbers
    redacted = redacted.replace(
        /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
        '[CARD_REDACTED]'
    );

    // Redact CPF (Brazilian tax ID)
    redacted = redacted.replace(
        /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
        '[CPF_REDACTED]'
    );

    // Truncate if needed
    if (redacted.length > maxLength) {
        redacted = redacted.substring(0, maxLength) + '... [TRUNCATED]';
    }

    return redacted;
}

/**
 * Redact PII from an object's string fields
 * 
 * @param obj - Object with potential PII in string fields
 * @param fields - Specific fields to redact (if not provided, redacts all string fields)
 * @returns New object with redacted fields
 */
export function redactPIIFromObject<T extends Record<string, any>>(
    obj: T,
    fields?: (keyof T)[]
): T {
    const redacted = { ...obj };
    const fieldsToRedact = fields || (Object.keys(obj) as (keyof T)[]);

    fieldsToRedact.forEach((field) => {
        if (typeof redacted[field] === 'string') {
            redacted[field] = redactPII(redacted[field] as string) as any;
        }
    });

    return redacted;
}

/**
 * Check if text contains potential PII
 * 
 * @param text - Text to check
 * @returns true if PII patterns are detected
 */
export function containsPII(text: string): boolean {
    if (!text) return false;

    const piiPatterns = [
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email
        /(\+?\d{1,3}[-.\s]?)?\(?\d{2,3}\)?[-.\s]?\d{4,5}[-.\s]?\d{4}/, // Phone
        /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, // CPF
        /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/ // Credit card
    ];

    return piiPatterns.some((pattern) => pattern.test(text));
}
