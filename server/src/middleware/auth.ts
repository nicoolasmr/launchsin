import { Request, Response, NextFunction } from 'express';
import { logger } from '../infra/structured-logger';

/**
 * Supabase Auth Middleware
 * 
 * Verifies JWT and injects `user` into the request.
 * In a real scenario, this would use `supabase-js` or direct JWT verification.
 */

export interface AuthUser {
    id: string;
    tenant_id: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
}

export interface AuthenticatedRequest extends Request {
    user?: AuthUser;
}

export const authMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed authorization header' });
    }

    // Mock JWT validation - In production, use verify(token, JWT_SECRET)
    // For Sprint 0, we assume the token is validated by the infrastructure/Supabase
    try {
        // Placeholder: Extracting mock user from token (header.payload.signature)
        // In prod: const payload = jwt.verify(token, secret);

        // MOCKING USER DATA FOR SPRINT BUILD
        req.user = {
            id: 'mock-user-id',
            tenant_id: req.headers['x-tenant-id'] as string || '00000000-0000-4000-a000-000000000001',
            role: 'admin'
        };

        next();
    } catch (error: any) {
        logger.error('Authentication failure', { error: error.message });
        res.status(401).json({ error: 'Invalid authentication token' });
    }
};
