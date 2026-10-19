import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, bearer, createE2EContext, type E2EContext } from './helpers';

let ctx: E2EContext;
const api = () => request(ctx.app);
let adminToken: string;
let kioskToken: string;
let deviceId: string;
let ana: { id: string };
let luis: { id: string };
let gaseosaId: string;
let yogurId: string;

const kioskOut = (personId: string, pin: string, items: { productId: string; quantity: number }[]) =>
  api().post('/api/kiosk/movements').set(bearer(kioskToken)).send({ personId, pin, type: 'OUT', items });

const stockOf = async (productId: string) =>
  (await api().get(`/api/products/${productId}`).set(bearer(adminToken))).body.product.quantity as number;

beforeAll(async () => {
  ctx = await createE2EContext();
  await ctx.reset();
  adminToken = await ctx.login(ADMIN.email, ADMIN.password);
  ana = await ctx.createPerson(adminToken, 'Ana', '2580');
  luis = await ctx.createPerson(adminToken, 'Luis', '3691');
  const create = (name: string, initialQuantity: number) =>
    api().post('/api/products').set(bearer(adminToken)).send({ name, initialQuantity });
  gaseosaId = (await create('Gaseosa', 10)).body.id;
  yogurId = (await create('Yogur', 3)).body.id;
});
afterAll(() => ctx?.close());

describe('Tablet: autorización (e2e)', () => {
  it('el admin autoriza una tablet y recibe un token KIOSK de larga duración', async () => {
    const res = await api()
      .post('/api/kiosk/devices')
      .set(bearer(adminToken))
      .send({ name: 'Tablet cocina' })
      .expect(201);
    expect(res.body.device).toMatchObject({
      name: 'Tablet cocina',
      isActive: true,
      createdBy: { name: 'Admin' },
    });
    kioskToken = res.body.token;
    deviceId = res.body.device.id;

    const decoded = jwt.decode(kioskToken) as { role: string; sub: string; exp: number };
    expect(decoded).toMatchObject({ role: 'KIOSK', sub: deviceId });
    expect(decoded.exp * 1000 - Date.now()).toBeGreaterThan(4 * 365 * 24 * 3600 * 1000);
  });

  it('la tablet lee el inventario y su propia información', async () => {
    expect((await api().get('/api/kiosk/me').set(bearer(kioskToken)).expect(200)).body.name).toBe(
      'Tablet cocina',
    );
    await api().get('/api/products').set(bearer(kioskToken)).expect(200);
    await api().get('/api/stats/top-withdrawers').set(bearer(kioskToken)).expect(200);
    await api().get('/api/movements').set(bearer(kioskToken)).expect(200);
    await api().get('/api/dashboard/summary').set(bearer(kioskToken)).expect(200);

    const people = await api().get('/api/kiosk/people').set(bearer(kioskToken)).expect(200);
    expect(people.body).toEqual([
      { id: ana.id, name: 'Ana', lastname: 'E2E', initials: 'AE', pinLockedUntil: null },
      { id: luis.id, name: 'Luis', lastname: 'E2E', initials: 'LE', pinLockedUntil: null },
    ]);
  });

  it('la tablet no puede usar rutas de administración ni de usuario', async () => {
    for (const [method, url] of [
      ['get', '/api/auth/me'],
      ['get', '/api/users'],
      ['get', '/api/people'],
      ['get', '/api/purchases'],
      ['get', '/api/kiosk/devices'],
      ['post', '/api/movements/out'],
      ['post', '/api/products'],
    ] as const) {
      const res = await api()[method](url).set(bearer(kioskToken)).send({});
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.error.code).toBe('USER_REQUIRED');
    }
  });

  it('un admin no usa las rutas de la tablet', async () => {
    const res = await api().get('/api/kiosk/people').set(bearer(adminToken)).expect(403);
    expect(res.body.error.code).toBe('KIOSK_REQUIRED');
  });
});

describe('Tablet: registrar con PIN (e2e)', () => {
  it('Ana saca 2 gaseosas y 1 yogur con su PIN', async () => {
    const res = await kioskOut(ana.id, '2580', [
      { productId: gaseosaId, quantity: 2 },
      { productId: yogurId, quantity: 1 },
    ]).expect(201);
    expect(res.body.person).toMatchObject({ name: 'Ana' });
    expect(res.body.movements).toHaveLength(2);
    expect(await stockOf(gaseosaId)).toBe(8);
    expect(await stockOf(yogurId)).toBe(2);

    const log = await api().get('/api/movements').query({ pageSize: 2 }).set(bearer(kioskToken)).expect(200);
    for (const row of log.body.items) {
      expect(row).toMatchObject({ type: 'OUT', performedBy: { name: 'Ana' }, registeredBy: { name: 'Ana' } });
    }
    const top = await api().get('/api/stats/top-withdrawers').set(bearer(kioskToken)).expect(200);
    expect(top.body[0]).toMatchObject({ user: { name: 'Ana' }, totalWithdrawn: 3 });
  });

  it('si una línea no tiene stock no se registra ninguna', async () => {
    const res = await kioskOut(luis.id, '3691', [
      { productId: gaseosaId, quantity: 1 },
      { productId: yogurId, quantity: 50 },
    ]).expect(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(gaseosaId)).toBe(8);
  });

  it('meter productos también funciona', async () => {
    await api()
      .post('/api/kiosk/movements')
      .set(bearer(kioskToken))
      .send({ personId: luis.id, pin: '3691', type: 'IN', items: [{ productId: yogurId, quantity: 4 }] })
      .expect(201);
    expect(await stockOf(yogurId)).toBe(6);
  });

  it('PIN incorrecto → 401 con intentos restantes; al quinto → 423 bloqueado; el admin lo restablece', async () => {
    const first = await kioskOut(luis.id, '0000', [{ productId: gaseosaId, quantity: 1 }]).expect(401);
    expect(first.body.error).toMatchObject({ code: 'INVALID_PIN', details: { remainingAttempts: 4 } });
    for (let i = 0; i < 3; i++)
      await kioskOut(luis.id, '0000', [{ productId: gaseosaId, quantity: 1 }]).expect(401);
    const locked = await kioskOut(luis.id, '0000', [{ productId: gaseosaId, quantity: 1 }]).expect(423);
    expect(locked.body.error.code).toBe('PIN_LOCKED');
    // Ni con el PIN correcto mientras dure el bloqueo
    await kioskOut(luis.id, '3691', [{ productId: gaseosaId, quantity: 1 }]).expect(423);
    expect(await stockOf(gaseosaId)).toBe(8);

    const people = await api().get('/api/people').set(bearer(adminToken)).expect(200);
    expect(people.body.find((p: { id: string }) => p.id === luis.id)).toMatchObject({ isPinLocked: true });
    await api().post(`/api/people/${luis.id}/pin`).set(bearer(adminToken)).send({ pin: '7351' }).expect(200);
    await kioskOut(luis.id, '7351', [{ productId: gaseosaId, quantity: 1 }]).expect(201);
  });

  it('cada persona puede cambiar su PIN desde la tablet', async () => {
    await api()
      .post(`/api/kiosk/people/${ana.id}/pin`)
      .set(bearer(kioskToken))
      .send({ currentPin: '2580', newPin: '4826' })
      .expect(204);
    await kioskOut(ana.id, '2580', [{ productId: gaseosaId, quantity: 1 }]).expect(401);
    await kioskOut(ana.id, '4826', [{ productId: gaseosaId, quantity: 1 }]).expect(201);
  });

  it('valida los datos', async () => {
    const res = await api()
      .post('/api/kiosk/movements')
      .set(bearer(kioskToken))
      .send({ personId: ana.id, pin: '4826', type: 'OUT', items: [] })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Tablet: revocación (e2e)', () => {
  it('la lista muestra la última conexión; al revocarla su token deja de servir', async () => {
    const list = await api().get('/api/kiosk/devices').set(bearer(adminToken)).expect(200);
    expect(list.body[0]).toMatchObject({ id: deviceId, isActive: true });
    expect(list.body[0].lastSeenAt).not.toBeNull();

    const revoked = await api().delete(`/api/kiosk/devices/${deviceId}`).set(bearer(adminToken)).expect(200);
    expect(revoked.body.isActive).toBe(false);
    const res = await api().get('/api/products').set(bearer(kioskToken)).expect(401);
    expect(res.body.error.code).toBe('DEVICE_REVOKED');
    await api().delete(`/api/kiosk/devices/${deviceId}`).set(bearer(adminToken)).expect(409);
  });
});
