import { ValidationError } from '../shared/DomainError';

const MIN_LENGTH = 8;
/** bcrypt solo usa los primeros 72 bytes. */
const MAX_BYTES = 72;

/** Contraseña en texto plano que cumple la política (antes de hashearla). */
export class PlainPassword {
  private constructor(readonly value: string) {}

  static create(raw: string): PlainPassword {
    const value = raw ?? '';
    if (value.length < MIN_LENGTH) {
      throw new ValidationError(
        `La contraseña debe tener al menos ${MIN_LENGTH} caracteres`,
        'WEAK_PASSWORD',
      );
    }
    if (new TextEncoder().encode(value).length > MAX_BYTES) {
      throw new ValidationError(`La contraseña no puede superar ${MAX_BYTES} bytes`, 'PASSWORD_TOO_LONG');
    }
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
      throw new ValidationError('La contraseña debe tener al menos una letra y un número', 'WEAK_PASSWORD');
    }
    return new PlainPassword(value);
  }
}
