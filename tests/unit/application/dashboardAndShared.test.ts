import { describe, expect, it } from 'vitest';
import {
  GetDashboardSummaryUseCase,
  rankingRange,
  RegisterContributionUseCase,
  RegisterStockOutUseCase,
  requireAdmin,
  toDateOnly,
  toPageRequest,
} from '../../../application';
import { createOfficeContext } from '../../support/testContext';

describe('GetDashboardSummaryUseCase', () => {
  it('resume inventario, stock bajo, top retirador, últimos movimientos y la quincena actual', async () => {
    const ctx = await createOfficeContext();
    const { repos, uow, recorder, clock, ids, asAna, asLuis, asAdmin, ana } = ctx;
    const gaseosa = await ctx.seedProduct('Gaseosa', { stock: 10, minStock: 4 });
    await ctx.seedProduct('Yogur', { stock: 1, minStock: 2 });
    const stockOut = new RegisterStockOutUseCase(uow, recorder, clock);
    const dashboard = new GetDashboardSummaryUseCase(repos.products, repos.movements, repos.periods, clock);

    const empty = await dashboard.execute();
    expect(empty.topWithdrawer).toBeNull();
    expect(empty.currentPeriod).toBeNull();

    await stockOut.execute({ productId: gaseosa.id, quantity: 4 }, asAna);
    await stockOut.execute({ productId: gaseosa.id, quantity: 2 }, asLuis);
    const period = await ctx.seedPeriod({ createdBy: asAdmin.id });
    await new RegisterContributionUseCase(
      repos.periods,
      repos.users,
      repos.contributions,
      ids,
      clock,
    ).execute(period.id, { userId: ana.id, amount: 20000, paidAt: clock.now() }, asAdmin);

    const summary = await dashboard.execute();
    expect(summary).toMatchObject({ activeProducts: 2, totalUnits: 5 });
    expect(summary.lowStockProducts.map((p) => p.name)).toEqual(['Gaseosa', 'Yogur']);
    expect(summary.topWithdrawer).toMatchObject({ user: { name: 'Ana' }, totalWithdrawn: 4 });
    expect(summary.topWithdrawers.last30Days.map((t) => t.user.name)).toEqual(['Ana', 'Luis']);
    expect(summary.latestMovements.map((m) => m.quantity)).toEqual([2, 4]);
    expect(summary.currentPeriod).toMatchObject({ collected: '20000.00', balance: '20000.00' });
  });
});

describe('Utilidades de aplicación', () => {
  it('toPageRequest normaliza página y tamaño', () => {
    expect(toPageRequest()).toEqual({ page: 1, pageSize: 20 });
    expect(toPageRequest(3, 50)).toEqual({ page: 3, pageSize: 50 });
    expect(toPageRequest(0, 1000)).toEqual({ page: 1, pageSize: 100 });
    expect(toPageRequest(-2, 1.5)).toEqual({ page: 1, pageSize: 20 });
  });

  it('rankingRange calcula ventanas móviles', () => {
    const now = new Date('2026-10-31T00:00:00Z');
    expect(rankingRange('all', now)).toEqual({});
    expect(rankingRange('week', now).from?.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(rankingRange('month', now).from?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('toDateOnly y requireAdmin', () => {
    expect(toDateOnly(new Date('2026-10-16'))).toBe('2026-10-16');
    expect(() => requireAdmin({ id: 'x', role: 'ADMIN' })).not.toThrow();
    expect(() => requireAdmin({ id: 'x', role: 'EMPLOYEE' })).toThrow(
      expect.objectContaining({ code: 'ADMIN_REQUIRED' }),
    );
  });
});
