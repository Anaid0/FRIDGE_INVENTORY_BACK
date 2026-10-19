import type { RequestHandler } from 'express';
import { ForbiddenError, type Role } from '../../../domain';

export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.actor || !roles.includes(req.actor.role)) {
      next(new ForbiddenError('No tienes permisos para esta acción', 'FORBIDDEN'));
      return;
    }
    next();
  };
}
