import type { Actor, UserFilter, UserRef, UserRepository } from '../../domain';
import { toUserDto, toUserRef, type UserDto } from '../dto';
import { requireAdmin } from '../shared/authorization';

/** Lista completa (con email y rol): solo admin. */
export class ListUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(filter: UserFilter, actor: Actor): Promise<UserDto[]> {
    requireAdmin(actor);
    return (await this.users.findAll(filter)).map(toUserDto);
  }
}

/** Lista mínima de usuarios activos (id y nombre) para filtros y selectores: cualquier usuario autenticado. */
export class ListUserOptionsUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(): Promise<UserRef[]> {
    return (await this.users.findAll({ isActive: true })).map(toUserRef);
  }
}
