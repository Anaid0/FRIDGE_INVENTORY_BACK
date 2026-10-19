import type { RequestHandler } from 'express';
import {
  KIOSK_TOKEN_ROLE,
  type AuthenticateKioskDeviceUseCase,
  type GetCurrentUserUseCase,
  type TokenService,
} from '../../../application';
import { ForbiddenError, UnauthorizedError } from '../../../domain';
import { asyncHandler } from '../asyncHandler';

/**
 * Acepta dos tipos de token:
 * - de usuario (admin): vuelve a cargar el usuario; si fue desactivado la sesión cae de inmediato → `req.actor`.
 * - de tablet (KIOSK): la tablet debe existir y no estar revocada → `req.kioskDevice`.
 */
export function authenticate(
  tokens: TokenService,
  getCurrentUser: GetCurrentUserUseCase,
  authenticateKiosk: AuthenticateKioskDeviceUseCase,
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedError('Falta el token de autenticación', 'MISSING_TOKEN');
    }
    const payload = tokens.verify(token);
    if (payload.role === KIOSK_TOKEN_ROLE) {
      req.kioskDevice = await authenticateKiosk.execute(payload.sub);
    } else {
      const user = await getCurrentUser.execute(payload.sub);
      req.actor = { id: user.id, role: user.role };
    }
    next();
  });
}

/** Rutas solo para usuarios (admin): una tablet no puede usarlas. */
export const requireUser: RequestHandler = (req, _res, next) => {
  next(
    req.actor
      ? undefined
      : new ForbiddenError('Esta acción no está disponible desde la tablet', 'USER_REQUIRED'),
  );
};

/** Rutas solo para tablets autorizadas. */
export const requireKiosk: RequestHandler = (req, _res, next) => {
  next(
    req.kioskDevice
      ? undefined
      : new ForbiddenError('Esta acción solo se puede hacer desde una tablet autorizada', 'KIOSK_REQUIRED'),
  );
};
