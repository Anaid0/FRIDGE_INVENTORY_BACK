import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, bearer, createE2EContext, type E2EContext } from './helpers';

let ctx: E2EContext;
const api = () => request(ctx.app);
let adminToken: string;
let pepito: { id: string };
let pepita: { id: string };
let aguaId: string;
let gansitoId: string;
let periodId: string;

beforeAll(async () => {
  ctx = await createE2EContext();
  await ctx.reset();
  adminToken = await ctx.login(ADMIN.email, ADMIN.password);
  pepito = await ctx.createPerson(adminToken, 'Pepito');
  pepita = await ctx.createPerson(adminToken, 'Pepita');
  const create = async (name: string) =>
    (await api().post('/api/products').set(bearer(adminToken)).send({ name }).expect(201)).body.id as string;
  aguaId = await create('Agua');
  gansitoId = await create('Gansito');
  // Quincena que contiene "hoy" (los movimientos usan la hora real).
  periodId = (
    await api()
      .post('/api/funding-periods')
      .set(bearer(adminToken))
      .send({ name: 'Quincena e2e', startDate: '2026-01-01', endDate: '2099-12-31' })
      .expect(201)
  ).body.id;
  await api()
    .post('/api/purchases')
    .set(bearer(adminToken))
    .send({
      periodId,
      buyerId: pepito.id,
      purchasedAt: new Date(Date.now() - 60_000).toISOString(),
      items: [
        { productId: aguaId, quantity: 30, unitPrice: '1500' },
        { productId: gansitoId, quantity: 12, unitPrice: '4000' },
      ],
    })
    .expect(201);
});
afterAll(() => ctx?.close());

describe('Quien más consume, más aporta (e2e)', () => {
  it('cada retiro guarda su precio y el producto muestra su precio actual', async () => {
    const out = await api()
      .post('/api/movements/out')
      .set(bearer(adminToken))
      .send({ productId: aguaId, quantity: 15, performedBy: pepito.id })
      .expect(201);
    expect(out.body.movement.unitPrice).toBe('1500.00');
    await api()
      .post('/api/movements/out')
      .set(bearer(adminToken))
      .send({ productId: gansitoId, quantity: 8, performedBy: pepita.id })
      .expect(201);

    const products = await api().get('/api/products').set(bearer(adminToken)).expect(200);
    expect(products.body.find((p: { id: string }) => p.id === gansitoId)).toMatchObject({
      currentPrice: '4000.00',
      referencePrice: null,
    });
  });

  it('estimación en vivo, cobros al cerrar y pago como aporte a la siguiente quincena', async () => {
    const estimate = await api()
      .get(`/api/funding-periods/${periodId}/charges`)
      .set(bearer(adminToken))
      .expect(200);
    expect(estimate.body).toMatchObject({
      status: 'estimate',
      canGenerate: false,
      totals: { amount: '54500.00' },
    });

    await api().patch(`/api/funding-periods/${periodId}/close`).set(bearer(adminToken)).expect(200);
    const charges = await api()
      .get(`/api/funding-periods/${periodId}/charges`)
      .set(bearer(adminToken))
      .expect(200);
    expect(charges.body.status).toBe('generated');
    expect(
      charges.body.charges.map((c: { user: { name: string }; amount: string }) => [c.user.name, c.amount]),
    ).toEqual([
      ['Pepita', '32000.00'],
      ['Pepito', '22500.00'],
    ]);

    const pepitaCharge = charges.body.charges[0].id;
    let res = await api()
      .post(`/api/charges/${pepitaCharge}/payments`)
      .set(bearer(adminToken))
      .send({})
      .expect(409);
    expect(res.body.error.code).toBe('NO_OPEN_PERIOD');

    const next = (
      await api()
        .post('/api/funding-periods')
        .set(bearer(adminToken))
        .send({ name: 'Siguiente', startDate: '2100-01-01', endDate: '2100-01-15' })
        .expect(201)
    ).body.id;
    res = await api()
      .post(`/api/charges/${pepitaCharge}/payments`)
      .set(bearer(adminToken))
      .send({ amount: '32000' })
      .expect(201);
    expect(res.body).toMatchObject({ periodId: next, userId: pepita.id, chargeId: pepitaCharge });

    const pending = await api().get('/api/charges/pending').set(bearer(adminToken)).expect(200);
    expect(
      pending.body.map((c: { user: { name: string }; pending: string }) => [c.user.name, c.pending]),
    ).toEqual([['Pepito', '22500.00']]);
    const detail = await api().get(`/api/funding-periods/${next}`).set(bearer(adminToken)).expect(200);
    expect(detail.body.summary.collected).toBe('32000.00');
    expect(detail.body.contributions[0].charge).toMatchObject({
      id: pepitaCharge,
      periodName: 'Quincena e2e',
    });

    await api().post(`/api/funding-periods/${periodId}/charges`).set(bearer(adminToken)).expect(200);
  });
});
