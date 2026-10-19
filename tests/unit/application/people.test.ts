import { describe, expect, it } from 'vitest';
import {
  ChangeOwnPinUseCase,
  ListPeopleUseCase,
  PinVerifier,
  RegisterPersonUseCase,
  ResetPersonPinUseCase,
  UpdatePersonUseCase,
} from '../../../application';
import { InvalidPinError, PIN_LOCK_MINUTES, PIN_MAX_ATTEMPTS, PinLockedError, Role } from '../../../domain';
import { createOfficeContext } from '../../support/testContext';

async function setup() {
  const ctx = await createOfficeContext();
  const { repos, hasher, ids, clock } = ctx;
  const verifier = new PinVerifier(hasher, clock);
  return {
    ...ctx,
    verifier,
    register: new RegisterPersonUseCase(repos.users, hasher, ids, clock),
    update: new UpdatePersonUseCase(repos.users, clock),
    resetPin: new ResetPersonPinUseCase(repos.users, hasher, clock),
    list: new ListPeopleUseCase(repos.users, clock),
    changeOwnPin: new ChangeOwnPinUseCase(repos.users, verifier, hasher, clock),
  };
}

describe('Personas: alta y edición (admin)', () => {
  it('crea una persona solo con nombre y PIN', async () => {
    const { register, asAdmin, repos } = await setup();
    const dto = await register.execute({ name: 'Marta', lastname: 'Ríos', pin: '4826' }, asAdmin);
    expect(dto).toMatchObject({ fullName: 'Marta Ríos', isActive: true, hasPin: true, isPinLocked: false });
    expect(dto).not.toHaveProperty('pinHash');
    const saved = (await repos.users.findById(dto.id))!;
    expect(saved.role).toBe(Role.EMPLOYEE);
    expect(saved.email).toBeNull();
    expect(saved.pinHash).toBe('hashed:4826');
  });

  it('valida el PIN, el nombre repetido y los permisos', async () => {
    const { register, asAdmin, asAna } = await setup();
    await expect(register.execute({ name: 'X', lastname: 'Y', pin: '1234' }, asAdmin)).rejects.toMatchObject({
      code: 'WEAK_PIN',
    });
    await expect(register.execute({ name: 'X', lastname: 'Y', pin: '12a4' }, asAdmin)).rejects.toMatchObject({
      code: 'INVALID_PIN_FORMAT',
    });
    // "Ana Test" ya existe (mayúsculas y acentos no importan)
    await expect(
      register.execute({ name: 'ÁNA', lastname: 'test', pin: '4826' }, asAdmin),
    ).rejects.toMatchObject({
      code: 'PERSON_NAME_TAKEN',
    });
    await expect(register.execute({ name: 'X', lastname: 'Y', pin: '4826' }, asAna)).rejects.toMatchObject({
      kind: 'FORBIDDEN',
    });
  });

  it('edita el nombre sin chocar con otra persona', async () => {
    const { update, asAdmin, ana } = await setup();
    expect((await update.execute(ana.id, { lastname: 'Gómez' }, asAdmin)).fullName).toBe('Ana Gómez');
    await expect(update.execute(ana.id, { name: 'Luis', lastname: 'Test' }, asAdmin)).rejects.toMatchObject({
      code: 'PERSON_NAME_TAKEN',
    });
  });

  it('no trata a un admin como persona', async () => {
    const { update, resetPin, asAdmin, admin } = await setup();
    await expect(update.execute(admin.id, { name: 'X' }, asAdmin)).rejects.toMatchObject({
      code: 'NOT_A_PERSON',
    });
    await expect(resetPin.execute(admin.id, { pin: '4826' }, asAdmin)).rejects.toMatchObject({
      code: 'NOT_A_PERSON',
    });
  });

  it('la lista muestra solo personas, con su estado de bloqueo', async () => {
    const { list, verifier, repos, asAdmin, ana } = await setup();
    for (let i = 0; i < PIN_MAX_ATTEMPTS; i++)
      await verifier.verify(repos.users, ana.id, '0000').catch(() => undefined);
    const people = await list.execute({}, asAdmin);
    expect(people.map((p) => p.name)).toEqual(['Ana', 'Luis']);
    expect(people[0]).toMatchObject({ isPinLocked: true, hasPin: true });
    expect(people[0]?.pinLockedUntil).toBeInstanceOf(Date);
    expect(people[1]).toMatchObject({ isPinLocked: false, pinLockedUntil: null });
  });
});

describe('PinVerifier', () => {
  it('con el PIN correcto devuelve la persona', async () => {
    const { verifier, repos, ana } = await setup();
    expect((await verifier.verify(repos.users, ana.id, '2580')).id).toBe(ana.id);
  });

  it('un PIN incorrecto dice cuántos intentos quedan y se guarda aunque falle', async () => {
    const { verifier, repos, ana } = await setup();
    const error = await verifier.verify(repos.users, ana.id, '9999').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidPinError);
    expect(error).toMatchObject({
      code: 'INVALID_PIN',
      details: { remainingAttempts: PIN_MAX_ATTEMPTS - 1 },
    });
    expect((await repos.users.findById(ana.id))!.failedPinAttempts).toBe(1);
  });

  it(`bloquea tras ${PIN_MAX_ATTEMPTS} intentos; ni el PIN correcto entra hasta que pasa el bloqueo`, async () => {
    const { verifier, repos, ana, clock } = await setup();
    for (let i = 1; i < PIN_MAX_ATTEMPTS; i++) {
      await expect(verifier.verify(repos.users, ana.id, '9999')).rejects.toBeInstanceOf(InvalidPinError);
    }
    await expect(verifier.verify(repos.users, ana.id, '9999')).rejects.toBeInstanceOf(PinLockedError);
    const locked = await verifier.verify(repos.users, ana.id, '2580').catch((e: unknown) => e);
    expect(locked).toMatchObject({ kind: 'LOCKED', code: 'PIN_LOCKED' });

    clock.set(new Date(clock.now().getTime() + PIN_LOCK_MINUTES * 60_000 + 1));
    expect((await verifier.verify(repos.users, ana.id, '2580')).id).toBe(ana.id);
  });

  it('un acierto reinicia los intentos fallidos', async () => {
    const { verifier, repos, ana } = await setup();
    await verifier.verify(repos.users, ana.id, '9999').catch(() => undefined);
    await verifier.verify(repos.users, ana.id, '2580');
    expect((await repos.users.findById(ana.id))!.failedPinAttempts).toBe(0);
  });

  it('un formato inválido cuenta como intento fallido', async () => {
    const { verifier, repos, ana } = await setup();
    await expect(verifier.verify(repos.users, ana.id, 'abc')).rejects.toBeInstanceOf(InvalidPinError);
    expect((await repos.users.findById(ana.id))!.failedPinAttempts).toBe(1);
  });

  it('personas inexistentes, inactivas o administradores: PERSON_NOT_FOUND', async () => {
    const { verifier, repos, seedUser, admin } = await setup();
    const inactive = await seedUser({ name: 'Inactiva', isActive: false });
    for (const id of ['nadie', inactive.id, admin.id]) {
      await expect(verifier.verify(repos.users, id, '2580')).rejects.toMatchObject({
        code: 'PERSON_NOT_FOUND',
      });
    }
  });
});

describe('PIN: cambio propio y reinicio por el admin', () => {
  it('la persona cambia su PIN confirmando el actual', async () => {
    const { changeOwnPin, verifier, repos, ana } = await setup();
    await changeOwnPin.execute({ personId: ana.id, currentPin: '2580', newPin: '4826' });
    expect((await verifier.verify(repos.users, ana.id, '4826')).id).toBe(ana.id);
    await expect(verifier.verify(repos.users, ana.id, '2580')).rejects.toBeInstanceOf(InvalidPinError);
  });

  it('valida el PIN actual, el nuevo y que sean distintos', async () => {
    const { changeOwnPin, ana } = await setup();
    await expect(
      changeOwnPin.execute({ personId: ana.id, currentPin: '9999', newPin: '4826' }),
    ).rejects.toBeInstanceOf(InvalidPinError);
    await expect(
      changeOwnPin.execute({ personId: ana.id, currentPin: '2580', newPin: '1111' }),
    ).rejects.toMatchObject({
      code: 'WEAK_PIN',
    });
    await expect(
      changeOwnPin.execute({ personId: ana.id, currentPin: '2580', newPin: '2580' }),
    ).rejects.toMatchObject({
      code: 'SAME_PIN',
    });
  });

  it('el admin restablece el PIN y eso desbloquea a la persona', async () => {
    const { resetPin, verifier, repos, asAdmin, ana } = await setup();
    for (let i = 0; i < PIN_MAX_ATTEMPTS; i++)
      await verifier.verify(repos.users, ana.id, '9999').catch(() => undefined);
    await expect(verifier.verify(repos.users, ana.id, '2580')).rejects.toBeInstanceOf(PinLockedError);

    const dto = await resetPin.execute(ana.id, { pin: '7351' }, asAdmin);
    expect(dto.isPinLocked).toBe(false);
    expect((await verifier.verify(repos.users, ana.id, '7351')).id).toBe(ana.id);
  });
});
