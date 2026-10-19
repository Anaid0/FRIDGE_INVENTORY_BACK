import { describe, expect, it } from 'vitest';
import {
  ComputePeriodRankingUseCase,
  GetLatestPeriodRankingUseCase,
  GetPeopleActivityUseCase,
  RegisterStockInUseCase,
  GetPeriodRankingUseCase,
  GetTopWithdrawersUseCase,
  ListRankingPeriodsUseCase,
  periodRange,
  RegisterStockOutUseCase,
} from '../../../application';
import { KioskDevice, PeriodRanking, type User } from '../../../domain';
import { createOfficeContext, TZ } from '../../support/testContext';

async function setup() {
  const ctx = await createOfficeContext();
  const marta = await ctx.seedUser({ name: 'Marta' });
  const gaseosa = await ctx.seedProduct('Gaseosa', { stock: 100 });
  const { repos, clock } = ctx;
  const stockOut = new RegisterStockOutUseCase(ctx.uow, ctx.recorder, clock);
  /** Retiro a nombre de `who`, registrado por el admin, en la fecha/hora indicada (UTC). */
  const takeAt = async (iso: string, who: User, quantity: number) => {
    clock.set(new Date(iso));
    await stockOut.execute({ productId: gaseosa.id, quantity, performedBy: who.id }, ctx.asAdmin);
  };
  return {
    ...ctx,
    marta,
    takeAt,
    live: new GetTopWithdrawersUseCase(repos.movements, repos.periods, clock, TZ),
    compute: new ComputePeriodRankingUseCase(
      repos.periods,
      repos.movements,
      repos.rankings,
      repos.users,
      repos.kioskDevices,
      clock,
      TZ,
    ),
    status: new GetPeriodRankingUseCase(
      repos.periods,
      repos.rankings,
      repos.users,
      repos.kioskDevices,
      clock,
      TZ,
    ),
    periodsList: new ListRankingPeriodsUseCase(repos.periods, repos.rankings, clock, TZ),
    latest: new GetLatestPeriodRankingUseCase(repos.periods, repos.rankings, repos.users, repos.kioskDevices),
  };
}

const summary = (rows: { user: { name: string }; totalWithdrawn: number }[]) =>
  rows.map((r) => [r.user.name, r.totalWithdrawn]);

describe('periodRange', () => {
  it('va de las 00:00 del primer día al final del último día en la hora de la oficina (Bogotá, UTC−5)', () => {
    const range = periodRange({ startDate: new Date('2026-10-16'), endDate: new Date('2026-10-31') }, TZ);
    expect(range.from.toISOString()).toBe('2026-10-16T05:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-11-01T04:59:59.999Z');
    expect(range.endsAt.toISOString()).toBe('2026-11-01T05:00:00.000Z');
  });
});

describe('Ranking en vivo por quincena', () => {
  it('cuenta solo los retiros dentro de las fechas de la quincena, en la hora de la oficina', async () => {
    const { seedPeriod, admin, takeAt, ana, luis, live } = await setup();
    const period = await seedPeriod({ createdBy: admin.id, start: '2026-10-16', end: '2026-10-31' });
    await takeAt('2026-10-16T04:59:00Z', ana, 9); // 15 oct, 23:59 en Bogotá: antes de la quincena
    await takeAt('2026-10-16T05:00:00Z', luis, 2); // 16 oct, 00:00 en Bogotá: primer minuto
    await takeAt('2026-11-01T04:30:00Z', ana, 1); // 31 oct, 23:30 en Bogotá: último día
    await takeAt('2026-11-01T05:00:00Z', luis, 7); // 1 nov en Bogotá: ya terminó

    expect(summary(await live.execute({ periodId: period.id }))).toEqual([
      ['Luis', 2],
      ['Ana', 1],
    ]);
  });

  it("'period' usa la quincena abierta; sin quincena abierta el ranking queda vacío", async () => {
    const { seedPeriod, admin, takeAt, ana, live, repos, clock } = await setup();
    await takeAt('2026-10-17T15:00:00Z', ana, 3);
    expect(await live.execute({ window: 'period' })).toEqual([]);

    const period = await seedPeriod({ createdBy: admin.id });
    expect(summary(await live.execute({ window: 'period' }))).toEqual([['Ana', 3]]);

    period.close(clock.now());
    await repos.periods.save(period);
    expect(await live.execute({ window: 'period' })).toEqual([]);
  });

  it('una quincena que no existe da 404', async () => {
    const { live } = await setup();
    await expect(live.execute({ periodId: 'nope' })).rejects.toMatchObject({ code: 'PERIOD_NOT_FOUND' });
  });
});

describe('Calcular el más hambriento de la quincena', () => {
  it('no se puede antes de que termine la quincena abierta (y dice desde cuándo)', async () => {
    const { seedPeriod, admin, compute, status, asAdmin, clock } = await setup();
    const period = await seedPeriod({ createdBy: admin.id });
    clock.set(new Date('2026-11-01T04:59:59Z')); // aún es 31 oct en Bogotá

    await expect(compute.execute(period.id, { actor: asAdmin })).rejects.toMatchObject({
      code: 'PERIOD_NOT_FINISHED',
      details: { availableFrom: '2026-11-01T05:00:00.000Z' },
    });
    expect(await status.execute(period.id)).toMatchObject({ canCompute: false, ranking: null });
  });

  it('al terminar la quincena guarda el podio y el más hambriento, con empates', async () => {
    const { seedPeriod, admin, compute, status, asAdmin, takeAt, ana, luis, marta, clock } = await setup();
    const period = await seedPeriod({ createdBy: admin.id });
    await takeAt('2026-10-17T15:00:00Z', ana, 4);
    await takeAt('2026-10-18T15:00:00Z', luis, 4);
    await takeAt('2026-10-19T15:00:00Z', marta, 1);
    clock.set(new Date('2026-11-01T05:00:00Z'));

    const result = await compute.execute(period.id, { actor: asAdmin });
    expect(result.period).toMatchObject({ id: period.id, startDate: '2026-10-16', endDate: '2026-10-31' });
    expect(result.computedBy).toEqual({ kind: 'user', name: 'Admin Test' });
    expect(result.entries.map((e) => [e.position, e.user.name, e.totalWithdrawn])).toEqual([
      [1, 'Ana', 4],
      [1, 'Luis', 4],
      [3, 'Marta', 1],
    ]);
    expect(result.hungriest.map((e) => e.user.name)).toEqual(['Ana', 'Luis']);
    expect(result.podium).toHaveLength(3);
    expect(await status.execute(period.id)).toMatchObject({
      canCompute: true,
      ranking: { podium: result.podium },
    });
  });

  it('una quincena cerrada se puede calcular aunque no haya llegado su fecha de fin', async () => {
    const { seedPeriod, admin, compute, asAdmin, takeAt, ana } = await setup();
    const period = await seedPeriod({ createdBy: admin.id, closed: true });
    await takeAt('2026-10-17T15:00:00Z', ana, 2);
    const result = await compute.execute(period.id, { actor: asAdmin });
    expect(result.hungriest.map((e) => e.user.name)).toEqual(['Ana']);
  });

  it('es una foto: los retiros posteriores no la cambian hasta que se vuelve a calcular', async () => {
    const { seedPeriod, admin, compute, status, asAdmin, takeAt, ana, luis, clock } = await setup();
    const period = await seedPeriod({ createdBy: admin.id, closed: true });
    await takeAt('2026-10-17T15:00:00Z', ana, 2);
    await compute.execute(period.id, { actor: asAdmin });

    await takeAt('2026-10-18T15:00:00Z', luis, 5); // retiro registrado tarde, con fecha de la quincena
    expect((await status.execute(period.id)).ranking?.hungriest.map((e) => e.user.name)).toEqual(['Ana']);

    clock.set(new Date('2026-11-02T12:00:00Z'));
    const again = await compute.execute(period.id, { actor: asAdmin });
    expect(summary(again.entries)).toEqual([
      ['Luis', 5],
      ['Ana', 2],
    ]);
    expect(again.computedAt.toISOString()).toBe('2026-11-02T12:00:00.000Z');
  });

  it('si nadie sacó nada, el ranking queda vacío y no hay más hambriento', async () => {
    const { seedPeriod, admin, compute, asAdmin } = await setup();
    const period = await seedPeriod({ createdBy: admin.id, closed: true });
    const result = await compute.execute(period.id, { actor: asAdmin });
    expect(result).toMatchObject({ entries: [], hungriest: [], podium: [] });
  });

  it('solo un administrador puede calcularlo', async () => {
    const { seedPeriod, admin, compute, asAna } = await setup();
    const period = await seedPeriod({ createdBy: admin.id, closed: true });
    await expect(compute.execute(period.id, { actor: asAna })).rejects.toMatchObject({
      code: 'ADMIN_REQUIRED',
    });
  });

  it('la tablet ve el último calculado: el de la quincena que terminó más recientemente', async () => {
    const { seedPeriod, admin, compute, latest, asAdmin, takeAt, ana, luis } = await setup();
    expect(await latest.execute()).toBeNull();

    const october = await seedPeriod({ id: 'oct', createdBy: admin.id, closed: true });
    const september = await seedPeriod({
      id: 'sep',
      start: '2026-09-16',
      end: '2026-09-30',
      createdBy: admin.id,
      closed: true,
    });
    await takeAt('2026-09-20T15:00:00Z', luis, 1);
    await takeAt('2026-10-20T15:00:00Z', ana, 1);
    await compute.execute(october.id, { actor: asAdmin });
    await compute.execute(september.id, { actor: asAdmin }); // calculada después, pero es más vieja

    const result = await latest.execute();
    expect(result?.period.id).toBe('oct');
    expect(result?.hungriest.map((e) => e.user.name)).toEqual(['Ana']);
  });
});

describe('El más hambriento desde la tablet', () => {
  async function withTablet() {
    const ctx = await setup();
    const tablet = KioskDevice.pair({
      id: 'tablet-1',
      name: 'Tablet cocina',
      createdBy: ctx.admin.id,
      now: ctx.clock.now(),
    });
    await ctx.repos.kioskDevices.save(tablet);
    return { ...ctx, fromTablet: { kioskDeviceId: tablet.id } };
  }

  it('la tablet lo calcula cuando la quincena terminó, y queda a nombre de la tablet', async () => {
    const { seedPeriod, admin, compute, takeAt, ana, clock, fromTablet } = await withTablet();
    const period = await seedPeriod({ createdBy: admin.id });
    await takeAt('2026-10-17T15:00:00Z', ana, 2);

    await expect(compute.execute(period.id, fromTablet)).rejects.toMatchObject({
      code: 'PERIOD_NOT_FINISHED',
    });
    clock.set(new Date('2026-11-01T05:00:00Z'));
    const result = await compute.execute(period.id, fromTablet);
    expect(result.computedBy).toEqual({ kind: 'kiosk', name: 'Tablet cocina' });
    expect(result.hungriest.map((e) => e.user.name)).toEqual(['Ana']);
  });

  it('desde la tablet no se puede volver a calcular; un admin sí', async () => {
    const { seedPeriod, admin, compute, asAdmin, takeAt, ana, luis, fromTablet } = await withTablet();
    const period = await seedPeriod({ createdBy: admin.id, closed: true });
    await takeAt('2026-10-17T15:00:00Z', ana, 2);
    await compute.execute(period.id, fromTablet);
    await takeAt('2026-10-18T15:00:00Z', luis, 5);

    await expect(compute.execute(period.id, fromTablet)).rejects.toMatchObject({
      code: 'RANKING_ALREADY_COMPUTED',
    });
    const again = await compute.execute(period.id, { actor: asAdmin });
    expect(again.hungriest.map((e) => e.user.name)).toEqual(['Luis']);
    expect(again.computedBy.kind).toBe('user');
  });

  it('lista las quincenas para elegir: si ya terminaron y si ya tienen su más hambriento', async () => {
    const { seedPeriod, admin, compute, periodsList, fromTablet } = await withTablet();
    await seedPeriod({
      id: 'sep',
      start: '2026-09-16',
      end: '2026-09-30',
      createdBy: admin.id,
      closed: true,
    });
    await seedPeriod({ id: 'oct', createdBy: admin.id });
    await compute.execute('sep', fromTablet);

    expect(await periodsList.execute()).toEqual([
      expect.objectContaining({ id: 'oct', status: 'OPEN', finished: false, computed: false }),
      expect.objectContaining({
        id: 'sep',
        status: 'CLOSED',
        finished: true,
        computed: true,
        endDate: '2026-09-30',
      }),
    ]);
  });
});

describe('PeriodRanking', () => {
  const ref = (name: string) => ({ id: name, name, lastname: 'Test' });

  it('a igualdad de unidades desempata por cantidad de retiros; si todo es igual, comparten puesto', () => {
    const ranking = PeriodRanking.compute({
      periodId: 'p',
      computedBy: { kind: 'user', id: 'admin' },
      now: new Date(),
      rows: [
        { user: ref('A'), totalWithdrawn: 5, withdrawals: 3 },
        { user: ref('B'), totalWithdrawn: 5, withdrawals: 2 },
        { user: ref('C'), totalWithdrawn: 5, withdrawals: 2 },
        { user: ref('D'), totalWithdrawn: 1, withdrawals: 1 },
      ],
    });
    expect(ranking.entries.map((e) => [e.user.name, e.position])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 2],
      ['D', 4],
    ]);
    expect(ranking.hungriest.map((e) => e.user.name)).toEqual(['A']);
    expect(ranking.podium.map((e) => e.user.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('GetPeopleActivityUseCase', () => {
  it('por persona, cuánto sacó y metió a mano en la quincena abierta (o la indicada)', async () => {
    const ctx = await setup();
    const { seedPeriod, admin, takeAt, ana, luis, repos, clock } = ctx;
    const activity = new GetPeopleActivityUseCase(repos.movements, repos.periods, TZ);
    expect(await activity.execute()).toEqual({ period: null, people: [] });

    const period = await seedPeriod({ createdBy: admin.id });
    await takeAt('2026-10-17T15:00:00Z', ana, 3);
    await takeAt('2026-10-18T15:00:00Z', ana, 1);
    clock.set(new Date('2026-10-18T16:00:00Z'));
    await new RegisterStockInUseCase(ctx.uow, ctx.recorder, clock).execute(
      { productId: 'prod-gaseosa', quantity: 6, performedBy: luis.id },
      ctx.asAdmin,
    );
    await takeAt('2026-11-02T15:00:00Z', luis, 9); // fuera de la quincena

    const result = await activity.execute();
    expect(result.period?.id).toBe(period.id);
    expect(result.people).toEqual(
      expect.arrayContaining([
        { userId: ana.id, withdrawn: 4, stored: 0 },
        { userId: luis.id, withdrawn: 0, stored: 6 },
      ]),
    );
    expect(result.people).toHaveLength(2);
    expect((await activity.execute({ periodId: period.id })).people).toHaveLength(2);
  });
});
