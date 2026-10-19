import { UnauthorizedError, type UserRepository } from '../../domain';
import { toUserDto, type UserDto } from '../dto';

/**
 * Devuelve el usuario de la sesión. Si fue desactivado, eliminado o ya no tiene cuenta (no es admin)
 * después de emitir el token, la sesión deja de ser válida.
 */
export class GetCurrentUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<UserDto> {
    const user = await this.users.findById(userId);
    if (!user || !user.isActive || !user.canLogIn()) {
      throw new UnauthorizedError('La sesión ya no es válida', 'SESSION_INVALID');
    }
    return toUserDto(user);
  }
}
