import { DomainError, UnauthorizedError } from '../shared/DomainError';

export class InvalidPinError extends UnauthorizedError {
  constructor(remainingAttempts: number) {
    super(
      remainingAttempts === 1
        ? 'PIN incorrecto. Te queda 1 intento antes del bloqueo.'
        : `PIN incorrecto. Te quedan ${remainingAttempts} intentos antes del bloqueo.`,
      'INVALID_PIN',
      { remainingAttempts },
    );
  }
}

/** Demasiados PIN incorrectos: la persona queda bloqueada unos minutos. */
export class PinLockedError extends DomainError {
  readonly kind = 'LOCKED' as const;
  constructor(personId: string, lockedUntil: Date) {
    super('Demasiados intentos con PIN incorrecto. Espera unos minutos e inténtalo de nuevo.', 'PIN_LOCKED', {
      personId,
      lockedUntil: lockedUntil.toISOString(),
    });
  }
}
