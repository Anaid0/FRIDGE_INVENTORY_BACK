import {
  AdminCode,
  ConflictError,
  DevicePinLockedError,
  InvalidAdminCodeError,
  NotFoundError,
  Role,
  ValidationError,
  type Actor,
  type KioskDeviceRepository,
  type User,
  type UserRepository,
} from '../../domain';
import type { Clock, PasswordHasher, TokenService } from '../ports';
import { requireAdmin } from '../shared/authorization';
import { getUserOrFail } from '../shared/loaders';
import { sessionFor, type LoginResult } from './LoginUseCase';

/** Administradores con código cuyo código es este (se guardan con hash: hay que compararlos uno por uno). */
async function adminsWithCode(
  users: UserRepository,
  hasher: PasswordHasher,
  code: string,
  options: { activeOnly: boolean },
): Promise<User[]> {
  const admins = (
    await users.findAll({ role: Role.ADMIN, ...(options.activeOnly && { isActive: true }) })
  ).filter((a) => a.adminCodeHash);
  const matches = await Promise.all(admins.map((a) => hasher.verify(code, a.adminCodeHash as string)));
  return admins.filter((_, index) => matches[index]);
}

export interface SetAdminCodeInput {
  /** Contraseña del propio admin (se verifica de nuevo aunque tenga sesión). */
  password: string;
  code: string;
}

/**
 * El admin define (o cambia) su código para entrar a la administración desde el teclado de la tablet.
 * Pide su contraseña, y dos admins no pueden tener el mismo código: en la tablet es lo único que los identifica.
 */
export class SetAdminCodeUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: SetAdminCodeInput, actor: Actor): Promise<void> {
    requireAdmin(actor);
    const admin = await getUserOrFail(this.users, actor.id);
    const passwordOk =
      Boolean(admin.passwordHash) &&
      (await this.hasher.verify(input.password ?? '', admin.passwordHash as string));
    if (!passwordOk) {
      throw new ValidationError('La contraseña de administrador no es correcta', 'INVALID_ADMIN_PASSWORD');
    }
    const code = AdminCode.create(input.code);
    const owners = await adminsWithCode(this.users, this.hasher, code.value, { activeOnly: false });
    if (owners.some((a) => a.id !== admin.id)) {
      throw new ConflictError('Ese código ya lo usa otro administrador', 'ADMIN_CODE_TAKEN');
    }
    admin.changeAdminCode(await this.hasher.hash(code.value), this.clock.now());
    await this.users.save(admin);
  }
}

/**
 * En la tablet: un admin marca su código en el teclado y entra a la administración con una sesión normal
 * (la misma respuesta que el login). Los códigos incorrectos cuentan para la tablet igual que los PIN
 * incorrectos (mismo contador y mismo bloqueo, ver PinIdentifier).
 *
 * Los intentos se guardan en cuanto ocurren (sin transacción): así quedan aunque después se lance el error.
 */
export class KioskAdminSessionUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly devices: KioskDeviceRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async execute(deviceId: string, code: string): Promise<LoginResult> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new NotFoundError('Tablet no encontrada', 'DEVICE_NOT_FOUND', { id: deviceId });
    const now = this.clock.now();
    if (device.isPinLocked(now)) throw new DevicePinLockedError(device.id, device.pinLockedUntil as Date);

    const owners = AdminCode.hasValidFormat(code)
      ? (await adminsWithCode(this.users, this.hasher, code, { activeOnly: true })).filter((a) =>
          a.canLogIn(),
        )
      : [];
    if (owners.length !== 1) {
      // Más de uno solo pasaría con códigos repetidos (la regla lo impide): se trata como incorrecto.
      const result = device.registerFailedPin(now);
      await this.devices.save(device);
      if (result.locked) throw new DevicePinLockedError(device.id, result.lockedUntil as Date);
      throw new InvalidAdminCodeError(result.remainingAttempts);
    }
    if (device.registerSuccessfulPin()) await this.devices.save(device);
    return sessionFor(owners[0] as User, this.tokens);
  }
}
