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
}
