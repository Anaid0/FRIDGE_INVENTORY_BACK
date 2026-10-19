import { describe, expect, it } from 'vitest';
import {
  GetTopWithdrawersUseCase,
  ListMovementsUseCase,
  RegisterStockInUseCase,
  RegisterStockOutUseCase,
} from '../../../application';
import { createOfficeContext } from '../../support/testContext';

async function setup() {
  const ctx = await createOfficeContext();
  const gaseosa = await ctx.seedProduct('Gaseosa', { stock: 10 });
  return {
    ...ctx,
    gaseosa,
    stockIn: new RegisterStockInUseCase(ctx.uow, ctx.recorder, ctx.clock),
    stockOut: new RegisterStockOutUseCase(ctx.uow, ctx.recorder, ctx.clock),
    list: new ListMovementsUseCase(ctx.repos.movements),
    ranking: new GetTopWithdrawersUseCase(ctx.repos.movements, ctx.clock),
  };
}

describe('Registrar entradas y salidas', () => {
  it('un empleado saca productos: baja el stock y queda en el log a su nombre', async () => {
    const { stockOut, gaseosa, asAna, stockOf } = await setup();
    const result = await stockOut.execute({ productId: gaseosa.id, quantity: 3, note: 'almuerzo' }, asAna);
    expect(result.product.quantity).toBe(7);
    expect(result.movement).toMatchObject({
      type: 'OUT',
      source: 'MANUAL',
      quantity: 3,
      stockBefore: 10,
      stockAfter: 7,
      performedBy: asAna.id,
      registeredBy: asAna.id,
      note: 'almuerzo',
    });
    expect(await stockOf(gaseosa.id)).toBe(7);
  });

  it('un empleado mete productos', async () => {
    const { stockIn, gaseosa, asLuis } = await setup();
    const result = await stockIn.execute({ productId: gaseosa.id, quantity: 6 }, asLuis);
    expect(result.movement).toMatchObject({
      type: 'IN',
      stockBefore: 10,
      stockAfter: 16,
      performedBy: asLuis.id,
    });
  });

  it('el admin registra a nombre de otra persona: quién lo hizo y quién lo registró', async () => {
    const { stockOut, gaseosa, asAdmin, ana } = await setup();
    const { movement } = await stockOut.execute(
      { productId: gaseosa.id, quantity: 2, performedBy: ana.id },
      asAdmin,
    );
    expect(movement.performedBy).toBe(ana.id);
    expect(movement.registeredBy).toBe(asAdmin.id);
  });

  it('si un empleado envía performedBy de otra persona, se ignora', async () => {
    const { stockOut, gaseosa, asAna, luis } = await setup();
    const { movement } = await stockOut.execute(
      { productId: gaseosa.id, quantity: 1, performedBy: luis.id },
      asAna,
    );
    expect(movement.performedBy).toBe(asAna.id);
  });

  it('el admin no puede atribuir a un usuario inexistente o desactivado', async () => {
    const { stockOut, gaseosa, asAdmin, seedUser } = await setup();
    const inactivo = await seedUser({ name: 'Inactivo', isActive: false });
    await expect(
      stockOut.execute({ productId: gaseosa.id, quantity: 1, performedBy: 'nadie' }, asAdmin),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    await expect(
      stockOut.execute({ productId: gaseosa.id, quantity: 1, performedBy: inactivo.id }, asAdmin),
    ).rejects.toMatchObject({ code: 'USER_INACTIVE' });
  });

  it('sin stock suficiente falla y no deja rastro', async () => {
    const { stockOut, gaseosa, asAna, stockOf, db } = await setup();
    await expect(stockOut.execute({ productId: gaseosa.id, quantity: 11 }, asAna)).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { available: 10, requested: 11 },
    });
    expect(await stockOf(gaseosa.id)).toBe(10);
    expect(db.movements).toHaveLength(0);
  });

  it('valida cantidad y producto', async () => {
    const { stockOut, gaseosa, asAna } = await setup();
    await expect(stockOut.execute({ productId: gaseosa.id, quantity: 0 }, asAna)).rejects.toMatchObject({
      code: 'INVALID_QUANTITY',
    });
    await expect(stockOut.execute({ productId: 'nope', quantity: 1 }, asAna)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
  });
});

describe('ListMovementsUseCase', () => {
  it('lista el log del más reciente al más antiguo, con filtros y paginación', async () => {
    const { stockIn, stockOut, list, gaseosa, asAna, asLuis, asAdmin, ana, clock } = await setup();
    await stockIn.execute({ productId: gaseosa.id, quantity: 5 }, asLuis);
    clock.advanceDays(1);
    await stockOut.execute({ productId: gaseosa.id, quantity: 1 }, asAna);
    clock.advanceDays(1);
    await stockOut.execute({ productId: gaseosa.id, quantity: 2, performedBy: ana.id }, asAdmin);

    const all = await list.execute({});
    expect(all.total).toBe(3);
    expect(all.items.map((m) => m.quantity)).toEqual([2, 1, 5]);
    expect(all.items[0]).toMatchObject({ performedBy: { name: 'Ana' }, registeredBy: { name: 'Admin' } });

    expect((await list.execute({ type: 'OUT' })).total).toBe(2);
    expect((await list.execute({ performedBy: ana.id })).total).toBe(2);
    expect((await list.execute({ registeredBy: asAdmin.id })).total).toBe(1);

    const page2 = await list.execute({ page: 2, pageSize: 2 });
    expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(page2.items).toHaveLength(1);
  });
});

describe('GetTopWithdrawersUseCase', () => {
  it('ordena por unidades retiradas por quien las realizó (no por quien registró)', async () => {
    const { stockOut, ranking, gaseosa, asAna, asLuis, asAdmin, luis } = await setup();
    await stockOut.execute({ productId: gaseosa.id, quantity: 3 }, asAna);
    await stockOut.execute({ productId: gaseosa.id, quantity: 1 }, asLuis);
    await stockOut.execute({ productId: gaseosa.id, quantity: 4, performedBy: luis.id }, asAdmin);

    const top = await ranking.execute();
    expect(top.map((t) => [t.user.name, t.totalWithdrawn, t.withdrawals])).toEqual([
      ['Luis', 5, 2],
      ['Ana', 3, 1],
    ]);
  });

  it('las entradas no cuentan y la ventana de tiempo filtra', async () => {
    const { stockIn, stockOut, ranking, gaseosa, asAna, asLuis, clock } = await setup();
    await stockOut.execute({ productId: gaseosa.id, quantity: 5 }, asAna); // hace 10 días
    clock.advanceDays(10);
    await stockIn.execute({ productId: gaseosa.id, quantity: 50 }, asLuis);
    await stockOut.execute({ productId: gaseosa.id, quantity: 1 }, asLuis);

    expect((await ranking.execute({ window: 'all' })).map((t) => t.user.name)).toEqual(['Ana', 'Luis']);
    expect((await ranking.execute({ window: 'week' })).map((t) => t.user.name)).toEqual(['Luis']);
    expect((await ranking.execute({ window: 'month' })).map((t) => t.user.name)).toEqual(['Ana', 'Luis']);
    expect(await ranking.execute({ limit: 1 })).toHaveLength(1);
  });
});
