import { describe, expect, it } from 'vitest';
import {
  AdminSafetyPolicy,
  ListUserOptionsUseCase,
  ListUsersUseCase,
  RegisterAdminUseCase,
  SetUserActiveUseCase,
  UpdateUserUseCase,
} from '../../../application';
import { Role } from '../../../domain';
import { actorOf, createOfficeContext } from '../../support/testContext';

async function setup() {
  const ctx = await createOfficeContext();
  const safety = new AdminSafetyPolicy(ctx.repos.users);
  return {
    ...ctx,
    register: new RegisterAdminUseCase(ctx.repos.users, ctx.hasher, ctx.ids, ctx.clock),
    list: new ListUsersUseCase(ctx.repos.users),
    options: new ListUserOptionsUseCase(ctx.repos.users),
    update: new UpdateUserUseCase(ctx.repos.users, ctx.hasher, ctx.clock),
    setActive: new SetUserActiveUseCase(ctx.repos.users, safety, ctx.clock),
  };
}

const newAdmin = { name: 'Marta', lastname: 'Ríos', email: 'Marta@Oficina.com', password: 'Nevera123' };

describe('RegisterAdminUseCase', () => {
  it('el admin crea otro administrador con la contraseña hasheada', async () => {
    const { register, asAdmin, repos } = await setup();
    const dto = await register.execute(newAdmin, asAdmin);
    expect(dto).toMatchObject({ email: 'marta@oficina.com', role: 'ADMIN', isActive: true });
    const saved = (await repos.users.findById(dto.id))!;
    expect(saved.passwordHash).toBe('hashed:Nevera123');
    expect(saved.canLogIn()).toBe(true);
  });

  it('solo un admin puede hacerlo', async () => {
    const { register, asAna } = await setup();
    await expect(register.execute(newAdmin, asAna)).rejects.toMatchObject({ kind: 'FORBIDDEN' });
  });

  it('rechaza emails repetidos y contraseñas débiles', async () => {
    const { register, asAdmin } = await setup();
    await expect(
      register.execute({ ...newAdmin, email: 'ADMIN@oficina.com' }, asAdmin),
    ).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
    await expect(register.execute({ ...newAdmin, password: 'corta' }, asAdmin)).rejects.toMatchObject({
      code: 'WEAK_PASSWORD',
    });
  });
});

describe('ListUsersUseCase / ListUserOptionsUseCase', () => {
  it('el admin ve la lista completa y puede filtrar', async () => {
    const { list, asAdmin } = await setup();
    expect(await list.execute({}, asAdmin)).toHaveLength(3);
    expect((await list.execute({ role: Role.ADMIN }, asAdmin)).map((u) => u.name)).toEqual(['Admin']);
    expect((await list.execute({ search: 'lui' }, asAdmin)).map((u) => u.name)).toEqual(['Luis']);
  });

  it('las personas no tienen email', async () => {
    const { list, asAdmin } = await setup();
    const ana = (await list.execute({ search: 'ana' }, asAdmin))[0];
    expect(ana?.email).toBeNull();
  });

  it('solo un admin ve la lista completa', async () => {
    const { list, asAna } = await setup();
    await expect(list.execute({}, asAna)).rejects.toMatchObject({ kind: 'FORBIDDEN' });
  });

  it('las opciones solo traen usuarios activos con id y nombre', async () => {
    const { options, seedUser } = await setup();
    await seedUser({ name: 'Inactivo', isActive: false });
    const result = await options.execute();
    expect(result.map((u) => u.name)).toEqual(['Admin', 'Ana', 'Luis']);
    expect(result[0]).toEqual({ id: 'user-admin', name: 'Admin', lastname: 'Test' });
  });
});

describe('UpdateUserUseCase', () => {
  it('actualiza datos, email y restablece la contraseña de un admin', async () => {
    const { update, asAdmin, admin, repos } = await setup();
    const dto = await update.execute(
      admin.id,
      { name: 'Jefa', email: 'jefa@oficina.com', password: 'NuevaClave1' },
      asAdmin,
    );
    expect(dto).toMatchObject({ name: 'Jefa', lastname: 'Test', email: 'jefa@oficina.com' });
    expect((await repos.users.findById(admin.id))!.passwordHash).toBe('hashed:NuevaClave1');
  });

  it('a una persona solo se le cambia el nombre (no tiene email ni contraseña)', async () => {
    const { update, asAdmin, ana } = await setup();
    expect((await update.execute(ana.id, { name: 'Ana María' }, asAdmin)).name).toBe('Ana María');
    await expect(update.execute(ana.id, { email: 'ana@oficina.com' }, asAdmin)).rejects.toMatchObject({
      code: 'NOT_AN_ACCOUNT',
    });
    await expect(update.execute(ana.id, { password: 'Clave1234' }, asAdmin)).rejects.toMatchObject({
      code: 'NOT_AN_ACCOUNT',
    });
  });

  it('no permite usar el email de otro usuario', async () => {
    const { update, register, asAdmin, admin } = await setup();
    await register.execute(newAdmin, asAdmin);
    await expect(update.execute(admin.id, { email: 'marta@oficina.com' }, asAdmin)).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
  });

  it('falla si el usuario no existe', async () => {
    const { update, asAdmin } = await setup();
    await expect(update.execute('nadie', { name: 'X' }, asAdmin)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });
});

describe('SetUserActiveUseCase', () => {
  it('desactiva y reactiva a una persona', async () => {
    const { setActive, asAdmin, ana } = await setup();
    expect((await setActive.execute(ana.id, false, asAdmin)).isActive).toBe(false);
    expect((await setActive.execute(ana.id, true, asAdmin)).isActive).toBe(true);
    expect((await setActive.execute(ana.id, true, asAdmin)).isActive).toBe(true); // sin cambios
  });

  it('el admin no puede desactivarse a sí mismo', async () => {
    const { setActive, asAdmin, admin } = await setup();
    await expect(setActive.execute(admin.id, false, asAdmin)).rejects.toMatchObject({
      code: 'CANNOT_DEACTIVATE_SELF',
    });
  });

  it('no se puede desactivar al último admin activo', async () => {
    const { setActive, seedUser, admin } = await setup();
    const second = await seedUser({ name: 'Segunda', role: Role.ADMIN });
    await setActive.execute(admin.id, false, actorOf(second)); // queda "Segunda" como única admin
    await expect(setActive.execute(second.id, false, { id: 'otro', role: Role.ADMIN })).rejects.toMatchObject(
      {
        code: 'LAST_ADMIN',
      },
    );
  });
});
