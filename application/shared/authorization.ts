import { ForbiddenError, Role, type Actor } from '../../domain';

/** Segunda línea de defensa: además del middleware HTTP, los casos de uso de admin lo verifican. */
export function requireAdmin(actor: Actor): void {
  if (actor.role !== Role.ADMIN) {
    throw new ForbiddenError('Solo un administrador puede realizar esta acción', 'ADMIN_REQUIRED');
  }
}
