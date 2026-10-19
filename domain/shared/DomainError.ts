export type DomainErrorKind =
  'VALIDATION' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'LOCKED';

export type ErrorDetails = Record<string, unknown>;

/**
 * Error base del dominio. `kind` clasifica el error (la capa HTTP lo traduce a un status)
 * y `code` lo identifica de forma estable para el cliente.
 */
export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  constructor(
    message: string,
    readonly code: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly kind = 'VALIDATION' as const;
  constructor(message: string, code = 'VALIDATION_ERROR', details?: ErrorDetails) {
    super(message, code, details);
  }
}

export class UnauthorizedError extends DomainError {
  readonly kind = 'UNAUTHORIZED' as const;
  constructor(message = 'No autenticado', code = 'UNAUTHORIZED', details?: ErrorDetails) {
    super(message, code, details);
  }
}

export class ForbiddenError extends DomainError {
  readonly kind = 'FORBIDDEN' as const;
  constructor(message = 'No tienes permisos para esta acción', code = 'FORBIDDEN', details?: ErrorDetails) {
    super(message, code, details);
  }
}

export class NotFoundError extends DomainError {
  readonly kind = 'NOT_FOUND' as const;
  constructor(message: string, code = 'NOT_FOUND', details?: ErrorDetails) {
    super(message, code, details);
  }
}

export class ConflictError extends DomainError {
  readonly kind = 'CONFLICT' as const;
  constructor(message: string, code = 'CONFLICT', details?: ErrorDetails) {
    super(message, code, details);
  }
}
