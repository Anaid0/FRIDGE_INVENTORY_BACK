import { ValidationError } from './DomainError';

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Valor monetario en la moneda configurada de la app.
 * Se guarda en centavos enteros para que sumas y multiplicaciones sean exactas.
 */
export class Money {
  private constructor(readonly cents: number) {}

  static zero(): Money {
    return new Money(0);
  }

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new ValidationError('Monto inválido', 'INVALID_MONEY', { cents });
    }
    return new Money(cents + 0); // normaliza -0
  }

  /** Acepta "2500", "2500.5", "2500.50" o el número equivalente (máximo 2 decimales). */
  static fromDecimal(value: string | number): Money {
    const text = typeof value === 'number' ? (Number.isFinite(value) ? value.toString() : '') : value.trim();
    const match = DECIMAL_PATTERN.exec(text);
    if (!match) {
      throw new ValidationError('Monto inválido: usa un número con máximo 2 decimales', 'INVALID_MONEY', {
        value,
      });
    }
    const [, sign, integerPart, fraction = ''] = match;
    const cents = Number(integerPart) * 100 + Number(fraction.padEnd(2, '0'));
    return Money.fromCents(sign ? -cents : cents);
  }

  static sum(values: readonly Money[]): Money {
    return values.reduce((acc, value) => acc.add(value), Money.zero());
  }

  add(other: Money): Money {
    return Money.fromCents(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return Money.fromCents(this.cents - other.cents);
  }

  multiply(factor: number): Money {
    if (!Number.isSafeInteger(factor)) {
      throw new ValidationError('Solo se puede multiplicar un monto por un entero', 'INVALID_MONEY', {
        factor,
      });
    }
    return Money.fromCents(this.cents * factor);
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  isNegative(): boolean {
    return this.cents < 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  /** Texto decimal con 2 cifras, apto para DECIMAL(12,2): "-1500.05". */
  toDecimalString(): string {
    const sign = this.cents < 0 ? '-' : '';
    const abs = Math.abs(this.cents);
    const integerPart = Math.trunc(abs / 100);
    const fraction = String(abs % 100).padStart(2, '0');
    return `${sign}${integerPart}.${fraction}`;
  }

  toNumber(): number {
    return this.cents / 100;
  }

  toJSON(): string {
    return this.toDecimalString();
  }
}
