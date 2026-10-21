import type { Money } from '../shared/Money';
import type { UserRef } from '../user/UserRef';
import type { MovementSource } from './MovementSource';
import type { MovementType } from './MovementType';

/** Modelo de lectura del log de movimientos (con nombres ya resueltos). */
export interface MovementView {
  id: string;
  type: MovementType;
  source: MovementSource;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  note: string | null;
  createdAt: Date;
  product: { id: string; name: string; unit: string };
  performedBy: UserRef;
  registeredBy: UserRef;
  purchaseId: string | null;
  /**
   * Precio unitario: el guardado en los movimientos manuales (entradas y salidas) o, en los de compra y
   * anulación, el del ítem de la compra. null si no se conocía.
   */
  unitPrice: Money | null;
}
