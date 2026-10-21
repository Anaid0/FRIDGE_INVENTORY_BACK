import { ValidationError } from '../shared/DomainError';
import { Pin } from './Pin';

const FORMAT = /^\d{4,6}$/;

/** Código numérico (4 a 6 dígitos) con el que un administrador entra a la administración desde la tablet. */
export class AdminCode {
  private constructor(readonly value: string) {}

  /** Para códigos nuevos: 4 a 6 dígitos y no trivial (0000, 111111, 1234, 654321…). */
  static create(raw: string): AdminCode {
    const value = (raw ?? '').trim();
    if (!AdminCode.hasValidFormat(value)) {
      throw new ValidationError(
        'El código de administrador debe tener de 4 a 6 dígitos (solo números)',
        'INVALID_ADMIN_CODE_FORMAT',
      );
    }
    if (Pin.isTrivial(value)) {
      throw new ValidationError(
        'Ese código es muy fácil de adivinar (dígitos repetidos o seguidos); elige otro',
        'INVALID_ADMIN_CODE_FORMAT',
      );
    }
    return new AdminCode(value);
  }

  static hasValidFormat(value: string): boolean {
    return FORMAT.test(value ?? '');
  }
}
