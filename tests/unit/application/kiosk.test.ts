import { describe, expect, it } from 'vitest';
import {
  AuthenticateKioskDeviceUseCase,
  GetTopWithdrawersUseCase,
  KIOSK_TOKEN_TTL,
  KioskRegisterMovementsUseCase,
  ListKioskDevicesUseCase,
  ListKioskPeopleUseCase,
  PairKioskDeviceUseCase,
  PinVerifier,
  RevokeKioskDeviceUseCase,
  type TokenPayload,
} from '../../../application';
import { InvalidPinError, PIN_MAX_ATTEMPTS, PinLockedError, Role, User } from '../../../domain';
import { createOfficeContext } from '../../support/testContext';

async function setup() {
  const ctx = await createOfficeContext();
  const { repos, uow, recorder, hasher, ids, clock } = ctx;
  const signed: { payload: TokenPayload; expiresIn?: string }[] = [];
  const tokens = {
    sign: (payload: TokenPayload, options?: { expiresIn?: string }) => {
      signed.push({ payload, expiresIn: options?.expiresIn });
      return ctx.tokens.sign(payload);
    },
    verify: (token: string) => ctx.tokens.verify(token),
  };
  const verifier = new PinVerifier(hasher, clock);
  const gaseosa = await ctx.seedProduct('Gaseosa', { stock: 10 });
  const yogur = await ctx.seedProduct('Yogur', { stock: 3 });
  return {
    ...ctx,
    signed,
    gaseosa,
    yogur,
    pair: new PairKioskDeviceUseCase(repos.kioskDevices, repos.users, tokens, ids, clock),
    listDevices: new ListKioskDevicesUseCase(repos.kioskDevices, repos.users),
    revoke: new RevokeKioskDeviceUseCase(repos.kioskDevices, repos.users, clock),
    authenticate: new AuthenticateKioskDeviceUseCase(repos.kioskDevices, clock),
    people: new ListKioskPeopleUseCase(repos.users),
    register: new KioskRegisterMovementsUseCase(uow, repos.users, verifier, recorder, clock),
    ranking: new GetTopWithdrawersUseCase(repos.movements, clock),
  };
}

describe('Autorizar y revocar tablets (admin)', () => {
  it('el admin autoriza una tablet y obtiene un token KIOSK de larga duración', async () => {
    const { pair, signed, asAdmin } = await setup();
    const result = await pair.execute({ name: 'Tablet cocina' }, asAdmin);
    expect(result.device).toMatchObject({
      name: 'Tablet cocina',
      isActive: true,
      createdBy: { name: 'Admin' },
    });
    expect(result.token).toBe(`token:${result.device.id}:KIOSK`);
    expect(signed[0]).toEqual({
      payload: { sub: result.device.id, role: 'KIOSK' },
      expiresIn: KIOSK_TOKEN_TTL,
    });
  });

  it('solo un admin autoriza, lista o revoca', async () => {
    const { pair, listDevices, revoke, asAna } = await setup();
    await expect(pair.execute({ name: 'X' }, asAna)).rejects.toMatchObject({ kind: 'FORBIDDEN' });
    await expect(listDevices.execute(asAna)).rejects.toMatchObject({ kind: 'FORBIDDEN' });
    await expect(revoke.execute('x', asAna)).rejects.toMatchObject({ kind: 'FORBIDDEN' });
  });

  it('una tablet revocada deja de autenticarse; la lista muestra primero las activas', async () => {
    const { pair, listDevices, revoke, authenticate, asAdmin, clock } = await setup();
    const first = await pair.execute({ name: 'Vieja' }, asAdmin);
    clock.advanceDays(1);
    const second = await pair.execute({ name: 'Nueva' }, asAdmin);

    expect((await authenticate.execute(first.device.id)).name).toBe('Vieja');
    await revoke.execute(first.device.id, asAdmin);
    await expect(authenticate.execute(first.device.id)).rejects.toMatchObject({
      kind: 'UNAUTHORIZED',
      code: 'DEVICE_REVOKED',
    });
    await expect(authenticate.execute('no-existe')).rejects.toMatchObject({ code: 'DEVICE_NOT_AUTHORIZED' });
    await expect(revoke.execute('no-existe', asAdmin)).rejects.toMatchObject({ code: 'DEVICE_NOT_FOUND' });

    const list = await listDevices.execute(asAdmin);
    expect(list.map((d) => [d.name, d.isActive])).toEqual([
      ['Nueva', true],
      ['Vieja', false],
    ]);
    expect(second.device.id).not.toBe(first.device.id);
  });

  it('registra la última conexión de la tablet', async () => {
    const { pair, authenticate, listDevices, asAdmin } = await setup();
    const { device } = await pair.execute({ name: 'Tablet' }, asAdmin);
    await authenticate.execute(device.id);
    expect((await listDevices.execute(asAdmin))[0]?.lastSeenAt).toBeInstanceOf(Date);
  });
});

describe('Personas en la tablet', () => {
  it('solo personas activas con PIN, sin datos del PIN', async () => {
    const { people, seedUser, repos, clock } = await setup();
    await seedUser({ name: 'Inactiva', isActive: false });
    // Persona migrada que todavía no tiene PIN asignado.
    await repos.users.save(
      User.restore({
        id: 'user-sin-pin',
        name: 'Sin',
        lastname: 'Pin',
        email: null,
        passwordHash: null,
        pinHash: null,
        failedPinAttempts: 0,
        pinLockedUntil: null,
        role: Role.EMPLOYEE,
        isActive: true,
        createdAt: clock.now(),
        updatedAt: clock.now(),
      }),
    );

    const result = await people.execute();
    expect(result).toEqual([
      { id: 'user-ana', name: 'Ana', lastname: 'Test', initials: 'AT' },
      { id: 'user-luis', name: 'Luis', lastname: 'Test', initials: 'LT' },
    ]);
  });
});

describe('KioskRegisterMovementsUseCase', () => {
  it('con PIN correcto saca varios productos en un solo registro', async () => {
    const { register, ana, gaseosa, yogur, stockOf, ranking } = await setup();
    const result = await register.execute({
      personId: ana.id,
      pin: '2580',
      type: 'OUT',
      items: [
        { productId: gaseosa.id, quantity: 2 },
        { productId: yogur.id, quantity: 1 },
      ],
      note: 'almuerzo',
    });
    expect(result.person).toEqual({ id: ana.id, name: 'Ana', lastname: 'Test' });
    expect(result.movements).toHaveLength(2);
    for (const movement of result.movements) {
      expect(movement).toMatchObject({
        type: 'OUT',
        source: 'MANUAL',
        performedBy: ana.id,
        registeredBy: ana.id,
        note: 'almuerzo',
      });
    }
    expect(result.products.map((p) => p.quantity)).toEqual([8, 2]);
    expect(await stockOf(gaseosa.id)).toBe(8);
    // Cuenta en el ranking como retiro de Ana
    expect(await ranking.execute()).toEqual([
      expect.objectContaining({ user: expect.objectContaining({ name: 'Ana' }), totalWithdrawn: 3 }),
    ]);
  });

  it('también mete productos', async () => {
    const { register, luis, yogur, stockOf } = await setup();
    await register.execute({
      personId: luis.id,
      pin: '2580',
      type: 'IN',
      items: [{ productId: yogur.id, quantity: 4 }],
    });
    expect(await stockOf(yogur.id)).toBe(7);
  });

  it('si una línea no tiene stock, no se guarda ninguna', async () => {
    const { register, ana, gaseosa, yogur, stockOf, db } = await setup();
    await expect(
      register.execute({
        personId: ana.id,
        pin: '2580',
        type: 'OUT',
        items: [
          { productId: gaseosa.id, quantity: 2 },
          { productId: yogur.id, quantity: 5 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await stockOf(gaseosa.id)).toBe(10);
    expect(db.movements).toHaveLength(0);
  });

  it('PIN incorrecto: no registra nada y el intento queda guardado', async () => {
    const { register, ana, gaseosa, stockOf, repos } = await setup();
    await expect(
      register.execute({
        personId: ana.id,
        pin: '9999',
        type: 'OUT',
        items: [{ productId: gaseosa.id, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(InvalidPinError);
    expect(await stockOf(gaseosa.id)).toBe(10);
    expect((await repos.users.findById(ana.id))!.failedPinAttempts).toBe(1);
  });

  it(`tras ${PIN_MAX_ATTEMPTS} PIN incorrectos la persona queda bloqueada`, async () => {
    const { register, ana, gaseosa } = await setup();
    const attempt = (pin: string) =>
      register.execute({
        personId: ana.id,
        pin,
        type: 'OUT',
        items: [{ productId: gaseosa.id, quantity: 1 }],
      });
    for (let i = 1; i < PIN_MAX_ATTEMPTS; i++)
      await expect(attempt('9999')).rejects.toBeInstanceOf(InvalidPinError);
    await expect(attempt('9999')).rejects.toBeInstanceOf(PinLockedError);
    await expect(attempt('2580')).rejects.toBeInstanceOf(PinLockedError);
  });

  it('valida la lista antes de mirar el PIN (no gasta intentos)', async () => {
    const { register, ana, gaseosa, repos } = await setup();
    const base = { personId: ana.id, pin: '9999', type: 'OUT' as const };
    await expect(register.execute({ ...base, items: [] })).rejects.toMatchObject({ code: 'EMPTY_MOVEMENT' });
    await expect(
      register.execute({
        ...base,
        items: [
          { productId: gaseosa.id, quantity: 1 },
          { productId: gaseosa.id, quantity: 1 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_PRODUCT' });
    await expect(
      register.execute({ ...base, items: [{ productId: gaseosa.id, quantity: 0 }] }),
    ).rejects.toMatchObject({
      code: 'INVALID_QUANTITY',
    });
    await expect(
      register.execute({
        ...base,
        items: Array.from({ length: 21 }, (_, i) => ({ productId: `p${i}`, quantity: 1 })),
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_ITEMS' });
    expect((await repos.users.findById(ana.id))!.failedPinAttempts).toBe(0);
  });

  it('un administrador no se identifica con PIN', async () => {
    const { register, admin, gaseosa } = await setup();
    await expect(
      register.execute({
        personId: admin.id,
        pin: '2580',
        type: 'OUT',
        items: [{ productId: gaseosa.id, quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' });
  });
});
