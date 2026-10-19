import type { Actor } from '../user/Actor';
import { Role } from '../user/Role';

/**
 * Decide a quién se le atribuye un movimiento (performed_by).
 * Solo un ADMIN puede registrar movimientos a nombre de otra persona;
 * para cualquier otro usuario el movimiento siempre queda a su propio nombre.
 */
export class MovementActorPolicy {
  static canChoosePerformer(actor: Actor): boolean {
    return actor.role === Role.ADMIN;
  }

  static resolvePerformedBy(actor: Actor, requestedPerformerId?: string | null): string {
    if (requestedPerformerId && MovementActorPolicy.canChoosePerformer(actor)) {
      return requestedPerformerId;
    }
    return actor.id;
  }
}
