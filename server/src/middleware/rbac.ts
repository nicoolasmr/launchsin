import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { logger } from '../infra/structured-logger';

/**
 * RBAC Helper
 * 
 * Requires a minimum role level for the organization.
 */

const ROLE_HIERARCHY = {
  'owner': 4,
  'admin': 3,
  'member': 2,
  'viewer': 1
};

export const requireOrgRole = (minRole: keyof typeof ROLE_HIERARCHY) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const userLevel = ROLE_HIERARCHY[req.user.role];
    const requiredLevel = ROLE_HIERARCHY[minRole];

    if (userLevel < requiredLevel) {
      logger.warn('RBAC Denial', {
        userId: req.user.id,
        role: req.user.role,
        required: minRole,
        path: (req as any).path
      });
      return res.status(403).json({ error: `Forbidden: Requires ${minRole} role` });
    }

    next();
  };
};

/**
 * Project Scoping Middleware
 * (Placeholder for actual DB check in later sprints)
 */
export const validateProjectAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { projectId } = (req as any).params;
  const { tenant_id } = req.user!;

  // In production: Check if project.org_id === tenant_id && (has explicit project membership OR org admin)
  logger.info('Validating project access', { projectId, tenant_id });

  next();
};
