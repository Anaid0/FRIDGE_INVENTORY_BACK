import { ConflictError, type User, type UserRepository } from '../../domain';

/** Evita dejar el sistema sin ningún administrador activo. */
export class AdminSafetyPolicy {
  constructor(private readonly users: UserRepository) {}

  /** Llamar antes de que `user` deje de ser un admin activo (degradarlo o desactivarlo). */
  async assertCanStopBeingActiveAdmin(user: User): Promise<void> {
    if (!user.isAdmin() || !user.isActive) return;
    if ((await this.users.countActiveAdmins()) <= 1) {
      throw new ConflictError('No se puede quitar al último administrador activo', 'LAST_ADMIN');
    }
  }
}
