import { ValidationError } from './DomainError';

/** Validaciones reutilizables para los invariantes de entidades y value objects. */
export const Guard = {
  requiredText(value: string, field: string, maxLength: number): string {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
      throw new ValidationError(`${field} es obligatorio`, 'REQUIRED', { field });
    }
    if (trimmed.length > maxLength) {
      throw new ValidationError(`${field} no puede superar ${maxLength} caracteres`, 'TOO_LONG', {
        field,
        maxLength,
      });
    }
    return trimmed;
  },

  /** Texto opcional: vacío o solo espacios se normaliza a null. */
  optionalText(value: string | null | undefined, field: string, maxLength: number): string | null {
    if (value == null) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > maxLength) {
      throw new ValidationError(`${field} no puede superar ${maxLength} caracteres`, 'TOO_LONG', {
        field,
        maxLength,
      });
    }
    return trimmed;
  },

  validDate(value: Date, field: string): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new ValidationError(`${field} no es una fecha válida`, 'INVALID_DATE', { field });
    }
    return value;
  },

  nonNegativeInteger(value: number, field: string): number {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ValidationError(`${field} debe ser un entero mayor o igual a 0`, 'INVALID_NUMBER', {
        field,
        value,
      });
    }
    return value;
  },
};
