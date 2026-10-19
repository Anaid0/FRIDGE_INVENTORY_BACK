import { readdir } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, bearer, createE2EContext, type E2EContext } from './helpers';

let ctx: E2EContext;
const api = () => request(ctx.app);
let adminToken: string;
let ana: { id: string };
let luis: { id: string };
let periodId: string;
let gaseosaId: string;
let yogurId: string;
let purchaseId: string;

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

async function receiptFiles() {
  try {
    return await readdir(path.join(ctx.uploadsDir, 'receipts'));
  } catch {
    return [];
  }
}

beforeAll(async () => {
  ctx = await createE2EContext();
  await ctx.reset();
  adminToken = await ctx.login(ADMIN.email, ADMIN.password);
  ana = await ctx.createPerson(adminToken, 'Ana');
  luis = await ctx.createPerson(adminToken, 'Luis');
  const bebidas = await api().post('/api/categories').set(bearer(adminToken)).send({ name: 'Bebidas' });
  const lacteos = await api().post('/api/categories').set(bearer(adminToken)).send({ name: 'Lácteos' });
  gaseosaId = (
    await api()
      .post('/api/products')
      .set(bearer(adminToken))
      .send({ name: 'Gaseosa', categoryId: bebidas.body.id })
  ).body.id;
  yogurId = (
    await api()
      .post('/api/products')
      .set(bearer(adminToken))
      .send({ name: 'Yogur', categoryId: lacteos.body.id })
  ).body.id;
});
afterAll(() => ctx?.close());

describe('Quincenas, compras y reportes (e2e)', () => {
  it('el admin abre la quincena y registra aportes', async () => {
    const period = await api()
      .post('/api/funding-periods')
      .set(bearer(adminToken))
      .send({ name: '2026-10 Q2', startDate: '2026-10-16', endDate: '2026-10-31' })
      .expect(201);
    expect(period.body).toMatchObject({ startDate: '2026-10-16', endDate: '2026-10-31', status: 'OPEN' });
    periodId = period.body.id;

    for (const userId of [ana.id, luis.id]) {
      await api()
        .post(`/api/funding-periods/${periodId}/contributions`)
        .set(bearer(adminToken))
        .send({ userId, amount: '50000' })
        .expect(201);
    }

    const other = await api()
      .post('/api/funding-periods')
      .set(bearer(adminToken))
      .send({ name: 'otra', startDate: '2026-11-01', endDate: '2026-11-15' })
      .expect(409);
    expect(other.body.error.code).toBe('OPEN_PERIOD_EXISTS');
  });

  it('registra la compra con comprobante (multipart): stock, total y saldo', async () => {
    const res = await api()
      .post('/api/purchases')
      .set(bearer(adminToken))
      .field('periodId', periodId)
      .field('buyerId', ana.id)
      .field('store', 'Éxito')
      .field('purchasedAt', '2026-10-16T15:00:00.000Z')
      .field(
        'items',
        JSON.stringify([
          { productId: gaseosaId, quantity: 12, unitPrice: '2500' },
          { productId: yogurId, quantity: 6, unitPrice: 3000 },
        ]),
      )
      .attach('receipt', PNG, { filename: 'recibo.png', contentType: 'image/png' })
      .expect(201);
    purchaseId = res.body.id;
    expect(res.body).toMatchObject({ total: '48000.00', hasReceipt: true, buyer: { name: 'Ana' } });
    expect(await receiptFiles()).toHaveLength(1);

    const gaseosa = await api().get(`/api/products/${gaseosaId}`).set(bearer(adminToken)).expect(200);
    expect(gaseosa.body.product.quantity).toBe(12);
    expect(gaseosa.body.latestMovements[0]).toMatchObject({ type: 'IN', source: 'PURCHASE', purchaseId });

    const current = await api().get('/api/funding-periods/current').set(bearer(adminToken)).expect(200);
    expect(current.body).toMatchObject({ collected: '100000.00', spent: '48000.00', balance: '52000.00' });

    const detail = await api().get(`/api/funding-periods/${periodId}`).set(bearer(adminToken)).expect(200);
    expect(detail.body.contributorTotals).toHaveLength(2);
    expect(detail.body.purchases[0]).toMatchObject({ id: purchaseId, itemsCount: 2 });

    // Las entradas por compra no cuentan como retiros
    expect((await api().get('/api/stats/top-withdrawers').set(bearer(adminToken))).body).toEqual([]);
  });

  it('descarga el comprobante', async () => {
    const res = await api().get(`/api/purchases/${purchaseId}/receipt`).set(bearer(adminToken)).expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['content-disposition']).toContain(`comprobante-${purchaseId}.png`);
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
  });

  it('reportes de gasto por producto, categoría y precio', async () => {
    const byProduct = await api()
      .get('/api/reports/spending-by-product')
      .query({ periodId })
      .set(bearer(adminToken))
      .expect(200);
    expect(
      byProduct.body.map((r: { productName: string; spent: string }) => [r.productName, r.spent]),
    ).toEqual([
      ['Gaseosa', '30000.00'],
      ['Yogur', '18000.00'],
    ]);
    const byCategory = await api()
      .get('/api/reports/spending-by-category')
      .query({ from: '2026-10-01', to: '2026-10-31' })
      .set(bearer(adminToken))
      .expect(200);
    expect(byCategory.body.map((r: { categoryName: string }) => r.categoryName)).toEqual([
      'Bebidas',
      'Lácteos',
    ]);
    const prices = await api()
      .get(`/api/reports/price-history/${gaseosaId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(prices.body).toEqual([expect.objectContaining({ unitPrice: '2500.00', store: 'Éxito' })]);
  });

  it('si una línea falla, la compra se revierte entera y el comprobante se borra', async () => {
    const res = await api()
      .post('/api/purchases')
      .set(bearer(adminToken))
      .field('periodId', periodId)
      .field('buyerId', luis.id)
      .field('purchasedAt', '2026-10-17T10:00:00.000Z')
      .field(
        'items',
        JSON.stringify([
          { productId: gaseosaId, quantity: 1, unitPrice: '2500' },
          { productId: 'no-existe', quantity: 1, unitPrice: '100' },
        ]),
      )
      .attach('receipt', PNG, { filename: 'r.png', contentType: 'image/png' })
      .expect(404);
    expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(await receiptFiles()).toHaveLength(1); // solo el de la compra anterior
    const gaseosa = await api().get(`/api/products/${gaseosaId}`).set(bearer(adminToken));
    expect(gaseosa.body.product.quantity).toBe(12);
    expect((await api().get('/api/purchases').set(bearer(adminToken))).body.total).toBe(1);
  });

  it('valida el comprobante y los datos de la compra', async () => {
    const badType = await api()
      .post('/api/purchases')
      .set(bearer(adminToken))
      .field('periodId', periodId)
      .field('buyerId', ana.id)
      .field('purchasedAt', '2026-10-17')
      .field('items', JSON.stringify([{ productId: gaseosaId, quantity: 1, unitPrice: 1 }]))
      .attach('receipt', Buffer.from('hola'), { filename: 'r.txt', contentType: 'text/plain' })
      .expect(400);
    expect(badType.body.error.code).toBe('INVALID_RECEIPT_TYPE');

    const badItems = await api()
      .post('/api/purchases')
      .set(bearer(adminToken))
      .send({ periodId, buyerId: ana.id, purchasedAt: '2026-10-17', items: 'no-es-json' })
      .expect(400);
    expect(badItems.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('anular la compra revierte el stock y deja de contar en el gasto', async () => {
    const res = await api().post(`/api/purchases/${purchaseId}/void`).set(bearer(adminToken)).expect(200);
    expect(res.body.voidedBy).toMatchObject({ name: 'Admin' });
    const gaseosa = await api().get(`/api/products/${gaseosaId}`).set(bearer(adminToken));
    expect(gaseosa.body.product.quantity).toBe(0);
    expect(gaseosa.body.latestMovements[0]).toMatchObject({ type: 'OUT', source: 'PURCHASE_VOID' });

    const current = await api().get('/api/funding-periods/current').set(bearer(adminToken));
    expect(current.body).toMatchObject({ spent: '0.00', balance: '100000.00' });
    expect((await api().get('/api/purchases').set(bearer(adminToken))).body.total).toBe(0);
    expect(
      (await api().get('/api/purchases').query({ includeVoided: 'true' }).set(bearer(adminToken))).body.total,
    ).toBe(1);
    expect((await api().get('/api/stats/top-withdrawers').set(bearer(adminToken))).body).toEqual([]);
  });

  it('una quincena cerrada no acepta compras', async () => {
    await api().patch(`/api/funding-periods/${periodId}/close`).set(bearer(adminToken)).expect(200);
    const res = await api()
      .post('/api/purchases')
      .set(bearer(adminToken))
      .send({
        periodId,
        buyerId: ana.id,
        purchasedAt: '2026-10-20',
        items: [{ productId: gaseosaId, quantity: 1, unitPrice: '2500' }],
      })
      .expect(409);
    expect(res.body.error.code).toBe('PERIOD_CLOSED');
    expect((await api().get('/api/funding-periods/current').set(bearer(adminToken))).body).toBeNull();
  });
});
