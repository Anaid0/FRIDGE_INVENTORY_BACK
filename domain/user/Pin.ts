import { ValidationError } from '../shared/DomainError';

const FORMAT = /^\d{4}$/;

/** PIN de 4 dígitos con el que una persona se identifica en la tablet. */
export class Pin {
  private constructor(readonly value: string) {}

  /** Para PIN nuevos: 4 dígitos y no trivial (0000, 1111, 1234, 4321…). */
  static create(raw: string): Pin {
    const value = (raw ?? '').trim();
    if (!Pin.hasValidFormat(value)) {
      throw new ValidationError('El PIN debe tener exactamente 4 dígitos', 'INVALID_PIN_FORMAT');
    }
    if (Pin.isTrivial(value)) {
      throw new ValidationError('Ese PIN es muy fácil de adivinar; elige otro', 'WEAK_PIN');
    }
    return new Pin(value);
  }

  static hasValidFormat(value: string): boolean {
    return FORMAT.test(value ?? '');
  }

  /** Todos iguales o una secuencia consecutiva ascendente/descendente. */
  static isTrivial(value: string): boolean {
    const digits = [...value].map(Number);
    const steps = digits.slice(1).map((digit, i) => digit - (digits[i] ?? 0));
    return steps.every((s) => s === 0) || steps.every((s) => s === 1) || steps.every((s) => s === -1);
  }
}
