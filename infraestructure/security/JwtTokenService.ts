import jwt, { type SignOptions as JwtSignOptions } from 'jsonwebtoken';
import {
  KIOSK_TOKEN_ROLE,
  type SignOptions,
  type TokenPayload,
  type TokenRole,
  type TokenService,
} from '../../application';
import { isRole, UnauthorizedError } from '../../domain';

const ALGORITHM = 'HS256';

const isTokenRole = (value: unknown): value is TokenRole => isRole(value) || value === KIOSK_TOKEN_ROLE;

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
  ) {}

  sign(payload: TokenPayload, options: SignOptions = {}): string {
    return jwt.sign({ role: payload.role }, this.secret, {
      subject: payload.sub,
      expiresIn: (options.expiresIn ?? this.expiresIn) as JwtSignOptions['expiresIn'],
      algorithm: ALGORITHM,
    });
  }

  verify(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret, { algorithms: [ALGORITHM] });
      if (typeof decoded === 'string' || !decoded.sub || !isTokenRole(decoded.role)) {
        throw new UnauthorizedError('Token inválido', 'INVALID_TOKEN');
      }
      return { sub: decoded.sub, role: decoded.role };
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('La sesión expiró, vuelve a iniciar sesión', 'TOKEN_EXPIRED');
      }
      throw new UnauthorizedError('Token inválido', 'INVALID_TOKEN');
    }
  }
}
