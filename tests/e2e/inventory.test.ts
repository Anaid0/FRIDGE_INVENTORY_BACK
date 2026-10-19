import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, bearer, createE2EContext, type E2EContext } from './helpers';

let ctx: E2EContext;
const api = () => request(ctx.app);
let adminToken: string;
let ana: { id: string };
let luis: { id: string };
let gaseosaId: string;

/** Hasta que existan los endpoints de la tablet (F11), los movimientos los registra el admin a nombre de cada persona. */
function stock(type: 'in' | 'out', productId: string, quantity: number, performedBy?: string, note?: string) {
  return api()
    .post(`/api/movements/${type}`)
    .set(bearer(adminToken))
    .send({ productId, quantity, performedBy, note });
}

beforeAll(async () => {
  ctx = await createE2EContext();
  await ctx.reset();
  adminToken = await ctx.login(ADMIN.email, ADMIN.password);
  ana = await ctx.createPerson(adminToken, 'Ana');
  luis = await ctx.createPerson(adminToken, 'Luis', '3691');
});
afterAll(() => ctx?.close());

describe('Inventario y movimientos (e2e)', () => {
  it('el admin crea categoría y producto con stock inicial', async () => {
    const category = await api()
      .post('/api/categories')
      .set(bearer(adminToken))
      .send({ name: 'Bebidas' })
      .expect(201);
    const product = await api()
      .post('/api/products')
      .set(bearer(adminToken))
      .send({ name: 'Gaseosa', minStock: 2, categoryId: category.body.id, initialQuantity: 10 })
      .expect(201);
    expect(product.body).toMatchObject({ name: 'Gaseosa', quantity: 10, isLowStock: false });
    gaseosaId = product.body.id;

    const dup = await api()
      .post('/api/products')
      .set(bearer(adminToken))
      .send({ name: 'GASEOSA' })
      .expect(409);
    expect(dup.body.error.code).toBe('PRODUCT_NAME_TAKEN');
    await api().post('/api/products').send({ name: 'Yogur' }).expect(401);
  });

  it('flujo del plan: A mete 10, B saca 3, A saca 1 → B es quien más retira', async () => {
    await stock('in', gaseosaId, 10, ana.id).expect(201);
    const out = await stock('out', gaseosaId, 3, luis.id, 'reunión').expect(201);
    expect(out.body.movement).toMatchObject({
      type: 'OUT',
      stockBefore: 20,
      stockAfter: 17,
      performedBy: luis.id,
      registeredBy: expect.any(String),
    });
    await stock('out', gaseosaId, 1, ana.id).expect(201);

    const top = await api().get('/api/stats/top-withdrawers').set(bearer(adminToken)).expect(200);
    expect(top.body[0]).toMatchObject({ user: { name: 'Luis' }, totalWithdrawn: 3, withdrawals: 1 });
  });

  it('el log muestra quién lo hizo y quién lo registró', async () => {
    await stock('out', gaseosaId, 5, ana.id).expect(201);
    const log = await api().get('/api/movements').query({ pageSize: 1 }).set(bearer(adminToken)).expect(200);
    expect(log.body.items[0]).toMatchObject({
      quantity: 5,
      performedBy: { name: 'Ana' },
      registeredBy: { name: 'Admin' },
      product: { name: 'Gaseosa' },
    });
    expect(log.body.total).toBe(5); // stock inicial + 4 movimientos

    const top = await api().get('/api/stats/top-withdrawers').set(bearer(adminToken)).expect(200);
    expect(top.body[0]).toMatchObject({ user: { name: 'Ana' }, totalWithdrawn: 6 });
  });

  it('no se puede atribuir a una persona desactivada', async () => {
    const pedro = await ctx.createPerson(adminToken, 'Pedro', '4826');
    await api()
      .patch(`/api/people/${pedro.id}`)
      .set(bearer(adminToken))
      .send({ isActive: false })
      .expect(200);
    const res = await stock('out', gaseosaId, 1, pedro.id).expect(400);
    expect(res.body.error.code).toBe('USER_INACTIVE');
  });

  it('sacar más que el stock devuelve 409 y no cambia nada', async () => {
    const before = (await api().get(`/api/products/${gaseosaId}`).set(bearer(adminToken))).body.product
      .quantity;
    const res = await stock('out', gaseosaId, 999, ana.id).expect(409);
    expect(res.body.error).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { available: before, requested: 999 },
    });
    const after = (await api().get(`/api/products/${gaseosaId}`).set(bearer(adminToken))).body.product
      .quantity;
    expect(after).toBe(before);
  });

  it('salidas concurrentes no venden de más (bloqueo FOR UPDATE)', async () => {
    const product = await api()
      .post('/api/products')
      .set(bearer(adminToken))
      .send({ name: 'Yogur', initialQuantity: 5 })
      .expect(201);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => stock('out', product.body.id, 1, luis.id)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);
    const final = await api().get(`/api/products/${product.body.id}`).set(bearer(adminToken)).expect(200);
    expect(final.body.product.quantity).toBe(0);
    const stockAfters = final.body.latestMovements
      .filter((m: { type: string }) => m.type === 'OUT')
      .map((m: { stockAfter: number }) => m.stockAfter)
      .sort();
    expect(stockAfters).toEqual([0, 1, 2, 3, 4]);
  });

  it('filtros de productos y dashboard', async () => {
    const low = await api()
      .get('/api/products')
      .query({ lowStock: 'true' })
      .set(bearer(adminToken))
      .expect(200);
    expect(low.body.map((p: { name: string }) => p.name)).toEqual(['Yogur']);

    const dashboard = await api().get('/api/dashboard/summary').set(bearer(adminToken)).expect(200);
    expect(dashboard.body).toMatchObject({
      activeProducts: 2,
      topWithdrawer: { user: { name: 'Luis' }, totalWithdrawn: 8 }, // 3 + 5 concurrentes (Ana: 6)
    });
    expect(dashboard.body.latestMovements.length).toBeGreaterThan(0);
  });
});
