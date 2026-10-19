import { Email, UnauthorizedError, ValidationError, type UserRepository } from '../../domain';
import { toUserDto, type UserDto } from '../dto';
import type { PasswordHasher, TokenService } from '../ports';

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: UserDto;
}

const invalidCredentials = () =>
  new UnauthorizedError('Email o contraseña incorrectos', 'INVALID_CREDENTIALS');

export class LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    let email: Email;
    try {
      email = Email.create(input.email);
    } catch (error) {
      if (error instanceof ValidationError) throw invalidCredentials();
      throw error;
    }

    const user = await this.users.findByEmail(email.value);
    // Mismo error para usuario inexistente, desactivado, sin cuenta (persona) o contraseña incorrecta:
    // no revela qué falló. Solo los administradores inician sesión.
    if (!user || !user.isActive || !user.canLogIn() || !user.passwordHash) throw invalidCredentials();
    if (!(await this.hasher.verify(input.password ?? '', user.passwordHash))) throw invalidCredentials();

    return {
      token: this.tokens.sign({ sub: user.id, role: user.role }),
      user: toUserDto(user),
    };
  }
}
