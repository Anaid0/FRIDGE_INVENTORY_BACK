import { describe, expect, it } from 'vitest';
import {
  CloseFundingPeriodUseCase,
  ComputePeriodRankingUseCase,
  ConsumptionChargeGenerator,
  GenerateConsumptionChargesUseCase,
  GetPeriodChargesUseCase,
  ListMovementsUseCase,
  ListPendingChargesUseCase,
  OpenFundingPeriodUseCase,
  PayConsumptionChargeUseCase,
  RegisterPurchaseUseCase,
  RegisterStockInUseCase,
  RegisterStockOutUseCase,
  UpdateProductUseCase,
} from '../../../application';
import type { User } from '../../../domain';
import { createOfficeContext, TZ } from '../../support/testContext';

/**
 * Quien más consume, más aporta: Pepito saca 15 aguas ($1.500) y es el más hambriento por unidades,
 * pero Pepita saca 8 gansitos ($4.000) y es quien más debe aportar al siguiente mercado.
 */
async function setup() {
  const ctx = await createOfficeContext();
  const { repos, ids, clock, uow, recorder, storage, admin, asAdmin } = ctx;
  const pepito = await ctx.seedUser({ name: 'Pepito' });
  const pepita = await ctx.seedUser({ name: 'Pepita' });
  const agua = await ctx.seedProduct('Agua');
  const gansito = await ctx.seedProduct('Gansito');
  const period = await ctx.seedPeriod({ createdBy: admin.id }); // 16–31 oct

  const register = new RegisterPurchaseUseCase(uow, recorder, storage, ids, clock);
  const buy = (items: { productId: string; quantity: number; unitPrice: string }[], purchasedAt: string) =>
    register.execute(
      { periodId: period.id, buyerId: admin.id, purchasedAt: new Date(purchasedAt), items },
      asAdmin,
    );
  await buy(
    [
      { productId: agua.id, quantity: 30, unitPrice: '1500' },
      { productId: gansito.id, quantity: 12, unitPrice: '4000' },
    ],
    '2026-10-16T14:00:00Z',
  );

  const stockOut = new RegisterStockOutUseCase(uow, recorder, clock);
  const take = async (who: User, productId: string, quantity: number, at: string) => {
    clock.set(new Date(at));
    await stockOut.execute({ productId, quantity, performedBy: who.id }, asAdmin);
  };
  const generator = new ConsumptionChargeGenerator(ids, TZ);
  const getCharges = new GetPeriodChargesUseCase(
    repos.periods,
    repos.movements,
    repos.charges,
    repos.users,
    TZ,
  );
  return {
    ...ctx,
    pepito,
    pepita,
    agua,
    gansito,
    period,
    buy,
    take,
    getCharges,
    close: new CloseFundingPeriodUseCase(uow, generator, clock),
    regenerate: new GenerateConsumptionChargesUseCase(uow, generator, getCharges, clock),
    pending: new ListPendingChargesUseCase(repos.charges),
    pay: new PayConsumptionChargeUseCase(repos.periods, repos.charges, repos.contributions, ids, clock),
    open: new OpenFundingPeriodUseCase(repos.periods, ids, clock),
    ranking: new ComputePeriodRankingUseCase(
      repos.periods,
      repos.movements,
      repos.rankings,
      repos.users,
      repos.kioskDevices,
      clock,
      TZ,
    ),
    updateProduct: new UpdateProductUseCase(repos.products, repos.categories, clock),
  };
}

const owed = (charges: { user: { name: string }; amount: string; units: number }[]) =>
  charges.map((c) => [c.user.name, c.amount, c.units]);

describe('Quien más consume, más aporta', () => {
  it('al cerrar la quincena cada uno debe lo que consumió en precio; el más hambriento sigue siendo por unidades', async () => {
    const { take, pepito, pepita, agua, gansito, close, getCharges, ranking, period, asAdmin } =
      await setup();
    await take(pepito, agua.id, 15, '2026-10-20T15:00:00Z');
    await take(pepita, gansito.id, 8, '2026-10-21T15:00:00Z');

    // Mientras la quincena está abierta: estimación en vivo.
    const estimate = await getCharges.execute(period.id);
    expect(estimate).toMatchObject({ status: 'estimate', canGenerate: false });
    expect(owed(estimate.charges)).toEqual([
      ['Pepita', '32000.00', 8],
      ['Pepito', '22500.00', 15],
    ]);

    await close.execute(period.id, asAdmin);
    const charges = await getCharges.execute(period.id);
    expect(charges).toMatchObject({
      status: 'generated',
      canGenerate: true,
      totals: { amount: '54500.00', paid: '0.00', pending: '54500.00', unpricedUnits: 0 },
    });
    expect(owed(charges.charges)).toEqual([
      ['Pepita', '32000.00', 8],
      ['Pepito', '22500.00', 15],
    ]);

    const hungriest = await ranking.execute(period.id, { actor: asAdmin });
    expect(hungriest.hungriest.map((e) => e.user.name)).toEqual(['Pepito']);
  });

  it('cada retiro queda al precio de la última compra: si después sube, lo ya sacado no cambia', async () => {
    const { take, buy, pepito, agua, close, getCharges, period, asAdmin } = await setup();
    await take(pepito, agua.id, 10, '2026-10-20T15:00:00Z'); // a $1.500
    await buy([{ productId: agua.id, quantity: 10, unitPrice: '1800' }], '2026-10-22T14:00:00Z');
    await take(pepito, agua.id, 5, '2026-10-23T15:00:00Z'); // a $1.800

    await close.execute(period.id, asAdmin);
    expect(owed((await getCharges.execute(period.id)).charges)).toEqual([['Pepito', '24000.00', 15]]);
  });

  it('las entradas manuales guardan su precio pero no suman al consumo de nadie', async () => {
    const ctx = await setup();
    const { take, pepito, pepita, agua, close, getCharges, period, asAdmin, uow, recorder, clock, repos } = ctx;
    const stockIn = new RegisterStockInUseCase(uow, recorder, clock);
    clock.set(new Date('2026-10-20T14:00:00Z'));
    const gift = await stockIn.execute({ productId: agua.id, quantity: 6, performedBy: pepita.id }, asAdmin);
    expect(gift.movement.unitPrice).toBe('1500.00'); // precio de la última compra
    await take(pepito, agua.id, 2, '2026-10-20T15:00:00Z');

    await close.execute(period.id, asAdmin);
    expect(owed((await getCharges.execute(period.id)).charges)).toEqual([['Pepito', '3000.00', 2]]);

    // En el historial: la entrada de la compra muestra el precio del ítem; la manual, el guardado.
    const log = await new ListMovementsUseCase(repos.movements).execute({ productId: agua.id });
    expect(log.items.map((m) => [m.type, m.source, m.unitPrice?.toDecimalString()])).toEqual([
      ['OUT', 'MANUAL', '1500.00'],
      ['IN', 'MANUAL', '1500.00'],
      ['IN', 'PURCHASE', '1500.00'],
    ]);
  });

  it('sin compras: usa el precio de referencia del producto; si tampoco hay, $0 y se avisa', async () => {
    const ctx = await setup();
    const { take, pepito, pepita, close, getCharges, period, asAdmin, updateProduct } = ctx;
    const torta = await ctx.seedProduct('Torta', { stock: 10 });
    const regalo = await ctx.seedProduct('Regalo', { stock: 10 });
    await updateProduct.execute(torta.id, { referencePrice: '5000' }, asAdmin);
    await take(pepito, torta.id, 2, '2026-10-20T15:00:00Z');
    await take(pepita, regalo.id, 3, '2026-10-20T16:00:00Z');

    await close.execute(period.id, asAdmin);
    const result = await getCharges.execute(period.id);
    expect(result.charges.map((c) => [c.user.name, c.amount, c.unpricedUnits])).toEqual([
      ['Pepito', '10000.00', 0],
      ['Pepita', '0.00', 3],
    ]);
    expect(result.totals.unpricedUnits).toBe(3);
  });

  it('el pago es un aporte a la quincena siguiente; puede ser parcial y no puede pasarse de lo pendiente', async () => {
    const {
      take,
      pepito,
      pepita,
      agua,
      gansito,
      close,
      getCharges,
      pending,
      pay,
      open,
      period,
      asAdmin,
      repos,
    } = await setup();
    await take(pepito, agua.id, 15, '2026-10-20T15:00:00Z');
    await take(pepita, gansito.id, 8, '2026-10-21T15:00:00Z');
    await close.execute(period.id, asAdmin);
    const [pepitaCharge, pepitoCharge] = (await getCharges.execute(period.id)).charges;

    // Sin quincena abierta no hay dónde recibir el dinero.
    await expect(pay.execute(pepitoCharge!.id!, {}, asAdmin)).rejects.toMatchObject({
      code: 'NO_OPEN_PERIOD',
    });

    const next = await open.execute(
      { name: '2026-11 Q1', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-15') },
      asAdmin,
    );
    const partial = await pay.execute(pepitoCharge!.id!, { amount: '10000' }, asAdmin);
    expect(partial).toMatchObject({ periodId: next.id, userId: pepito.id, amount: '10000.00' });
    await expect(pay.execute(pepitoCharge!.id!, { amount: '20000' }, asAdmin)).rejects.toMatchObject({
      code: 'PAYMENT_EXCEEDS_PENDING',
    });
    await pay.execute(pepitaCharge!.id!, {}, asAdmin); // todo lo pendiente
    await expect(pay.execute(pepitaCharge!.id!, {}, asAdmin)).rejects.toMatchObject({
      code: 'CHARGE_ALREADY_PAID',
    });

    expect((await pending.execute()).map((c) => [c.user.name, c.pending])).toEqual([['Pepito', '12500.00']]);
    const after = await getCharges.execute(period.id);
    expect(after.totals).toMatchObject({ paid: '42000.00', pending: '12500.00' });
    // El dinero entra al fondo del siguiente mercado.
    expect((await repos.periods.findSummary(next.id))?.collected.toDecimalString()).toBe('42000.00');
  });

  it('recalcular actualiza los montos y conserva lo pagado; solo el admin y con la quincena cerrada', async () => {
    const ctx = await setup();
    const { take, pepito, agua, close, regenerate, getCharges, pay, open, period, asAdmin, asAna } = ctx;
    await take(pepito, agua.id, 2, '2026-10-20T15:00:00Z');
    await expect(regenerate.execute(period.id, asAdmin)).rejects.toMatchObject({ code: 'PERIOD_STILL_OPEN' });
    await close.execute(period.id, asAdmin);
    await open.execute(
      { name: '2026-11 Q1', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-15') },
      asAdmin,
    );
    const [charge] = (await getCharges.execute(period.id)).charges;
    await pay.execute(charge!.id!, {}, asAdmin);

    // Un retiro registrado tarde con fecha de la quincena: se recalcula y queda debiendo la diferencia.
    await take(pepito, agua.id, 1, '2026-10-31T20:00:00Z');
    await expect(regenerate.execute(period.id, asAna)).rejects.toMatchObject({ code: 'ADMIN_REQUIRED' });
    const result = await regenerate.execute(period.id, asAdmin);
    expect(result.charges.map((c) => [c.amount, c.paid, c.pending])).toEqual([
      ['4500.00', '3000.00', '1500.00'],
    ]);
  });
});
