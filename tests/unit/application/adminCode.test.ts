import { describe, expect, it } from 'vitest';
import {
  GetCurrentUserUseCase,
  KioskAdminSessionUseCase,
  ListUsersUseCase,
  LoginUseCase,
  PinIdentifier,
  SetAdminCodeUseCase,
} from '../../../application';
import { KIOSK_PIN_LOCK_MINUTES, KIOSK_PIN_MAX_ATTEMPTS, KioskDevice, Role } from '../../../domain';
import { actorOf, createOfficeContext } from '../../support/testContext';

const TABLET_ID = 'tablet-test';
const CODE = '482915';

async function setup() {
  const ctx = await createOfficeContext();
  const { repos, hasher, tokens, clock } = ctx;
  await repos.kioskDevices.save(
    KioskDevice.pair({ id: TABLET_ID, name: 'Tablet cocina', createdBy: ctx.admin.id, now: clock.now() }),
  );
  const setAdminCode = new SetAdminCodeUseCase(repos.users, hasher, clock);
  const session = new KioskAdminSessionUseCase(repos.users, repos.kioskDevices, hasher, tokens, clock);
  return {
    ...ctx,
    setAdminCode,
    session,
    enter: (code: string) => session.execute(TABLET_ID, code),
    login: new LoginUseCase(repos.users, hasher, tokens),
    me: new GetCurrentUserUseCase(repos.users),
    listUsers: new ListUsersUseCase(repos.users),
    identifier: new PinIdentifier(repos.users, repos.kioskDevices, hasher, clock),
    device: async () => (await repos.kioskDevices.findById(TABLET_ID))!,
  };
}

describe('SetAdminCodeUseCase', () => {
  it('con su contraseña, el admin define su código (se guarda con hash)', async () => {
    const { setAdminCode, asAdmin, admin, repos, me, listUsers } = await setup();
    expect((await me.execute(admin.id)).hasAdminCode).toBe(false);

    await setAdminCode.execute({ password: 'Nevera123', code: CODE }, asAdmin);

    const saved = (await repos.users.findById(admin.id))!;
    expect(saved.adminCodeHash).toBe(`hashed:${CODE}`);
    const dto = await me.execute(admin.id);
    expect(dto.hasAdminCode).toBe(true);
    expect(JSON.stringify(dto)).not.toContain(CODE);
    const list = await listUsers.execute({ role: Role.ADMIN }, asAdmin);
    expect(list.find((u) => u.id === admin.id)?.hasAdminCode).toBe(true);
  });

  it('contraseña incorrecta → INVALID_ADMIN_PASSWORD (400, no cierra la sesión) y no guarda nada', async () => {
    const { setAdminCode, asAdmin, admin, repos } = await setup();
    await expect(
      setAdminCode.execute({ password: 'otra-clave1', code: CODE }, asAdmin),
    ).rejects.toMatchObject({ kind: 'VALIDATION', code: 'INVALID_ADMIN_PASSWORD' });
    expect((await repos.users.findById(admin.id))!.hasAdminCode()).toBe(false);
  });

  it('valida el formato y rechaza códigos triviales', async () => {
    const { setAdminCode, asAdmin } = await setup();
    for (const code of ['123', '1234567', 'abcd', '0000', '123456', '654321']) {
      await expect(setAdminCode.execute({ password: 'Nevera123', code }, asAdmin)).rejects.toMatchObject({
        code: 'INVALID_ADMIN_CODE_FORMAT',
      });
    }
  });

  it('no puede repetir el código de otro admin (aunque esté desactivado); el propio sí', async () => {
    const { setAdminCode, seedUser, asAdmin, repos } = await setup();
    const otro = await seedUser({ name: 'Otro', role: Role.ADMIN });
    await setAdminCode.execute({ password: 'Nevera123', code: CODE }, actorOf(otro));
    const saved = (await repos.users.findById(otro.id))!;
    saved.deactivate(new Date());
    await repos.users.save(saved);
    await expect(setAdminCode.execute({ password: 'Nevera123', code: CODE }, asAdmin)).rejects.toMatchObject({
      kind: 'CONFLICT',
      code: 'ADMIN_CODE_TAKEN',
      message: 'Ese código ya lo usa otro administrador',
    });
    // Cambiar su propio código por el mismo no choca consigo mismo
    await setAdminCode.execute({ password: 'Nevera123', code: CODE }, actorOf(otro));
  });

  it('solo un administrador', async () => {
    const { setAdminCode, asAna } = await setup();
    await expect(setAdminCode.execute({ password: 'x', code: CODE }, asAna)).rejects.toMatchObject({
      kind: 'FORBIDDEN',
    });
  });
});

describe('KioskAdminSessionUseCase (entrar a la administración desde la tablet)', () => {
  async function withCode() {
    const ctx = await setup();
    await ctx.setAdminCode.execute({ password: 'Nevera123', code: CODE }, ctx.asAdmin);
    return ctx;
  }

  it('con el código correcto devuelve lo mismo que el login (token de admin + usuario)', async () => {
    const { enter, login, admin } = await withCode();
    const result = await enter(CODE);
    const viaLogin = await login.execute({ email: admin.email!.value, password: 'Nevera123' });
    expect(result).toEqual(viaLogin);
    expect(result.token).toBe(`token:${admin.id}:ADMIN`);
    expect(result.user).toMatchObject({ id: admin.id, role: 'ADMIN', hasAdminCode: true });
  });

  it('código incorrecto → INVALID_ADMIN_CODE con los intentos restantes; el intento queda guardado', async () => {
    const { enter, device } = await withCode();
    await expect(enter('975310')).rejects.toMatchObject({
      kind: 'UNAUTHORIZED',
      code: 'INVALID_ADMIN_CODE',
      details: { remainingAttempts: KIOSK_PIN_MAX_ATTEMPTS - 1 },
    });
    expect((await device()).failedPinAttempts).toBe(1);
    await expect(enter('abc')).rejects.toMatchObject({
      details: { remainingAttempts: KIOSK_PIN_MAX_ATTEMPTS - 2 },
    });
    expect((await device()).failedPinAttempts).toBe(2);
  });

  it('un acierto reinicia la cuenta de la tablet', async () => {
    const { enter, device } = await withCode();
    await expect(enter('975310')).rejects.toMatchObject({ code: 'INVALID_ADMIN_CODE' });
    await enter(CODE);
    expect((await device()).failedPinAttempts).toBe(0);
  });

  it(`a los ${KIOSK_PIN_MAX_ATTEMPTS} fallos bloquea la tablet ${KIOSK_PIN_LOCK_MINUTES} minutos (ni el correcto pasa)`, async () => {
    const { enter, clock, device } = await withCode();
    for (let i = 1; i < KIOSK_PIN_MAX_ATTEMPTS; i++) {
      await expect(enter('975310')).rejects.toMatchObject({ code: 'INVALID_ADMIN_CODE' });
    }
    const lockedUntil = new Date(clock.now().getTime() + KIOSK_PIN_LOCK_MINUTES * 60_000).toISOString();
    await expect(enter('975310')).rejects.toMatchObject({
      kind: 'LOCKED',
      code: 'PIN_LOCKED',
      details: { deviceId: TABLET_ID, lockedUntil },
    });
    await expect(enter(CODE)).rejects.toMatchObject({ code: 'PIN_LOCKED', details: { lockedUntil } });
    expect((await device()).pinLockedUntil?.toISOString()).toBe(lockedUntil);

    clock.set(new Date(clock.now().getTime() + KIOSK_PIN_LOCK_MINUTES * 60_000 + 1));
    await expect(enter(CODE)).resolves.toMatchObject({ user: { role: 'ADMIN' } });
  });

  it('comparte el contador y el bloqueo con los PIN incorrectos', async () => {
    const { enter, identifier } = await withCode();
    await expect(identifier.identify(TABLET_ID, '9999')).rejects.toMatchObject({ code: 'INVALID_PIN' });
    await expect(identifier.identify(TABLET_ID, '9998')).rejects.toMatchObject({ code: 'INVALID_PIN' });
    await expect(enter('975310')).rejects.toMatchObject({
      details: { remainingAttempts: KIOSK_PIN_MAX_ATTEMPTS - 3 },
    });
    await expect(enter('975310')).rejects.toMatchObject({ code: 'INVALID_ADMIN_CODE' });
    await expect(enter('975310')).rejects.toMatchObject({ code: 'PIN_LOCKED' });
    // La tablet bloqueada tampoco acepta PIN
    await expect(identifier.identify(TABLET_ID, '2580')).rejects.toMatchObject({ code: 'PIN_LOCKED' });
  });

  it('un admin desactivado no entra con su código', async () => {
    const { enter, admin, repos, seedUser } = await withCode();
    await seedUser({ name: 'Otro', role: Role.ADMIN }); // para no dejar el sistema sin admins
    const saved = (await repos.users.findById(admin.id))!;
    saved.deactivate(new Date());
    await repos.users.save(saved);
    await expect(enter(CODE)).rejects.toMatchObject({ code: 'INVALID_ADMIN_CODE' });
  });

  it('las personas (PIN) y los admins sin código nunca coinciden', async () => {
    const { enter, seedUser } = await setup(); // nadie tiene código
    await seedUser({ name: 'Pepa', pin: '4829' });
    await expect(enter('4829')).rejects.toMatchObject({ code: 'INVALID_ADMIN_CODE' });
    await expect(enter('2580')).rejects.toMatchObject({ code: 'INVALID_ADMIN_CODE' }); // PIN de Ana y Luis
  });

  it('una tablet que no existe', async () => {
    const { session } = await withCode();
    await expect(session.execute('no-existe', CODE)).rejects.toMatchObject({ code: 'DEVICE_NOT_FOUND' });
  });
});
