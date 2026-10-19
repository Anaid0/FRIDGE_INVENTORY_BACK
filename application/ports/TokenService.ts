import type { Role } from '../../domain';

/** Rol especial de los tokens de tablet: `sub` es el id del dispositivo, no de un usuario. */
export const KIOSK_TOKEN_ROLE = 'KIOSK' as const;
export type TokenRole = Role | typeof KIOSK_TOKEN_ROLE;

export interface TokenPayload {
  sub: string; // id del usuario, o del dispositivo si role = KIOSK
  role: TokenRole;
}

export interface SignOptions {
  /** Duración del token (ej. "8h", "1825d"). Si se omite, la configurada para sesiones de usuario. */
  expiresIn?: string;
}

export interface TokenService {
  sign(payload: TokenPayload, options?: SignOptions): string;
  /** Lanza UnauthorizedError si el token es inválido o expiró. */
  verify(token: string): TokenPayload;
}
