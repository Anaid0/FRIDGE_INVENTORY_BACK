import { ValidationError } from '../shared/DomainError';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 150;

export class Email {
  private constructor(readonly value: string) {}

  /** Normaliza (trim + minúsculas) y valida el formato. */
  static create(raw: string): Email {
    const normalized = (raw ?? '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized) || normalized.length > MAX_LENGTH) {
      throw new ValidationError('El email no es válido', 'INVALID_EMAIL', { email: raw });
    }
    return new Email(normalized);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
