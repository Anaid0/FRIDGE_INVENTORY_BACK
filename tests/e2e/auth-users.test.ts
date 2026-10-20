import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, bearer, createE2EContext, type E2EContext } from './helpers';

let ctx: E2EContext;
const api = () => request(ctx.app);
let adminToken: string;

beforeAll(async () => {
  ctx = await createE2EContext();
  await ctx.reset();
  adminToken = await ctx.login(ADMIN.email, ADMIN.password);
});
afterAll(() => ctx?.close());

describe('Autenticación y administradores (e2e)', () => {
  it('GET /health responde con la BD conectada', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: true });
  });

  it('CORS: permite el front y la app Android (Capacitor), no otros orígenes', async () => {
    for (const origin of ['http://localhost:5173', 'http://localhost', 'capacitor://localhost']) {
      const res = await api()
        .options('/api/products')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET');
      expect(res.headers['access-control-allow-origin'], origin).toBe(origin);
    }
    const evil = await api()
      .options('/api/products')
      .set('Origin', 'https://malo.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('login devuelve un JWT real y /auth/me el usuario', async () => {
    const login = await api().post('/api/auth/login').send(ADMIN).expect(200);
    expect(login.body.token.split('.')).toHaveLength(3);
    const me = await api().get('/api/auth/me').set(bearer(login.body.token)).expect(200);
    expect(me.body).toMatchObject({ email: ADMIN.email, role: 'ADMIN' });
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('rechaza credenciales malas, falta de token y tokens inválidos', async () => {
    const bad = await api()
      .post('/api/auth/login')
      .send({ ...ADMIN, password: 'Mala1234' })
      .expect(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    expect((await api().get('/api/auth/me').expect(401)).body.error.code).toBe('MISSING_TOKEN');
    expect((await api().get('/api/auth/me').set(bearer('x.y.z')).expect(401)).body.error.code).toBe(
      'INVALID_TOKEN',
    );
  });

  it('el admin crea otro admin, que puede iniciar sesión', async () => {
    const res = await api()
      .post('/api/users')
      .set(bearer(adminToken))
      .send({ name: 'Segunda', lastname: 'Admin', email: 'segunda@e2e.test', password: 'Clave1234' })
      .expect(201);
    expect(res.body).toMatchObject({ role: 'ADMIN', email: 'segunda@e2e.test' });
    expect(await ctx.login('segunda@e2e.test', 'Clave1234')).toBeTruthy();

    const dup = await api()
      .post('/api/users')
      .set(bearer(adminToken))
      .send({ name: 'Otra', lastname: 'X', email: 'SEGUNDA@e2e.test', password: 'Clave1234' })
      .expect(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('/users ya no crea empleados: las personas se crean en /people', async () => {
    const res = await api()
      .post('/api/users')
      .set(bearer(adminToken))
      .send({ name: 'X', lastname: 'Y', email: 'x@e2e.test', password: 'Clave1234', role: 'EMPLOYEE' })
      .expect(400);
    expect(res.body.error.details[0].message).toContain('/people');
  });

  it('desactivar a un admin invalida su sesión de inmediato', async () => {
    const res = await api()
      .post('/api/users')
      .set(bearer(adminToken))
      .send({ name: 'Temporal', lastname: 'Admin', email: 'temporal@e2e.test', password: 'Clave1234' })
      .expect(201);
    const token = await ctx.login('temporal@e2e.test', 'Clave1234');
    await api().get('/api/auth/me').set(bearer(token)).expect(200);
    await api()
      .patch(`/api/users/${res.body.id}`)
      .set(bearer(adminToken))
      .send({ isActive: false })
      .expect(200);
    expect((await api().get('/api/auth/me').set(bearer(token)).expect(401)).body.error.code).toBe(
      'SESSION_INVALID',
    );
  });
});

describe('Personas con PIN (e2e)', () => {
  let personId: string;

  it('el admin crea una persona solo con nombre y PIN', async () => {
    const res = await api()
      .post('/api/people')
      .set(bearer(adminToken))
      .send({ name: 'Ana', lastname: 'Gómez', pin: '2580' })
      .expect(201);
    expect(res.body).toMatchObject({
      fullName: 'Ana Gómez',
      hasPin: true,
      isPinLocked: false,
      isActive: true,
    });
    expect(res.body).not.toHaveProperty('pinHash');
    personId = res.body.id;

    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: personId } });
    expect(row).toMatchObject({ role: 'EMPLOYEE', email: null, passwordHash: null });
    expect(row.pinHash).toMatch(/^\$2[aby]\$/); // bcrypt, nunca en texto plano
  });

  it('valida el PIN y los nombres repetidos', async () => {
    const weak = await api()
      .post('/api/people')
      .set(bearer(adminToken))
      .send({ name: 'Luis', lastname: 'X', pin: '1234' })
      .expect(400);
    expect(weak.body.error.code).toBe('WEAK_PIN');
    const dup = await api()
      .post('/api/people')
      .set(bearer(adminToken))
      .send({ name: 'ana', lastname: 'GOMEZ', pin: '4826' })
      .expect(409);
    expect(dup.body.error.code).toBe('PERSON_NAME_TAKEN');
  });

  it('lista, edita y restablece el PIN (las personas no tienen email)', async () => {
    const list = await api().get('/api/people').set(bearer(adminToken)).expect(200);
    expect(list.body.map((p: { fullName: string }) => p.fullName)).toEqual(['Ana Gómez']);

    const edited = await api()
      .patch(`/api/people/${personId}`)
      .set(bearer(adminToken))
      .send({ lastname: 'Gómez Ruiz' })
      .expect(200);
    expect(edited.body.fullName).toBe('Ana Gómez Ruiz');

    const reset = await api()
      .post(`/api/people/${personId}/pin`)
      .set(bearer(adminToken))
      .send({ pin: '7351', adminPassword: ADMIN.password })
      .expect(200);
    expect(reset.body.hasPin).toBe(true);
    expect(Object.keys(edited.body)).not.toContain('email');
  });

  it('solo los administradores gestionan personas', async () => {
    await api().get('/api/people').expect(401);
    const admin = await api().get('/api/auth/me').set(bearer(adminToken));
    const res = await api()
      .post(`/api/people/${admin.body.id}/pin`)
      .set(bearer(adminToken))
      .send({ pin: '7351', adminPassword: ADMIN.password })
      .expect(400);
    expect(res.body.error.code).toBe('NOT_A_PERSON');
  });

  it('un admin no puede desactivarse a sí mismo: siempre queda al menos uno', async () => {
    const me = await api().get('/api/auth/me').set(bearer(adminToken));
    const users = await api()
      .get('/api/users')
      .query({ role: 'ADMIN', isActive: 'true' })
      .set(bearer(adminToken));
    // Deja a este admin como el único activo e intenta desactivarlo.
    for (const user of users.body.filter((u: { id: string }) => u.id !== me.body.id)) {
      await api()
        .patch(`/api/users/${user.id}`)
        .set(bearer(adminToken))
        .send({ isActive: false })
        .expect(200);
    }
    const res = await api()
      .patch(`/api/users/${me.body.id}`)
      .set(bearer(adminToken))
      .send({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');
  });
});
