import { describe, expect, it } from 'vitest';
import {
  CloseFundingPeriodUseCase,
  GetCurrentFundingPeriodUseCase,
  GetFundingPeriodDetailUseCase,
  ListFundingPeriodsUseCase,
  OpenFundingPeriodUseCase,
  RegisterContributionUseCase,
} from '../../../application';
import { createOfficeContext } from '../../support/testContext';

async function setup() {
  const ctx = await createOfficeContext();
  const { repos, ids, clock } = ctx;
  return {
    ...ctx,
    open: new OpenFundingPeriodUseCase(repos.periods, ids, clock),
    close: new CloseFundingPeriodUseCase(repos.periods, clock),
    list: new ListFundingPeriodsUseCase(repos.periods),
    current: new GetCurrentFundingPeriodUseCase(repos.periods),
    detail: new GetFundingPeriodDetailUseCase(repos.periods, repos.contributions, repos.purchases),
    contribute: new RegisterContributionUseCase(repos.periods, repos.users, repos.contributions, ids, clock),
  };
}

const q2 = { name: '2026-10 Q2', startDate: new Date('2026-10-16'), endDate: new Date('2026-10-31') };
const q1nov = { name: '2026-11 Q1', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-15') };

describe('Abrir y cerrar quincenas', () => {
  it('el admin abre una quincena', async () => {
    const { open, asAdmin } = await setup();
    const dto = await open.execute(q2, asAdmin);
    expect(dto).toMatchObject({
      name: '2026-10 Q2',
      startDate: '2026-10-16',
      endDate: '2026-10-31',
      status: 'OPEN',
    });
  });

  it('solo puede haber una abierta a la vez', async () => {
    const { open, asAdmin } = await setup();
    await open.execute(q2, asAdmin);
    await expect(open.execute(q1nov, asAdmin)).rejects.toMatchObject({ code: 'OPEN_PERIOD_EXISTS' });
  });

  it('no se puede abrir una quincena que se cruza con otra', async () => {
    const { open, close, asAdmin } = await setup();
    const first = await open.execute(q2, asAdmin);
    await close.execute(first.id, asAdmin);
    await expect(
      open.execute(
        { name: 'cruzada', startDate: new Date('2026-10-30'), endDate: new Date('2026-11-10') },
        asAdmin,
      ),
    ).rejects.toMatchObject({ code: 'PERIOD_OVERLAP' });
    expect((await open.execute(q1nov, asAdmin)).status).toBe('OPEN');
  });

  it('cerrar dos veces o como empleado falla', async () => {
    const { open, close, asAdmin, asAna } = await setup();
    const period = await open.execute(q2, asAdmin);
    await expect(close.execute(period.id, asAna)).rejects.toMatchObject({ kind: 'FORBIDDEN' });
    expect((await close.execute(period.id, asAdmin)).status).toBe('CLOSED');
    await expect(close.execute(period.id, asAdmin)).rejects.toMatchObject({ code: 'PERIOD_ALREADY_CLOSED' });
    await expect(close.execute('nope', asAdmin)).rejects.toMatchObject({ code: 'PERIOD_NOT_FOUND' });
  });
});

describe('Aportes y resumen de la quincena', () => {
  it('registra aportes y calcula recaudado / saldo por persona', async () => {
    const { open, contribute, detail, current, list, asAdmin, ana, luis } = await setup();
    expect(await current.execute()).toBeNull();
    const period = await open.execute(q2, asAdmin);

    const paidAt = new Date('2026-10-16T13:00:00Z');
    const dto = await contribute.execute(period.id, { userId: ana.id, amount: '30000', paidAt }, asAdmin);
    expect(dto).toMatchObject({ amount: '30000.00', userId: ana.id, registeredBy: asAdmin.id });
    await contribute.execute(
      period.id,
      { userId: ana.id, amount: 20000, paidAt, note: 'segunda parte' },
      asAdmin,
    );
    await contribute.execute(period.id, { userId: luis.id, amount: '50000.50', paidAt }, asAdmin);

    const result = await detail.execute(period.id);
    expect(result.summary).toMatchObject({ collected: '100000.50', spent: '0.00', balance: '100000.50' });
    expect(result.contributions).toHaveLength(3);
    expect(result.contributorTotals).toEqual([
      { user: expect.objectContaining({ name: 'Luis' }), total: '50000.50', contributions: 1 },
      { user: expect.objectContaining({ name: 'Ana' }), total: '50000.00', contributions: 2 },
    ]);
    expect((await current.execute())?.collected).toBe('100000.50');
    expect((await list.execute())[0]?.periodId).toBe(period.id);
  });

  it('valida quincena abierta, usuario activo, monto y permisos', async () => {
    const { contribute, seedPeriod, seedUser, asAdmin, asAna, ana } = await setup();
    const closed = await seedPeriod({ id: 'cerrada', createdBy: asAdmin.id, closed: true });
    const paidAt = new Date();
    await expect(
      contribute.execute(closed.id, { userId: ana.id, amount: 1000, paidAt }, asAdmin),
    ).rejects.toMatchObject({ code: 'PERIOD_CLOSED' });

    const open = await seedPeriod({
      id: 'abierta',
      start: '2026-11-01',
      end: '2026-11-15',
      createdBy: asAdmin.id,
    });
    const inactivo = await seedUser({ name: 'Inactivo', isActive: false });
    await expect(
      contribute.execute(open.id, { userId: inactivo.id, amount: 1000, paidAt }, asAdmin),
    ).rejects.toMatchObject({ code: 'USER_INACTIVE' });
    await expect(
      contribute.execute(open.id, { userId: ana.id, amount: '0', paidAt }, asAdmin),
    ).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
    await expect(
      contribute.execute(open.id, { userId: ana.id, amount: 'abc', paidAt }, asAdmin),
    ).rejects.toMatchObject({ code: 'INVALID_MONEY' });
    await expect(
      contribute.execute(open.id, { userId: ana.id, amount: 1, paidAt }, asAna),
    ).rejects.toMatchObject({
      kind: 'FORBIDDEN',
    });
  });

  it('el detalle de una quincena inexistente falla', async () => {
    const { detail } = await setup();
    await expect(detail.execute('nope')).rejects.toMatchObject({ code: 'PERIOD_NOT_FOUND' });
  });
});
