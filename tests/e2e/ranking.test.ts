import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, bearer, createE2EContext, type E2EContext } from './helpers';

let ctx: E2EContext;
const api = () => request(ctx.app);
let adminToken: string;
let kioskToken: string;
let ana: { id: string };
let luis: { id: string };
let productId: string;
let periodId: string;

const takeOut = (performedBy: string, quantity: number) =>
  api()
    .post('/api/movements/out')
    .set(bearer(adminToken))
    .send({ productId, quantity, performedBy })
    .expect(201);

beforeAll(async () => {
  ctx = await createE2EContext();
  await ctx.reset();
  adminToken = await ctx.login(ADMIN.email, ADMIN.password);
  ana = await ctx.createPerson(adminToken, 'Ana');
  luis = await ctx.createPerson(adminToken, 'Luis');
  productId = (
    await api()
      .post('/api/products')
      .set(bearer(adminToken))
      .send({ name: 'Gaseosa', initialQuantity: 50 })
      .expect(201)
  ).body.id;
  kioskToken = (
    await api().post('/api/kiosk/devices').set(bearer(adminToken)).send({ name: 'Tablet' }).expect(201)
  ).body.token;
  // Una quincena que contiene "hoy" (los movimientos se registran con la hora real).
  periodId = (
    await api()
      .post('/api/funding-periods')
      .set(bearer(adminToken))
      .send({ name: 'Quincena e2e', startDate: '2026-01-01', endDate: '2099-12-31' })
      .expect(201)
  ).body.id;
});
afterAll(() => ctx?.close());

describe('Ranking por quincena y el más hambriento (e2e)', () => {
  it('el ranking en vivo de la quincena, por id o la abierta, también desde la tablet', async () => {
    await takeOut(ana.id, 2);
    await takeOut(luis.id, 5);
    await takeOut(luis.id, 1);

    const byId = await api()
      .get(`/api/stats/top-withdrawers?periodId=${periodId}`)
      .set(bearer(adminToken))
      .expect(200);
    expect(
      byId.body.map((r: { user: { name: string }; totalWithdrawn: number }) => [
        r.user.name,
        r.totalWithdrawn,
      ]),
    ).toEqual([
      ['Luis', 6],
      ['Ana', 2],
    ]);
    const open = await api()
      .get('/api/stats/top-withdrawers?period=period')
      .set(bearer(kioskToken))
      .expect(200);
    expect(open.body).toEqual(byId.body);
  });

  it('mientras la quincena sigue abierta y sin terminar, no se puede calcular', async () => {
    const status = await api()
      .get(`/api/funding-periods/${periodId}/ranking`)
      .set(bearer(adminToken))
      .expect(200);
    expect(status.body).toMatchObject({ canCompute: false, ranking: null });

    const res = await api()
      .post(`/api/funding-periods/${periodId}/ranking`)
      .set(bearer(adminToken))
      .expect(409);
    expect(res.body.error.code).toBe('PERIOD_NOT_FINISHED');
    expect(res.body.error.details.availableFrom).toBe('2100-01-01T05:00:00.000Z');
  });

  it('al cerrar la quincena el admin calcula el podio y el más hambriento; la tablet lo ve', async () => {
    let latest = await api().get('/api/stats/hungriest/latest').set(bearer(kioskToken)).expect(200);
    expect(latest.body).toEqual({ ranking: null });

    await api().patch(`/api/funding-periods/${periodId}/close`).set(bearer(adminToken)).expect(200);
    const computed = await api()
      .post(`/api/funding-periods/${periodId}/ranking`)
      .set(bearer(adminToken))
      .expect(200);
    expect(computed.body.hungriest).toEqual([
      expect.objectContaining({
        position: 1,
        totalWithdrawn: 6,
        withdrawals: 2,
        user: expect.objectContaining({ name: 'Luis' }),
      }),
    ]);
    expect(computed.body.podium.map((e: { user: { name: string } }) => e.user.name)).toEqual(['Luis', 'Ana']);
    expect(computed.body.computedBy).toEqual({ kind: 'user', name: 'Admin E2E' });

    latest = await api().get('/api/stats/hungriest/latest').set(bearer(kioskToken)).expect(200);
    expect(latest.body.ranking).toMatchObject({ period: { id: periodId, name: 'Quincena e2e' } });
    expect(latest.body.ranking.podium).toEqual(computed.body.podium);
  });

  it('volver a calcular reemplaza el resultado; desde la tablet no se puede recalcular', async () => {
    await takeOut(ana.id, 10); // retiro registrado tarde, con fecha dentro de la quincena
    const again = await api()
      .post(`/api/funding-periods/${periodId}/ranking`)
      .set(bearer(adminToken))
      .expect(200);
    expect(
      again.body.entries.map((e: { user: { name: string }; position: number }) => [e.position, e.user.name]),
    ).toEqual([
      [1, 'Ana'],
      [2, 'Luis'],
    ]);
    const status = await api()
      .get(`/api/funding-periods/${periodId}/ranking`)
      .set(bearer(adminToken))
      .expect(200);
    expect(status.body.ranking.hungriest[0].user.name).toBe('Ana');

    const kiosk = await api()
      .post(`/api/funding-periods/${periodId}/ranking`)
      .set(bearer(kioskToken))
      .expect(409);
    expect(kiosk.body.error.code).toBe('RANKING_ALREADY_COMPUTED');
  });

  it('la tablet elige la quincena, ve su estado y calcula la primera vez', async () => {
    // Otra quincena ya terminada (cerrada) sin calcular.
    const next = (
      await api()
        .post('/api/funding-periods')
        .set(bearer(adminToken))
        .send({ name: 'Quincena 2100', startDate: '2100-01-01', endDate: '2100-01-15' })
        .expect(201)
    ).body.id;
    await api().patch(`/api/funding-periods/${next}/close`).set(bearer(adminToken)).expect(200);

    const list = await api().get('/api/stats/ranking-periods').set(bearer(kioskToken)).expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ id: next, finished: true, computed: false }),
      expect.objectContaining({ id: periodId, finished: true, computed: true }),
    ]);
    expect(list.body[0]).not.toHaveProperty('collected'); // sin montos del fondo en la tablet

    const status = await api()
      .get(`/api/funding-periods/${next}/ranking`)
      .set(bearer(kioskToken))
      .expect(200);
    expect(status.body).toMatchObject({ canCompute: true, ranking: null });
    const computed = await api()
      .post(`/api/funding-periods/${next}/ranking`)
      .set(bearer(kioskToken))
      .expect(200);
    expect(computed.body).toMatchObject({ computedBy: { kind: 'kiosk', name: 'Tablet' }, hungriest: [] });
  });
});
