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

/** La tablet recibió demasiados PIN que no son de nadie seguidos: no acepta PIN durante unos minutos. */
export class DevicePinLockedError extends DomainError {
  readonly kind = 'LOCKED' as const;
  constructor(deviceId: string, lockedUntil: Date) {
    super(
      'Demasiados PIN incorrectos en esta tablet. Espera un par de minutos e inténtalo de nuevo.',
      'PIN_LOCKED',
      {
        deviceId,
        lockedUntil: lockedUntil.toISOString(),
      },
    );
  }
}

/** PIN incorrecto en la tablet (no corresponde a nadie), con los intentos que le quedan a la tablet. */
export class UnknownPinError extends UnauthorizedError {
  constructor(remainingAttempts: number) {
    super(
      remainingAttempts === 1
        ? 'PIN incorrecto. Queda 1 intento antes de bloquear la tablet un par de minutos.'
        : `PIN incorrecto. Quedan ${remainingAttempts} intentos antes de bloquear la tablet un par de minutos.`,
      'INVALID_PIN',
      { remainingAttempts },
    );
  }
}

/**
 * Código de administrador incorrecto en la tablet. Cuenta para la tablet igual que un PIN incorrecto
 * (mismos intentos y mismo bloqueo).
 */
export class InvalidAdminCodeError extends UnauthorizedError {
  constructor(remainingAttempts: number) {
    super(
      remainingAttempts === 1
        ? 'Código de administrador incorrecto. Queda 1 intento antes de bloquear la tablet un par de minutos.'
        : `Código de administrador incorrecto. Quedan ${remainingAttempts} intentos antes de bloquear la tablet un par de minutos.`,
      'INVALID_ADMIN_CODE',
      { remainingAttempts },
    );
  }
}
