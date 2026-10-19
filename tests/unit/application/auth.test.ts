import { describe, expect, it } from 'vitest';
import { GetCurrentUserUseCase, LoginUseCase } from '../../../application';
import { Role } from '../../../domain';
import { createOfficeContext } from '../../support/testContext';

async function setup() {
  const ctx = await createOfficeContext();
  return {
    ...ctx,
    login: new LoginUseCase(ctx.repos.users, ctx.hasher, ctx.tokens),
    me: new GetCurrentUserUseCase(ctx.repos.users),
  };
}

describe('LoginUseCase', () => {
  it('el admin inicia sesión: token y usuario sin hashes', async () => {
    const { login, admin } = await setup();
    const result = await login.execute({ email: '  ADMIN@oficina.com ', password: 'Nevera123' });
    expect(result.token).toBe(`token:${admin.id}:ADMIN`);
    expect(result.user).toMatchObject({
      id: admin.id,
      email: 'admin@oficina.com',
      role: 'ADMIN',
      fullName: 'Admin Test',
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('pinHash');
  });

  it.each([
    ['contraseña incorrecta', 'admin@oficina.com', 'Otra1234'],
    ['email inexistente', 'nadie@oficina.com', 'Nevera123'],
    ['email con formato inválido', 'no-es-email', 'Nevera123'],
  ])('rechaza con el mismo error genérico: %s', async (_label, email, password) => {
    const { login } = await setup();
    await expect(login.execute({ email, password })).rejects.toMatchObject({
      kind: 'UNAUTHORIZED',
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('un admin desactivado no puede entrar', async () => {
    const { login, seedUser } = await setup();
    await seedUser({ name: 'Pedro', role: Role.ADMIN, isActive: false });
    await expect(login.execute({ email: 'pedro@oficina.com', password: 'Nevera123' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });
});

describe('GetCurrentUserUseCase', () => {
  it('devuelve el admin de la sesión', async () => {
    const { me, admin } = await setup();
    expect((await me.execute(admin.id)).id).toBe(admin.id);
  });

  it('invalida la sesión si el usuario fue desactivado, no existe o es una persona sin cuenta', async () => {
    const { me, seedUser, ana } = await setup();
    const pedro = await seedUser({ name: 'Pedro', role: Role.ADMIN, isActive: false });
    await expect(me.execute(pedro.id)).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    await expect(me.execute('no-existe')).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    await expect(me.execute(ana.id)).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });
});
