import {
  ConflictError,
  DevicePinLockedError,
  NotFoundError,
  Pin,
  PinLockedError,
  Role,
  UnknownPinError,
  type KioskDeviceRepository,
  type User,
  type UserRepository,
} from '../../domain';
import type { Clock, PasswordHasher } from '../ports';

/** Personas con PIN cuyo PIN es este (los PIN se guardan con hash: hay que compararlos uno por uno). */
export async function peopleWithPin(
  users: UserRepository,
  hasher: PasswordHasher,
  pin: string,
  options: { activeOnly: boolean },
): Promise<User[]> {
  const people = (
    await users.findAll({ role: Role.EMPLOYEE, ...(options.activeOnly && { isActive: true }) })
  ).filter((p) => p.pinHash);
  const matches = await Promise.all(people.map((p) => hasher.verify(pin, p.pinHash as string)));
  return people.filter((_, index) => matches[index]);
}

/**
 * Dos personas no pueden tener el mismo PIN: en la tablet el PIN es lo único que las identifica.
 * Se revisa al crear, restablecer o cambiar un PIN (también contra personas desactivadas, por si vuelven).
 */
export async function assertPinAvailable(
  users: UserRepository,
  hasher: PasswordHasher,
  pin: string,
  exceptUserId?: string,
): Promise<void> {
  const owners = await peopleWithPin(users, hasher, pin, { activeOnly: false });
  if (owners.some((p) => p.id !== exceptUserId)) {
    throw new ConflictError('Ese PIN ya lo usa otra persona; elige otro', 'PIN_TAKEN');
  }
}

/**
 * Identifica a la persona solo por su PIN, en una tablet. Los PIN incorrectos se cuentan por tablet (no se
 * sabe de quién eran) y, al llegar al máximo, la tablet no acepta PIN un par de minutos.
 *
 * Importante: llamar FUERA de la transacción del movimiento, para que los intentos fallidos queden guardados
 * aunque lo que venga después falle (igual que PinVerifier).
 */
export class PinIdentifier {
  constructor(
    private readonly users: UserRepository,
    private readonly devices: KioskDeviceRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async identify(deviceId: string, pin: string): Promise<User> {
    const device = await this.devices.findById(deviceId);
    if (!device) throw new NotFoundError('Tablet no encontrada', 'DEVICE_NOT_FOUND', { id: deviceId });
    const now = this.clock.now();
    if (device.isPinLocked(now)) throw new DevicePinLockedError(device.id, device.pinLockedUntil as Date);

    const owners = Pin.hasValidFormat(pin)
      ? await peopleWithPin(this.users, this.hasher, pin, { activeOnly: true })
      : [];
    if (owners.length === 0) {
      const result = device.registerFailedPin(now);
      await this.devices.save(device);
      if (result.locked) throw new DevicePinLockedError(device.id, result.lockedUntil as Date);
      throw new UnknownPinError(result.remainingAttempts);
    }
    if (device.registerSuccessfulPin()) await this.devices.save(device);
    if (owners.length > 1) {
      // Solo pasa con PIN repetidos de antes de esta regla: el admin debe restablecer uno de ellos.
      throw new ConflictError(
        'Ese PIN lo tienen varias personas. Pide al administrador que restablezca el tuyo.',
        'PIN_AMBIGUOUS',
      );
    }

    const person = owners[0] as User;
    if (person.isPinLocked(now)) throw new PinLockedError(person.id, person.pinLockedUntil as Date);
    return person;
  }
}
