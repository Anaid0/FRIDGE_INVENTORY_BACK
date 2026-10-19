import { describe, expect, it } from 'vitest';
import {
  GetFundingPeriodDetailUseCase,
  GetProductPriceHistoryUseCase,
  GetPurchaseReceiptUseCase,
  GetPurchaseUseCase,
  GetSpendingByCategoryUseCase,
  GetSpendingByProductUseCase,
  GetTopWithdrawersUseCase,
  ListPurchasesUseCase,
  RegisterContributionUseCase,
  RegisterPurchaseUseCase,
  RegisterStockOutUseCase,
  VoidPurchaseUseCase,
  type RegisterPurchaseInput,
} from '../../../application';
import { createOfficeContext, TZ } from '../../support/testContext';

const receipt = { content: new Uint8Array([1, 2, 3]), originalName: 'recibo.jpg', mimeType: 'image/jpeg' };

async function setup() {
  const ctx = await createOfficeContext();
  const { repos, ids, clock, uow, recorder, storage } = ctx;
  const bebidas = await ctx.seedCategory('Bebidas');
  const lacteos = await ctx.seedCategory('Lácteos');
  const gaseosa = await ctx.seedProduct('Gaseosa', { categoryId: bebidas.id });
  const yogur = await ctx.seedProduct('Yogur', { categoryId: lacteos.id });
  const period = await ctx.seedPeriod({ createdBy: ctx.admin.id });

  const sample = (overrides: Partial<RegisterPurchaseInput> = {}): RegisterPurchaseInput => ({
    periodId: period.id,
    buyerId: ctx.ana.id,
    store: 'Éxito',
    purchasedAt: new Date('2026-10-16T15:00:00Z'),
    items: [
      { productId: gaseosa.id, quantity: 12, unitPrice: '2500' },
      { productId: yogur.id, quantity: 6, unitPrice: 3000 },
    ],
    ...overrides,
  });

  return {
    ...ctx,
    gaseosa,
    yogur,
    period,
    sample,
    register: new RegisterPurchaseUseCase(uow, recorder, storage, ids, clock),
    voidPurchase: new VoidPurchaseUseCase(uow, recorder, clock),
    list: new ListPurchasesUseCase(repos.purchases),
    get: new GetPurchaseUseCase(repos.purchases, repos.users, repos.products),
    getReceipt: new GetPurchaseReceiptUseCase(repos.purchases, storage),
    contribute: new RegisterContributionUseCase(repos.periods, repos.users, repos.contributions, ids, clock),
    periodDetail: new GetFundingPeriodDetailUseCase(repos.periods, repos.contributions, repos.purchases),
    byProduct: new GetSpendingByProductUseCase(repos.reports),
    byCategory: new GetSpendingByCategoryUseCase(repos.reports),
    priceHistory: new GetProductPriceHistoryUseCase(repos.reports, repos.products),
    stockOut: new RegisterStockOutUseCase(uow, recorder, clock),
    ranking: new GetTopWithdrawersUseCase(repos.movements, repos.periods, clock, TZ),
  };
}

describe('RegisterPurchaseUseCase — escenario del plan', () => {
  it('aportes de 100.000, compra de 48.000: stock, movimientos, saldo y reporte', async () => {
    const ctx = await setup();
    const {
      register,
      contribute,
      periodDetail,
      byProduct,
      sample,
      asAdmin,
      ana,
      luis,
      period,
      gaseosa,
      yogur,
    } = ctx;
    const paidAt = new Date('2026-10-16T13:00:00Z');
    await contribute.execute(period.id, { userId: ana.id, amount: 50000, paidAt }, asAdmin);
    await contribute.execute(period.id, { userId: luis.id, amount: 50000, paidAt }, asAdmin);

    const purchase = await register.execute(sample({ receipt }), asAdmin);

    expect(purchase).toMatchObject({
      total: '48000.00',
      store: 'Éxito',
      hasReceipt: true,
      buyer: { name: 'Ana' },
      registeredBy: { name: 'Admin' },
      voidedAt: null,
    });
    expect(purchase.items.map((i) => [i.product.name, i.quantity, i.unitPrice, i.subtotal])).toEqual([
      ['Gaseosa', 12, '2500.00', '30000.00'],
      ['Yogur', 6, '3000.00', '18000.00'],
    ]);

    // Los productos entraron a la nevera
    expect(await ctx.stockOf(gaseosa.id)).toBe(12);
    expect(await ctx.stockOf(yogur.id)).toBe(6);

    // Un movimiento IN por línea, enlazado a la compra, a nombre de quien compró
    expect(ctx.db.movements).toHaveLength(2);
    for (const movement of ctx.db.movements) {
      expect(movement).toMatchObject({
        type: 'IN',
        source: 'PURCHASE',
        performedBy: ana.id,
        registeredBy: asAdmin.id,
      });
    }
    expect(ctx.db.movements.map((m) => m.purchaseItemId)).toEqual(purchase.items.map((i) => i.id));
    const log = await ctx.repos.movements.findLatest(5);
    expect(log.every((m) => m.purchaseId === purchase.id)).toBe(true);

    // Saldo de la quincena
    const detail = await periodDetail.execute(period.id);
    expect(detail.summary).toMatchObject({ collected: '100000.00', spent: '48000.00', balance: '52000.00' });
    expect(detail.purchases).toHaveLength(1);

    // Reporte por producto
    expect((await byProduct.execute({ periodId: period.id })).map((r) => [r.productName, r.spent])).toEqual([
      ['Gaseosa', '30000.00'],
      ['Yogur', '18000.00'],
    ]);
  });

  it('las entradas por compra no cuentan en el ranking de retiros', async () => {
    const { register, ranking, sample, asAdmin } = await setup();
    await register.execute(sample(), asAdmin);
    expect(await ranking.execute()).toEqual([]);
  });
});

describe('RegisterPurchaseUseCase — validaciones y transacción', () => {
  it('si falla una línea a mitad, no queda nada: ni compra, ni stock, ni movimientos, ni comprobante', async () => {
    const { register, sample, asAdmin, seedProduct, gaseosa, db, storage, stockOf } = await setup();
    const inactivo = await seedProduct('Descontinuado', { isActive: false });
    await expect(
      register.execute(
        sample({
          receipt,
          items: [
            { productId: gaseosa.id, quantity: 12, unitPrice: '2500' },
            { productId: inactivo.id, quantity: 1, unitPrice: '1000' },
          ],
        }),
        asAdmin,
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_INACTIVE' });

    expect(db.purchases.size).toBe(0);
    expect(db.movements).toHaveLength(0);
    expect(await stockOf(gaseosa.id)).toBe(0);
    expect(storage.files.size).toBe(0);
  });

  it('un producto inexistente se detecta antes de guardar la compra', async () => {
    const { register, sample, asAdmin, gaseosa, db, storage } = await setup();
    await expect(
      register.execute(
        sample({
          receipt,
          items: [
            { productId: gaseosa.id, quantity: 1, unitPrice: 1 },
            { productId: 'no-existe', quantity: 1, unitPrice: 1 },
          ],
        }),
        asAdmin,
      ),
    ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(db.purchases.size).toBe(0);
    expect(storage.files.size).toBe(0);
  });

  it('en una quincena cerrada falla con PERIOD_CLOSED y borra el comprobante', async () => {
    const { register, sample, asAdmin, seedPeriod, storage, db } = await setup();
    const closed = await seedPeriod({
      id: 'cerrada',
      start: '2026-10-01',
      end: '2026-10-15',
      createdBy: asAdmin.id,
      closed: true,
    });
    await expect(register.execute(sample({ periodId: closed.id, receipt }), asAdmin)).rejects.toMatchObject({
      code: 'PERIOD_CLOSED',
    });
    expect(storage.files.size).toBe(0);
    expect(db.purchases.size).toBe(0);
  });

  it('valida comprobante, líneas, comprador, quincena y permisos antes de guardar', async () => {
    const { register, sample, asAdmin, asAna, seedUser, gaseosa, storage } = await setup();
    await expect(
      register.execute(sample({ receipt: { ...receipt, mimeType: 'text/plain' } }), asAdmin),
    ).rejects.toMatchObject({ code: 'INVALID_RECEIPT_TYPE' });
    await expect(
      register.execute(
        sample({ receipt: { ...receipt, content: new Uint8Array(5 * 1024 * 1024 + 1) } }),
        asAdmin,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RECEIPT_SIZE' });
    await expect(register.execute(sample({ items: [] }), asAdmin)).rejects.toMatchObject({
      code: 'EMPTY_PURCHASE',
    });
    await expect(
      register.execute(
        sample({ items: [{ productId: gaseosa.id, quantity: 1, unitPrice: '1.999' }] }),
        asAdmin,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_MONEY' });
    await expect(
      register.execute(
        sample({
          items: [
            { productId: gaseosa.id, quantity: 1, unitPrice: 1 },
            { productId: gaseosa.id, quantity: 2, unitPrice: 1 },
          ],
        }),
        asAdmin,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PRODUCT' });
    const inactivo = await seedUser({ name: 'Inactivo', isActive: false });
    await expect(register.execute(sample({ buyerId: inactivo.id }), asAdmin)).rejects.toMatchObject({
      code: 'USER_INACTIVE',
    });
    await expect(register.execute(sample({ periodId: 'nope' }), asAdmin)).rejects.toMatchObject({
      code: 'PERIOD_NOT_FOUND',
    });
    await expect(register.execute(sample(), asAna)).rejects.toMatchObject({ kind: 'FORBIDDEN' });
    expect(storage.files.size).toBe(0);
  });
});

describe('VoidPurchaseUseCase', () => {
  it('revierte el stock con movimientos PURCHASE_VOID y deja de contar en el gasto', async () => {
    const {
      register,
      voidPurchase,
      periodDetail,
      byProduct,
      ranking,
      sample,
      asAdmin,
      period,
      gaseosa,
      db,
      stockOf,
    } = await setup();
    const purchase = await register.execute(sample(), asAdmin);
    const voided = await voidPurchase.execute(purchase.id, asAdmin);

    expect(voided.voidedAt).not.toBeNull();
    expect(voided.voidedBy).toMatchObject({ name: 'Admin' });
    expect(await stockOf(gaseosa.id)).toBe(0);
    const reversals = db.movements.filter((m) => m.source === 'PURCHASE_VOID');
    expect(reversals).toHaveLength(2);
    expect(reversals.every((m) => m.type === 'OUT')).toBe(true);

    expect((await periodDetail.execute(period.id)).summary.spent).toBe('0.00');
    expect(await byProduct.execute({ periodId: period.id })).toEqual([]);
    expect(await ranking.execute()).toEqual([]); // la reversión no es un retiro
  });

  it('si ya se consumió lo comprado no se puede anular y nada cambia', async () => {
    const { register, voidPurchase, stockOut, sample, asAdmin, asLuis, gaseosa, db, stockOf } = await setup();
    const purchase = await register.execute(sample(), asAdmin);
    await stockOut.execute({ productId: gaseosa.id, quantity: 5 }, asLuis);
    const movementsBefore = db.movements.length;

    await expect(voidPurchase.execute(purchase.id, asAdmin)).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });
    expect(db.movements).toHaveLength(movementsBefore);
    expect(await stockOf(gaseosa.id)).toBe(7);
    expect(db.purchases.get(purchase.id)!.isVoided()).toBe(false);
  });

  it('no se anula dos veces, ni si no existe, ni como empleado', async () => {
    const { register, voidPurchase, sample, asAdmin, asAna } = await setup();
    const purchase = await register.execute(sample(), asAdmin);
    await expect(voidPurchase.execute(purchase.id, asAna)).rejects.toMatchObject({ kind: 'FORBIDDEN' });
    await voidPurchase.execute(purchase.id, asAdmin);
    await expect(voidPurchase.execute(purchase.id, asAdmin)).rejects.toMatchObject({
      code: 'PURCHASE_ALREADY_VOIDED',
    });
    await expect(voidPurchase.execute('nope', asAdmin)).rejects.toMatchObject({ code: 'PURCHASE_NOT_FOUND' });
  });
});

describe('Consultas de compras', () => {
  it('lista con filtros; las anuladas solo si se piden', async () => {
    const { register, voidPurchase, list, sample, asAdmin, luis, yogur, gaseosa } = await setup();
    const first = await register.execute(sample(), asAdmin);
    await register.execute(
      sample({
        buyerId: luis.id,
        purchasedAt: new Date('2026-10-20T10:00:00Z'),
        items: [{ productId: gaseosa.id, quantity: 1, unitPrice: 2600 }],
      }),
      asAdmin,
    );

    const all = await list.execute({});
    expect(all.items.map((p) => p.buyer.name)).toEqual(['Luis', 'Ana']);
    expect(all.items[1]).toMatchObject({
      total: '48000.00',
      itemsCount: 2,
      periodName: 'Quincena 2026-10-16',
    });
    expect(all.items[1]!.lines).toEqual([
      { productName: 'Gaseosa', quantity: 12 },
      { productName: 'Yogur', quantity: 6 },
    ]);
    expect((await list.execute({ buyerId: luis.id })).total).toBe(1);
    expect((await list.execute({ productId: yogur.id })).total).toBe(1);
    expect((await list.execute({ from: new Date('2026-10-18') })).total).toBe(1);

    await voidPurchase.execute(first.id, asAdmin);
    expect((await list.execute({})).total).toBe(1);
    expect((await list.execute({ includeVoided: true })).total).toBe(2);
  });

  it('detalle y descarga del comprobante', async () => {
    const { register, get, getReceipt, sample, asAdmin } = await setup();
    const withReceipt = await register.execute(sample({ receipt }), asAdmin);
    expect((await get.execute(withReceipt.id)).items).toHaveLength(2);

    const file = await getReceipt.execute(withReceipt.id);
    expect(file).toMatchObject({ mimeType: 'image/jpeg', fileName: `comprobante-${withReceipt.id}.jpg` });
    expect([...file.content]).toEqual([1, 2, 3]);

    const without = await register.execute(
      sample({
        purchasedAt: new Date('2026-10-17'),
        items: [{ productId: sample().items[0]!.productId, quantity: 1, unitPrice: 1 }],
      }),
      asAdmin,
    );
    await expect(getReceipt.execute(without.id)).rejects.toMatchObject({ code: 'RECEIPT_NOT_FOUND' });
    await expect(get.execute('nope')).rejects.toMatchObject({ code: 'PURCHASE_NOT_FOUND' });
  });
});

describe('Reportes de gasto', () => {
  it('gasto por categoría y evolución del precio', async () => {
    const { register, byCategory, priceHistory, sample, asAdmin, gaseosa, seedProduct } = await setup();
    const sinCategoria = await seedProduct('Hielo');
    await register.execute(sample(), asAdmin);
    await register.execute(
      sample({
        store: 'D1',
        purchasedAt: new Date('2026-10-25T10:00:00Z'),
        items: [
          { productId: gaseosa.id, quantity: 6, unitPrice: '2700' },
          { productId: sinCategoria.id, quantity: 2, unitPrice: '1500' },
        ],
      }),
      asAdmin,
    );

    expect(
      (await byCategory.execute({ periodId: 'period-1' })).map((r) => [r.categoryName, r.units, r.spent]),
    ).toEqual([
      ['Bebidas', 18, '46200.00'],
      ['Lácteos', 6, '18000.00'],
      ['Sin categoría', 2, '3000.00'],
    ]);

    const history = await priceHistory.execute(gaseosa.id);
    expect(history.map((p) => [p.unitPrice, p.store])).toEqual([
      ['2500.00', 'Éxito'],
      ['2700.00', 'D1'],
    ]);
    expect(await priceHistory.execute(gaseosa.id, { from: new Date('2026-10-20') })).toHaveLength(1);
    await expect(priceHistory.execute('nope')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it('el reporte por rango de fechas promedia el precio unitario', async () => {
    const { register, byProduct, sample, asAdmin, gaseosa } = await setup();
    await register.execute(
      sample({ items: [{ productId: gaseosa.id, quantity: 1, unitPrice: '2500' }] }),
      asAdmin,
    );
    await register.execute(
      sample({
        purchasedAt: new Date('2026-10-20'),
        items: [{ productId: gaseosa.id, quantity: 3, unitPrice: '2700' }],
      }),
      asAdmin,
    );
    const [row] = await byProduct.execute({ from: new Date('2026-10-01'), to: new Date('2026-10-31') });
    expect(row).toMatchObject({
      productName: 'Gaseosa',
      units: 4,
      spent: '10600.00',
      averageUnitPrice: '2600.00',
    });
  });
});

describe('Compra por paquetes o por total', () => {
  it('el precio unitario es lo pagado ÷ unidades; el total de la compra es exactamente lo pagado', async () => {
    const ctx = await setup();
    const { register, period, asAdmin, ana, gaseosa, yogur, stockOf } = ctx;
    const choco = await ctx.seedProduct('Chocorramo');

    const purchase = await register.execute(
      {
        periodId: period.id,
        buyerId: ana.id,
        purchasedAt: new Date('2026-10-16T15:00:00Z'),
        items: [
          // 2 sixpacks a $13.800
          { productId: gaseosa.id, packageCount: 2, unitsPerPackage: 6, packagePrice: '13800' },
          // 12 unidades por $20.600 en total → $1.716,67 c/u
          { productId: yogur.id, quantity: 12, total: '20600' },
          // 2 paquetes de 5 con descuento en el segundo: $15.000 + $9.000
          { productId: choco.id, packageCount: 2, unitsPerPackage: 5, total: '24000' },
        ],
      },
      asAdmin,
    );

    expect(purchase.total).toBe('72200.00');
    expect(
      purchase.items.map((i) => [
        i.product.name,
        i.quantity,
        i.unitPrice,
        i.subtotal,
        i.packageCount,
        i.unitsPerPackage,
      ]),
    ).toEqual([
      ['Gaseosa', 12, '2300.00', '27600.00', 2, 6],
      ['Yogur', 12, '1716.67', '20600.00', null, null],
      ['Chocorramo', 10, '2400.00', '24000.00', 2, 5],
    ]);
    expect(await stockOf(choco.id)).toBe(10);
  });

  it('valida las líneas por paquetes', async () => {
    const { register, period, asAdmin, ana, gaseosa } = await setup();
    const line = (extra: object) =>
      register.execute(
        {
          periodId: period.id,
          buyerId: ana.id,
          purchasedAt: new Date('2026-10-16T15:00:00Z'),
          items: [{ productId: gaseosa.id, ...extra }],
        },
        asAdmin,
      );
    await expect(line({ packageCount: 2, unitsPerPackage: 6 })).rejects.toMatchObject({
      code: 'INVALID_PACKAGES',
    });
    await expect(line({ packageCount: 0, unitsPerPackage: 6, packagePrice: 100 })).rejects.toMatchObject({
      code: 'INVALID_QUANTITY',
    });
    await expect(line({ quantity: 3 })).rejects.toMatchObject({ code: 'INVALID_PRICE' });
  });
});
