import { describe, expect, it } from 'vitest';
import {
  AdminCode,
  Email,
  isRole,
  Pin,
  PIN_LOCK_MINUTES,
  PIN_MAX_ATTEMPTS,
  PlainPassword,
  Role,
  User,
  ValidationError,
} from '../../../domain';
import { LATER, makeAdmin, makePerson, NOW } from './fixtures';

describe('Email', () => {
  it('normaliza a minúsculas sin espacios', () => {
    expect(Email.create('  Ana@Oficina.COM ').value).toBe('ana@oficina.com');
  });

  it.each(['', 'ana', 'ana@', 'ana@oficina', 'a b@c.com', `${'a'.repeat(150)}@x.com`])(
    'rechaza %j',
    (raw) => {
      expect(() => Email.create(raw)).toThrow(expect.objectContaining({ code: 'INVALID_EMAIL' }));
    },
  );

  it('compara por valor', () => {
    expect(Email.create('A@b.co').equals(Email.create('a@B.co'))).toBe(true);
    expect(Email.create('a@b.co').toString()).toBe('a@b.co');
  });
});

describe('Role', () => {
  it('isRole reconoce solo los roles válidos', () => {
    expect(isRole('ADMIN')).toBe(true);
    expect(isRole('EMPLOYEE')).toBe(true);
    expect(isRole('ROOT')).toBe(false);
  });
});

describe('User: administrador', () => {
  it('se crea activo como ADMIN, con cuenta para iniciar sesión', () => {
    const user = makeAdmin({ name: ' Ana ', lastname: ' Pérez ' });
    expect(user.role).toBe(Role.ADMIN);
    expect(user.isAdmin()).toBe(true);
    expect(user.isPerson()).toBe(false);
    expect(user.canLogIn()).toBe(true);
    expect(user.hasPin()).toBe(false);
    expect(user.fullName).toBe('Ana Pérez');
    expect(user.createdAt).toBe(NOW);
  });

  it('exige nombre, apellido y hash de contraseña', () => {
    expect(() => makeAdmin({ name: '' })).toThrow(ValidationError);
    expect(() => makeAdmin({ lastname: '  ' })).toThrow(ValidationError);
    expect(() => makeAdmin({ passwordHash: '' })).toThrow(ValidationError);
  });

  it('cambia datos, email y contraseña', () => {
    const user = makeAdmin();
    user.rename('Luisa', 'Gómez', LATER);
    user.changeEmail(Email.create('luisa@oficina.com'), LATER);
    user.changePassword('nuevo-hash', LATER);
    expect(user.fullName).toBe('Luisa Gómez');
    expect(user.email?.value).toBe('luisa@oficina.com');
    expect(user.passwordHash).toBe('nuevo-hash');
    expect(user.updatedAt).toBe(LATER);
  });

  it('no usa PIN', () => {
    const user = makeAdmin();
    expect(() => user.changePin('x', LATER)).toThrow(expect.objectContaining({ code: 'NOT_A_PERSON' }));
    expect(() => user.registerFailedPin(LATER)).toThrow(expect.objectContaining({ code: 'NOT_A_PERSON' }));
  });

  it('se activa y desactiva', () => {
    const user = makeAdmin();
    user.deactivate(LATER);
    expect(user.isActive).toBe(false);
    user.activate(LATER);
    expect(user.isActive).toBe(true);
  });
});

describe('User: persona (tablet)', () => {
  it('se crea como EMPLOYEE solo con nombre y PIN, sin cuenta', () => {
    const person = makePerson();
    expect(person.role).toBe(Role.EMPLOYEE);
    expect(person.isPerson()).toBe(true);
    expect(person.email).toBeNull();
    expect(person.passwordHash).toBeNull();
    expect(person.hasPin()).toBe(true);
    expect(person.canLogIn()).toBe(false);
    expect(person.failedPinAttempts).toBe(0);
    expect(() => makePerson({ pinHash: '' })).toThrow(ValidationError);
  });

  it('no tiene email ni contraseña', () => {
    const person = makePerson();
    expect(() => person.changeEmail(Email.create('x@y.co'), LATER)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_ACCOUNT' }),
    );
    expect(() => person.changePassword('h', LATER)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_ACCOUNT' }),
    );
  });

  it(`se bloquea ${PIN_LOCK_MINUTES} minutos tras ${PIN_MAX_ATTEMPTS} PIN incorrectos`, () => {
    const person = makePerson();
    for (let i = 1; i < PIN_MAX_ATTEMPTS; i++) {
      expect(person.registerFailedPin(NOW)).toEqual({
        locked: false,
        remainingAttempts: PIN_MAX_ATTEMPTS - i,
        lockedUntil: null,
      });
    }
    const last = person.registerFailedPin(NOW);
    expect(last.locked).toBe(true);
    expect(last.lockedUntil?.getTime()).toBe(NOW.getTime() + PIN_LOCK_MINUTES * 60_000);
    expect(person.isPinLocked(NOW)).toBe(true);
    expect(person.isPinLocked(new Date(NOW.getTime() + PIN_LOCK_MINUTES * 60_000))).toBe(false);
    expect(person.failedPinAttempts).toBe(0);
  });

  it('un PIN correcto reinicia los intentos y cambiar el PIN levanta el bloqueo', () => {
    const person = makePerson();
    person.registerFailedPin(NOW);
    person.registerSuccessfulPin(LATER);
    expect(person.failedPinAttempts).toBe(0);
    expect(person.updatedAt).toBe(LATER);

    for (let i = 0; i < PIN_MAX_ATTEMPTS; i++) person.registerFailedPin(NOW);
    expect(person.isPinLocked(NOW)).toBe(true);
    person.changePin('otro-hash', NOW);
    expect(person.isPinLocked(NOW)).toBe(false);
    expect(person.pinHash).toBe('otro-hash');
  });

  it('registerSuccessfulPin no toca nada si no había intentos', () => {
    const person = makePerson();
    person.registerSuccessfulPin(LATER);
    expect(person.updatedAt).toBe(NOW);
  });

  it('restore admite una persona sin PIN (pendiente de asignar)', () => {
    const person = User.restore({
      id: 'p',
      name: 'Ana',
      lastname: 'Pérez',
      email: null,
      passwordHash: null,
      pinHash: null,
      failedPinAttempts: 0,
      pinLockedUntil: null,
      role: Role.EMPLOYEE,
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(person.hasPin()).toBe(false);
    expect(person.canLogIn()).toBe(false);
  });
});

describe('Pin', () => {
  it.each(['2580', '0471', '9305'])('acepta %s', (raw) => {
    expect(Pin.create(raw).value).toBe(raw);
  });

  it.each(['', '123', '12345', 'abcd', '12 4'])('rechaza el formato %j', (raw) => {
    expect(() => Pin.create(raw)).toThrow(expect.objectContaining({ code: 'INVALID_PIN_FORMAT' }));
  });

  it.each(['0000', '7777', '1234', '6789', '4321', '9876'])('rechaza el PIN trivial %s', (raw) => {
    expect(() => Pin.create(raw)).toThrow(expect.objectContaining({ code: 'WEAK_PIN' }));
  });
});

describe('PlainPassword', () => {
  it('acepta una contraseña con letras y números de 8+ caracteres', () => {
    expect(PlainPassword.create('Nevera123').value).toBe('Nevera123');
  });

  it.each(['corta1', 'sololetras', '12345678'])('rechaza %j por débil', (raw) => {
    expect(() => PlainPassword.create(raw)).toThrow(expect.objectContaining({ code: 'WEAK_PASSWORD' }));
  });

  it('rechaza más de 72 bytes (límite de bcrypt)', () => {
    expect(() => PlainPassword.create(`a1${'ñ'.repeat(36)}`)).toThrow(
      expect.objectContaining({ code: 'PASSWORD_TOO_LONG' }),
    );
  });
});

describe('AdminCode', () => {
  it.each(['4829', '48291', '482915', ' 2580 '])('acepta %s', (raw) => {
    expect(AdminCode.create(raw).value).toBe(raw.trim());
  });

  it.each(['', '123', '1234567', '12a4', '12 34'])('rechaza el formato de "%s"', (raw) => {
    expect(() => AdminCode.create(raw)).toThrow(
      expect.objectContaining({ code: 'INVALID_ADMIN_CODE_FORMAT', message: expect.stringMatching(/4 a 6/) }),
    );
  });

  it.each(['0000', '111111', '1234', '123456', '4321', '654321', '34567', '98765'])(
    'rechaza el código trivial %s',
    (raw) => {
      expect(() => AdminCode.create(raw)).toThrow(
        expect.objectContaining({
          code: 'INVALID_ADMIN_CODE_FORMAT',
          message: expect.stringMatching(/fácil/),
        }),
      );
    },
  );
});

describe('User: código de administrador', () => {
  it('un admin empieza sin código y lo puede definir', () => {
    const admin = makeAdmin();
    expect(admin.hasAdminCode()).toBe(false);
    expect(admin.adminCodeHash).toBeNull();
    admin.changeAdminCode('code-hash', LATER);
    expect(admin.hasAdminCode()).toBe(true);
    expect(admin.adminCodeHash).toBe('code-hash');
    expect(admin.updatedAt).toBe(LATER);
    expect(() => admin.changeAdminCode(' ', LATER)).toThrow(ValidationError);
  });

  it('una persona no tiene código de administrador', () => {
    expect(() => makePerson().changeAdminCode('code-hash', LATER)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_ADMIN' }),
    );
  });
});
