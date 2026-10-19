import { describe, expect, it } from 'vitest';
import {
  buildPeriodSummary,
  Contribution,
  FundingPeriod,
  Money,
  PeriodClosedError,
  PeriodStatus,
  ValidationError,
} from '../../../domain';
import { admin, LATER, makeClosedPeriod, makeOpenPeriod, NOW } from './fixtures';

describe('FundingPeriod', () => {
  it('se abre en estado OPEN', () => {
    const period = makeOpenPeriod();
    expect(period.status).toBe(PeriodStatus.OPEN);
    expect(period.isOpen()).toBe(true);
    expect(period.closedAt).toBeNull();
    expect(period.notes).toBeNull();
    expect(period.createdBy).toBe(admin.id);
    expect(() => period.assertOpen()).not.toThrow();
  });

  it('valida nombre y rango de fechas', () => {
    const base = { id: 'q', name: 'Q', createdBy: 'a', now: NOW };
    expect(() =>
      FundingPeriod.open({ ...base, startDate: new Date('2026-10-31'), endDate: new Date('2026-10-16') }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_PERIOD_RANGE' }));
    expect(() =>
      FundingPeriod.open({
        ...base,
        name: '',
        startDate: new Date('2026-10-16'),
        endDate: new Date('2026-10-31'),
      }),
    ).toThrow(ValidationError);
    expect(() =>
      FundingPeriod.open({ ...base, startDate: new Date('x'), endDate: new Date('2026-10-31') }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_DATE' }));
  });

  it('permite una quincena de un solo día', () => {
    const day = new Date('2026-10-16');
    expect(
      FundingPeriod.open({
        id: 'q',
        name: 'Q',
        startDate: day,
        endDate: day,
        createdBy: 'a',
        now: NOW,
      }).isOpen(),
    ).toBe(true);
  });

  it('al cerrarse deja de aceptar operaciones', () => {
    const period = makeOpenPeriod();
    period.close(LATER);
    expect(period.status).toBe(PeriodStatus.CLOSED);
    expect(period.closedAt).toBe(LATER);
    expect(period.updatedAt).toBe(LATER);
    expect(() => period.assertOpen()).toThrow(PeriodClosedError);
    expect(() => period.close(LATER)).toThrow(expect.objectContaining({ code: 'PERIOD_ALREADY_CLOSED' }));
  });
});

describe('Contribution', () => {
  const input = {
    id: 'c1',
    userId: 'emp-1',
    amount: Money.fromDecimal('50000'),
    paidAt: NOW,
    registeredBy: admin.id,
    now: NOW,
  };

  it('registra un aporte en una quincena abierta', () => {
    const contribution = Contribution.register({ ...input, period: makeOpenPeriod(), note: ' efectivo ' });
    expect(contribution.periodId).toBe('period-1');
    expect(contribution.userId).toBe('emp-1');
    expect(contribution.amount.toDecimalString()).toBe('50000.00');
    expect(contribution.note).toBe('efectivo');
    expect(contribution.registeredBy).toBe(admin.id);
  });

  it('no acepta aportes en una quincena cerrada', () => {
    expect(() => Contribution.register({ ...input, period: makeClosedPeriod() })).toThrow(PeriodClosedError);
  });

  it.each(['0', '-100'])('rechaza el monto %s', (amount) => {
    expect(() =>
      Contribution.register({ ...input, period: makeOpenPeriod(), amount: Money.fromDecimal(amount) }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
  });
});

describe('buildPeriodSummary', () => {
  const period = makeOpenPeriod();

  it('calcula el saldo como recaudado - gastado', () => {
    const summary = buildPeriodSummary(period, Money.fromDecimal('100000'), Money.fromDecimal('48000'));
    expect(summary.balance.toDecimalString()).toBe('52000.00');
    expect(summary.isOverspent).toBe(false);
    expect(summary.periodId).toBe(period.id);
    expect(summary.status).toBe('OPEN');
  });

  it('marca la quincena cuando se gastó más de lo recaudado', () => {
    const summary = buildPeriodSummary(period, Money.fromDecimal('10000'), Money.fromDecimal('12000'));
    expect(summary.balance.toDecimalString()).toBe('-2000.00');
    expect(summary.isOverspent).toBe(true);
  });
});
