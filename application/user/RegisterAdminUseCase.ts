import { ConflictError, Email, PlainPassword, User, type Actor, type UserRepository } from '../../domain';
import { toUserDto, type UserDto } from '../dto';
import type { Clock, IdGenerator, PasswordHasher } from '../ports';
import { requireAdmin } from '../shared/authorization';

export interface RegisterAdminInput {
  name: string;
  lastname: string;
  email: string;
  password: string;
}

/** Crea otra cuenta de administrador (email + contraseña). Las personas se crean con RegisterPersonUseCase. */
export class RegisterAdminUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterAdminInput, actor: Actor): Promise<UserDto> {
    requireAdmin(actor);
    const email = Email.create(input.email);
    const password = PlainPassword.create(input.password);

    if (await this.users.findByEmail(email.value)) {
      throw new ConflictError('Ya existe un usuario con ese email', 'EMAIL_TAKEN', { email: email.value });
    }

    const user = User.createAdmin({
      id: this.ids.generate(),
      name: input.name,
      lastname: input.lastname,
      email,
      passwordHash: await this.hasher.hash(password.value),
      now: this.clock.now(),
    });
    await this.users.save(user);
    return toUserDto(user);
  }
}
