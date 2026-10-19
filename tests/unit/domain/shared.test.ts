import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  Guard,
  InsufficientStockError,
  NotFoundError,
  PeriodClosedError,
  UnauthorizedError,
  ValidationError,
} from '../../../domain';

describe('Errores de dominio', () => {
  it('cada tipo expone kind, code y name', () => {
    const cases: [DomainError, string, string][] = [
      [new ValidationError('x'), 'VALIDATION', 'VALIDATION_ERROR'],
      [new UnauthorizedError(), 'UNAUTHORIZED', 'UNAUTHORIZED'],
      [new ForbiddenError(), 'FORBIDDEN', 'FORBIDDEN'],
      [new NotFoundError('x', 'PRODUCT_NOT_FOUND'), 'NOT_FOUND', 'PRODUCT_NOT_FOUND'],
      [new ConflictError('x'), 'CONFLICT', 'CONFLICT'],
    ];
    for (const [error, kind, code] of cases) {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
      expect(error.kind).toBe(kind);
      expect(error.code).toBe(code);
      expect(error.name).toBe(error.constructor.name);
    }
  });

  it('InsufficientStockError y PeriodClosedError son conflictos con detalles', () => {
    const stock = new InsufficientStockError('p1', 2, 5);
    expect(stock).toBeInstanceOf(ConflictError);
    expect(stock.code).toBe('INSUFFICIENT_STOCK');
    expect(stock.details).toEqual({ productId: 'p1', available: 2, requested: 5 });

    const closed = new PeriodClosedError('q1');
    expect(closed.kind).toBe('CONFLICT');
    expect(closed.code).toBe('PERIOD_CLOSED');
  });
});

describe('Guard', () => {
  it('requiredText recorta y valida longitud', () => {
    expect(Guard.requiredText('  Ana ', 'name', 10)).toBe('Ana');
    expect(() => Guard.requiredText('   ', 'name', 10)).toThrow(
      expect.objectContaining({ code: 'REQUIRED' }),
    );
    expect(() => Guard.requiredText('abcdef', 'name', 3)).toThrow(
      expect.objectContaining({ code: 'TOO_LONG' }),
    );
  });

  it('optionalText normaliza vacíos a null', () => {
    expect(Guard.optionalText(undefined, 'note', 5)).toBeNull();
    expect(Guard.optionalText(null, 'note', 5)).toBeNull();
    expect(Guard.optionalText('   ', 'note', 5)).toBeNull();
    expect(Guard.optionalText(' hola ', 'note', 5)).toBe('hola');
    expect(() => Guard.optionalText('demasiado', 'note', 3)).toThrow(ValidationError);
  });

  it('validDate rechaza fechas inválidas', () => {
    const date = new Date('2026-01-01');
    expect(Guard.validDate(date, 'd')).toBe(date);
    expect(() => Guard.validDate(new Date('nope'), 'd')).toThrow(
      expect.objectContaining({ code: 'INVALID_DATE' }),
    );
  });

  it('nonNegativeInteger acepta 0 y rechaza negativos o decimales', () => {
    expect(Guard.nonNegativeInteger(0, 'n')).toBe(0);
    expect(() => Guard.nonNegativeInteger(-1, 'n')).toThrow(ValidationError);
    expect(() => Guard.nonNegativeInteger(1.5, 'n')).toThrow(ValidationError);
  });
});
