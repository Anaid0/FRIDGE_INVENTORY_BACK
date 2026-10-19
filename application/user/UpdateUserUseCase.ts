import { ConflictError, Email, PlainPassword, type Actor, type UserRepository } from '../../domain';
import { toUserDto, type UserDto } from '../dto';
import type { Clock, PasswordHasher } from '../ports';
import { requireAdmin } from '../shared/authorization';
import { getUserOrFail } from '../shared/loaders';

export interface UpdateUserInput {
  name?: string;
  lastname?: string;
  /** Solo administradores (las personas no tienen email). */
  email?: string;
  /** Restablecer la contraseña (solo administradores). */
  password?: string;
}

/**
 * Edita datos de un usuario. El rol no se cambia: un admin y una persona se identifican distinto
 * (contraseña vs. PIN).
 */
export class UpdateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, input: UpdateUserInput, actor: Actor): Promise<UserDto> {
    requireAdmin(actor);
    const user = await getUserOrFail(this.users, userId);
    const now = this.clock.now();

    if (input.name !== undefined || input.lastname !== undefined) {
      user.rename(input.name ?? user.name, input.lastname ?? user.lastname, now);
    }

    if (input.email !== undefined) {
      const email = Email.create(input.email);
      if (!user.email || !email.equals(user.email)) {
        const owner = await this.users.findByEmail(email.value);
        if (owner && owner.id !== user.id) {
          throw new ConflictError('Ya existe un usuario con ese email', 'EMAIL_TAKEN', {
            email: email.value,
          });
        }
        user.changeEmail(email, now);
      }
    }

    if (input.password !== undefined) {
      const password = PlainPassword.create(input.password);
      user.changePassword(await this.hasher.hash(password.value), now);
    }

    await this.users.save(user);
    return toUserDto(user);
  }
}
