import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, bearer, createE2EContext, type E2EContext } from './helpers';

let ctx: E2EContext;
const api = () => request(ctx.app);
let adminToken: string;

const pairTablet = async (name: string) => {
  const res = await api().post('/api/kiosk/devices').set(bearer(adminToken)).send({ name }).expect(201);
  return { token: res.body.token as string, id: res.body.device.id as string };
};

beforeAll(async () => {
  ctx = await createE2EContext();
  await ctx.reset();
  adminToken = await ctx.login(ADMIN.email, ADMIN.password);
});
afterAll(() => ctx?.close());

describe('Código de los productos (e2e)', () => {
  let aguaId: string;

  it('POST /products sin código asigna el primero libre; con código usa ese', async () => {
    const agua = await api().post('/api/products').set(bearer(adminToken)).send({ name: 'Agua' }).expect(201);
    expect(agua.body.code).toBe('11');
    aguaId = agua.body.id;
    const yogur = await api()
      .post('/api/products')
      .set(bearer(adminToken))
      .send({ name: 'Yogur', code: null })
      .expect(201);
    expect(yogur.body.code).toBe('12');
    const papas = await api()
      .post('/api/products')
      .set(bearer(adminToken))
      .send({ name: 'Papas', code: '57' })
      .expect(201);
    expect(papas.body.code).toBe('57');
  });

  it('rechaza un código ocupado o con formato inválido', async () => {
    const taken = await api()
      .post('/api/products')
      .set(bearer(adminToken))
      .send({ name: 'Gaseosa', code: '11' })
      .expect(409);
    expect(taken.body.error).toEqual({
      code: 'PRODUCT_CODE_TAKEN',
      message: 'El código 11 ya lo tiene Agua',
      details: { code: '11', productId: aguaId },
    });
    for (const code of ['5', '05', '100', 'ab']) {
      const res = await api()
        .post('/api/products')
        .set(bearer(adminToken))
        .send({ name: 'Gaseosa', code })
        .expect(400);
      expect(res.body.error.code).toBe('INVALID_PRODUCT_CODE');
    }
  });

  it('PATCH /products/:id cambia el código (no a uno ocupado; el mismo sí)', async () => {
    await api().patch(`/api/products/${aguaId}`).set(bearer(adminToken)).send({ code: '11' }).expect(200);
    const changed = await api()
      .patch(`/api/products/${aguaId}`)
      .set(bearer(adminToken))
      .send({ code: '34' })
      .expect(200);
    expect(changed.body.code).toBe('34');
    const taken = await api()
      .patch(`/api/products/${aguaId}`)
      .set(bearer(adminToken))
      .send({ code: '57' })
      .expect(409);
    expect(taken.body.error).toMatchObject({ code: 'PRODUCT_CODE_TAKEN', details: { code: '57' } });
    // El 11 quedó libre: el siguiente producto lo recibe
    const next = await api().post('/api/products').set(bearer(adminToken)).send({ name: 'Gaseosa' });
    expect(next.body.code).toBe('11');
  });

  it('GET /products y /products/:id incluyen el código; search busca también por código', async () => {
    const list = await api().get('/api/products').set(bearer(adminToken)).expect(200);
    expect(list.body.map((p: { name: string; code: string }) => [p.name, p.code])).toEqual([
      ['Agua', '34'],
      ['Gaseosa', '11'],
      ['Papas', '57'],
      ['Yogur', '12'],
    ]);
    const byCode = await api().get('/api/products?search=57').set(bearer(adminToken)).expect(200);
    expect(byCode.body.map((p: { name: string }) => p.name)).toEqual(['Papas']);
    const detail = await api().get(`/api/products/${aguaId}`).set(bearer(adminToken)).expect(200);
    expect(detail.body.product.code).toBe('34');
  });
});

describe('Código de administrador (e2e)', () => {
  let otroToken: string;

  it('/auth/me y el login indican si el admin tiene código (nunca el código ni el hash)', async () => {
    const login = await api()
      .post('/api/auth/login')
      .send({ email: ADMIN.email, password: ADMIN.password })
      .expect(200);
    expect(login.body.user.hasAdminCode).toBe(true); // el admin de los e2e se crea con ADMIN.code
    expect(JSON.stringify(login.body)).not.toMatch(/adminCode(Hash)?"/);

    await api()
      .post('/api/users')
      .set(bearer(adminToken))
      .send({ name: 'Otro', lastname: 'Admin', email: 'otro@e2e.test', password: 'OtroAdmin123' })
      .expect(201);
    otroToken = await ctx.login('otro@e2e.test', 'OtroAdmin123');
    expect((await api().get('/api/auth/me').set(bearer(otroToken)).expect(200)).body.hasAdminCode).toBe(
      false,
    );
  });

  it('PUT /auth/me/admin-code: valida contraseña, formato y que no lo use otro admin', async () => {
    const put = (body: object) => api().put('/api/auth/me/admin-code').set(bearer(otroToken)).send(body);

    const wrongPassword = await put({ password: 'NoEsLaClave1', code: '739164' }).expect(400);
    expect(wrongPassword.body.error.code).toBe('INVALID_ADMIN_PASSWORD');
    for (const code of ['123', '1234567', '1111', '123456', '654321']) {
      const res = await put({ password: 'OtroAdmin123', code }).expect(400);
      expect(res.body.error.code).toBe('INVALID_ADMIN_CODE_FORMAT');
    }
    const taken = await put({ password: 'OtroAdmin123', code: ADMIN.code }).expect(409);
    expect(taken.body.error).toMatchObject({
      code: 'ADMIN_CODE_TAKEN',
      message: 'Ese código ya lo usa otro administrador',
    });
    await put({ code: '739164' }).expect(400);

    await put({ password: 'OtroAdmin123', code: '739164' }).expect(204);
    expect((await api().get('/api/auth/me').set(bearer(otroToken))).body.hasAdminCode).toBe(true);
    const users = await api().get('/api/users?role=ADMIN').set(bearer(adminToken)).expect(200);
    expect(users.body.every((u: { hasAdminCode: boolean }) => u.hasAdminCode)).toBe(true);
    expect(JSON.stringify(users.body)).not.toContain('admin_code');
  });

  it('una tablet no puede definir códigos de administrador', async () => {
    const tablet = await pairTablet('Tablet sin permisos');
    await api()
      .put('/api/auth/me/admin-code')
      .set(bearer(tablet.token))
      .send({ password: ADMIN.password, code: '739164' })
      .expect(403);
  });
});

describe('POST /kiosk/admin-session (e2e)', () => {
  it('con el código correcto devuelve la misma sesión que el login', async () => {
    const tablet = await pairTablet('Tablet cocina');
    const res = await api()
      .post('/api/kiosk/admin-session')
      .set(bearer(tablet.token))
      .send({ code: ADMIN.code })
      .expect(200);
    expect(Object.keys(res.body).sort()).toEqual(['token', 'user']);
    const login = await api().post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password });
    expect(res.body.user).toEqual(login.body.user);
    // El token es de admin: sirve para la administración
    const me = await api().get('/api/auth/me').set(bearer(res.body.token)).expect(200);
    expect(me.body).toMatchObject({ email: ADMIN.email, role: 'ADMIN' });
    await api().get('/api/kiosk/devices').set(bearer(res.body.token)).expect(200);
  });

  it('código incorrecto → 401 con intentos restantes (guardados en la tablet); al quinto → 423', async () => {
    const tablet = await pairTablet('Tablet pasillo');
    const enter = (code: string) =>
      api().post('/api/kiosk/admin-session').set(bearer(tablet.token)).send({ code });

    const wrong = await enter('975310').expect(401);
    expect(wrong.body.error).toMatchObject({ code: 'INVALID_ADMIN_CODE', details: { remainingAttempts: 4 } });
    expect(wrong.body.error.message).toMatch(/Código de administrador incorrecto/);
    const saved = await ctx.prisma.kioskDevice.findUniqueOrThrow({ where: { id: tablet.id } });
    expect(saved.failedPinAttempts).toBe(1);

    // Un acierto reinicia la cuenta
    await enter(ADMIN.code).expect(200);
    expect(
      (await ctx.prisma.kioskDevice.findUniqueOrThrow({ where: { id: tablet.id } })).failedPinAttempts,
    ).toBe(0);

    // Los PIN incorrectos y los códigos incorrectos comparten el contador de la tablet
    await api()
      .post('/api/kiosk/movements')
      .set(bearer(tablet.token))
      .send({ pin: '9999', type: 'OUT', items: [{ productId: 'x', quantity: 1 }] })
      .expect(401);
    for (const remaining of [3, 2, 1]) {
      expect((await enter('975310').expect(401)).body.error.details.remainingAttempts).toBe(remaining);
    }
    const locked = await enter('975310').expect(423);
    expect(locked.body.error).toMatchObject({ code: 'PIN_LOCKED', details: { deviceId: tablet.id } });
    expect(new Date(locked.body.error.details.lockedUntil).getTime()).toBeGreaterThan(Date.now());
    // Bloqueada: ni el código correcto entra
    expect((await enter(ADMIN.code).expect(423)).body.error.code).toBe('PIN_LOCKED');
  });

  it('valida el formato sin gastar intentos; solo desde una tablet', async () => {
    const tablet = await pairTablet('Tablet entrada');
    for (const code of ['123', '1234567', 'abcd']) {
      const res = await api()
        .post('/api/kiosk/admin-session')
        .set(bearer(tablet.token))
        .send({ code })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(
      (await ctx.prisma.kioskDevice.findUniqueOrThrow({ where: { id: tablet.id } })).failedPinAttempts,
    ).toBe(0);
    await api()
      .post('/api/kiosk/admin-session')
      .set(bearer(adminToken))
      .send({ code: ADMIN.code })
      .expect(403);
    await api().post('/api/kiosk/admin-session').send({ code: ADMIN.code }).expect(401);
  });

  it('un admin desactivado no entra con su código', async () => {
    const tablet = await pairTablet('Tablet bodega');
    const otro = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'otro@e2e.test' } });
    await api().patch(`/api/users/${otro.id}`).set(bearer(adminToken)).send({ isActive: false }).expect(200);
    const res = await api()
      .post('/api/kiosk/admin-session')
      .set(bearer(tablet.token))
      .send({ code: '739164' })
      .expect(401);
    expect(res.body.error.code).toBe('INVALID_ADMIN_CODE');
  });
});
