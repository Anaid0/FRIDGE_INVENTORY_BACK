import {
  InvalidPinError,
  NotFoundError,
  Pin,
  PinLockedError,
  type User,
  type UserRepository,
} from '../../domain';
import type { Clock, PasswordHasher } from '../ports';

/**
 * Verifica el PIN de una persona y lleva la cuenta de intentos fallidos (con bloqueo temporal).
 *
 * Importante: llamar FUERA de la transacción del movimiento. Los intentos fallidos se guardan aunque la
 * operación posterior falle; si se guardaran dentro de la transacción, un error los revertiría y el bloqueo
 * por fuerza bruta no funcionaría.
 */
export class PinVerifier {
  constructor(
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async verify(users: UserRepository, personId: string, pin: string): Promise<User> {
    const person = await users.findById(personId);
    if (!person || !person.isPerson() || !person.isActive || !person.pinHash) {
      throw new NotFoundError('Persona no encontrada', 'PERSON_NOT_FOUND', { id: personId });
    }

    const now = this.clock.now();
    if (person.isPinLocked(now)) throw new PinLockedError(person.id, person.pinLockedUntil as Date);

    const matches = Pin.hasValidFormat(pin) && (await this.hasher.verify(pin, person.pinHash));
    if (!matches) {
      const result = person.registerFailedPin(now);
      await users.save(person);
      if (result.locked) throw new PinLockedError(person.id, result.lockedUntil as Date);
      throw new InvalidPinError(result.remainingAttempts);
    }

    if (person.failedPinAttempts > 0) {
      person.registerSuccessfulPin(now);
      await users.save(person);
    }
    return person;
  }
}
