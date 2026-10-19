import { ConflictError, type Actor, type UserRepository } from '../../domain';
import { toUserDto, type UserDto } from '../dto';
import type { Clock } from '../ports';
import { requireAdmin } from '../shared/authorization';
import { getUserOrFail } from '../shared/loaders';
import type { AdminSafetyPolicy } from './AdminSafetyPolicy';

/** Activa o desactiva un usuario. Los usuarios nunca se borran (tienen historial). */
export class SetUserActiveUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly adminSafety: AdminSafetyPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, isActive: boolean, actor: Actor): Promise<UserDto> {
    requireAdmin(actor);
    const user = await getUserOrFail(this.users, userId);
    if (user.isActive === isActive) return toUserDto(user);

    if (isActive) {
      user.activate(this.clock.now());
    } else {
      if (user.id === actor.id) {
        throw new ConflictError('No puedes desactivar tu propio usuario', 'CANNOT_DEACTIVATE_SELF');
      }
      await this.adminSafety.assertCanStopBeingActiveAdmin(user);
      user.deactivate(this.clock.now());
    }

    await this.users.save(user);
    return toUserDto(user);
  }
}
